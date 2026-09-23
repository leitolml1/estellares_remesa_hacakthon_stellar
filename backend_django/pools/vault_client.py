"""Cliente del vault comunitario (Modulo 2): contrato propio de Soroban
cuyo codigo Rust vive en vault_contract/ de la raiz del repo (ver el
docstring del contrato para las reglas enforced on-chain).

Mismo patron que family_pools.blend_client: ContractClient de stellar-sdk
arma las invocaciones (la simulacion resuelve fees y las entradas de auth),
y este backend nunca firma nada - devuelve XDRs para que los firme el
cliente (Freighter) y somete lo que vuelve firmado via Soroban RPC.

Montos: en la API de pools todo se maneja como strings con hasta 7
decimales (unidades del asset); al contrato se le pasan enteros escalados
por 10^7, igual que los stroops de XLM.
"""

import time
from decimal import Decimal

from django.conf import settings
from stellar_sdk import Address, Asset, TransactionBuilder, TransactionEnvelope, scval
from stellar_sdk.contract import ContractClient
from stellar_sdk.contract.exceptions import SimulationFailedError
from stellar_sdk.exceptions import BadRequestError, BaseHorizonError, ConnectionError
from stellar_sdk.operation import InvokeHostFunction
from stellar_sdk.soroban_rpc import GetTransactionStatus, SendTransactionStatus
from stellar_sdk.soroban_server import SorobanServer
from stellar_sdk.xdr import HostFunctionType

from stellar_common.assets import CIRCLE_TESTNET_ASSET_ISSUERS

TRANSACTION_TIMEOUT_SECONDS = 180
SCALES_PER_UNIT = Decimal(10_000_000)
POLL_ATTEMPTS = 15
POLL_DELAY_SECONDS = 2.0

VAULT_FUNCTIONS = ("create_pool", "deposit", "withdraw")


class VaultUnavailableError(Exception):
    """Soroban RPC no responde, o la tx no se confirmo a tiempo."""


class VaultConfirmationTimeoutError(VaultUnavailableError):
    """La tx se sometio pero no se confirmo dentro del polling; puede
    terminar confirmando igual. Trae el hash para poder reconciliar."""

    def __init__(self, message: str, tx_hash: str):
        super().__init__(message)
        self.tx_hash = tx_hash


class VaultConfigError(VaultUnavailableError):
    """El backend no tiene configurado el vault (VAULT_CONTRACT_ID
    vacio): es un error de configuracion, no de disponibilidad."""


class VaultSimulationError(Exception):
    """El contrato (o el host) rechazo la operacion: meta cumplida,
    auto-donacion del owner, retiro sobre lo donado, asset no admitido,
    etc. Trae el mensaje crudo para poder mostrarlo."""

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


class VaultValidationError(Exception):
    """El XDR firmado no es una invocacion valida a ESTE vault - nunca se
    confia en lo que declare el caller, se valida leyendo la tx firmada."""

    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


def sac_address_for(asset_code: str) -> str:
    """Address del SAC del asset (XLM nativo / USDC / EURC de Circle)."""
    code = (asset_code or "").strip().upper()
    if code in ("", "XLM", "NATIVE"):
        asset = Asset.native()
    else:
        issuer = CIRCLE_TESTNET_ASSET_ISSUERS.get(code)
        if not issuer:
            raise VaultValidationError("Solo se admiten XLM, USDC o EURC.")
        asset = Asset(code, issuer)
    return asset.contract_id(settings.STELLAR_NETWORK_PASSPHRASE)


def asset_code_for_sac(sac_address: str) -> str:
    """Nombre corto del asset dado el address de su SAC (para respuestas)."""
    native = Asset.native().contract_id(settings.STELLAR_NETWORK_PASSPHRASE)
    if sac_address == native:
        return "XLM"
    for code, issuer in CIRCLE_TESTNET_ASSET_ISSUERS.items():
        if Asset(code, issuer).contract_id(settings.STELLAR_NETWORK_PASSPHRASE) == sac_address:
            return code
    return sac_address[:12]


def amount_to_scaled(amount: str) -> int:
    """String con hasta 7 decimales -> entero escalado por 10^7 (la unidad
    de los montos del contrato)."""
    scaled = Decimal(amount) * SCALES_PER_UNIT
    if scaled <= 0 or scaled != scaled.to_integral_value():
        raise VaultValidationError("El monto tiene que ser positivo, con hasta 7 decimales.")
    return int(scaled)


def scaled_to_amount(scaled: int) -> str:
    return str(Decimal(scaled) / SCALES_PER_UNIT)


