from decimal import Decimal

from django.utils import timezone
from datetime import timedelta

from rest_framework import serializers

from . import quotes
from .models import STELLAR_TX_HASH_LENGTH, Payment, RecurringTransfer
from .stellar_client import fetch_payment_from_tx_hash

_HEX_DIGITS = set("0123456789abcdef")


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ["id", "sender", "receiver", "tx_hash", "note", "category", "created_at", "updated_at"]
        read_only_fields = fields


class PaymentMetadataCreateSerializer(serializers.ModelSerializer):
    """Input: tx_hash + la metadata que el ledger no tiene (nota, categoria).

    sender/receiver no se piden en el body: se toman de Horizon al guardar
    (ver `create`), para que no haya forma de que la metadata quede asociada
    a un sender/receiver distinto de lo que realmente paso on-chain.
    """

    class Meta:
        model = Payment
        fields = ["tx_hash", "note", "category"]

    def validate_tx_hash(self, value: str) -> str:
        value = value.strip().lower()
        if len(value) != STELLAR_TX_HASH_LENGTH or not set(value) <= _HEX_DIGITS:
            raise serializers.ValidationError(
                f"tx_hash debe ser un hash hexadecimal de {STELLAR_TX_HASH_LENGTH} caracteres."
            )
        if Payment.objects.filter(tx_hash=value).exists():
            raise serializers.ValidationError("Ya existe metadata guardada para esta transaccion.")
        return value

    def create(self, validated_data: dict) -> Payment:
        # Puede levantar StellarLookupError/StellarUnavailableError: la vista
        # las mapea a la respuesta HTTP correspondiente.
        on_chain = fetch_payment_from_tx_hash(validated_data["tx_hash"])
        return Payment.objects.create(
            sender=on_chain.sender,
            receiver=on_chain.receiver,
            tx_hash=validated_data["tx_hash"],
            note=validated_data.get("note", ""),
            category=validated_data.get("category", ""),
        )


class PaymentHistoryQuerySerializer(serializers.Serializer):
    """Valida los query params de GET /api/payments/history/<public_key>/."""

    limit = serializers.IntegerField(required=False, default=20, min_value=1, max_value=100)
    cursor = serializers.CharField(required=False, allow_null=True, default=None)


class QuoteQuerySerializer(serializers.Serializer):
    """Valida los query params de GET /api/payments/quote/.

    Los assets admitidos son los de `payments.quotes` (XLM/USDC/EURC) y el
    monto admite hasta 7 decimales, como los montos de Stellar.
    """

    send_asset = serializers.ChoiceField(choices=quotes.SUPPORTED_ASSET_CODES)
    dest_asset = serializers.ChoiceField(choices=quotes.SUPPORTED_ASSET_CODES)
    amount = serializers.DecimalField(
        max_digits=20,
        decimal_places=7,
        min_value=Decimal("0.0000001"),
    )

    def validate_amount(self, value: Decimal) -> Decimal:
        # DecimalField ya garantiza 7 decimales; normalizamos para que el
        # calculo no dependa de ceros finales ("10" == "10.0000000").
        return value.normalize()


def _validate_g_public_key(value: str) -> str:
    from stellar_sdk.strkey import StrKey

    if not StrKey.is_valid_ed25519_public_key(value):
        raise serializers.ValidationError(
            "Debe ser una clave publica de Stellar valida (G...)."
        )
    return value


def _next_run_delta(frequency: str) -> timedelta:
    return {
        "weekly": timedelta(days=7),
        "biweekly": timedelta(days=14),
        "monthly": timedelta(days=30),
    }[frequency]


class RecurringSerializer(serializers.ModelSerializer):
    class Meta:
        model = RecurringTransfer
        fields = [
            "id",
            "sender",
            "receiver",
            "amount",
            "asset_code",
            "frequency",
            "next_run_at",
            "last_paid_at",
            "note",
            "active",
            "created_at",
        ]
        read_only_fields = fields


class RecurringCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = RecurringTransfer
        fields = ["sender", "receiver", "amount", "asset_code", "frequency", "note", "next_run_at"]
        extra_kwargs = {"next_run_at": {"required": False, "allow_null": True, "default": None}}

    def validate_sender(self, value: str) -> str:
        return _validate_g_public_key(value)

    def validate_receiver(self, value: str) -> str:
        return _validate_g_public_key(value)

    def validate_asset_code(self, value: str) -> str:
        code = (value or "XLM").strip().upper()
        if code not in quotes.SUPPORTED_ASSET_CODES:
            raise serializers.ValidationError("asset_code debe ser XLM, USDC o EURC.")
        return code

    def validate_amount(self, value: str) -> str:
        try:
            amount = Decimal(value)
        except Exception as exc:
            raise serializers.ValidationError("amount debe ser un numero valido.") from exc
        if amount <= 0:
            raise serializers.ValidationError("amount debe ser mayor a 0.")
        if amount != amount.quantize(Decimal("0.0000001")):
            raise serializers.ValidationError("amount admite hasta 7 decimales.")
        return value

    def validate(self, attrs: dict) -> dict:
        if attrs["sender"] == attrs["receiver"]:
            raise serializers.ValidationError(
                {"receiver": "El remitente y el destinatario tienen que ser distintas cuentas."}
            )
        return attrs

    def create(self, validated_data: dict) -> RecurringTransfer:
        next_run = validated_data.get("next_run_at") or timezone.now() + _next_run_delta(
            validated_data["frequency"]
        )
        return RecurringTransfer.objects.create(
            sender=validated_data["sender"],
            receiver=validated_data["receiver"],
            amount=validated_data["amount"],
            asset_code=validated_data.get("asset_code", "XLM"),
            frequency=validated_data["frequency"],
            note=validated_data.get("note", ""),
            next_run_at=next_run,
        )


class RecurringPatchSerializer(serializers.Serializer):
    """PATCH: toggle de activo y/o marcar como pagado (corre la proxima
    fecha segun la frecuencia). El guard de quien puede tocar vive en la
    vista (sender_public_key == regla.sender)."""

    active = serializers.BooleanField(required=False)
    paid = serializers.BooleanField(required=False)
