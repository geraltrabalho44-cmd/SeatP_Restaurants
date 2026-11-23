"""Nobody has to sign in to book; a booking made with the email of a proven account goes into that account's history."""

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_restaurant_helpers import book, future_day, hold, make_restaurant

from app.models import Booking, GuestAccount, Organiser, utc_now
from app.security import hash_password


def _account(session: Session, email: str, proven: bool) -> GuestAccount:
    row = GuestAccount(
        email=email,
        name="Lia",
        password_hash=hash_password("a long password"),
        consent_at=utc_now(),
        consent_version="v",
        email_proven=proven,
    )
    session.add(row)
    session.commit()
    return row


def _booked(client: TestClient, place, email: str):
    day = future_day(3)
    held = hold(client, place, day, "20:00", 2)
    assert held.status_code in (200, 201), held.text
    answer = book(client, place, held.json()["hold_id"], 2, email=email)
    assert answer.status_code in (200, 201), answer.text


def test_a_booking_with_the_email_of_an_account_goes_into_that_account(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    session.commit()
    account = _account(session, "lia@example.com", proven=True)
    _booked(client, place, "Lia@Example.com")  # any capitals, any spaces around: the same address
    assert session.scalars(select(Booking.account_id)).one() == account.id


def test_an_unknown_email_or_an_unproven_account_leaves_the_booking_alone(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    session.commit()
    _account(session, "demo@example.com", proven=False)  # its address was never proven
    _booked(client, place, "demo@example.com")
    _booked(client, place, "nobody@example.com")
    assert session.scalars(select(Booking.account_id)).all() == [None, None]
