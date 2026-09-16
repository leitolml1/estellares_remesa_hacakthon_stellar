"""SEP-7 (URI Scheme to facilitate delegated signing): solo el caso "pay"
que necesita el Modulo 2, para que cualquier wallet compatible (Freighter,
Lobstr, etc.) pueda donar a un pool escaneando un QR sin estar registrada
en la app.
"""

from urllib.parse import urlencode

from stellar_common.assets import CIRCLE_TESTNET_ASSET_ISSUERS

SEP7_PAY_PREFIX = "web+stellar:pay"
MEMO_TYPE_TEXT = "MEMO_TEXT"


def build_payment_uri(
    destination: str,
    memo: str,
    amount: str | None = None,
    asset_code: str | None = None,
) -> str:
    # urlencode en vez de concatenar a mano: evita bugs de encoding si
    # destination/memo tuvieran caracteres especiales (hoy no los tienen,
    # pero no hay que asumirlo a futuro). XLM nativo no lleva
    # asset_code/asset_issuer.
    params = {"destination": destination, "memo": memo, "memo_type": MEMO_TYPE_TEXT}
    if amount:
        params["amount"] = amount
    code = (asset_code or "").strip().upper()
    issuer = CIRCLE_TESTNET_ASSET_ISSUERS.get(code)
    if issuer:
        params["asset_code"] = code
        params["asset_issuer"] = issuer
    return f"{SEP7_PAY_PREFIX}?{urlencode(params)}"
