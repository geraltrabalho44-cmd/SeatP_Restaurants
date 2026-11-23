"""Email colours come from the design tokens, pass contrast, and the button is safe."""

import re
from pathlib import Path

import pytest

from app.mail import style

TOKENS = Path(__file__).resolve().parents[2] / "frontend" / "src" / "design" / "tokens.css"


def _token(name: str) -> str:
    match = re.search(rf"--{re.escape(name)}:\s*(#[0-9a-fA-F]{{6}})", TOKENS.read_text("utf-8"))
    assert match, f"{name} not found in tokens.css"
    return match.group(1).lower()


def test_colours_match_the_design_tokens() -> None:
    expected = {
        "c-bg": style.BG,
        "c-surface": style.CARD,
        "c-text": style.INK,
        "c-text-muted": style.MUTED,
        "c-border": style.BORDER,
        "c-primary": style.PRIMARY,
        "c-on-primary": style.ON_PRIMARY,
        "c-accent": style.ACCENT,
        "c-danger": style.DANGER,
    }
    for token, value in expected.items():
        assert _token(token) == value.lower(), token


def _luminance(hex_colour: str) -> float:
    channels = [int(hex_colour[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    linear = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def _ratio(foreground: str, background: str) -> float:
    lighter, darker = sorted((_luminance(foreground), _luminance(background)), reverse=True)
    return (lighter + 0.05) / (darker + 0.05)


@pytest.mark.parametrize(
    ("foreground", "background"),
    [
        (style.INK, style.CARD),
        (style.MUTED, style.CARD),
        (style.MUTED, style.BG),
        (style.ON_PRIMARY, style.PRIMARY),
        (style.PRIMARY, style.CARD),
        (style.ACCENT, style.CARD),
    ],
)
def test_text_pairs_pass_wcag_aa(foreground: str, background: str) -> None:
    assert _ratio(foreground, background) >= 4.5


def test_button_escapes_and_has_two_looks() -> None:
    primary = style.button_html('https://x/b/a?x=1&y="2"', "<b>Go</b>")
    assert 'href="https://x/b/a?x=1&amp;y=&quot;2&quot;"' in primary
    assert "&lt;b&gt;Go&lt;/b&gt;" in primary and "<b>" not in primary
    assert "background:#1f5a48" in primary
    secondary = style.button_html("https://x/b/a", "Cancel", primary=False)
    assert "border:2px solid #1f5a48" in secondary
    assert "background:#1f5a48" not in secondary
