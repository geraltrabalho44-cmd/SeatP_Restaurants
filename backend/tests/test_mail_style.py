"""Email colours come from the restaurants look, pass contrast, and the buttons are safe."""

import re
from pathlib import Path

import pytest

from app.mail import style

THEME = Path(__file__).resolve().parents[2] / "frontend" / "src" / "design" / "restaurant-theme.css"


def _token(name: str) -> str:
    # The first definition in the file is the light one (the dark block comes later).
    match = re.search(rf"--{re.escape(name)}:\s*(#[0-9a-fA-F]{{6}})", THEME.read_text("utf-8"))
    assert match, f"{name} not found in restaurant-theme.css"
    return match.group(1).lower()


def test_colours_match_the_restaurants_theme() -> None:
    expected = {
        "c-bg": style.BG,
        "c-surface": style.CARD,
        "c-text": style.INK,
        "c-text-muted": style.MUTED,
        "c-border": style.BORDER,
        "c-primary": style.PRIMARY,
        "c-on-primary": style.ON_PRIMARY,
        "c-cta": style.CTA,
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
        (style.ON_PRIMARY, style.CTA),
        (style.ON_PRIMARY, style.PRIMARY),
        (style.PRIMARY, style.CARD),
        (style.DANGER, style.CARD),
        (style.ACCENT, style.CARD),
    ],
)
def test_text_pairs_pass_wcag_aa(foreground: str, background: str) -> None:
    assert _ratio(foreground, background) >= 4.5


def test_button_escapes_and_has_two_looks() -> None:
    main = style.button_html('https://x/b/a?x=1&y="2"', "<b>Go</b>")
    assert 'href="https://x/b/a?x=1&amp;y=&quot;2&quot;"' in main
    assert "&lt;b&gt;Go&lt;/b&gt;" in main and "<b>" not in main
    assert "background:#b0347a" in main  # the site's one main action is pink
    danger = style.button_html("https://x/b/a", "Cancel", kind="danger")
    assert "border:2px solid #923b31" in danger and "color:#923b31" in danger
    assert "background:#b0347a" not in danger


def test_with_action_adds_the_action_to_a_link_with_or_without_a_query() -> None:
    assert style.with_action("https://s/b/t", "change") == "https://s/b/t?action=change"
    assert style.with_action("https://s/b/t?x=1", "cancel") == "https://s/b/t?x=1&action=cancel"
