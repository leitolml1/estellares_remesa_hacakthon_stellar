from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from stellar_common.client import StellarAccountNotFoundError, StellarUnavailableError

from .models import Pool
from .sep7 import build_payment_uri
from .serializers import PoolCreateSerializer, PoolSerializer
from .stellar_client import (
    get_latest_horizon_cursor,
    get_pool_with_synced_progress,
    progress_summary,
)


class PoolCreateView(APIView):
    """POST /api/pools/

    Crea un pool y devuelve su URI de pago SEP-7 (para armar el QR). La
    wallet de destino tiene que existir/estar fondeada en la red: ese
    momento se usa para fijar desde donde arranca el sync de donaciones
    (ver get_latest_horizon_cursor), asi nunca se cuenta actividad previa
    de la wallet como si fuera de este pool.
    """

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
            creator=data["creator"],
            donations_synced_cursor=initial_cursor,
        )

        payment_uri = build_payment_uri(pool.wallet_address, pool.short_code)
        return Response(
            {"pool": PoolSerializer(pool).data, "payment_uri": payment_uri},
            status=status.HTTP_201_CREATED,
        )


class PoolDetailView(APIView):
    """GET /api/pools/<short_code>/?amount=

    Pool + progreso de donaciones (sincronizado contra Horizon en el
    momento de la consulta) + URI de pago SEP-7. Sin guard a proposito:
    cualquiera con el link/QR tiene que poder verlo. `amount` es opcional,
    para sugerir un monto de donacion en el QR (las donaciones son libres
    por default).
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

        amount = request.query_params.get("amount") or None
        payment_uri = build_payment_uri(pool.wallet_address, pool.short_code, amount)

        return Response(
            {
                "pool": PoolSerializer(pool).data,
                "progress": progress_summary(pool),
                "payment_uri": payment_uri,
            }
        )
