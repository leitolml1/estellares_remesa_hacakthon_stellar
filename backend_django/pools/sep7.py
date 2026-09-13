"""SEP-7 (URI Scheme to facilitate delegated signing): solo el caso "pay"
que necesita el Modulo 2, para que cualquier wallet compatible (Freighter,
Lobstr, etc.) pueda donar a un pool escaneando un QR sin estar registrada
en la app.
"""

from urllib.parse import urlencode

SEP7_PAY_PREFIX = "web+stellar:pay"
MEMO_TYPE_TEXT = "MEMO_TEXT"


def build_payment_uri(destination: str, memo: str, amount: str | None = None) -> str:
    # urlencode en vez de concatenar a mano: evita bugs de encoding si
    # destination/memo tuvieran caracteres especiales (hoy no los tienen,
    # pero no hay que asumirlo a futuro).
    params = {"destination": destination, "memo": memo, "memo_type": MEMO_TYPE_TEXT}
    if amount:
        params["amount"] = amount
    return f"{SEP7_PAY_PREFIX}?{urlencode(params)}"
