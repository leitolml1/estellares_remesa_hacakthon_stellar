"""Lectura/sync contra Horizon para el Modulo 2 (pools comunitarios).

A diferencia del historial simple del Modulo 1, aca hace falta filtrar por
memo (el short_code del pool) para distinguir las donaciones de cualquier
otro pago que reciba la wallet del pool. El memo vive en la tx padre, no en
la operacion, asi que resolverlo cuesta 1 request extra por operacion (se
hace en batches acotados para no saturar Horizon, igual que hacia el
backend NestJS de referencia).
"""

from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

from django.db import transaction
from stellar_sdk.exceptions import BaseHorizonError, ConnectionError, NotFoundError

from stellar_common.assets import CIRCLE_TESTNET_XLM_REFERENCE_RATES
from stellar_common.client import (
    PAYMENT_LIKE_OPERATION_TYPES,
    StellarAccountNotFoundError,
    StellarUnavailableError,
    asset_fields,
    get_server,
)

from .models import Pool

SYNC_PAGE_SIZE = 200
MAX_CONCURRENT_MEMO_LOOKUPS = 5


def _asset_key(asset_code: str, asset_issuer: str | None) -> str:
    return asset_code if asset_issuer is None else f"{asset_code}:{asset_issuer}"


def _split_asset_key(key: str) -> tuple[str, str | None]:
    if ":" in key:
        asset_code, asset_issuer = key.split(":", 1)
        return asset_code, asset_issuer
    return key, None


def _memo_for_transaction(server, tx_hash: str) -> str | None:
    transaction_record = server.transactions().transaction(tx_hash).call()
    return transaction_record.get("memo")


def _fetch_memos_in_batches(server, tx_hashes: list[str]) -> dict[str, str | None]:
    memos: dict[str, str | None] = {}
    for start in range(0, len(tx_hashes), MAX_CONCURRENT_MEMO_LOOKUPS):
        batch = tx_hashes[start : start + MAX_CONCURRENT_MEMO_LOOKUPS]
        with ThreadPoolExecutor(max_workers=len(batch)) as executor:
            results = list(executor.map(lambda h: _memo_for_transaction(server, h), batch))
        memos.update(zip(batch, results))
    return memos


def get_latest_horizon_cursor(wallet_address: str) -> str | None:
    """Cursor de Horizon en el momento de crear el pool.

    `_sync_pool_donations` arranca desde aca en vez de desde el origen de
    la cuenta: no puede haber donaciones a un pool antes de que el pool
    exista, asi que no tiene sentido (ni es barato) escanear el historial
    previo completo de la wallet la primera vez que se consulta el pool.
    """
    server = get_server()
    try:
        page = server.payments().for_account(wallet_address).order(desc=True).limit(1).call()
    except NotFoundError as exc:
        raise StellarAccountNotFoundError(wallet_address) from exc
    except (ConnectionError, BaseHorizonError) as exc:
        raise StellarUnavailableError(str(exc)) from exc

    records = page["_embedded"]["records"]
    return records[0]["paging_token"] if records else None


def _sync_pool_donations(pool: Pool) -> None:
    """Actualiza (in-place, sin guardar) el total/cursor de `pool` con las
    donaciones nuevas desde `donations_synced_cursor`. Recorre en orden
    ascendente pagina por pagina hasta que Horizon no devuelve mas: solo
    hace el trabajo proporcional a lo nuevo, nunca vuelve a mirar donaciones
    ya contadas.
    """
    server = get_server()
    cursor = pool.donations_synced_cursor
    totals = dict(pool.total_donated_by_asset)
    count = pool.donation_count

    while True:
        builder = (
            server.payments()
            .for_account(pool.wallet_address)
            .order(desc=False)
            .limit(SYNC_PAGE_SIZE)
        )
        if cursor:
            builder = builder.cursor(cursor)

        try:
            page = builder.call()
        except NotFoundError as exc:
            raise StellarAccountNotFoundError(pool.wallet_address) from exc
        except (ConnectionError, BaseHorizonError) as exc:
            raise StellarUnavailableError(str(exc)) from exc

        raw_records = page["_embedded"]["records"]
        if not raw_records:
            break

        # Auto-donaciones (del creador o de la propia wallet que recibe) no
        # cuentan: no inflan el progreso ni la meta del pool.
        self_senders = {pool.creator, pool.wallet_address}
        incoming = [
            op
            for op in raw_records
            if op.get("type") in PAYMENT_LIKE_OPERATION_TYPES
            and op.get("to") == pool.wallet_address
            and op.get("from") not in self_senders
        ]
        if incoming:
            try:
                memos_by_hash = _fetch_memos_in_batches(
                    server, [op["transaction_hash"] for op in incoming]
                )
            except (ConnectionError, BaseHorizonError) as exc:
                raise StellarUnavailableError(str(exc)) from exc

            for op in incoming:
                if memos_by_hash.get(op["transaction_hash"]) != pool.short_code:
                    continue
                asset_code, asset_issuer = asset_fields(op)
                key = _asset_key(asset_code, asset_issuer)
                totals[key] = str(Decimal(totals.get(key, "0")) + Decimal(op["amount"]))
                count += 1

        cursor = raw_records[-1]["paging_token"]
        if len(raw_records) < SYNC_PAGE_SIZE:
            break

    pool.donation_count = count
    pool.total_donated_by_asset = totals
    pool.donations_synced_cursor = cursor


