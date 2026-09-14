from decimal import Decimal

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
    BlendSimulationError,
    BlendUnavailableError,
    build_supply_tx,
    build_withdraw_from_blend_tx,
    submit_blend_tx,
)
from .models import FamilyPool, FamilyPoolDeposit
from .serializers import (
    BlendAmountSerializer,
    BuildConfigureSignersSerializer,
    BuildCreateAccountSerializer,
    ConfirmPoolSetupSerializer,
    FamilyPoolDepositCreateSerializer,
    FamilyPoolDepositSerializer,
    FamilyPoolSerializer,
    WithdrawalBuildSerializer,
    WithdrawalSubmitSerializer,
)
from .stellar_client import (
    PoolSetupIncompleteError,
    StellarAccountAlreadyExistsError,
    StellarSubmissionError,
    WithdrawalLimitExceededError,
    WithdrawalValidationError,
    build_configure_signers_tx,
    build_create_account_tx,
    build_withdrawal_tx,
    compute_minimum_starting_balance,
    confirm_pool_setup,
    submit_withdrawal,
)


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
            signers=onchain["signers"],
            med_threshold=onchain["med_threshold"],
            high_threshold=onchain["high_threshold"],
        )
        return Response(FamilyPoolSerializer(pool).data, status=status.HTTP_201_CREATED)


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

        try:
            xdr = build_withdrawal_tx(
                pool_account=pool.pool_account,
                withdrawal_limit=pool.withdrawal_limit,
                destination_public_key=data["destination_public_key"],
                amount=data["amount"],
                memo=data.get("memo") or None,
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
        serializer = WithdrawalSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            result = submit_withdrawal(
                pool_account=pool.pool_account,
                withdrawal_limit=pool.withdrawal_limit,
                signed_xdr=serializer.validated_data["signed_xdr"],
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
            status_by_category = {
                "bad_seq": status.HTTP_409_CONFLICT,
                "insufficient_signatures": status.HTTP_422_UNPROCESSABLE_ENTITY,
                "underfunded": status.HTTP_422_UNPROCESSABLE_ENTITY,
                "other": status.HTTP_400_BAD_REQUEST,
            }
            return Response({"detail": exc.message}, status=status_by_category[exc.category])
        except StellarUnavailableError:
            return Response(
                {"detail": "El servicio de Stellar Horizon no esta disponible, reintenta en unos segundos."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(result)


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
    familiar y la somete via Soroban RPC.
    """

    def post(self, request, pool_account: str):
        get_object_or_404(FamilyPool, pool_account=pool_account)
        serializer = WithdrawalSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            result = submit_blend_tx(serializer.validated_data["signed_xdr"])
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

        return Response(result)
