"""Construccion/verificacion contra Horizon para el Modulo 3 (caja
familiar multi-firma). Multisig nativo de Stellar, sin contrato propio -
ver docstring de FamilyPool para el resumen del diseño de signers/
thresholds.

Flujo de 3 pasos, todo firmado del lado del cliente (el backend nunca ve
private keys):

  1. build_create_account_tx: tx CreateAccount firmada por el creador (una
     wallet existente, ej. Freighter) que funda la cuenta nueva del pool.
  2. build_configure_signers_tx: tx SetOptions firmada por la master key
     efimera de la cuenta del pool recien creada (se genera y se descarta
     del lado del cliente, nunca la ve este backend), que agrega a la
     familia como signers y pone master_weight en 0.
  3. confirm_pool_setup: lee Horizon para confirmar que la cuenta quedo
     configurada como se pidio, y arma el snapshot para guardar como
     FamilyPool - nunca se confia en lo que mando el cliente sobre
     signers/thresholds, siempre se relee del ledger.

Retiros (build_withdrawal_tx / submit_withdrawal): el multisig nativo de
Stellar no valida montos por operacion, asi que el tope de withdrawal_limit
es 100% responsabilidad de este backend. Se revalida en DOS puntos, nunca
confiando en lo que declare el caller: (a) en build, antes de tocar Horizon
o construir la tx; (b) en submit, releyendo el monto directo de la tx ya
firmada (no del body del request), por si algo llega a este endpoint sin
haber pasado por build.
"""

from decimal import Decimal

from django.conf import settings
from stellar_sdk import Asset, TransactionBuilder, TransactionEnvelope
from stellar_sdk.exceptions import BadRequestError, BaseHorizonError, ConnectionError, NotFoundError
from stellar_sdk.operation import ChangeTrust, Payment, SetOptions
from stellar_sdk.signer_key import SignerKeyType

from stellar_common.assets import CIRCLE_TESTNET_ASSET_ISSUERS
from stellar_common.client import StellarAccountNotFoundError, StellarUnavailableError, get_server

TRANSACTION_TIMEOUT_SECONDS = 180
STROOPS_PER_LUMEN = Decimal(10_000_000)
MAX_THRESHOLD = 255


class StellarAccountAlreadyExistsError(Exception):
    """El pool_public_key propuesto ya existe en el ledger: tiene que ser
    una keypair nueva, generada especificamente para este pool."""

    def __init__(self, public_key: str):
        self.public_key = public_key
        super().__init__(public_key)


class PoolSetupIncompleteError(Exception):
    """La cuenta existe pero su config on-chain no coincide con un setup
    valido de caja familiar (master_weight != 0, sin signers familiares,
    medThreshold en 0, etc.)."""

    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


class WithdrawalLimitExceededError(Exception):
    """El monto pedido supera withdrawal_limit. Se levanta ANTES de tocar
    Horizon o construir cualquier tx - el chequeo de limite nunca depende
    de una llamada de red."""

    def __init__(self, amount: str, limit: str):
        self.amount = amount
        self.limit = limit
        super().__init__(f"{amount} > {limit}")


class WithdrawalValidationError(Exception):
    """El XDR firmado que se pidio someter no corresponde a un retiro
    valido de este pool (source distinto, mas de una operacion, asset no
    nativo, etc.)."""

    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


class StellarSubmissionError(Exception):
    """Horizon rechazo la tx al enviarla. `category` deja que la vista
    elija el status HTTP sin tener que parsear result_codes de nuevo."""

    def __init__(self, category: str, message: str):
        self.category = category
        self.message = message
        super().__init__(message)

    @classmethod
    def from_bad_request(cls, exc: BadRequestError) -> "StellarSubmissionError":
        result_codes = (exc.extras or {}).get("result_codes", {})
        transaction_code = result_codes.get("transaction")
        operation_codes = result_codes.get("operations") or []

        if transaction_code == "tx_bad_seq":
            return cls("bad_seq", "El sequence number de la cuenta del pool esta desactualizado, reintenta.")
        if transaction_code == "tx_bad_auth" or "op_bad_auth" in operation_codes:
            return cls(
                "insufficient_signatures",
                "Faltan firmas o el peso combinado no alcanza el umbral requerido.",
            )
        if "op_underfunded" in operation_codes:
            return cls("underfunded", "Fondos insuficientes en la cuenta del pool para este retiro.")
        return cls("other", "La transaccion de retiro fue rechazada por la red Stellar.")


