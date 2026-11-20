"""GET /b/{token}/calendar.ics: the diner can add their booking to a calendar, with the manage link as the only key."""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from test_restaurant_emails import seated_booking
from test_restaurant_helpers import future_day

from app.models import Organiser
from app.restaurant_service import booking_rows


def _unfold(text: str) -> str:
    return text.replace("\r\n ", "")


def test_the_diner_gets_a_calendar_file_for_their_booking(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    _, token = seated_booking(client, session, organiser, future_day(7))
    booking = booking_rows.load_by_token(session, token)
    answer = client.get(f"/api/b/{token}/calendar.ics")
    assert answer.status_code == 200, answer.text
    assert answer.headers["content-type"].startswith("text/calendar")
    assert "attachment" in answer.headers["content-disposition"]
    body = _unfold(answer.text)
    assert body.startswith("BEGIN:VCALENDAR\r\n") and body.endswith("END:VCALENDAR\r\n")
    assert "SUMMARY:Table at Test Bistro" in body
    assert f"UID:booking-{booking.public_id}@" in body
    assert "DTSTART:" in body and "DTEND:" in body
    assert f"/b/{token}" in body  # the way back to change or cancel
    assert "METHOD:PUBLISH" in body and "STATUS:CONFIRMED" in body
    assert (
        "ATTENDEE" not in body and "ORGANIZER" not in body
    )  # nobody's address is in a file the diner shares


def test_the_calendar_file_is_in_the_language_of_the_booking(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    _, token = seated_booking(client, session, organiser, future_day(7))
    booking = booking_rows.load_by_token(session, token)
    booking.locale = "pt"
    session.commit()
    body = _unfold(client.get(f"/api/b/{token}/calendar.ics").text)
    assert "SUMMARY:Mesa em Test Bistro" in body


def test_a_cancelled_booking_has_no_calendar_file(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    _, token = seated_booking(client, session, organiser, future_day(7))
    assert client.delete(f"/api/b/{token}").status_code == 200
    answer = client.get(f"/api/b/{token}/calendar.ics")
    assert answer.status_code == 404


def test_a_wrong_token_gets_nothing(client: TestClient) -> None:
    assert client.get("/api/b/not-a-real-token/calendar.ics").status_code == 404
