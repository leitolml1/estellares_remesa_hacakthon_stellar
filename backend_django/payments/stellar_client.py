"""Lectura contra Horizon para el Modulo 1 (pagos P2P).

Este backend nunca construye ni firma transacciones: el frontend arma y
firma con Freighter (u otra wallet), envia el XDR firmado directo a Horizon,
y este backend solo *lee* el ledger para confirmar que una tx existe y
extraer los datos de pago que le sirven de metadata (sender/receiver/monto).
El ledger sigue siendo la fuente de verdad; nada de esto se vuelve a guardar
como "estado" propio, salvo lo que Horizon no tiene (nota/categoria).
"""

from dataclasses import dataclass

from stellar_sdk.exceptions import BaseHorizonError, ConnectionError, NotFoundError

from stellar_common.client import (
    PAYMENT_LIKE_OPERATION_TYPES,
    StellarAccountNotFoundError,
    StellarUnavailableError,
    asset_fields,
    get_server,
)

__all__ = [
    "StellarAccountNotFoundError",
    "StellarUnavailableError",
    "StellarTransactionNotFoundError",
    "StellarTransactionFailedError",
    "StellarTransactionNotAPaymentError",
    "OnChainPayment",
    "OnChainPaymentRecord",
    "fetch_payment_from_tx_hash",
    "fetch_payment_history",
]


class StellarLookupError(Exception):
    """Base de los errores de esta capa; llevan el tx_hash para poder loguear."""

    def __init__(self, tx_hash: str):
        self.tx_hash = tx_hash
        super().__init__(tx_hash)


class StellarTransactionNotFoundError(StellarLookupError):
    """La tx no existe (todavia, o nunca) en el ledger de Horizon."""


class StellarTransactionFailedError(StellarLookupError):
    """La tx existe pero Horizon la marca como no exitosa."""


class StellarTransactionNotAPaymentError(StellarLookupError):
    """La tx existe y fue exitosa, pero ninguna de sus operaciones es un pago."""


@dataclass(frozen=True)
class OnChainPayment:
    sender: str
    receiver: str
    amount: str
    asset_code: str
    asset_issuer: str | None


@dataclass(frozen=True)
class OnChainPaymentRecord(OnChainPayment):
    operation_id: str
    transaction_hash: str
    created_at: str


def fetch_payment_from_tx_hash(tx_hash: str) -> OnChainPayment:
    """Verifica contra Horizon que `tx_hash` sea una tx real, exitosa, con al
    menos una operacion de pago, y devuelve sender/receiver/monto tal como
    los ve el ledger.

    Si la tx tiene varias operaciones de pago (poco comun en este flujo P2P,
    pensado para una sola), se toma la primera.
    """
    server = get_server()

    try:
        transaction = server.transactions().transaction(tx_hash).call()
    except NotFoundError as exc:
        raise StellarTransactionNotFoundError(tx_hash) from exc
    except (ConnectionError, BaseHorizonError) as exc:
        raise StellarUnavailableError(str(exc)) from exc

    if not transaction.get("successful", False):
        raise StellarTransactionFailedError(tx_hash)

    try:
        operations = server.operations().for_transaction(tx_hash).call()["_embedded"]["records"]
    except (ConnectionError, BaseHorizonError) as exc:
        raise StellarUnavailableError(str(exc)) from exc

    for operation in operations:
        if operation.get("type") not in PAYMENT_LIKE_OPERATION_TYPES:
            continue

        asset_code, asset_issuer = asset_fields(operation)
        return OnChainPayment(
            sender=operation["from"],
            receiver=operation["to"],
            amount=operation["amount"],
            asset_code=asset_code,
            asset_issuer=asset_issuer,
        )

    raise StellarTransactionNotAPaymentError(tx_hash)


def fetch_payment_history(
    public_key: str,
    limit: int,
    cursor: str | None = None,
) -> tuple[list[OnChainPaymentRecord], str | None]:
    """Historial de pagos on-chain de `public_key`, paginado via cursor de
    Horizon (no trae todo para despues cortar en memoria).

    No incluye memo: a diferencia del Modulo 2 (que filtra por memo de
    pool), el historial P2P no lo necesita, y pedirlo implicaria 1 request
    extra por transaccion (memo vive en la tx padre, no en la operacion).
    """
    server = get_server()
    builder = server.payments().for_account(public_key).order(desc=True).limit(limit)
    if cursor:
        builder = builder.cursor(cursor)

    try:
        page = builder.call()
    except NotFoundError as exc:
        raise StellarAccountNotFoundError(public_key) from exc
    except (ConnectionError, BaseHorizonError) as exc:
        raise StellarUnavailableError(str(exc)) from exc

    raw_records = page["_embedded"]["records"]

    records = []
    for operation in raw_records:
        if operation.get("type") not in PAYMENT_LIKE_OPERATION_TYPES:
            continue
        asset_code, asset_issuer = asset_fields(operation)
        records.append(
            OnChainPaymentRecord(
                operation_id=operation["id"],
                sender=operation["from"],
                receiver=operation["to"],
                amount=operation["amount"],
                asset_code=asset_code,
                asset_issuer=asset_issuer,
                transaction_hash=operation["transaction_hash"],
                created_at=operation["created_at"],
            )
        )

    # El cursor de la proxima pagina se calcula sobre la respuesta cruda de
    # Horizon (no sobre `records`, que puede tener menos items si la pagina
    # trajo operaciones que no son pagos): asi la paginacion avanza siempre,
    # aunque esta pagina en particular no aporte ningun record util.
    next_cursor = raw_records[-1]["paging_token"] if raw_records else None

    return records, next_cursor
