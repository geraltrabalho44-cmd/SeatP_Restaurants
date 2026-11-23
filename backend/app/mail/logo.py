"""The SeatPlan logo for emails.

Gmail and Outlook do not show SVG, so emails carry the site's own logo
(frontend/src/design/seatplan-logo.png: the purple pin with an armchair and
the word SeatPlan) as a PNG. The site's file is 760 px wide; the email copy is
300 px wide (twice its shown width of 150, so it stays sharp on a phone) and
lives in app/mail/assets/ because the deployed function leaves out frontend/.
If the site's logo changes, resize the new file to 300 px wide and replace
the copy; tests/test_mail_logo.py checks that the shape still matches.

ResendProvider adds it to an email as the inline image `cid:logo`
(providers.py); it is never stored in the database.
"""

import base64
from functools import cache
from pathlib import Path

LOGO_CONTENT_ID = "logo"
LOGO_WIDTH = 300
_FILE = Path(__file__).with_name("assets") / "seatplan-logo-email.png"


@cache
def logo_png() -> bytes:
    return _FILE.read_bytes()


def logo_base64() -> str:
    return base64.b64encode(logo_png()).decode("ascii")
