"""Portuguese mobile numbers: one clean form to store, and a masked form to show."""

import re

# Mobile numbers start with 91, 92, 93 or 96 and have 9 digits. Landlines (2xx) and
# special numbers (707, 800, other 9xx) are refused: they cannot receive these
# messages, and premium ones are how "SMS pumping" fraud makes money.
_MOBILE = re.compile(r"^9[1236]\d{7}$")


def normalise_pt_mobile(raw: str) -> str | None:
    """'912 345 678', '+351 912345678' or '00351912345678' -> '+351912345678'.

    None when it is not a Portuguese mobile number.
    """
    text = raw.strip()
    if not re.fullmatch(r"\+?[\d\s.\-()]+", text):
        return None
    digits = re.sub(r"\D", "", text)
    for prefix in ("00351", "351"):
        if digits.startswith(prefix) and len(digits) == len(prefix) + 9:
            digits = digits[len(prefix) :]
            break
    return f"+351{digits}" if _MOBILE.match(digits) else None


def mask(e164: str | None) -> str:
    """'+351912345678' -> '+351 9•• ••• 678': enough to recognise your own number."""
    if not e164 or not e164.startswith("+351") or len(e164) != 13:
        return "•••"
    local = e164[4:]
    return f"+351 {local[0]}•• ••• {local[6:]}"
