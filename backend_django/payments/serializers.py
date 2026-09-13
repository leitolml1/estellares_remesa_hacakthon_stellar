from rest_framework import serializers

from .models import STELLAR_TX_HASH_LENGTH, Payment
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
