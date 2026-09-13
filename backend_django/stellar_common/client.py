"""Helpers de lectura contra Horizon compartidos entre `payments` y `pools`.

No es una app de Django (no tiene modelos): es un paquete de utilidades
puro para no duplicar la conexion a Horizon ni las excepciones de red entre
los dos modulos.
"""

from django.conf import settings
from stellar_sdk import Server

PAYMENT_LIKE_OPERATION_TYPES = {
    "payment",
    "path_payment_strict_send",
    "path_payment_strict_receive",
}


class StellarAccountNotFoundError(Exception):
    """La cuenta no existe o todavia no fue fondeada en la red Stellar."""

    def __init__(self, public_key: str):
        self.public_key = public_key
        super().__init__(public_key)


class StellarUnavailableError(Exception):
    """Horizon no responde (timeout, DNS, 5xx, etc.) - reintentar mas tarde."""


def get_server() -> Server:
    return Server(horizon_url=settings.STELLAR_HORIZON_URL)


def asset_fields(operation: dict) -> tuple[str, str | None]:
    """(asset_code, asset_issuer) de una operacion de pago de Horizon, con
    'XLM'/None para el activo nativo en vez de los valores crudos de la API.
    """
    is_native = operation.get("asset_type") == "native"
    asset_code = "XLM" if is_native else operation.get("asset_code", "")
    asset_issuer = None if is_native else operation.get("asset_issuer")
    return asset_code, asset_issuer
