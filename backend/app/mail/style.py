"""The look of every email: the site's restaurants look, as email-safe values.

The colours are the ones in frontend/src/design/restaurant-theme.css (white and
lavender surfaces, deep purple for structure, pink for the one main action).
Email apps ignore CSS variables and web fonts, so the values are written out
here, and tests/test_mail_style.py fails if they drift from the theme or stop
passing the contrast rule (WCAG AA, 4.5:1).

The font stack uses single quotes because it is placed inside style="...".
"""

import html
from typing import Literal

BG = "#f8f7fc"  # lavender page
CARD = "#ffffff"  # the card the words sit on
INK = "#1f1b33"
MUTED = "#5f5a75"
BORDER = "#e3e0ec"
PRIMARY = "#4f3f8f"  # deep purple: headings, links
ON_PRIMARY = "#ffffff"
CTA = "#b0347a"  # pink: the one main action
ACCENT = "#a12f6f"
DANGER = "#923b31"

# The restaurants look uses one sans family for headings and text.
FONT = "'Avenir Next', 'Segoe UI Variable Text', 'Segoe UI', system-ui, -apple-system, Roboto, 'Helvetica Neue', Arial, sans-serif"

_BUTTON_BASE = (
    "display:inline-block;text-decoration:none;padding:12px 22px;border-radius:12px;"
    "font-weight:700;font-size:16px;margin:0 8px 8px 0;"
)


def button_html(href: str, label: str, *, kind: Literal["cta", "danger"] = "cta") -> str:
    """A link that looks like one of the site's buttons. Address and label are escaped.

    "cta" is the pink main action; "danger" is the white button with red text
    and a red border that the site uses for cancelling.
    """
    if kind == "cta":
        look = f"background:{CTA};color:{ON_PRIMARY};border:2px solid {CTA};"
    else:
        look = f"background:{CARD};color:{DANGER};border:2px solid {DANGER};"
    return (
        f'<a href="{html.escape(href, quote=True)}" style="{_BUTTON_BASE}{look}">'
        f"{html.escape(label)}</a>"
    )


def with_action(link: str, action: Literal["change", "cancel"]) -> str:
    """The manage link with `action=...` added, so the page opens the right panel.

    The page only opens a form or a confirmation: opening this link never
    changes or cancels anything by itself.
    """
    return f"{link}{'&' if '?' in link else '?'}action={action}"