def _client() -> ContractClient:
    if not settings.VAULT_CONTRACT_ID:
        raise VaultConfigError("VAULT_CONTRACT_ID no esta configurado en el backend.")
    return ContractClient(
        contract_id=settings.VAULT_CONTRACT_ID,
        rpc_url=settings.STELLAR_SOROBAN_RPC_URL,
        network_passphrase=settings.STELLAR_NETWORK_PASSPHRASE,
    )


def _build_invoke_xdr(fn_name: str, parameters: list, source: str) -> str:
    client = _client()
    try:
        assembled = client.invoke(
            fn_name,
            parameters=parameters,
            source=source,
            transaction_timeout=TRANSACTION_TIMEOUT_SECONDS,
        )
    except SimulationFailedError as exc:
        raise VaultSimulationError(str(exc)) from exc
    except (ConnectionError, BaseHorizonError) as exc:
        raise VaultUnavailableError(str(exc)) from exc
    return assembled.to_xdr()


def build_create_pool_tx(short_code: str, owner_public_key: str, goal: int, initial_equivalent: int) -> str:
    """Registra el pool en el vault (nuevo o migrado). La firma el owner,
    que es la wallet_address del pool. goal/initial_equivalent van en
    enteros escalados (XLM-equivalente * 10^7)."""
    return _build_invoke_xdr(
        "create_pool",
        [
            scval.to_string(short_code),
            scval.to_address(owner_public_key),
            scval.to_int128(goal),
            scval.to_int128(initial_equivalent),
        ],
        owner_public_key,
    )


def build_deposit_tx(short_code: str, donor_public_key: str, asset_code: str, amount: str) -> str:
    """El donante transfiere `amount` del asset al vault del pool. El
    contrato rechaza on-chain meta cumplida / auto-donacion del owner /
    asset no admitido - esto igual lo revalida la vista antes de armar."""
    return _build_invoke_xdr(
        "deposit",
        [
            scval.to_string(short_code),
            scval.to_address(donor_public_key),
            scval.to_address(sac_address_for(asset_code)),
            scval.to_int128(amount_to_scaled(amount)),
        ],
        donor_public_key,
    )


def build_withdraw_tx(
    short_code: str,
    owner_public_key: str,
    asset_code: str,
    destination_public_key: str,
    amount: str,
) -> str:
    """El owner retira `amount` del asset hacia `destination`, al momento.
    El contrato lo capa a lo donado a este pool en particular."""
    return _build_invoke_xdr(
        "withdraw",
        [
            scval.to_string(short_code),
            scval.to_address(owner_public_key),
            scval.to_address(sac_address_for(asset_code)),
            scval.to_address(destination_public_key),
            scval.to_int128(amount_to_scaled(amount)),
        ],
        owner_public_key,
    )


def parse_invoke(signed_xdr: str) -> tuple[str, list]:
    """(fn_name, args) de una tx firmada que invoca al vault configurado -
    nunca se confia en lo que declare el body, se lee de la tx firmada.
    Los Address quedan como string G.../C... para compararlos directo.
    """
    try:
        envelope = TransactionBuilder.from_xdr(signed_xdr, settings.STELLAR_NETWORK_PASSPHRASE)
    except Exception as exc:
        raise VaultValidationError("El XDR enviado no es una transaccion valida.") from exc

    if not isinstance(envelope, TransactionEnvelope):
        raise VaultValidationError("Se esperaba una transaccion simple, no un fee-bump.")

    transaction = envelope.transaction
    if len(transaction.operations) != 1:
        raise VaultValidationError("La transaccion debe tener exactamente una operacion.")

    operation = transaction.operations[0]
    if not isinstance(operation, InvokeHostFunction):
        raise VaultValidationError("La operacion no es un llamado a un contrato.")

    host_function = operation.host_function
    if host_function.type != HostFunctionType.HOST_FUNCTION_TYPE_INVOKE_CONTRACT:
        raise VaultValidationError("El llamado no es una invocacion de contrato.")

    invoke_args = host_function.invoke_contract
    contract_strkey = Address.from_xdr_sc_address(invoke_args.contract_address).address
    if contract_strkey != settings.VAULT_CONTRACT_ID:
        raise VaultValidationError("La transaccion no llama al vault configurado.")

    fn_name = invoke_args.function_name.sc_symbol.decode()
    if fn_name not in VAULT_FUNCTIONS:
        raise VaultValidationError(f"La funcion {fn_name!r} no es del vault comunitario.")

    args = []
    for arg in invoke_args.args:
        native = scval.to_native(arg)
        if hasattr(native, "address"):
            native = native.address
        args.append(native)
    return fn_name, args


