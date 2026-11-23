"""The look of every email: the product's colours and fonts, and the button.

The colours are the ones in frontend/src/design/tokens.css (linen and bottle
green). Email apps ignore CSS variables and web fonts, so the values are
written out here and tests/test_mail_style.py fails if they drift from the
tokens or stop passing the contrast rule.

The font stacks use single quotes because they are placed inside style="...".
"""

import html

BG = "#f4efe6"  # linen page
CARD = "#fbf8f2"  # the card the words sit on
INK = "#1e2724"
MUTED = "#545d58"
BORDER = "#c9bfae"
PRIMARY = "#1f5a48"  # bottle green
ON_PRIMARY = "#fbf8f2"
ACCENT = "#7f5310"  # brass, dark enough for text
DANGER = "#9c3226"

FONT_DISPLAY = (
    "'Iowan Old Style', Charter, 'Bitstream Charter', 'Sitka Text', Cambria, Georgia, serif"
)
FONT_BODY = "'Avenir Next', 'Segoe UI', system-ui, -apple-system, Roboto, 'Helvetica Neue', Arial, sans-serif"

_BUTTON_BASE = (
    "display:inline-block;text-decoration:none;padding:12px 20px;border-radius:6px;"
    "font-weight:bold;margin:0 8px 8px 0;"
)


def button_html(href: str, label: str, *, primary: bool = True) -> str:
    """A link that looks like a button. Both the address and the label are escaped."""
    if primary:
        look = f"background:{PRIMARY};color:{ON_PRIMARY};border:2px solid {PRIMARY};"
    else:
        look = f"background:{CARD};color:{PRIMARY};border:2px solid {PRIMARY};"
    return (
        f'<a href="{html.escape(href, quote=True)}" style="{_BUTTON_BASE}{look}">'
        f"{html.escape(label)}</a>"
    )