def account_exists(public_key: str) -> bool:
    server = get_server()
    try:
        server.load_account(public_key)
        return True
    except NotFoundError:
        return False
    except (ConnectionError, BaseHorizonError) as exc:
        raise StellarUnavailableError(str(exc)) from exc


def get_base_reserve() -> Decimal:
    server = get_server()
    try:
        ledger = server.ledgers().order(desc=True).limit(1).call()["_embedded"]["records"][0]
    except (ConnectionError, BaseHorizonError) as exc:
        raise StellarUnavailableError(str(exc)) from exc
    return Decimal(ledger["base_reserve_in_stroops"]) / STROOPS_PER_LUMEN


def compute_minimum_starting_balance(signer_count: int) -> str:
    """(2 + subentries) * base_reserve, con 1 base_reserve extra de margen
    (cubre tambien el fee de la tx de configuracion que sigue). Cada
    signer agregado cuenta como 1 subentry de la cuenta - ver
    "Base Reserves and Minimum Balance" en la docs de Stellar.
    """
    base_reserve = get_base_reserve()
    return str((Decimal(2 + signer_count) + 1) * base_reserve)


def build_create_account_tx(creator_public_key: str, pool_public_key: str, starting_balance: str) -> str:
    """Tx CreateAccount (source=creator) que funda la cuenta nueva del
    pool. La firma el creador con su wallet existente.
    """
    if account_exists(pool_public_key):
        raise StellarAccountAlreadyExistsError(pool_public_key)

    server = get_server()
    try:
        creator_account = server.load_account(creator_public_key)
        base_fee = server.fetch_base_fee()
    except NotFoundError as exc:
        raise StellarAccountNotFoundError(creator_public_key) from exc
    except (ConnectionError, BaseHorizonError) as exc:
        raise StellarUnavailableError(str(exc)) from exc

    tx = (
        TransactionBuilder(
            creator_account,
            network_passphrase=settings.STELLAR_NETWORK_PASSPHRASE,
            base_fee=base_fee,
        )
        .append_create_account_op(destination=pool_public_key, starting_balance=starting_balance)
        .set_timeout(TRANSACTION_TIMEOUT_SECONDS)
        .build()
    )
    return tx.to_xdr()


def build_configure_signers_tx(pool_public_key: str, signers: list[dict], med_threshold: int) -> str:
    """Tx SetOptions (source=pool_public_key) que agrega a la familia como
    signers, fija medThreshold para retiros, highThreshold = suma de todos
    los weights (unanime, protege cambios futuros al multisig) y pone
    master_weight en 0.

    Cambiar signers/weights/thresholds requiere highThreshold (verificado
    empiricamente contra testnet: un SetOptions que solo toca otros campos,
    como home_domain, alcanza con medThreshold, pero tocar signers o
    thresholds exige highThreshold) - por eso esta tx tiene que estar
    firmada, en este momento puntual, solo por la master key (unica
    autoridad que existe todavia sobre la cuenta recien creada).
    """
    server = get_server()
    try:
        pool_account = server.load_account(pool_public_key)
        base_fee = server.fetch_base_fee()
    except NotFoundError as exc:
        raise StellarAccountNotFoundError(pool_public_key) from exc
    except (ConnectionError, BaseHorizonError) as exc:
        raise StellarUnavailableError(str(exc)) from exc

    high_threshold = sum(signer["weight"] for signer in signers)

    builder = TransactionBuilder(
        pool_account,
        network_passphrase=settings.STELLAR_NETWORK_PASSPHRASE,
        base_fee=base_fee,
    )
    for signer in signers:
        builder = builder.append_ed25519_public_key_signer(signer["public_key"], signer["weight"])

    builder = builder.append_set_options_op(
        master_weight=0,
        low_threshold=med_threshold,
        med_threshold=med_threshold,
        high_threshold=high_threshold,
    )

    tx = builder.set_timeout(TRANSACTION_TIMEOUT_SECONDS).build()
    return tx.to_xdr()


