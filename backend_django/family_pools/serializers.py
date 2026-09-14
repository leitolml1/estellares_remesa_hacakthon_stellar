from decimal import Decimal, InvalidOperation

from rest_framework import serializers
from stellar_sdk.strkey import StrKey

from .models import FamilyPool, FamilyPoolDeposit

MAX_SIGNER_WEIGHT = 255
MAX_THRESHOLD = 255
STELLAR_TX_HASH_LENGTH = 64
_HEX_DIGITS = set("0123456789abcdef")


def _validate_public_key(value: str) -> str:
    if not StrKey.is_valid_ed25519_public_key(value):
        raise serializers.ValidationError("Debe ser una clave publica de Stellar valida (G...).")
    return value


def _validate_positive_decimal(value: str, field_label: str) -> str:
    try:
        amount = Decimal(value)
    except InvalidOperation as exc:
        raise serializers.ValidationError(f"{field_label} debe ser un numero valido.") from exc
    if amount <= 0:
        raise serializers.ValidationError(f"{field_label} debe ser mayor a 0.")
    return value


class SignerInputSerializer(serializers.Serializer):
    public_key = serializers.CharField()
    weight = serializers.IntegerField(min_value=1, max_value=MAX_SIGNER_WEIGHT)

    def validate_public_key(self, value: str) -> str:
        return _validate_public_key(value)


class SignersThresholdValidationMixin:
    """Comun a los dos endpoints de "build" que reciben signers +
    med_threshold: sin repetidos, sin lista vacia, suma de weights dentro
    del rango de un threshold de Stellar (uint8), y med_threshold
    alcanzable por esa suma.
    """

    def validate_signers(self, value: list[dict]) -> list[dict]:
        if not value:
            raise serializers.ValidationError("Hace falta al menos un signer.")
        public_keys = [signer["public_key"] for signer in value]
        if len(public_keys) != len(set(public_keys)):
            raise serializers.ValidationError("No puede haber signers repetidos.")
        return value

    def validate(self, attrs: dict) -> dict:
        total_weight = sum(signer["weight"] for signer in attrs["signers"])
        if total_weight > MAX_THRESHOLD:
            raise serializers.ValidationError(
                f"La suma de weights de los signers ({total_weight}) no puede superar {MAX_THRESHOLD}."
            )
        if attrs["med_threshold"] > total_weight:
            raise serializers.ValidationError(
                "med_threshold no puede ser mayor a la suma de weights de los signers: "
                "ninguna combinacion de firmas podria alcanzarlo nunca."
            )
        return attrs


class BuildCreateAccountSerializer(SignersThresholdValidationMixin, serializers.Serializer):
    creator_public_key = serializers.CharField()
    pool_public_key = serializers.CharField()
    signers = SignerInputSerializer(many=True)
    med_threshold = serializers.IntegerField(min_value=1, max_value=MAX_THRESHOLD)
    extra_starting_balance = serializers.CharField(required=False, default="0")

    def validate_creator_public_key(self, value: str) -> str:
        return _validate_public_key(value)

    def validate_pool_public_key(self, value: str) -> str:
        return _validate_public_key(value)

    def validate_extra_starting_balance(self, value: str) -> str:
        if not value:
            return "0"
        try:
            amount = Decimal(value)
        except InvalidOperation as exc:
            raise serializers.ValidationError("extra_starting_balance debe ser un numero valido.") from exc
        if amount < 0:
            raise serializers.ValidationError("extra_starting_balance no puede ser negativo.")
        return value


class BuildConfigureSignersSerializer(SignersThresholdValidationMixin, serializers.Serializer):
    pool_public_key = serializers.CharField()
    signers = SignerInputSerializer(many=True)
    med_threshold = serializers.IntegerField(min_value=1, max_value=MAX_THRESHOLD)

    def validate_pool_public_key(self, value: str) -> str:
        return _validate_public_key(value)


class ConfirmPoolSetupSerializer(serializers.Serializer):
    pool_public_key = serializers.CharField()
    title = serializers.CharField(max_length=140)
    creator_public_key = serializers.CharField()
    withdrawal_limit = serializers.CharField(max_length=32)

    def validate_pool_public_key(self, value: str) -> str:
        value = _validate_public_key(value)
        if FamilyPool.objects.filter(pool_account=value).exists():
            raise serializers.ValidationError("Ya existe una caja familiar para esta cuenta.")
        return value

    def validate_creator_public_key(self, value: str) -> str:
        return _validate_public_key(value)

    def validate_withdrawal_limit(self, value: str) -> str:
        return _validate_positive_decimal(value, "withdrawal_limit")


class FamilyPoolSerializer(serializers.ModelSerializer):
    class Meta:
        model = FamilyPool
        fields = [
            "id",
            "pool_account",
            "title",
            "creator",
            "signers",
            "med_threshold",
            "high_threshold",
            "withdrawal_limit",
            "created_at",
        ]
        read_only_fields = fields


class FamilyPoolDepositSerializer(serializers.ModelSerializer):
    class Meta:
        model = FamilyPoolDeposit
        fields = ["id", "pool", "depositor", "tx_hash", "note", "created_at"]
        read_only_fields = fields


class FamilyPoolDepositCreateSerializer(serializers.ModelSerializer):
    """Input: tx_hash + nota. depositor se toma de Horizon al guardar (ver
    la vista), nunca del body: depositar no requiere firma de la cuenta
    del pool, asi que no hay forma de "autenticar" quien deposito salvo
    leyendo quien aparece como sender en el ledger.
    """

    class Meta:
        model = FamilyPoolDeposit
        fields = ["tx_hash", "note"]

    def validate_tx_hash(self, value: str) -> str:
        value = value.strip().lower()
        if len(value) != STELLAR_TX_HASH_LENGTH or not set(value) <= _HEX_DIGITS:
            raise serializers.ValidationError(
                f"tx_hash debe ser un hash hexadecimal de {STELLAR_TX_HASH_LENGTH} caracteres."
            )
        if FamilyPoolDeposit.objects.filter(tx_hash=value).exists():
            raise serializers.ValidationError("Ya existe metadata guardada para esta transaccion.")
        return value


class WithdrawalBuildSerializer(serializers.Serializer):
    destination_public_key = serializers.CharField()
    amount = serializers.CharField()
    memo = serializers.CharField(required=False, allow_blank=True, max_length=28)

    def validate_destination_public_key(self, value: str) -> str:
        return _validate_public_key(value)

    def validate_amount(self, value: str) -> str:
        return _validate_positive_decimal(value, "amount")


class WithdrawalSubmitSerializer(serializers.Serializer):
    signed_xdr = serializers.CharField()


class BlendAmountSerializer(serializers.Serializer):
    """Input comun a supply/withdraw de Blend: un monto en XLM."""

    amount = serializers.CharField()

    def validate_amount(self, value: str) -> str:
        return _validate_positive_decimal(value, "amount")
