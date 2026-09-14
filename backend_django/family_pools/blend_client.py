"""Integracion con Blend Protocol (lending sobre Soroban) para invertir
automaticamente los fondos de la caja familiar y generar rendimiento
(Modulo 3, paso 3).

Blend no tiene SDK oficial en Python - `@blend-capital/blend-sdk` es solo
JS/TS. En vez de portarlo, se replica el unico llamado que hace falta
(`submit`) usando el soporte generico de Soroban de `stellar-sdk`
(`ContractClient` + `scval`). Todo lo siguiente se confirmo contra fuentes
primarias antes de escribir esta integracion, no de memoria:

  - La interfaz real del contrato desplegado en testnet
    (SorobanServer.get_contract_spec sobre BLEND_POOL_CONTRACT_ID):
    confirma que `submit`, `get_reserve_list`, `get_positions`, etc.
    existen tal cual, y la forma exacta de `Request` (address, amount,
    request_type: u32).
  - El codigo fuente de blend-sdk-js (src/pool/index.ts) para los valores
    exactos del enum RequestType: Supply=0, Withdraw=1,
    SupplyCollateral=2, WithdrawCollateral=3 (no confundir: para
    simplemente prestar/rescatar sin pedir prestado se usan Supply/
    Withdraw, no las variantes *Collateral).
  - El codigo fuente de blend-contracts-v2 (pool/src/pool/actions.rs) para
    entender la semantica de `amount` en un Withdraw (esta en unidades del
    activo subyacente, no en bTokens - el contrato hace la conversion via
    el b_rate interno).
  - Pruebas reales en testnet: Supply y Withdraw ejecutados end-to-end
    contra el pool real, incluyendo con `from`/`spender`/`to` = una cuenta
    multisig familiar. Punto clave verificado empiricamente: una
    operacion InvokeHostFunction donde el invoker es la propia cuenta
    origen de la tx exige el mismo medThreshold que un Payment (NO
    highThreshold) - el mismo quorum familiar que aprueba un retiro
    alcanza para mover plata hacia/desde Blend.

Diseño: supply/withdraw de Blend son acciones separadas y explicitas, no
estan encadenadas al flujo de retiro normal (ver views.WithdrawalBuildView
/ WithdrawalSubmitView). Si Blend llegara a fallar o quedar inaccesible,
depositar y retirar de la caja familiar siguen funcionando sin tocarse -
es el "Plan B" ya incorporado por diseño, no un modo de emergencia aparte.
"""

import time
from decimal import Decimal

from django.conf import settings
from stellar_sdk import Asset, TransactionBuilder, TransactionEnvelope, scval
from stellar_sdk.contract import ContractClient
from stellar_sdk.contract.exceptions import SimulationFailedError
from stellar_sdk.exceptions import BadRequestError, BaseHorizonError, ConnectionError
from stellar_sdk.soroban_rpc import GetTransactionStatus, SendTransactionStatus
from stellar_sdk.soroban_server import SorobanServer

REQUEST_TYPE_SUPPLY = 0
REQUEST_TYPE_WITHDRAW = 1

STROOPS_PER_LUMEN = Decimal(10_000_000)
TRANSACTION_TIMEOUT_SECONDS = 180
POLL_ATTEMPTS = 15
POLL_DELAY_SECONDS = 2.0


class BlendUnavailableError(Exception):
    """Blend/Soroban RPC no responde, o la tx no se pudo confirmar a
    tiempo por una razon de red/disponibilidad, no de logica de negocio."""


class BlendSimulationError(Exception):
    """La tx fue rechazada por el contrato de Blend o por Soroban (ej.
    monto invalido, reserva no soportada, tx mal formada). Trae el
    mensaje crudo del host para poder loguearlo/mostrarlo."""

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


def _xlm_reserve_address() -> str:
    return Asset.native().contract_id(settings.STELLAR_NETWORK_PASSPHRASE)


def _amount_to_stroops(amount: str) -> int:
    return int((Decimal(amount) * STROOPS_PER_LUMEN).to_integral_exact())


def _get_contract_client() -> ContractClient:
    return ContractClient(
        contract_id=settings.BLEND_POOL_CONTRACT_ID,
        rpc_url=settings.STELLAR_SOROBAN_RPC_URL,
        network_passphrase=settings.STELLAR_NETWORK_PASSPHRASE,
    )