def fetch_pool_donations(pool: Pool, limit: int = 20) -> list[dict]:
    """Ultimas donaciones REALES del pool: pagos entrantes a la wallet con
    memo == short_code, exactamente el mismo criterio que usa
    `_sync_pool_donations` para contar el progreso. Nada mas entra en el
    feed: ni gastos salientes de la wallet, ni pagos entrantes sin memo
    (que serian actividad no relacionada con el pool).

    Cada record trae los datos crudos del ledger; el memo vive en la tx
    padre, asi que se resuelve en batches como en la sync.
    """
    server = get_server()
    try:
        page = (
            server.payments()
            .for_account(pool.wallet_address)
            .order(desc=True)
            .limit(max(1, min(limit, 50)))
            .call()
        )
    except NotFoundError as exc:
        raise StellarAccountNotFoundError(pool.wallet_address) from exc
    except (ConnectionError, BaseHorizonError) as exc:
        raise StellarUnavailableError(str(exc)) from exc

    raw_records = page["_embedded"]["records"]
    # Mismo criterio que la sync: las auto-donaciones (creador / wallet
    # receptora) tampoco entran al feed.
    self_senders = {pool.creator, pool.wallet_address}
    incoming = [
        op
        for op in raw_records
        if op.get("type") in PAYMENT_LIKE_OPERATION_TYPES
        and op.get("to") == pool.wallet_address
        and op.get("from") not in self_senders
    ]
    if not incoming:
        return []

    try:
        memos_by_hash = _fetch_memos_in_batches(
            server, [op["transaction_hash"] for op in incoming]
        )
    except (ConnectionError, BaseHorizonError) as exc:
        raise StellarUnavailableError(str(exc)) from exc

    records = []
    for op in incoming:
        if memos_by_hash.get(op["transaction_hash"]) != pool.short_code:
            continue
        asset_code, asset_issuer = asset_fields(op)
        records.append(
            {
                "operation_id": op["id"],
                "sender": op["from"],
                "amount": op["amount"],
                "asset_code": asset_code,
                "asset_issuer": asset_issuer,
                "transaction_hash": op["transaction_hash"],
                "created_at": op["created_at"],
            }
        )
    return records


def get_pool_with_synced_progress(short_code: str) -> Pool:
    """Trae el pool por `short_code` y sincroniza su progreso contra
    Horizon de forma atomica (select_for_update): si dos requests consultan
    el mismo pool en paralelo se serializan, en vez de contar las mismas
    donaciones dos veces.

    Levanta `Pool.DoesNotExist` si no existe ese short_code.
    """
    with transaction.atomic():
        pool = Pool.objects.select_for_update().get(short_code=short_code)
        _sync_pool_donations(pool)
        pool.save(
            update_fields=[
                "donation_count",
                "total_donated_by_asset",
                "donations_synced_cursor",
                "updated_at",
            ]
        )
    return pool


def progress_summary(pool: Pool) -> dict:
    """Progreso del pool + estado de la meta.

    `xlm_equivalent_total` suma las donaciones de TODOS los assets
    convertidas a XLM con la tasa referencial de stellar_common.assets
    (testnet no tiene mercado DEX para USDC/EURC, no hay precio on-chain).
    `completed` es fail-closed: si hay donaciones en un asset sin tasa
    referencial, la meta no se puede marcar como cumplida (y el equivalente
    se devuelve en None) - mejor dejar el pool abierto un rato mas que
    cerrarlo por un conteo incompleto.
    """
    total_by_asset = []
    xlm_equivalent = Decimal(pool.total_donated_by_asset.get("XLM", "0"))
    rates_complete = True
    for key, total in pool.total_donated_by_asset.items():
        asset_code, asset_issuer = _split_asset_key(key)
        total_by_asset.append({"asset_code": asset_code, "asset_issuer": asset_issuer, "total": total})
        if asset_issuer is None:
            continue
        rate = CIRCLE_TESTNET_XLM_REFERENCE_RATES.get(asset_code)
        if rate is None:
            rates_complete = False
            continue
        xlm_equivalent += Decimal(total) * Decimal(rate)

    goal = pool.goal_amount
    completed = bool(goal and rates_complete and xlm_equivalent >= Decimal(goal))

    return {
        "donation_count": pool.donation_count,
        "total_by_asset": total_by_asset,
        "xlm_equivalent_total": str(xlm_equivalent) if rates_complete else None,
        "completed": completed,
    }
