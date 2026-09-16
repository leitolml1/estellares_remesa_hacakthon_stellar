from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.db.utils import NotSupportedError
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from payments.stellar_client import (
    StellarTransactionFailedError,
    StellarTransactionNotAPaymentError,
    StellarTransactionNotFoundError,
    fetch_payment_from_tx_hash,
)
from stellar_common.client import StellarAccountNotFoundError, StellarUnavailableError

from .blend_client import (
    REQUEST_TYPE_WITHDRAW,
    BlendSimulationError,
    BlendUnavailableError,
    BlendValidationError,
    build_supply_tx,
    build_withdraw_from_blend_tx,
    compute_updated_principal,
    get_position,
    parse_submit_request,
    submit_blend_tx,
)
from .models import FamilyPool, FamilyPoolDeposit
from .serializers import (
    AddDepositorSerializer,
    AddSignerBuildSerializer,
    BlendAmountSerializer,
    BuildConfigureSignersSerializer,
    BuildCreateAccountSerializer,
    ConfirmPoolSetupSerializer,
    FamilyPoolDepositCreateSerializer,
    FamilyPoolDepositSerializer,
    FamilyPoolSerializer,
    TrustlineBuildSerializer,
    WithdrawalBuildSerializer,
    WithdrawalSubmitSerializer,
)
from .stellar_client import (
    PoolSetupIncompleteError,
    StellarAccountAlreadyExistsError,
    StellarSubmissionError,
    WithdrawalLimitExceededError,
    WithdrawalValidationError,
    build_add_signer_tx,
    build_change_trust_tx,
    build_configure_signers_tx,
    build_create_account_tx,
    build_withdrawal_tx,
    compute_minimum_starting_balance,
    confirm_pool_setup,
    submit_add_signer,
    submit_change_trust,
    submit_withdrawal,
)


def is_family_signer(pool: FamilyPool, public_key: str) -> bool:
    return any(signer.get("public_key") == public_key for signer in pool.signers or [])


def is_family_member(pool: FamilyPool, public_key: str) -> bool:
    if pool.creator == public_key:
        return True
    if is_family_signer(pool, public_key):
        return True
    return public_key in (pool.depositors or [])


def family_pools_visible_to(public_key: str):
    # Containment de JSONField (Postgres @>): matchea los signers que
    # tienen esa public_key aunque traigan mas campos (weight), dejando
    # que la DB filtre en vez de cargar cada pool. SQLite (dev local) no
    # soporta este lookup, asi que ahi se cae al filtro en Python - mismo
    # resultado, distinto costo.
    try:
        return list(
            FamilyPool.objects.filter(
                Q(creator=public_key)
                | Q(signers__contains=[{"public_key": public_key}])
                | Q(depositors__contains=public_key)
                | Q(depositors__contains=[public_key])
            )
        )
    except NotSupportedError:
        return [pool for pool in FamilyPool.objects.all() if is_family_member(pool, public_key)]


