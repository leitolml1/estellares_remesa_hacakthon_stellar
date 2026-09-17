"""Cotizador de tipo de cambio para armado de pagos (pathPaymentStrictSend).

Para un par de assets devuelve cuánto recibirá el destinatario por un monto
de envio, junto con el `dest_min` que el pago deberia exigir (proteccion de
slippage). Dos fuentes, en este orden:

1. "dex": Horizon strict-send path finding (el mejor camino real on-chain).
2. "reference": tasas referenciales asset -> XLM de `stellar_common.assets`
   (testnet no tiene liquidez DEX para USDC/EURC, asi que casi siempre cae aca).

Mismo asset en los dos extremos no necesita camino: es un pago directo.
"""

from decimal import Decimal, ROUND_DOWN, getcontext

from stellar_common.assets import (
    CIRCLE_TESTNET_ASSET_ISSUERS,
    CIRCLE_TESTNET_XLM_REFERENCE_RATES,
)
from stellar_common.client import get_server

getcontext().prec = 28

# Cuanto tolera perder el envio antes de que Horizon lo rechace por
# `op_under_dest_min`: buffer de slippage del 1% sobre lo cotizado.
SLIPPAGE_BUFFER = Decimal("0.99")

# Guard de sanidad para el camino DEX: la respuesta de Horizon se compara
# contra la tasa referencial y solo se usa si se mantiene dentro de esta
# banda. En testnet hay pools con precios absurdos (liquidez de juguete)
# que devuelven tasas de cientos de veces el valor real: mejor rechazar el
# camino y cotizar con la tasa referencial, que es la misma que usa el
# resto de la app (metas de pools, etc.).
MAX_DEX_DEVIATION_UP = Decimal("2")    # dex hasta 2x la referencial
MAX_DEX_DEVIATION_DOWN = Decimal("0.5")  # dex no peor que la mitad

_XLM_PRECISION = Decimal("0.0000001")
_XLM_RATE_BY_CODE = {"XLM": Decimal("1")}

SUPPORTED_ASSET_CODES = ("XLM",) + tuple(CIRCLE_TESTNET_ASSET_ISSUERS)


class UnsupportedAssetError(Exception):
    """El par pedido no es un asset soportado (XLM/USDC/EURC)."""


def reference_rate_for(asset_code: str) -> Decimal:
    """Cuantos XLM vale 1 unidad del asset, segun tasas referenciales."""
    if asset_code in _XLM_RATE_BY_CODE:
        return _XLM_RATE_BY_CODE[asset_code]
    rate = CIRCLE_TESTNET_XLM_REFERENCE_RATES.get(asset_code)
    if rate is None:
        raise UnsupportedAssetError(asset_code)
    return Decimal(rate)


def _floor_7_decimals(value: Decimal) -> str:
    return format(value.quantize(_XLM_PRECISION, rounding=ROUND_DOWN), "f")


def _dex_quote(send_asset, dest_asset, amount: Decimal) -> str | None:
    """Mejor camino de Horizon strict-send path finding, o None si no hay."""
    server = get_server()
    builder = server.strict_send_paths(send_asset, str(amount), [dest_asset])
    records = builder.call().get("_embedded", {}).get("records", [])
    if not records:
        return None
    best = records[0]
    destination_amount = best.get("destination_amount")
    if destination_amount is None or Decimal(destination_amount) <= 0:
        return None
    return destination_amount


def _reference_dest_amount(send_code: str, dest_code: str, amount: Decimal) -> Decimal:
    """Equivalente del monto segun tasas referenciales, via XLM."""
    send_in_xlm = amount * reference_rate_for(send_code)
    return send_in_xlm / reference_rate_for(dest_code)


def _dex_quote_is_sane(
    send_code: str, dest_code: str, amount: Decimal, dex_amount: Decimal
) -> bool:
    """True si la respuesta DEX no se desvia de la tasa referencial."""
    reference_amount = _reference_dest_amount(send_code, dest_code, amount)
    if reference_amount <= 0:
        return False
    ratio = dex_amount / reference_amount
    return MAX_DEX_DEVIATION_DOWN <= ratio <= MAX_DEX_DEVIATION_UP


def get_quote(send_code: str, dest_code: str, amount: Decimal) -> dict:
    """Quote lista para armado de pago: dest_amount, dest_min y rate.

    `source` explica de donde salio: "direct" (mismo asset), "dex" (Horizon)
    o "reference" (tasas editoriales cuando no hay camino on-chain).
    """
    if send_code not in SUPPORTED_ASSET_CODES:
        raise UnsupportedAssetError(send_code)
    if dest_code not in SUPPORTED_ASSET_CODES:
        raise UnsupportedAssetError(dest_code)
    if amount <= 0:
        raise UnsupportedAssetError("amount")

    if send_code == dest_code:
        dest_amount = Decimal(amount)
        source = "direct"
    else:
        from stellar_sdk import Asset

        send_asset = (
            Asset.native()
            if send_code == "XLM"
            else Asset(send_code, CIRCLE_TESTNET_ASSET_ISSUERS[send_code])
        )
        dest_asset = (
            Asset.native()
            if dest_code == "XLM"
            else Asset(dest_code, CIRCLE_TESTNET_ASSET_ISSUERS[dest_code])
        )
        try:
            dex_amount = _dex_quote(send_asset, dest_asset, amount)
        except Exception:
            # Sin camino on-chain (400 de Horizon, 5xx, timeout, etc.):
            # la quote cae a la tasa referencial en vez de romper el flujo.
            dex_amount = None
        if dex_amount is not None and _dex_quote_is_sane(
            send_code, dest_code, amount, Decimal(dex_amount)
        ):
            dest_amount = Decimal(dex_amount)
            source = "dex"
        else:
            send_in_xlm = amount * reference_rate_for(send_code)
            dest_amount = send_in_xlm / reference_rate_for(dest_code)
            source = "reference"

    dest_min = dest_amount * SLIPPAGE_BUFFER
    rate = dest_amount / amount
    return {
        "send_asset": send_code,
        "dest_asset": dest_code,
        "send_amount": _floor_7_decimals(Decimal(amount)),
        "dest_amount": _floor_7_decimals(dest_amount),
        "dest_min": _floor_7_decimals(dest_min),
        "rate": _floor_7_decimals(rate),
        "source": source,
    }
