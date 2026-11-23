"""The SeatPlan logo for emails: the site's own logo, resized, stored beside the code."""

import base64
import struct
from pathlib import Path

from app.mail.logo import LOGO_CONTENT_ID, LOGO_WIDTH, logo_base64, logo_png
from app.mail.png import SIGNATURE, png_width

SITE_LOGO = (
    Path(__file__).resolve().parents[2] / "frontend" / "src" / "design" / "seatplan-logo.png"
)


def _size(png: bytes) -> tuple[int, int]:
    assert png[:8] == SIGNATURE
    return struct.unpack(">II", png[16:24])


def test_the_logo_is_a_300_pixel_wide_png_and_small() -> None:
    assert LOGO_CONTENT_ID == "logo" and LOGO_WIDTH == 300
    assert png_width(logo_png()) == 300
    assert len(logo_png()) < 40_000


def test_it_is_the_site_logo_resized_not_another_picture() -> None:
    site_width, site_height = _size(SITE_LOGO.read_bytes())
    width, height = _size(logo_png())
    assert abs(width / height - site_width / site_height) < 0.03


def test_the_logo_is_read_once() -> None:
    assert logo_png() is logo_png()


def test_base64_decodes_back_to_the_png() -> None:
    assert base64.b64decode(logo_base64()) == logo_png()
