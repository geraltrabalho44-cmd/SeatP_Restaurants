"""One mailbox must not be flooded by someone typing it into the booking or waitlist form.

Only matters once real email is on: with the console provider nothing is sent, so the demo and the tests are
never held back (see restaurant_service/booking_caps.py).
"""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from test_restaurant_helpers import Place, book, future_day, hold, make_restaurant

from app.core.errors import ApiError
from app.models import Organiser
from app.restaurant_service import booking_caps

LIMIT = booking_caps.MAX_EMAILS_PER_RECIPIENT_PER_HOUR


def _provider(monkeypatch: pytest.MonkeyPatch, name: str) -> None:
    monkeypatch.setattr(booking_caps, "get_settings", lambda: SimpleNamespace(email_provider=name))


def test_the_limit_is_five_an_hour() -> None:
    # A decision, not a tweak: a diner booking a few tables for friends must never meet it.
    assert LIMIT == 5


def test_nothing_is_limited_while_email_only_goes_to_the_console(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _provider(monkeypatch, "console")
    for _ in range(LIMIT * 4):
        booking_caps.check_email_recipient_limit(session, "lia.moreno@example.com")


def test_with_real_email_one_mailbox_gets_a_few_an_hour(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _provider(monkeypatch, "resend")
    for _ in range(LIMIT):
        booking_caps.check_email_recipient_limit(session, "lia.moreno@example.com")
    with pytest.raises(ApiError) as refused:
        # Capitals and a +tag are the same mailbox.
        booking_caps.check_email_recipient_limit(session, "LIA.Moreno+tables@example.com")
    assert refused.value.status == 429
    assert refused.value.code == "rate_limited"
    assert "last hour" in refused.value.message
    # Someone else is not held back.
    booking_caps.check_email_recipient_limit(session, "noor.haddad@example.com")


def test_a_booking_to_a_flooded_mailbox_is_refused_and_a_normal_one_is_not(
    client: TestClient, session: Session, organiser: Organiser, monkeypatch: pytest.MonkeyPatch
) -> None:
    _provider(monkeypatch, "resend")
    place: Place = make_restaurant(session, organiser)
    for _ in range(LIMIT):
        booking_caps.check_email_recipient_limit(session, "lia.moreno@example.com")
    held = hold(client, place, future_day(7), "19:00", 2)
    assert held.status_code == 201, held.text
    refused = book(client, place, held.json()["hold_id"], 2, email="lia.moreno@example.com")
    assert refused.status_code == 429
    assert "last hour" in refused.json()["error"]["message"]
    fine = book(client, place, held.json()["hold_id"], 2, email="noor.haddad@example.com")
    assert fine.status_code == 201, fine.text


def test_the_waitlist_obeys_the_same_limit(
    client: TestClient, session: Session, organiser: Organiser, monkeypatch: pytest.MonkeyPatch
) -> None:
    _provider(monkeypatch, "resend")
    place = make_restaurant(session, organiser)
    for _ in range(LIMIT):
        booking_caps.check_email_recipient_limit(session, "lia.moreno@example.com")
    body = {
        "date": future_day(7).isoformat(),
        "time": "19:00",
        "party": 2,
        "name": "Lia Moreno",
        "email": "lia.moreno@example.com",
    }
    refused = client.post(f"/api/r/{place.public_id}/waitlist", json=body)
    assert refused.status_code == 429, refused.text
