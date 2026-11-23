"""Emails go out when the site is used, with no cron: right after a change, and the rest on traffic."""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_restaurant_helpers import book, future_day, hold, make_restaurant

from app import scheduler
from app.config import get_settings
from app.models import EmailOutbox, Organiser, utc_now

DINER = "ana@example.com"


def _turn_on(monkeypatch: pytest.MonkeyPatch) -> None:
    """The test suite switches sending on request off; these tests switch it on."""
    monkeypatch.setenv("SEND_ON_REQUEST", "1")
    monkeypatch.setenv(
        "EMAIL_ALLOWLIST", DINER
    )  # the console provider "sends" to this address only
    get_settings.cache_clear()
    scheduler.reset()


def _book(client: TestClient, session: Session, organiser: Organiser) -> None:
    place = make_restaurant(session, organiser)
    held = hold(client, place, future_day(9), "19:00", 2)
    assert held.status_code == 201, held.text
    answer = book(client, place, held.json()["hold_id"], 2, email=DINER)
    assert answer.status_code == 201, answer.text


def _row(session: Session, kind: str) -> EmailOutbox:
    row = session.scalar(select(EmailOutbox).where(EmailOutbox.kind == kind))
    assert row is not None, kind
    session.refresh(row)
    return row


def test_a_booking_sends_its_confirmation_at_once_with_no_cron(
    client: TestClient, session: Session, organiser: Organiser, monkeypatch: pytest.MonkeyPatch
) -> None:
    _turn_on(monkeypatch)
    _book(client, session, organiser)
    assert _row(session, "booking_confirmed").status == "sent"


def test_with_the_switch_off_a_booking_only_queues_its_email(
    client: TestClient, session: Session, organiser: Organiser, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("EMAIL_ALLOWLIST", DINER)
    get_settings.cache_clear()
    scheduler.reset()
    _book(client, session, organiser)  # the test suite's default: SEND_ON_REQUEST=0
    assert _row(session, "booking_confirmed").status == "queued"


def test_a_failure_in_the_background_work_never_breaks_the_booking(
    client: TestClient, session: Session, organiser: Organiser, monkeypatch: pytest.MonkeyPatch
) -> None:
    _turn_on(monkeypatch)

    def explode(*args: object, **kwargs: object) -> None:
        raise RuntimeError("the email service is on fire")

    monkeypatch.setattr(scheduler, "send_due_emails", explode)
    monkeypatch.setattr(scheduler, "run_chores", explode)
    _book(client, session, organiser)  # still answers 201
    assert (
        _row(session, "booking_confirmed").status == "queued"
    )  # and the email waits for next time


def test_a_reminder_goes_out_when_someone_uses_the_site_after_it_is_due(
    client: TestClient, session: Session, organiser: Organiser, monkeypatch: pytest.MonkeyPatch
) -> None:
    _turn_on(monkeypatch)
    _book(client, session, organiser)
    reminder = _row(session, "booking_reminder")
    assert reminder.status == "queued"  # a day before the booking: not due yet
    reminder.next_attempt_at = utc_now() - timedelta(minutes=1)
    session.commit()
    scheduler.reset()  # "a minute has passed"
    assert client.get("/api/health").status_code == 200
    assert _row(session, "booking_reminder").status == "sent"


class _Counter:
    def __init__(self, monkeypatch: pytest.MonkeyPatch, clock: list[float]) -> None:
        self.sends = 0
        self.chores = 0
        monkeypatch.setattr(scheduler, "send_due_emails", self._send)
        monkeypatch.setattr(scheduler, "run_chores", self._chore)
        monkeypatch.setattr(scheduler.time, "monotonic", lambda: clock[0])

    def _send(self, *args: object, **kwargs: object) -> None:
        self.sends += 1

    def _chore(self, *args: object, **kwargs: object) -> None:
        self.chores += 1


def test_the_other_chores_run_at_most_once_a_minute(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _turn_on(monkeypatch)
    clock = [1000.0]
    seen = _Counter(monkeypatch, clock)
    scheduler.after_request("GET", "/api/health", 200)
    clock[0] = 1030.0
    scheduler.after_request("GET", "/api/health", 200)
    assert seen.chores == 1
    clock[0] = 1061.0
    scheduler.after_request("GET", "/api/health", 200)
    assert seen.chores == 2
    assert seen.sends == 0  # a plain page view does not send on its own: the chores do


def test_a_change_sends_at_once_but_a_refused_change_does_not(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _turn_on(monkeypatch)
    seen = _Counter(monkeypatch, [1000.0])
    scheduler.after_request("POST", "/api/r/x/book", 201)
    assert seen.sends == 1
    scheduler.after_request("DELETE", "/api/b/token", 409)
    scheduler.after_request("POST", "/api/auth/login", 401)
    assert seen.sends == 1


@pytest.mark.parametrize(
    "path", ["/api/internal/email/process", "/api/live/scope/stream", "/assets/app.js", "/"]
)
def test_the_secret_endpoint_streams_and_files_trigger_nothing(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, path: str
) -> None:
    _turn_on(monkeypatch)
    seen = _Counter(monkeypatch, [1000.0])
    scheduler.after_request("POST", path, 200)
    scheduler.after_request("GET", path, 200)
    assert (seen.sends, seen.chores) == (0, 0)
