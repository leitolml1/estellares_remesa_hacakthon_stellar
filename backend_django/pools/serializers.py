from decimal import Decimal, InvalidOperation

from rest_framework import serializers
from stellar_sdk.strkey import StrKey

from .models import Pool


def _validate_stellar_public_key(value: str) -> str:
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


class PoolSerializer(serializers.ModelSerializer):
    class Meta:
        model = Pool
        fields = [
            "id",
            "short_code",
            "wallet_address",
            "title",
            "goal_amount",
            "deadline",
            "creator",
            "vault_registered",
            "created_at",
        ]
        read_only_fields = fields


class PoolCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Pool
        fields = ["wallet_address", "title", "goal_amount", "deadline", "creator"]

    def validate_wallet_address(self, value: str) -> str:
        return _validate_stellar_public_key(value)

    def validate_creator(self, value: str) -> str:
        return _validate_stellar_public_key(value)

    def validate_goal_amount(self, value: str | None) -> str | None:
        if not value:
            return value
        try:
            amount = Decimal(value)
        except InvalidOperation as exc:
            raise serializers.ValidationError("goal_amount debe ser un numero valido.") from exc
        if amount <= 0:
            raise serializers.ValidationError("goal_amount debe ser mayor a 0.")
        # Alineado con amount_to_scaled del vault: una meta con mas de 7
        # decimales crearia un pool que despues nunca se podria registrar
        # en el vault.
        if (amount * Decimal(10_000_000)) != (amount * Decimal(10_000_000)).to_integral_value():
            raise serializers.ValidationError(
                "goal_amount debe tener hasta 7 decimales (unidad del asset)."
            )
        return value


class VaultRegisterBuildSerializer(serializers.Serializer):
    owner_public_key = serializers.CharField()

    def validate_owner_public_key(self, value: str) -> str:
        return _validate_stellar_public_key(value)


class VaultDepositBuildSerializer(serializers.Serializer):
    donor_public_key = serializers.CharField()
    asset_code = serializers.CharField(required=False, allow_blank=True, default="XLM")
    amount = serializers.CharField()

    def validate_donor_public_key(self, value: str) -> str:
        return _validate_stellar_public_key(value)

    def validate_asset_code(self, value: str) -> str:
        code = (value or "XLM").strip().upper()
        if code not in ("XLM", "USDC", "EURC"):
            raise serializers.ValidationError("asset_code debe ser XLM, USDC o EURC.")
        return code

    def validate_amount(self, value: str) -> str:
        return _validate_positive_decimal(value, "amount")


class VaultWithdrawBuildSerializer(serializers.Serializer):
    owner_public_key = serializers.CharField()
    asset_code = serializers.CharField(required=False, allow_blank=True, default="XLM")
    destination_public_key = serializers.CharField()
    amount = serializers.CharField()

    def validate_owner_public_key(self, value: str) -> str:
        return _validate_stellar_public_key(value)

    def validate_destination_public_key(self, value: str) -> str:
        return _validate_stellar_public_key(value)

    def validate_asset_code(self, value: str) -> str:
        code = (value or "XLM").strip().upper()
        if code not in ("XLM", "USDC", "EURC"):
            raise serializers.ValidationError("asset_code debe ser XLM, USDC o EURC.")
        return code

    def validate_amount(self, value: str) -> str:
        return _validate_positive_decimal(value, "amount")


class VaultSubmitSerializer(serializers.Serializer):
    signed_xdr = serializers.CharField()