def confirm_pool_setup(pool_public_key: str) -> dict:
    """Lee Horizon y confirma que `pool_public_key` quedo configurada como
    una caja familiar valida. Nunca confia en lo que mando el cliente
    sobre signers/thresholds: los relee del ledger, que es la fuente de
    verdad.

    Devuelve un dict listo para persistir en FamilyPool (signers,
    med_threshold, high_threshold). Levanta PoolSetupIncompleteError si la
    cuenta no quedo configurada como se espera.
    """
    server = get_server()
    try:
        account = server.accounts().account_id(pool_public_key).call()
    except NotFoundError as exc:
        raise StellarAccountNotFoundError(pool_public_key) from exc
    except (ConnectionError, BaseHorizonError) as exc:
        raise StellarUnavailableError(str(exc)) from exc

    med_threshold = account["thresholds"]["med_threshold"]
    high_threshold = account["thresholds"]["high_threshold"]

    master_signer = next((s for s in account["signers"] if s["key"] == pool_public_key), None)
    if master_signer is not None and master_signer["weight"] != 0:
        raise PoolSetupIncompleteError("La master key de la cuenta todavia tiene weight distinto de 0.")

    family_signers = [
        {"public_key": s["key"], "weight": s["weight"]}
        for s in account["signers"]
        if s["key"] != pool_public_key and s["weight"] > 0
    ]
    if not family_signers:
        raise PoolSetupIncompleteError("La cuenta no tiene ningun signer familiar configurado.")

    if med_threshold < 1:
        raise PoolSetupIncompleteError("medThreshold no esta configurado (sigue en 0).")

    return {
        "signers": family_signers,
        "med_threshold": med_threshold,
        "high_threshold": high_threshold,
    }


def resolve_circle_or_native_asset(asset_code: str | None) -> Asset:
    code = (asset_code or "XLM").strip().upper()
    if code in ("", "XLM", "NATIVE"):
        return Asset.native()
    issuer = CIRCLE_TESTNET_ASSET_ISSUERS.get(code)
    if not issuer:
        raise WithdrawalValidationError("Solo se admiten XLM, USDC o EURC de Circle testnet.")
    return Asset(code, issuer)


def _assert_supported_payment_asset(asset: Asset) -> None:
    if asset.is_native():
        return
    issuer = CIRCLE_TESTNET_ASSET_ISSUERS.get(asset.code)
    if not issuer or asset.issuer != issuer:
        raise WithdrawalValidationError("Solo se admiten XLM, USDC o EURC de Circle testnet.")


def _effective_withdrawal_limit(asset: Asset, withdrawal_limit: str, asset_limits: dict) -> str:
    """Tope que aplica a un retiro segun su asset: `withdrawal_limit` es
    el tope en XLM y cada asset no nativo necesita el suyo propio - nunca
    se reusa el tope de XLM para otro asset porque "100 XLM" y "100 USDC"
    no representan el mismo valor. Sin tope configurado, el asset no se
    puede retirar (fail closed).
    """
    if asset.is_native():
        return withdrawal_limit
    limit = (asset_limits or {}).get(asset.code)
    if not limit:
        raise WithdrawalValidationError(
            f"Esta caja no tiene limite de retiro configurado para {asset.code}: "
            "no se pueden retirar assets sin un tope propio."
        )
    return str(limit)


def build_withdrawal_tx(
    pool_account: str,
    withdrawal_limit: str,
    destination_public_key: str,
    amount: str,
    memo: str | None = None,
    asset_code: str | None = None,
    asset_withdrawal_limits: dict | None = None,
) -> str:
    """Arma (sin firmar) la tx Payment de un retiro desde la cuenta del
    pool.

    CRITICO: el chequeo del tope de retiro es lo primero que pasa aca,
    antes de tocar Horizon o construir nada - nunca se confia en que el
    frontend ya "aprobo" un monto, se revalida siempre contra la config
    guardada en este backend (nunca en base a lo que declare el caller).
    """
    asset = resolve_circle_or_native_asset(asset_code)
    limit = _effective_withdrawal_limit(asset, withdrawal_limit, asset_withdrawal_limits)
    if Decimal(amount) > Decimal(limit):
        raise WithdrawalLimitExceededError(amount, limit)

    server = get_server()
    try:
        pool_stellar_account = server.load_account(pool_account)
        base_fee = server.fetch_base_fee()
    except NotFoundError as exc:
        raise StellarAccountNotFoundError(pool_account) from exc
    except (ConnectionError, BaseHorizonError) as exc:
        raise StellarUnavailableError(str(exc)) from exc

    builder = TransactionBuilder(
        pool_stellar_account,
        network_passphrase=settings.STELLAR_NETWORK_PASSPHRASE,
        base_fee=base_fee,
    ).append_payment_op(destination=destination_public_key, asset=asset, amount=amount)

    if memo:
        builder = builder.add_text_memo(memo)

    tx = builder.set_timeout(TRANSACTION_TIMEOUT_SECONDS).build()
    return tx.to_xdr()


