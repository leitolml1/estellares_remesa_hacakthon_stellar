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

        incoming = [
            op
            for op in raw_records
            if op.get("type") in PAYMENT_LIKE_OPERATION_TYPES and op.get("to") == pool.wallet_address
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
    total_by_asset = []
    for key, total in pool.total_donated_by_asset.items():
        asset_code, asset_issuer = _split_asset_key(key)
        total_by_asset.append({"asset_code": asset_code, "asset_issuer": asset_issuer, "total": total})

    return {"donation_count": pool.donation_count, "total_by_asset": total_by_asset}
