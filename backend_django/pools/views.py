from decimal import Decimal

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from stellar_common.client import StellarAccountNotFoundError, StellarUnavailableError

from .models import Pool
from .sep7 import build_payment_uri
from .serializers import (
    PoolCreateSerializer,
    PoolSerializer,
    VaultDepositBuildSerializer,
    VaultRegisterBuildSerializer,
    VaultSubmitSerializer,
    VaultWithdrawBuildSerializer,
)
from .stellar_client import (
    fetch_pool_donations,
    get_latest_horizon_cursor,
    get_pool_with_synced_progress,
    progress_summary,
)
from .vault_client import (
    VaultConfigError,
    VaultConfirmationTimeoutError,
    VaultSimulationError,
    VaultUnavailableError,
    VaultValidationError,
    amount_to_scaled,
    build_create_pool_tx,
    build_deposit_tx,
    build_withdraw_tx,
    get_vault_leaderboard,
    get_vault_state,
    parse_invoke,
    submit_vault_tx,
)


def _vault_unavailable_response(exc: VaultUnavailableError) -> Response:
    """Mapea los errores de disponibilidad/config del vault: un
    VaultConfigError es un error de configuracion del backend (500), el
    resto es indisponibilidad de la red (503)."""
    if isinstance(exc, VaultConfigError):
        return Response(
            {"detail": f"Error de configuracion del backend: {exc}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    return Response(
        {"detail": "El servicio de Soroban RPC no esta disponible, reintenta en unos segundos."},
        status=status.HTTP_503_SERVICE_UNAVAILABLE,
    )


def _pool_registered_on_chain(pool: Pool) -> bool:
    """True si el contrato ya tiene registrado este pool con este owner.
    Best-effort: si Soroban no responde, devuelve False (no reconcilia)."""
    try:
        state = get_vault_state(pool.short_code)
    except VaultUnavailableError:
        return False
    return bool(state.get("registered")) and state.get("owner") == pool.wallet_address


class PoolCreateView(APIView):
    """GET /api/pools/?public_key=

    Lista solo los pools comunitarios creados por esa wallet.

    POST /api/pools/

    Crea un pool y devuelve su URI de pago SEP-7 (para armar el QR). La
    wallet de destino tiene que existir/estar fondeada en la red: ese
    momento se usa para fijar desde donde arranca el sync de donaciones
    (ver get_latest_horizon_cursor), asi nunca se cuenta actividad previa
    de la wallet como si fuera de este pool.
    """
    def get(self, request):
        public_key = (request.query_params.get("public_key") or "").strip()
        if not public_key:
            return Response(
                {"detail": "Hace falta public_key para listar tus pools."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        pools = Pool.objects.filter(creator=public_key)
        return Response({"pools": PoolSerializer(pools, many=True).data})

    def post(self, request):
        serializer = PoolCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            initial_cursor = get_latest_horizon_cursor(data["wallet_address"])
        except StellarAccountNotFoundError:
            return Response(
                {"detail": "wallet_address no existe o todavia no fue fondeada en la red Stellar."},
                status=status.HTTP_404_NOT_FOUND,
            )
        except StellarUnavailableError:
            return Response(
                {"detail": "El servicio de Stellar Horizon no esta disponible, reintenta en unos segundos."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        pool = Pool.objects.create(
            wallet_address=data["wallet_address"],
            title=data["title"],
            goal_amount=data.get("goal_amount") or None,
            deadline=data.get("deadline"),
            creator=data["creator"],
            donations_synced_cursor=initial_cursor,
        )

        payment_uri = build_payment_uri(pool.wallet_address, pool.short_code)
        return Response(
            {"pool": PoolSerializer(pool).data, "payment_uri": payment_uri},
            status=status.HTTP_201_CREATED,
        )


class PoolDetailView(APIView):
    """GET /api/pools/<short_code>/?amount=&asset=

    Pool + progreso de donaciones (sincronizado contra Horizon en el
    momento de la consulta) + URI de pago SEP-7. Sin guard a proposito:
    cualquiera con el link/short_code compartido tiene que poder verlo y
    donar, sin estar registrado ni conectado en la app. `amount` es
    opcional, para sugerir un monto de donacion en el QR (las donaciones
    son libres por default). `asset` acepta USDC o EURC (issuers Circle
    testnet); cualquier otro valor deja el QR en XLM nativo.
    """

    def get(self, request, short_code: str):
        try:
            pool = get_pool_with_synced_progress(short_code)
        except Pool.DoesNotExist:
            return Response(
                {"detail": f'No existe un pool con short_code "{short_code}".'},
                status=status.HTTP_404_NOT_FOUND,
            )
        except StellarAccountNotFoundError:
            return Response(
                {"detail": "La wallet de este pool no existe o dejo de estar fondeada en la red Stellar."},
                status=status.HTTP_404_NOT_FOUND,
            )
        except StellarUnavailableError:
            return Response(
                {"detail": "El servicio de Stellar Horizon no esta disponible, reintenta en unos segundos."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        progress = progress_summary(pool)
        # Un pool con la meta cumplida ya no sugiere monto de donacion en
        # el QR: no deberian entrar donaciones nuevas.
        amount = request.query_params.get("amount") or None
        if progress["completed"]:
            amount = None
        asset = request.query_params.get("asset") or None
        payment_uri = build_payment_uri(
            pool.wallet_address, pool.short_code, amount, asset
        )

        return Response(
            {
                "pool": PoolSerializer(pool).data,
                "progress": progress,
                "payment_uri": payment_uri,
            }
        )


class PoolDonationsView(APIView):
    """GET /api/pools/<short_code>/donations/?limit=

    Feed de donaciones del pool: SOLO pagos entrantes a la wallet con el
    memo del pool (mismo criterio que la sync de progreso). Los gastos
    salientes de la wallet y los pagos sin memo no corresponden al pool y
    no aparecen. Para pools vault, los depositos nuevos van al contrato
    (no son payments de la wallet): esos se ven en el estado del vault.
    """

    def get(self, request, short_code: str):
        pool = get_object_or_404(Pool, short_code=short_code)
        try:
            limit = int(request.query_params.get("limit") or 20)
        except ValueError:
            limit = 20

        try:
            records = fetch_pool_donations(pool, limit)
        except StellarAccountNotFoundError:
            return Response(
                {"detail": "La wallet de este pool no existe o dejo de estar fondeada en la red Stellar."},
                status=status.HTTP_404_NOT_FOUND,
            )
        except StellarUnavailableError:
            return Response(
                {"detail": "El servicio de Stellar Horizon no esta disponible, reintenta en unos segundos."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({"records": records})


def _current_vault_equivalent(pool: Pool) -> int:
    """Progreso ya donado a la wallet (XLM-equivalente escalado), para que
    un pool migrado al vault conserve su avance. Si Horizon no responde
    falla hacia arriba (no se registra un pool con initial_equivalent
    inventado): solo afecta el conteo historico, no los fondos."""
    synced = get_pool_with_synced_progress(pool.short_code)
    equivalent = progress_summary(synced).get("xlm_equivalent_total")
    if not equivalent:
        return 0
    try:
        return int(Decimal(equivalent) * Decimal(10_000_000))
    except Exception as exc:
        raise VaultValidationError(
            "No se pudo interpretar el progreso historico de este pool."
        ) from exc


class VaultRegisterBuildView(APIView):
    """POST /api/pools/<short_code>/vault/register-build/

    Arma la tx que registra el pool en el vault comunitario (contrato
    Soroban propio). La firma el OWNER del pool = la wallet que recibe
    (wallet_address): en el vault, el owner es quien controla esa wallet.
    Sirve tanto para pools nuevos como para migrar los clasicos: la meta
    sale del pool y el progreso historico ya donado a la wallet se arrastra
    como initial_equivalent.
    """

    def post(self, request, short_code: str):
        pool = get_object_or_404(Pool, short_code=short_code)
        serializer = VaultRegisterBuildSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if serializer.validated_data["owner_public_key"] != pool.wallet_address:
            return Response(
                {"detail": "Solo la wallet que recibe este pool puede registrarlo en el vault."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if pool.vault_registered:
            return Response(
                {"detail": "Este pool ya esta registrado en el vault."},
                status=status.HTTP_409_CONFLICT,
            )

        # Reconciliacion: si el contrato ya tiene este pool (registro que
        # confirmo a pesar de un timeout reportado), se marca en la DB y no
        # se vuelve a intentar el create_pool (panic on-chain garantizado).
        if _pool_registered_on_chain(pool):
            pool.vault_registered = True
            pool.save(update_fields=["vault_registered", "updated_at"])
            return Response({"already_registered": True})

        goal = 0
        if pool.goal_amount:
            try:
                goal = amount_to_scaled(pool.goal_amount)
            except VaultValidationError:
                return Response(
                    {"detail": "La meta guardada de este pool no es un monto valido."},
                    status=status.HTTP_422_UNPROCESSABLE_ENTITY,
                )

        try:
            historical = _current_vault_equivalent(pool)
        except StellarAccountNotFoundError:
            return Response(
                {"detail": "La wallet de este pool no existe o dejo de estar fondeada en la red Stellar."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except StellarUnavailableError:
            return Response(
                {
                    "detail": (
                        "El servicio de Stellar Horizon no esta disponible y no se pudo "
                        "calcular el progreso previo del pool, reintenta en unos segundos."
                    )
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except VaultValidationError as exc:
            return Response({"detail": str(exc.reason)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)

        try:
            xdr = build_create_pool_tx(
                pool.short_code,
                pool.wallet_address,
                goal,
                historical,
            )
        except VaultSimulationError as exc:
            return Response({"detail": exc.message}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        except VaultUnavailableError as exc:
            return _vault_unavailable_response(exc)

        return Response({"xdr": xdr})


class VaultDepositBuildView(APIView):
    """POST /api/pools/<short_code>/vault/deposit-build/

    Arma la tx que el donante firma para meter fondos al vault del pool.
    El contrato rechaza on-chain meta cumplida / auto-donacion del owner /
    asset no admitido; esto revalida lo mismo antes de armar para no hacer
    firmar una tx que ya se sabe rechazada.
    """

    def post(self, request, short_code: str):
        pool = get_object_or_404(Pool, short_code=short_code)
        serializer = VaultDepositBuildSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if not pool.vault_registered:
            return Response(
                {"detail": "Este pool no esta registrado en el vault."},
                status=status.HTTP_409_CONFLICT,
            )
        if data["donor_public_key"] in (pool.wallet_address, pool.creator):
            return Response(
                {"detail": "No podes donarle a tu propio pool."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        try:
            vault_state = get_vault_state(pool.short_code)
        except VaultUnavailableError:
            vault_state = None
        if vault_state and vault_state.get("complete"):
            return Response(
                {"detail": "Meta alcanzada: ya no se puede donar a este pool."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        try:
            xdr = build_deposit_tx(
                pool.short_code,
                data["donor_public_key"],
                data["asset_code"],
                data["amount"],
            )
        except VaultSimulationError as exc:
            return Response({"detail": exc.message}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        except VaultValidationError as exc:
            return Response({"detail": str(exc.reason)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        except VaultUnavailableError as exc:
            return _vault_unavailable_response(exc)

        return Response({"xdr": xdr})


class VaultWithdrawBuildView(APIView):
    """POST /api/pools/<short_code>/vault/withdraw-build/

    Arma la tx que el owner firma para retirar fondos del vault al
    momento. El contrato capa el retiro a lo donado a ESTE pool por asset;
    esto pre-chequea lo mismo contra el estado on-chain para no hacer
    firmar una tx que ya se sabe rechazada.
    """

    def post(self, request, short_code: str):
        pool = get_object_or_404(Pool, short_code=short_code)
        serializer = VaultWithdrawBuildSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if data["owner_public_key"] != pool.wallet_address:
            return Response(
                {"detail": "Solo la wallet que recibe este pool puede retirar del vault."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not pool.vault_registered:
            return Response(
                {"detail": "Este pool no esta registrado en el vault."},
                status=status.HTTP_409_CONFLICT,
            )

        try:
            state = get_vault_state(pool.short_code)
            if not state.get("registered"):
                return Response(
                    {"detail": "El contrato no tiene registrado este pool."},
                    status=status.HTTP_409_CONFLICT,
                )
            available = next(
                (
                    Decimal(item["available"])
                    for item in state.get("assets", [])
                    if item["asset_code"] == data["asset_code"]
                ),
                Decimal(0),
            )
            if Decimal(data["amount"]) > available:
                return Response(
                    {
                        "detail": (
                            f"El retiro ({data['amount']}) supera lo disponible en el vault "
                            f"para {data['asset_code']} ({available})."
                        )
                    },
                    status=status.HTTP_422_UNPROCESSABLE_ENTITY,
                )
            xdr = build_withdraw_tx(
                pool.short_code,
                pool.wallet_address,
                data["asset_code"],
                data["destination_public_key"],
                data["amount"],
            )
        except VaultSimulationError as exc:
            return Response({"detail": exc.message}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        except VaultValidationError as exc:
            return Response({"detail": str(exc.reason)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        except VaultUnavailableError as exc:
            return _vault_unavailable_response(exc)

        return Response({"xdr": xdr})


class VaultSubmitView(APIView):
    """POST /api/pools/<short_code>/vault/submit/

    Somete una tx del vault ya firmada. Nunca se confia en lo que declare
    el body sobre que operacion es: se lee la tx firmada (parse_invoke) y
    se revalida contra este pool - misma defensa en profundidad que los
    retiros de las cajas familiares. Un create_pool confirmado marca el
    pool como vault_registered (Soroban rechaza la tx entera si la
    invocacion trappea, asi que un SUCCESS aca es prueba de ejecucion).
    """

    def post(self, request, short_code: str):
        pool = get_object_or_404(Pool, short_code=short_code)
        serializer = VaultSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            fn_name, args = parse_invoke(serializer.validated_data["signed_xdr"])
        except VaultValidationError as exc:
            return Response({"detail": str(exc.reason)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)

        if not args or args[0] != pool.short_code:
            return Response(
                {"detail": "La transaccion no opera sobre este pool."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        if fn_name == "create_pool":
            if pool.vault_registered:
                return Response(
                    {"detail": "Este pool ya esta registrado en el vault."},
                    status=status.HTTP_409_CONFLICT,
                )
            if args[1] != pool.wallet_address:
                return Response(
                    {"detail": "El owner del registro no es la wallet de este pool."},
                    status=status.HTTP_422_UNPROCESSABLE_ENTITY,
                )
        elif fn_name == "deposit":
            if not pool.vault_registered:
                return Response(
                    {"detail": "Este pool no esta registrado en el vault."},
                    status=status.HTTP_409_CONFLICT,
                )
            if args[1] in (pool.wallet_address, pool.creator):
                return Response(
                    {"detail": "No podes donarle a tu propio pool."},
                    status=status.HTTP_422_UNPROCESSABLE_ENTITY,
                )
        else:  # withdraw
            if not pool.vault_registered:
                return Response(
                    {"detail": "Este pool no esta registrado en el vault."},
                    status=status.HTTP_409_CONFLICT,
                )
            if args[1] != pool.wallet_address:
                return Response(
                    {"detail": "Solo la wallet que recibe este pool puede retirar del vault."},
                    status=status.HTTP_422_UNPROCESSABLE_ENTITY,
                )

        try:
            result = submit_vault_tx(serializer.validated_data["signed_xdr"])
        except VaultConfirmationTimeoutError as exc:
            # La tx se sometio pero el polling se quedo sin intentos: puede
            # terminar confirmando igual. Antes de reportar 503, se consulta
            # el estado on-chain: si el pool ya existe aca se marca como
            # registrado y se devuelve el hash real (evita el estado stuck
            # clasico/vault y el reintento que panicaria con "ya existe").
            if fn_name == "create_pool" and not pool.vault_registered:
                if _pool_registered_on_chain(pool):
                    pool.vault_registered = True
                    pool.save(update_fields=["vault_registered", "updated_at"])
                    return Response({"hash": exc.tx_hash})
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except VaultSimulationError as exc:
            return Response({"detail": exc.message}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        except VaultValidationError as exc:
            return Response({"detail": str(exc.reason)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        except VaultUnavailableError as exc:
            return _vault_unavailable_response(exc)

        if fn_name == "create_pool":
            pool.vault_registered = True
            pool.save(update_fields=["vault_registered", "updated_at"])

        return Response(result)


class VaultStateView(APIView):
    """GET /api/pools/<short_code>/vault/state/

    Estado del pool leido directo del contrato (fuente de verdad):
    donado/retirado/disponible por asset, equivalente en XLM y si la meta
    esta cumplida. `registered: false` si el pool nunca se registro.
    """

    def get(self, request, short_code: str):
        get_object_or_404(Pool, short_code=short_code)
        try:
            state = get_vault_state(short_code)
        except VaultUnavailableError as exc:
            return _vault_unavailable_response(exc)
        return Response(state)


class VaultLeaderboardView(APIView):
    """GET /api/pools/<short_code>/vault/leaderboard/

    Top donantes del pool, leido del mapa `donors` del contrato Soroban
    (XLM-equivalente acumulado por donante, nunca baja al retirar). Sin
    guard a proposito: es data publica del pool.
    """

    def get(self, request, short_code: str):
        get_object_or_404(Pool, short_code=short_code)
        try:
            donors = get_vault_leaderboard(short_code)
        except VaultUnavailableError as exc:
            return _vault_unavailable_response(exc)
        return Response({"donors": donors})