def require_family_viewer(request, pool: FamilyPool):
    public_key = (
        (request.query_params.get("public_key") or "").strip()
        or (request.data.get("requester_public_key") or "").strip()
        or (request.data.get("public_key") or "").strip()
    )
    if not public_key:
        return Response(
            {"detail": "Hace falta public_key para ver o gestionar esta caja."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not is_family_member(pool, public_key):
        return Response(
            {"detail": "Solo el creador o una wallet asociada puede ver esta caja familiar."},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


def stellar_submit_error_response(exc: StellarSubmissionError) -> Response:
    status_by_category = {
        "bad_seq": status.HTTP_409_CONFLICT,
        "insufficient_signatures": status.HTTP_422_UNPROCESSABLE_ENTITY,
        "underfunded": status.HTTP_422_UNPROCESSABLE_ENTITY,
        "other": status.HTTP_400_BAD_REQUEST,
    }
    return Response({"detail": exc.message}, status=status_by_category[exc.category])


class BuildCreateAccountView(APIView):
    """POST /api/family-pools/build-create-account/

    Paso 1 de 3. `pool_public_key` tiene que ser una keypair nueva
    generada del lado del cliente especificamente para este pool (el
    backend nunca la genera ni la ve firmada). Devuelve el XDR sin firmar
    de la tx CreateAccount: la firma el creador con su wallet existente.
    """

    def post(self, request):
        serializer = BuildCreateAccountSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            minimum_balance = compute_minimum_starting_balance(len(data["signers"]))
            starting_balance = str(Decimal(minimum_balance) + Decimal(data["extra_starting_balance"]))
            xdr = build_create_account_tx(
                creator_public_key=data["creator_public_key"],
                pool_public_key=data["pool_public_key"],
                starting_balance=starting_balance,
            )
        except StellarAccountAlreadyExistsError:
            return Response(
                {"detail": "pool_public_key ya existe en el ledger: generá una keypair nueva para el pool."},
                status=status.HTTP_409_CONFLICT,
            )
        except StellarAccountNotFoundError:
            return Response(
                {"detail": "creator_public_key no existe o todavia no fue fondeada en la red Stellar."},
                status=status.HTTP_404_NOT_FOUND,
            )
        except StellarUnavailableError:
            return Response(
                {"detail": "El servicio de Stellar Horizon no esta disponible, reintenta en unos segundos."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({"xdr": xdr, "starting_balance": starting_balance})


class BuildConfigureSignersView(APIView):
    """POST /api/family-pools/build-configure-signers/

    Paso 2 de 3, solo despues de que la tx del paso 1 este confirmada en
    el ledger (si no, pool_public_key todavia no existe y esto da 404).
    Devuelve el XDR sin firmar de la tx SetOptions: la firma la master key
    efimera de la cuenta del pool, la unica vez que hace falta.
    """

    def post(self, request):
        serializer = BuildConfigureSignersSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            xdr = build_configure_signers_tx(
                pool_public_key=data["pool_public_key"],
                signers=data["signers"],
                med_threshold=data["med_threshold"],
            )
        except StellarAccountNotFoundError:
            return Response(
                {
                    "detail": (
                        "pool_public_key todavia no existe en el ledger: "
                        "esperá a que se confirme la tx de create-account."
                    )
                },
                status=status.HTTP_404_NOT_FOUND,
            )
        except StellarUnavailableError:
            return Response(
                {"detail": "El servicio de Stellar Horizon no esta disponible, reintenta en unos segundos."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({"xdr": xdr})


class ConfirmPoolSetupView(APIView):
    """POST /api/family-pools/confirm/

    Paso 3 de 3, solo despues de que la tx del paso 2 este confirmada.
    Relee Horizon (nunca confia en lo que mando el cliente sobre signers/
    thresholds) para verificar que la cuenta quedo configurada como una
    caja familiar valida, y recien ahi persiste el FamilyPool.
    """

    def post(self, request):
        serializer = ConfirmPoolSetupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            onchain = confirm_pool_setup(data["pool_public_key"])
        except StellarAccountNotFoundError:
            return Response(
                {
                    "detail": (
                        "pool_public_key todavia no existe en el ledger: "
                        "esperá a que se confirme la tx de create-account."
                    )
                },
                status=status.HTTP_404_NOT_FOUND,
            )
        except PoolSetupIncompleteError as exc:
            return Response(
                {"detail": f"El setup on-chain todavia no es valido: {exc.reason}"},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        except StellarUnavailableError:
            return Response(
                {"detail": "El servicio de Stellar Horizon no esta disponible, reintenta en unos segundos."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        pool = FamilyPool.objects.create(
            pool_account=data["pool_public_key"],
            title=data["title"],
            creator=data["creator_public_key"],
            withdrawal_limit=data["withdrawal_limit"],
            asset_withdrawal_limits=data.get("asset_withdrawal_limits") or {},
            signers=onchain["signers"],
            depositors=data.get("depositors") or [],
            wallet_roles=data.get("wallet_roles") or {},
            med_threshold=onchain["med_threshold"],
            high_threshold=onchain["high_threshold"],
        )
        return Response(FamilyPoolSerializer(pool).data, status=status.HTTP_201_CREATED)


class FamilyPoolListView(APIView):
    """GET /api/family-pools/?public_key=

    Cajas donde la wallet es creadora o figura como firmante.
    """

    def get(self, request):
        public_key = (request.query_params.get("public_key") or "").strip()
        if not public_key:
            return Response(
                {"detail": "Hace falta public_key para listar tus cajas familiares."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        pools = family_pools_visible_to(public_key)
        return Response({"pools": FamilyPoolSerializer(pools, many=True).data})


class FamilyPoolDetailView(APIView):
    """GET /api/family-pools/<pool_account>/?public_key="""

    def get(self, request, pool_account: str):
        pool = get_object_or_404(FamilyPool, pool_account=pool_account)
        denied = require_family_viewer(request, pool)
        if denied:
            return denied
        return Response(FamilyPoolSerializer(pool).data)


class FamilyPoolDepositCreateView(APIView):
    """POST /api/family-pools/<pool_account>/deposits/

    Guarda la nota de un deposito ya confirmado en el ledger. Depositar no
    requiere ninguna firma de la cuenta del pool - cualquiera puede
    pagarle libremente, sea o no signer - asi que esto solo verifica
    contra Horizon que la tx exista, sea un pago exitoso, y tenga como
    receiver la cuenta de este pool, antes de guardar la nota.
    """

    def post(self, request, pool_account: str):
        pool = get_object_or_404(FamilyPool, pool_account=pool_account)
        serializer = FamilyPoolDepositCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            on_chain = fetch_payment_from_tx_hash(data["tx_hash"])
        except StellarTransactionNotFoundError:
            return Response(
                {"detail": "No se encontro esa transaccion en el ledger de Stellar."},
                status=status.HTTP_404_NOT_FOUND,
            )
        except StellarTransactionFailedError:
            return Response(
                {"detail": "Esa transaccion existe pero no fue exitosa en el ledger."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        except StellarTransactionNotAPaymentError:
            return Response(
                {"detail": "Esa transaccion no contiene ninguna operacion de pago."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        except StellarUnavailableError:
            return Response(
                {"detail": "El servicio de Stellar Horizon no esta disponible, reintenta en unos segundos."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if on_chain.receiver != pool.pool_account:
            return Response(
                {"detail": "Esa transaccion no es un pago a la cuenta de este pool."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        deposit = FamilyPoolDeposit.objects.create(
            pool=pool,
            depositor=on_chain.sender,
            tx_hash=data["tx_hash"],
            note=data.get("note", ""),
        )
        return Response(FamilyPoolDepositSerializer(deposit).data, status=status.HTTP_201_CREATED)


class WithdrawalBuildView(APIView):
    """POST /api/family-pools/<pool_account>/withdrawals/build/

    CRITICO: el chequeo de withdrawal_limit pasa aca, ANTES de construir
    cualquier tx o pedir firmas - nunca se confia en un flag del frontend
    diciendo que el monto ya fue aprobado, siempre se revalida contra el
    limite guardado en este pool.
    """

    def post(self, request, pool_account: str):
        pool = get_object_or_404(FamilyPool, pool_account=pool_account)
        serializer = WithdrawalBuildSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if not is_family_member(pool, data["requester_public_key"]):
            return Response(
                {"detail": "Solo el creador o una wallet asociada puede pedir retiros."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            xdr = build_withdrawal_tx(
                pool_account=pool.pool_account,
                withdrawal_limit=pool.withdrawal_limit,
                destination_public_key=data["destination_public_key"],
                amount=data["amount"],
                memo=data.get("memo") or None,
                asset_code=data.get("asset_code") or "XLM",
                asset_withdrawal_limits=pool.asset_withdrawal_limits,
            )
        except WithdrawalLimitExceededError as exc:
            return Response(
                {
                    "detail": (
                        f"El monto ({exc.amount}) supera el limite de retiro configurado "
                        f"para este pool ({exc.limit})."
                    )
                },
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        except WithdrawalValidationError as exc:
            return Response(
                {"detail": str(exc.reason)},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        except StellarAccountNotFoundError:
            return Response(
                {"detail": "La cuenta del pool no existe en la red Stellar."},
                status=status.HTTP_404_NOT_FOUND,
            )
        except StellarUnavailableError:
            return Response(
                {"detail": "El servicio de Stellar Horizon no esta disponible, reintenta en unos segundos."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({"xdr": xdr})


class WithdrawalSubmitView(APIView):
    """POST /api/family-pools/<pool_account>/withdrawals/submit/

    Recibe la tx ya firmada por suficientes familiares (peso combinado >=
    medThreshold) y la somete a Horizon. Vuelve a validar el monto leyendo
    directo de la tx firmada (nunca de lo que declare el body) contra
    withdrawal_limit, por si esto se llega a llamar sin haber pasado por
    build/ - nunca se confia en un monto "ya aprobado" declarado afuera de
    la tx firmada en si.
    """

    def post(self, request, pool_account: str):
        pool = get_object_or_404(FamilyPool, pool_account=pool_account)
        denied = require_family_viewer(request, pool)
        if denied:
            return denied
        serializer = WithdrawalSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            result = submit_withdrawal(
                pool_account=pool.pool_account,
                withdrawal_limit=pool.withdrawal_limit,
                signed_xdr=serializer.validated_data["signed_xdr"],
                asset_withdrawal_limits=pool.asset_withdrawal_limits,
            )
        except WithdrawalValidationError as exc:
            return Response(
                {"detail": f"La transaccion enviada no es un retiro valido para este pool: {exc.reason}"},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        except WithdrawalLimitExceededError as exc:
            return Response(
                {
                    "detail": (
                        f"El monto ({exc.amount}) supera el limite de retiro configurado "
                        f"para este pool ({exc.limit})."
                    )
                },
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        except StellarSubmissionError as exc:
            return stellar_submit_error_response(exc)
        except StellarUnavailableError:
            return Response(
                {"detail": "El servicio de Stellar Horizon no esta disponible, reintenta en unos segundos."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(result)


class TrustlineBuildView(APIView):
    """POST /api/family-pools/<pool_account>/trustlines/build/"""

    def post(self, request, pool_account: str):
        pool = get_object_or_404(FamilyPool, pool_account=pool_account)
        serializer = TrustlineBuildSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not is_family_member(pool, serializer.validated_data["requester_public_key"]):
            return Response(
                {"detail": "Solo el creador o una wallet asociada puede abrir trustlines."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            xdr = build_change_trust_tx(pool.pool_account, serializer.validated_data["asset_code"])
        except WithdrawalValidationError as exc:
            return Response({"detail": str(exc.reason)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        except StellarAccountNotFoundError:
            return Response(
                {"detail": "La cuenta del pool no existe en la red Stellar."},
                status=status.HTTP_404_NOT_FOUND,
            )
        except StellarUnavailableError:
            return Response(
                {"detail": "El servicio de Stellar Horizon no esta disponible, reintenta en unos segundos."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({"xdr": xdr})


class TrustlineSubmitView(APIView):
    """POST /api/family-pools/<pool_account>/trustlines/submit/"""

    def post(self, request, pool_account: str):
        pool = get_object_or_404(FamilyPool, pool_account=pool_account)
        denied = require_family_viewer(request, pool)
        if denied:
            return denied
        serializer = WithdrawalSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            result = submit_change_trust(pool.pool_account, serializer.validated_data["signed_xdr"])
        except WithdrawalValidationError as exc:
            return Response(
                {"detail": f"La transaccion enviada no es un ChangeTrust valido: {exc.reason}"},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        except StellarSubmissionError as exc:
            return stellar_submit_error_response(exc)
        except StellarUnavailableError:
            return Response(
                {"detail": "El servicio de Stellar Horizon no esta disponible, reintenta en unos segundos."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(result)


class AddSignerBuildView(APIView):
    """POST /api/family-pools/<pool_account>/signers/build/"""

    def post(self, request, pool_account: str):
        pool = get_object_or_404(FamilyPool, pool_account=pool_account)
        serializer = AddSignerBuildSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if pool.creator != data["requester_public_key"]:
            return Response(
                {"detail": "Solo quien creó esta caja puede agregar wallets."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            xdr = build_add_signer_tx(
                pool.pool_account,
                data["signer_public_key"],
                data["weight"],
            )
        except WithdrawalValidationError as exc:
            return Response({"detail": str(exc.reason)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        except StellarAccountNotFoundError:
            return Response(
                {"detail": "La cuenta del pool no existe en la red Stellar."},
                status=status.HTTP_404_NOT_FOUND,
            )
        except PoolSetupIncompleteError as exc:
            return Response(
                {"detail": f"El setup on-chain todavia no es valido: {exc.reason}"},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        except StellarUnavailableError:
            return Response(
                {"detail": "El servicio de Stellar Horizon no esta disponible, reintenta en unos segundos."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({"xdr": xdr})


class AddSignerSubmitView(APIView):
    """POST /api/family-pools/<pool_account>/signers/submit/"""

    def post(self, request, pool_account: str):
        pool = get_object_or_404(FamilyPool, pool_account=pool_account)
        requester = (
            (request.data.get("requester_public_key") or "").strip()
            or (request.data.get("public_key") or "").strip()
        )
        if pool.creator != requester:
            return Response(
                {"detail": "Solo quien creó esta caja puede someter el alta de wallets."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = WithdrawalSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            result = submit_add_signer(pool.pool_account, serializer.validated_data["signed_xdr"])
        except WithdrawalValidationError as exc:
            return Response(
                {"detail": f"La transaccion enviada no es un alta de firmante valida: {exc.reason}"},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        except StellarSubmissionError as exc:
            return stellar_submit_error_response(exc)
        except PoolSetupIncompleteError as exc:
            return Response(
                {"detail": f"El setup on-chain todavia no es valido: {exc.reason}"},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        except StellarAccountNotFoundError:
            return Response(
                {"detail": "La cuenta del pool no existe en la red Stellar."},
                status=status.HTTP_404_NOT_FOUND,
            )
        except StellarUnavailableError:
            return Response(
                {"detail": "El servicio de Stellar Horizon no esta disponible, reintenta en unos segundos."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # El alta ya esta on-chain: si Horizon no responde para releer la
        # config, se devuelve igual el exito con el snapshot que tenemos
        # (resynced: false) - mentir con un 503 aca llevaria al cliente a
        # reintentar un submit que ya sucedio. El proximo alta/listado
        # vuelve a sincronizar contra el ledger.
        try:
            onchain = confirm_pool_setup(pool.pool_account)
        except (StellarAccountNotFoundError, StellarUnavailableError, PoolSetupIncompleteError):
            return Response({**result, "pool": FamilyPoolSerializer(pool).data, "resynced": False})

        previous_signers = {signer.get("public_key") for signer in (pool.signers or [])}
        roles = dict(pool.wallet_roles or {})
        role = str(request.data.get("role") or "deposit_withdraw").strip().replace("-", "_")
        if role not in ("deposit_withdraw", "withdraw"):
            role = "deposit_withdraw"

        pool.signers = onchain["signers"]
        pool.med_threshold = onchain["med_threshold"]
        pool.high_threshold = onchain["high_threshold"]
        new_keys = {signer["public_key"] for signer in onchain["signers"]}
        for key in new_keys - previous_signers:
            roles[key] = role
        pool.wallet_roles = roles
        pool.depositors = [key for key in (pool.depositors or []) if key not in new_keys]
        pool.save(
            update_fields=[
                "signers",
                "med_threshold",
                "high_threshold",
                "wallet_roles",
                "depositors",
                "updated_at",
            ]
        )

        return Response({**result, "pool": FamilyPoolSerializer(pool).data, "resynced": True})


class AddDepositorView(APIView):
    """POST /api/family-pools/<pool_account>/depositors/"""

    def post(self, request, pool_account: str):
        pool = get_object_or_404(FamilyPool, pool_account=pool_account)
        serializer = AddDepositorSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if pool.creator != data["requester_public_key"]:
            return Response(
                {"detail": "Solo quien creó esta caja puede asociar depositantes."},
                status=status.HTTP_403_FORBIDDEN,
            )

        public_key = data["public_key"]
        if is_family_signer(pool, public_key):
            return Response(
                {"detail": "Esa wallet ya puede firmar retiros de esta caja."},
                status=status.HTTP_409_CONFLICT,
            )
        depositors = list(pool.depositors or [])
        if public_key in depositors:
            return Response(
                {"detail": "Esa wallet ya esta asociada para depositar."},
                status=status.HTTP_409_CONFLICT,
            )

        depositors.append(public_key)
        roles = dict(pool.wallet_roles or {})
        roles[public_key] = "deposit"
        pool.depositors = depositors
        pool.wallet_roles = roles
        pool.save(update_fields=["depositors", "wallet_roles", "updated_at"])
        return Response(FamilyPoolSerializer(pool).data)


class BlendSupplyBuildView(APIView):
    """POST /api/family-pools/<pool_account>/blend/supply/build/

    Arma (sin firmar) la tx que pone `amount` XLM del balance ocioso de la
    caja familiar a generar interes en Blend. La firma el mismo quorum
    familiar que aprueba un retiro (medThreshold) - Blend no es un
    contrato propio, esto es 100% supply/withdraw estandar del pool ya
    desplegado por el equipo de Blend en testnet.
    """

    def post(self, request, pool_account: str):
        pool = get_object_or_404(FamilyPool, pool_account=pool_account)
        serializer = BlendAmountSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not is_family_member(pool, serializer.validated_data["requester_public_key"]):
            return Response(
                {"detail": "Solo el creador o una wallet asociada puede operar Blend."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            xdr = build_supply_tx(pool.pool_account, serializer.validated_data["amount"])
        except BlendSimulationError as exc:
            return Response(
                {"detail": f"Blend rechazo la operacion: {exc.message}"},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        except BlendUnavailableError:
            return Response(
                {"detail": "El servicio de Blend/Soroban no esta disponible, reintenta en unos segundos."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({"xdr": xdr})


class BlendWithdrawBuildView(APIView):
    """POST /api/family-pools/<pool_account>/blend/withdraw/build/

    Arma (sin firmar) la tx que hace redeem de `amount` XLM (capital +
    interes acumulado) desde Blend de vuelta al balance clasico de la
    cuenta del pool. Esto NO saca fondos de la caja familiar hacia afuera
    - para eso esta /withdrawals/build/, que sigue andando igual haya o no
    plata puesta en Blend.
    """

    def post(self, request, pool_account: str):
        pool = get_object_or_404(FamilyPool, pool_account=pool_account)
        serializer = BlendAmountSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not is_family_member(pool, serializer.validated_data["requester_public_key"]):
            return Response(
                {"detail": "Solo el creador o una wallet asociada puede operar Blend."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            xdr = build_withdraw_from_blend_tx(pool.pool_account, serializer.validated_data["amount"])
        except BlendSimulationError as exc:
            return Response(
                {"detail": f"Blend rechazo la operacion: {exc.message}"},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        except BlendUnavailableError:
            return Response(
                {"detail": "El servicio de Blend/Soroban no esta disponible, reintenta en unos segundos."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({"xdr": xdr})


class BlendSubmitView(APIView):
    """POST /api/family-pools/<pool_account>/blend/submit/

    Recibe la tx de Blend (supply o withdraw) ya firmada por el quorum
    familiar y la somete via Soroban RPC. Ademas actualiza el cost-basis
    (`blend_principal`) que este backend mantiene aparte, porque Blend
    solo trackea shares (bTokens) y no cuanto se aporto originalmente -
    sin esto, /blend/position/ no podria separar capital de interes.

    Que operacion es y que monto tiene se leen de la tx firmada en si
    (`parse_submit_request`), nunca de un campo declarado en el body.
    """

    def post(self, request, pool_account: str):
        pool = get_object_or_404(FamilyPool, pool_account=pool_account)
        denied = require_family_viewer(request, pool)
        if denied:
            return denied
        serializer = WithdrawalSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        signed_xdr = serializer.validated_data["signed_xdr"]

        try:
            request_type, amount = parse_submit_request(signed_xdr)
        except BlendValidationError as exc:
            return Response(
                {"detail": f"La transaccion enviada no es una operacion valida de Blend: {exc.reason}"},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        # Para un withdraw hace falta el valor de la posicion ANTES de
        # ejecutarlo, para poder prorratear cuanto de ese retiro es
        # capital vs. interes ya generado (ver compute_updated_principal).
        value_before = None
        if request_type == REQUEST_TYPE_WITHDRAW:
            try:
                value_before = get_position(pool.pool_account)["current_value"]
            except BlendSimulationError as exc:
                return Response(
                    {"detail": f"Blend rechazo la consulta previa al retiro: {exc.message}"},
                    status=status.HTTP_422_UNPROCESSABLE_ENTITY,
                )
            except BlendUnavailableError:
                return Response(
                    {"detail": "El servicio de Blend/Soroban no esta disponible, reintenta en unos segundos."},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )

        try:
            result = submit_blend_tx(signed_xdr)
        except BlendSimulationError as exc:
            return Response(
                {"detail": f"Blend rechazo la operacion: {exc.message}"},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        except BlendUnavailableError as exc:
            return Response(
                {"detail": str(exc) or "El servicio de Blend/Soroban no esta disponible, reintenta en unos segundos."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        with transaction.atomic():
            locked_pool = FamilyPool.objects.select_for_update().get(pk=pool.pk)
            locked_pool.blend_principal = compute_updated_principal(
                locked_pool.blend_principal, request_type, amount, value_before
            )
            locked_pool.save(update_fields=["blend_principal", "updated_at"])

        return Response(result)


class BlendPositionView(APIView):
    """GET /api/family-pools/<pool_account>/blend/position/

    Posicion actual en Blend, leyendo el contrato en vivo (nunca datos
    guardados para el valor total): capital aportado e interes acumulado,
    separados. El capital sale de `blend_principal` (cost-basis que este
    backend mantiene, ver BlendSubmitView) porque Blend no lo trackea
    on-chain; el interes es la diferencia contra el valor actual real.
    """

    def get(self, request, pool_account: str):
        pool = get_object_or_404(FamilyPool, pool_account=pool_account)
        denied = require_family_viewer(request, pool)
        if denied:
            return denied

        try:
            position = get_position(pool.pool_account)
        except BlendSimulationError as exc:
            return Response(
                {"detail": f"Blend rechazo la consulta: {exc.message}"},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        except BlendUnavailableError:
            return Response(
                {"detail": "El servicio de Blend/Soroban no esta disponible, reintenta en unos segundos."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        current_value = Decimal(position["current_value"])
        principal = Decimal(pool.blend_principal or "0")
        # Puede dar levemente negativo por redondeo fixed-point entre
        # Blend (SCALAR_12) y nuestro cost-basis en XLM: nunca se muestra
        # interes negativo.
        interest_earned = max(Decimal(0), current_value - principal)

        return Response(
            {
                "capital": str(principal),
                "interest_earned": str(interest_earned),
                "current_value": position["current_value"],
                "b_tokens": position["b_tokens"],
                "b_rate": position["b_rate"],
            }
        )
