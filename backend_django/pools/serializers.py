from decimal import Decimal, InvalidOperation

from rest_framework import serializers
from stellar_sdk.strkey import StrKey

from .models import Pool


def _validate_stellar_public_key(value: str) -> str:
    if not StrKey.is_valid_ed25519_public_key(value):
        raise serializers.ValidationError("Debe ser una clave publica de Stellar valida (G...).")
    return value


class PoolSerializer(serializers.ModelSerializer):
    class Meta:
        model = Pool
        fields = ["id", "short_code", "wallet_address", "title", "goal_amount", "creator", "created_at"]
        read_only_fields = fields


class PoolCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Pool
        fields = ["wallet_address", "title", "goal_amount", "creator"]

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
        return value