def _build_submit_xdr(pool_account: str, request_type: int, amount: str) -> str:
    """Arma (sin firmar) una tx que llama a `submit()` en el pool de
    Blend con un unico Request sobre la reserva de XLM. `from`, `spender`
    y `to` son siempre la cuenta del pool: no hay ningun otro actor
    involucrado en supply/withdraw propio de la caja familiar.
    """
    request = scval.to_struct(
        {
            "address": scval.to_address(_xlm_reserve_address()),
            "amount": scval.to_int128(_amount_to_stroops(amount)),
            "request_type": scval.to_uint32(request_type),
        }
    )
    params = [
        scval.to_address(pool_account),
        scval.to_address(pool_account),
        scval.to_address(pool_account),
        scval.to_vec([request]),
    ]

    client = _get_contract_client()
    try:
        assembled = client.invoke(
            "submit",
            parameters=params,
            source=pool_account,
            transaction_timeout=TRANSACTION_TIMEOUT_SECONDS,
        )
    except SimulationFailedError as exc:
        raise BlendSimulationError(str(exc)) from exc
    except (ConnectionError, BaseHorizonError) as exc:
        raise BlendUnavailableError(str(exc)) from exc

    return assembled.to_xdr()


def build_supply_tx(pool_account: str, amount: str) -> str:
    """Tx (sin firmar) que hace supply de `amount` XLM del balance
    ocioso de la cuenta del pool hacia Blend, para que empiece a generar
    interes. La firma el mismo quorum familiar que aprueba un retiro
    (medThreshold).
    """
    return _build_submit_xdr(pool_account, REQUEST_TYPE_SUPPLY, amount)


def build_withdraw_from_blend_tx(pool_account: str, amount: str) -> str:
    """Tx (sin firmar) que hace redeem de `amount` XLM (capital + interes
    acumulado, segun el b_rate actual del reserve) desde Blend de vuelta
    al balance clasico de la cuenta del pool.

    Esto NO saca fondos de la caja familiar hacia afuera - para eso esta
    el flujo de retiro normal (views.WithdrawalBuildView/-SubmitView), que
    sigue funcionando igual haya o no plata puesta en Blend.
    """
    return _build_submit_xdr(pool_account, REQUEST_TYPE_WITHDRAW, amount)


def submit_blend_tx(signed_xdr: str) -> dict:
    """Somete una tx de Blend ya firmada (supply o withdraw) a la red via
    Soroban RPC, y espera su confirmacion.
    """
    try:
        envelope = TransactionBuilder.from_xdr(signed_xdr, settings.STELLAR_NETWORK_PASSPHRASE)
    except Exception as exc:
        raise BlendSimulationError("El XDR enviado no es una transaccion valida.") from exc

    if not isinstance(envelope, TransactionEnvelope):
        raise BlendSimulationError("Se esperaba una transaccion simple, no un fee-bump.")

    soroban_server = SorobanServer(settings.STELLAR_SOROBAN_RPC_URL)
    try:
        send_result = soroban_server.send_transaction(envelope)
    except (ConnectionError, BaseHorizonError, BadRequestError) as exc:
        raise BlendUnavailableError(str(exc)) from exc

    if send_result.status == SendTransactionStatus.ERROR:
        raise BlendSimulationError(f"La red rechazo la transaccion: {send_result.error_result_xdr}")

    return _poll_transaction(soroban_server, send_result.hash)


def _poll_transaction(soroban_server: SorobanServer, tx_hash: str) -> dict:
    for _ in range(POLL_ATTEMPTS):
        time.sleep(POLL_DELAY_SECONDS)
        try:
            result = soroban_server.get_transaction(tx_hash)
        except (ConnectionError, BaseHorizonError) as exc:
            raise BlendUnavailableError(str(exc)) from exc

        if result.status == GetTransactionStatus.SUCCESS:
            return {"hash": tx_hash, "status": "SUCCESS"}
        if result.status == GetTransactionStatus.FAILED:
            raise BlendSimulationError(f"La transaccion se incluyo en el ledger pero fallo (hash={tx_hash}).")

    raise BlendUnavailableError(
        f"No se pudo confirmar la transaccion a tiempo (hash={tx_hash}); puede seguir procesandose, "
        "consulta el estado mas tarde antes de reintentar."
    )