def submit_vault_tx(signed_xdr: str) -> dict:
    """Somete una tx ya firmada via Soroban RPC y espera su confirmacion.
    Soroban rechaza la tx entera si la invocacion trappea, asi que un
    SUCCESS aca significa que el contrato ejecuto sin panic."""
    try:
        envelope = TransactionBuilder.from_xdr(signed_xdr, settings.STELLAR_NETWORK_PASSPHRASE)
    except Exception as exc:
        raise VaultValidationError("El XDR enviado no es una transaccion valida.") from exc

    if not isinstance(envelope, TransactionEnvelope):
        raise VaultValidationError("Se esperaba una transaccion simple, no un fee-bump.")

    soroban_server = SorobanServer(settings.STELLAR_SOROBAN_RPC_URL)
    try:
        send_result = soroban_server.send_transaction(envelope)
    except (ConnectionError, BaseHorizonError, BadRequestError) as exc:
        raise VaultUnavailableError(str(exc)) from exc

    if send_result.status == SendTransactionStatus.ERROR:
        raise VaultSimulationError(f"La red rechazo la transaccion: {send_result.error_result_xdr}")

    for _ in range(POLL_ATTEMPTS):
        time.sleep(POLL_DELAY_SECONDS)
        try:
            result = soroban_server.get_transaction(send_result.hash)
        except (ConnectionError, BaseHorizonError) as exc:
            raise VaultUnavailableError(str(exc)) from exc

        if result.status == GetTransactionStatus.SUCCESS:
            return {"hash": send_result.hash}
        if result.status == GetTransactionStatus.FAILED:
            raise VaultSimulationError(
                f"La transaccion se incluyo en el ledger pero fallo (hash={send_result.hash})."
            )

    raise VaultConfirmationTimeoutError(
        f"No se pudo confirmar la transaccion a tiempo (hash={send_result.hash}); "
        "puede seguir procesandose, consulta el estado mas tarde antes de reintentar.",
        send_result.hash,
    )


def get_vault_leaderboard(short_code: str) -> list[dict]:
    """Leaderboard del pool leido directo del contrato: (donante, XLM
    equivalente acumulado), ordenado de mayor a menor aporte. Nunca baja
    al retirar. Los montos vuelven como strings en unidades XLM, igual que
    el resto de la API de pools."""
    client = _client()
    try:
        result = client.invoke("donors", parameters=[scval.to_string(short_code)]).result()
    except (ConnectionError, BaseHorizonError) as exc:
        raise VaultUnavailableError(str(exc)) from exc

    native = scval.to_native(result)
    donors = []
    for entry in native:
        donor, equivalent = entry[0], entry[1]
        donors.append(
            {
                "public_key": donor.address if hasattr(donor, "address") else str(donor),
                "donated_xlm_equivalent": scaled_to_amount(int(equivalent)),
            }
        )
    return donors


def get_vault_state(short_code: str) -> dict:
    """Estado on-chain del pool en el vault (fuente de verdad). Devuelve
    registered: False si el pool no esta registrado (o el contrato no
    responde con ese pool). Los montos vienen como strings en unidades del
    asset, igual que el resto de la API de pools."""
    client = _client()
    try:
        result = client.invoke("pool_info", parameters=[scval.to_string(short_code)]).result()
    except SimulationFailedError:
        # Un pool no registrado trappea (los mensajes de panic del build
        # release se strippan, asi que no se puede distinguir del resto).
        return {"registered": False}
    except (ConnectionError, BaseHorizonError) as exc:
        raise VaultUnavailableError(str(exc)) from exc

    native = scval.to_native(result)
    assets = []
    for item in native.get("assets", []):
        sac = item["asset"]
        sac_str = sac.address if hasattr(sac, "address") else str(sac)
        assets.append(
            {
                "asset_code": asset_code_for_sac(sac_str),
                "sac": sac_str,
                "donated": scaled_to_amount(item["donated"]),
                "withdrawn": scaled_to_amount(item["withdrawn"]),
                "available": scaled_to_amount(item["available"]),
            }
        )
    owner = native["owner"]
    return {
        "registered": True,
        "owner": owner.address if hasattr(owner, "address") else str(owner),
        "goal": scaled_to_amount(native["goal"]),
        "initial_equivalent": scaled_to_amount(native["initial_equivalent"]),
        "equivalent_total": scaled_to_amount(native["equivalent_total"]),
        "complete": bool(native["complete"]),
        "assets": assets,
    }