def _validate_signed_withdrawal(
    pool_account: str,
    withdrawal_limit: str,
    signed_xdr: str,
    asset_withdrawal_limits: dict | None = None,
) -> TransactionEnvelope:
    """Extrae el monto/destino/source directo de la tx ya firmada (no de
    lo que declare el body del request) y los valida, incluyendo un
    segundo chequeo de withdrawal_limit: defensa en profundidad por si
    algo firmo una tx sin pasar por build_withdrawal_tx.
    """
    try:
        envelope = TransactionBuilder.from_xdr(signed_xdr, settings.STELLAR_NETWORK_PASSPHRASE)
    except Exception as exc:
        raise WithdrawalValidationError("El XDR enviado no es una transaccion valida.") from exc

    if not isinstance(envelope, TransactionEnvelope):
        raise WithdrawalValidationError("Se esperaba una transaccion simple, no un fee-bump.")

    transaction = envelope.transaction
    if transaction.source.account_id != pool_account:
        raise WithdrawalValidationError("La transaccion no tiene como source la cuenta de este pool.")

    if len(transaction.operations) != 1:
        raise WithdrawalValidationError("La transaccion de retiro debe tener exactamente una operacion.")

    operation = transaction.operations[0]
    if not isinstance(operation, Payment):
        raise WithdrawalValidationError("La operacion de la transaccion no es un Payment.")

    if operation.source is not None and operation.source.account_id != pool_account:
        raise WithdrawalValidationError("La operacion tiene un source distinto a la cuenta del pool.")

    _assert_supported_payment_asset(operation.asset)

    limit = _effective_withdrawal_limit(operation.asset, withdrawal_limit, asset_withdrawal_limits)
    if Decimal(operation.amount) > Decimal(limit):
        raise WithdrawalLimitExceededError(operation.amount, limit)

    return envelope


def submit_withdrawal(
    pool_account: str,
    withdrawal_limit: str,
    signed_xdr: str,
    asset_withdrawal_limits: dict | None = None,
) -> dict:
    envelope = _validate_signed_withdrawal(
        pool_account, withdrawal_limit, signed_xdr, asset_withdrawal_limits
    )

    server = get_server()
    try:
        response = server.submit_transaction(envelope)
    except BadRequestError as exc:
        raise StellarSubmissionError.from_bad_request(exc) from exc
    except (ConnectionError, BaseHorizonError) as exc:
        raise StellarUnavailableError(str(exc)) from exc

    return {"hash": response["hash"], "ledger": response["ledger"]}


def _load_pool_builder(pool_account: str) -> tuple[TransactionBuilder, object]:
    server = get_server()
    try:
        pool_stellar_account = server.load_account(pool_account)
        base_fee = server.fetch_base_fee()
    except NotFoundError as exc:
        raise StellarAccountNotFoundError(pool_account) from exc
    except (ConnectionError, BaseHorizonError) as exc:
        raise StellarUnavailableError(str(exc)) from exc

    builder = TransactionBuilder(
        pool_stellar_account,
        network_passphrase=settings.STELLAR_NETWORK_PASSPHRASE,
        base_fee=base_fee,
    )
    return builder, server


def build_change_trust_tx(pool_account: str, asset_code: str) -> str:
    """ChangeTrust (source=pool) para que la caja pueda recibir USDC/EURC.
    Es una operacion de umbral medio: el mismo quorum que un retiro.
    """
    asset = resolve_circle_or_native_asset(asset_code)
    if asset.is_native():
        raise WithdrawalValidationError("XLM nativo no necesita trustline.")

    builder, _server = _load_pool_builder(pool_account)
    tx = builder.append_change_trust_op(asset=asset).set_timeout(TRANSACTION_TIMEOUT_SECONDS).build()
    return tx.to_xdr()


def build_add_signer_tx(pool_account: str, signer_public_key: str, weight: int) -> str:
    """Agrega un firmante y sube highThreshold para seguir exigiendo
    acuerdo unanime. Requiere el umbral alto (toda la familia actual).
    """
    onchain = confirm_pool_setup(pool_account)
    existing = {signer["public_key"] for signer in onchain["signers"]}
    if signer_public_key in existing or signer_public_key == pool_account:
        raise WithdrawalValidationError("Esa wallet ya es firmante de esta caja.")

    new_high = onchain["high_threshold"] + weight
    if new_high > MAX_THRESHOLD:
        raise WithdrawalValidationError(
            f"La suma de weights ({new_high}) no puede superar {MAX_THRESHOLD}."
        )

    builder, _server = _load_pool_builder(pool_account)
    tx = (
        builder.append_ed25519_public_key_signer(signer_public_key, weight)
        .append_set_options_op(high_threshold=new_high)
        .set_timeout(TRANSACTION_TIMEOUT_SECONDS)
        .build()
    )
    return tx.to_xdr()


