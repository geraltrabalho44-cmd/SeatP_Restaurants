"""GET /b/{token}/emails: while the site sends no email, a diner sees what would have been sent, and only their own."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from test_restaurant_emails import seated_booking
from test_restaurant_helpers import future_day

from app.config import get_settings
from app.models import Organiser


def test_in_console_mode_the_diner_sees_their_confirmation(
    client: TestClient, session: Session, organiser: Organiser, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("EMAIL_PROVIDER", "console")
    _, token = seated_booking(client, session, organiser, future_day(7))
    answer = client.get(f"/api/b/{token}/emails")
    assert answer.status_code == 200, answer.text
    body = answer.json()
    assert body["available"] is True
    kinds = [email["kind"] for email in body["emails"]]
    assert kinds[0] == "booking_confirmed"
    first = body["emails"][0]
    assert first["subject"].startswith("Booked: Test Bistro, ")
    assert "Manage my booking" in first["text"] and "Table T1" in first["text"]
    assert first["to"]  # the diner's own address


def test_a_change_adds_its_email_to_the_list(
    client: TestClient, session: Session, organiser: Organiser, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("EMAIL_PROVIDER", "console")
    _, token = seated_booking(client, session, organiser, future_day(7))
    assert client.patch(f"/api/b/{token}", json={"time": "20:00"}).status_code == 200
    kinds = [email["kind"] for email in client.get(f"/api/b/{token}/emails").json()["emails"]]
    assert "booking_confirmed" in kinds and "booking_changed" in kinds


def test_with_a_real_provider_nothing_is_shown(
    client: TestClient, session: Session, organiser: Organiser, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, token = seated_booking(client, session, organiser, future_day(7))
    monkeypatch.setenv("EMAIL_PROVIDER", "resend")
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key_not_real")
    monkeypatch.setenv("EMAIL_FROM", "SeatPlan <noreply@example.org>")
    get_settings.cache_clear()
    try:
        answer = client.get(f"/api/b/{token}/emails")
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()
    assert answer.status_code == 200
    assert answer.json() == {"available": False, "emails": []}


def test_a_wrong_token_shows_nothing(
    client: TestClient, session: Session, organiser: Organiser, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("EMAIL_PROVIDER", "console")
    seated_booking(client, session, organiser, future_day(7))
    answer = client.get("/api/b/this-is-not-a-real-token-at-all/emails")
    assert answer.status_code == 404
