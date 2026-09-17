from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from stellar_sdk.strkey import StrKey

from .models import Payment, RecurringTransfer
from .serializers import (
    PaymentHistoryQuerySerializer,
    PaymentMetadataCreateSerializer,
    PaymentSerializer,
    QuoteQuerySerializer,
    RecurringCreateSerializer,
    RecurringPatchSerializer,
    RecurringSerializer,
)
from .quotes import get_quote, UnsupportedAssetError
from .serializers import _next_run_delta
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


class QuoteView(APIView):
    """GET /api/payments/quote/?send_asset=&dest_asset=&amount=

    Cuanto recibira el destinatario por el envio y que `dest_min` exigir en
    el pathPaymentStrictSend. La logica (DEX de Horizon + fallback a tasas
    referenciales) vive en `payments.quotes`.
    """

    def get(self, request):
        query = QuoteQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)

        try:
            quote = get_quote(
                query.validated_data["send_asset"],
                query.validated_data["dest_asset"],
                query.validated_data["amount"],
            )
        except UnsupportedAssetError:
            return Response(
                {"detail": "Asset no soportado: usamos XLM, USDC o EURC."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(quote)


class RecurringListCreateView(APIView):
    """GET /api/payments/recurring/?public_key=&due=
    POST /api/payments/recurring/

    Reglas de remesa recurrente de una wallet. Sin custodia: el backend
    solo guarda la intencion (frecuencia + proxima fecha) para que el
    frontend le recuerde al usuario pagar con su wallet. `due=true`
    devuelve solo las que vencieron (para el recordatorio).
    """

    def get(self, request):
        public_key = (request.query_params.get("public_key") or "").strip()
        if not StrKey.is_valid_ed25519_public_key(public_key):
            return Response(
                {"detail": "Hace falta public_key (clave G...) para listar tus pagos programados."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        rules = RecurringTransfer.objects.filter(sender=public_key)
        if (request.query_params.get("due") or "").lower() in ("1", "true"):
            rules = rules.filter(active=True, next_run_at__lte=timezone.now())
        return Response({"records": RecurringSerializer(rules, many=True).data})

    def post(self, request):
        serializer = RecurringCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rule = serializer.save()
        return Response(RecurringSerializer(rule).data, status=status.HTTP_201_CREATED)


class RecurringDetailView(APIView):
    """PATCH /api/payments/recurring/<id>/
    DELETE /api/payments/recurring/<id>/

    Modificacion/borrado de una regla. Guard ad-hoc (mismo patron que
    family_pools mientras no haya auth real): `sender_public_key` en el
    body tiene que ser el sender de la regla.
    """

    def patch(self, request, rule_id: int):
        rule = get_object_or_404(RecurringTransfer, pk=rule_id)
        sender = (request.data.get("sender_public_key") or "").strip()
        if sender != rule.sender:
            return Response(
                {"detail": "Solo quien creo la regla puede modificarla."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = RecurringPatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if "active" in data:
            rule.active = data["active"]
        if data.get("paid"):
            rule.last_paid_at = timezone.now()
            rule.next_run_at = timezone.now() + _next_run_delta(rule.frequency)
        rule.save()
        return Response(RecurringSerializer(rule).data)

    def delete(self, request, rule_id: int):
        rule = get_object_or_404(RecurringTransfer, pk=rule_id)
        sender = (request.data.get("sender_public_key") or "").strip()
        if sender != rule.sender:
            return Response(
                {"detail": "Solo quien creo la regla puede borrarla."},
                status=status.HTTP_403_FORBIDDEN,
            )
        rule.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