def _envelope_from_signed_xdr(signed_xdr: str) -> TransactionEnvelope:
    try:
        envelope = TransactionBuilder.from_xdr(signed_xdr, settings.STELLAR_NETWORK_PASSPHRASE)
    except Exception as exc:
        raise WithdrawalValidationError("El XDR enviado no es una transaccion valida.") from exc

    if not isinstance(envelope, TransactionEnvelope):
        raise WithdrawalValidationError("Se esperaba una transaccion simple, no un fee-bump.")
    return envelope


def submit_change_trust(pool_account: str, signed_xdr: str) -> dict:
    envelope = _envelope_from_signed_xdr(signed_xdr)
    transaction = envelope.transaction
    if transaction.source.account_id != pool_account:
        raise WithdrawalValidationError("La transaccion no tiene como source la cuenta de este pool.")
    if len(transaction.operations) != 1 or not isinstance(transaction.operations[0], ChangeTrust):
        raise WithdrawalValidationError("La transaccion no es un ChangeTrust de esta caja.")

    asset = transaction.operations[0].asset
    _assert_supported_payment_asset(asset)
    if asset.is_native():
        raise WithdrawalValidationError("XLM nativo no necesita trustline.")

    return _submit_pool_envelope(envelope)


def _set_options_touched_fields(operation: SetOptions) -> set[str]:
    """Nombres de los campos de configuracion que esta operacion SetOptions
    efectivamente toca (los que no quedaron en None).
    """
    fields = (
        "inflation_dest",
        "clear_flags",
        "set_flags",
        "master_weight",
        "low_threshold",
        "med_threshold",
        "high_threshold",
        "home_domain",
        "signer",
    )
    return {field for field in fields if getattr(operation, field) is not None}


def submit_add_signer(pool_account: str, signed_xdr: str) -> dict:
    """Somete un alta de firmante, validando la ESTRUCTURA de la tx firmada
    igual que se valida un retiro: la unica forma admitida es la que arma
    build_add_signer_tx, o sea exactamente dos operaciones SetOptions -
    (1) dar de alta un signer ed25519 nuevo con peso >= 1, (2) subir
    high_threshold. Todo lo demas (borrar signers via weight 0, restaurar
    master_weight, bajar thresholds) se rechaza aca, sin confiar en que
    la tx haya pasado por build/.
    """
    envelope = _envelope_from_signed_xdr(signed_xdr)
    transaction = envelope.transaction
    if transaction.source.account_id != pool_account:
        raise WithdrawalValidationError("La transaccion no tiene como source la cuenta de este pool.")

    operations = transaction.operations
    if len(operations) != 2 or not all(isinstance(operation, SetOptions) for operation in operations):
        raise WithdrawalValidationError(
            "La tx de alta de firmante debe tener exactamente dos operaciones SetOptions."
        )

    add_op, threshold_op = operations

    if _set_options_touched_fields(add_op) != {"signer"}:
        raise WithdrawalValidationError(
            "La primera operacion solo puede dar de alta un signer, sin tocar otra configuracion."
        )
    signer = add_op.signer
    if (
        signer is None
        or signer.signer_key.signer_key_type != SignerKeyType.SIGNER_KEY_TYPE_ED25519
        or (signer.weight or 0) < 1
    ):
        raise WithdrawalValidationError(
            "La primera operacion tiene que dar de alta una wallet ed25519 con peso >= 1."
        )
    signer_public_key = signer.signer_key.encoded_signer_key

    if _set_options_touched_fields(threshold_op) != {"high_threshold"}:
        raise WithdrawalValidationError(
            "La segunda operacion solo puede subir high_threshold, sin tocar otra configuracion."
        )

    onchain = confirm_pool_setup(pool_account)
    existing = {existing_signer["public_key"] for existing_signer in onchain["signers"]}
    if signer_public_key == pool_account or signer_public_key in existing:
        raise WithdrawalValidationError("Esa wallet ya es firmante de esta caja (o es la master key).")
    if not (
        onchain["high_threshold"] <= threshold_op.high_threshold <= MAX_THRESHOLD
    ):
        raise WithdrawalValidationError(
            "high_threshold solo puede subir (y seguir dentro del rango 0-255)."
        )

    return _submit_pool_envelope(envelope)


def _submit_pool_envelope(envelope: TransactionEnvelope) -> dict:
    server = get_server()
    try:
        response = server.submit_transaction(envelope)
    except BadRequestError as exc:
        raise StellarSubmissionError.from_bad_request(exc) from exc
    except (ConnectionError, BaseHorizonError) as exc:
        raise StellarUnavailableError(str(exc)) from exc

    return {"hash": response["hash"], "ledger": response["ledger"]}
