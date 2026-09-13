from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from stellar_sdk.strkey import StrKey

from .models import Payment
from .serializers import (
    PaymentHistoryQuerySerializer,
    PaymentMetadataCreateSerializer,
    PaymentSerializer,
)
from .stellar_client import (
    StellarAccountNotFoundError,
    StellarTransactionFailedError,
    StellarTransactionNotAPaymentError,
    StellarTransactionNotFoundError,
    StellarUnavailableError,
    fetch_payment_history,
)


class PaymentMetadataView(APIView):
    """POST /api/payments/

    Guarda la metadata (nota/categoria) de un pago que ya esta confirmado en
    el ledger de Stellar. Antes de guardar nada, verifica contra Horizon que
    la tx existe, fue exitosa, y contiene una operacion de pago; sender y
    receiver se toman de esa verificacion, no del body.
    """

    def post(self, request):
        serializer = PaymentMetadataCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            payment = serializer.save()
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

        return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)


class PaymentHistoryView(APIView):
    """GET /api/payments/history/<public_key>/?limit=&cursor=

    Historial de pagos on-chain de `public_key`, combinado con la metadata
    propia (nota/categoria) para las tx que la tengan guardada. El ledger
    sigue siendo la fuente de verdad de monto/fecha/estado; esta vista solo
    le agrega lo que Horizon no tiene.
    """

    def get(self, request, public_key: str):
        if not StrKey.is_valid_ed25519_public_key(public_key):
            return Response(
                {"detail": "public_key invalida: debe ser una clave publica de Stellar (G...)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        query = PaymentHistoryQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)

        try:
            records, next_cursor = fetch_payment_history(
                public_key,
                limit=query.validated_data["limit"],
                cursor=query.validated_data["cursor"],
            )
        except StellarAccountNotFoundError:
            return Response(
                {"detail": "La cuenta no existe o todavia no fue fondeada en la red Stellar."},
                status=status.HTTP_404_NOT_FOUND,
            )
        except StellarUnavailableError:
            return Response(
                {"detail": "El servicio de Stellar Horizon no esta disponible, reintenta en unos segundos."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        tx_hashes = {record.transaction_hash for record in records}
        metadata_by_tx_hash = {
            payment.tx_hash: payment
            for payment in Payment.objects.filter(tx_hash__in=tx_hashes)
        }

        results = []
        for record in records:
            metadata = metadata_by_tx_hash.get(record.transaction_hash)
            results.append(
                {
                    "operation_id": record.operation_id,
                    "sender": record.sender,
                    "receiver": record.receiver,
                    "amount": record.amount,
                    "asset_code": record.asset_code,
                    "asset_issuer": record.asset_issuer,
                    "transaction_hash": record.transaction_hash,
                    "created_at": record.created_at,
                    "note": metadata.note if metadata else None,
                    "category": metadata.category if metadata else None,
                }
            )

        return Response({"records": results, "next_cursor": next_cursor})
