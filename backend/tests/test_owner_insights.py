"""The owner's numbers: totals, the busiest tables and the guest book.

Bookings are written straight into the database (with the table rows they hold), so every
number here can be worked out by hand from the setup.
"""

from datetime import UTC, datetime, timedelta
from typing import Any

from conftest import auth_header, make_user
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from test_restaurant_helpers import Place, make_restaurant

from app.models import Booking, Organiser, TableSlot, Venue
from app.restaurant_service import insights
from app.restaurant_service.clock import now_local


def _add(
    session: Session,
    place: Place,
    email: str,
    days_ago: int,
    status: str = "completed",
    party: int = 2,
    table: str = "T1",
    name: str | None = None,
    hour: int = 19,
    created_days_before: int = 3,
    **extra: Any,
) -> Booking:
    venue = session.get(Venue, place.venue_id)
    day = now_local(venue).date() - timedelta(days=days_ago)
    start = datetime(day.year, day.month, day.day, hour, 0, tzinfo=UTC)
    booking = Booking(
        venue_id=venue.id,
        date=day,
        start_at=start,
        end_at=start + timedelta(hours=2),
        party_size=party,
        name=name or email.split("@")[0].title(),
        email=email,
        status=status,
        manage_token_hash=f"hash-{email}-{days_ago}-{table}-{status}",
        created_at=start - timedelta(days=created_days_before),
        **extra,
    )
    session.add(booking)
    session.flush()
    session.add(
        TableSlot(table_id=place.table[table], date=day, slot_index=hour * 4, booking_id=booking.id)
    )
    session.commit()
    return booking


def _place(session: Session, organiser: Organiser) -> Place:
    place = make_restaurant(session, organiser)
    assert {"T1", "T2"} <= set(place.table), place.table
    return place


def test_totals_count_only_kept_bookings_and_no_show_rate_uses_finished_ones(
    session: Session, organiser: Organiser
) -> None:
    place = _place(session, organiser)
    venue = session.get(Venue, place.venue_id)
    _add(session, place, "a@example.com", 5, "completed", party=2)
    _add(session, place, "b@example.com", 6, "completed", party=4)
    _add(session, place, "c@example.com", 7, "no_show", party=2)
    _add(session, place, "d@example.com", 8, "cancelled", party=6)
    _add(session, place, "e@example.com", 300, "completed")  # only in the 365 day view

    data = insights.overview(session, venue, 30)
    assert data["bookings"] == 3 and data["covers"] == 8  # cancelled never counts
    assert (data["completed"], data["no_shows"], data["cancelled"]) == (2, 1, 1)
    assert data["no_show_rate"] == round(1 / 3, 3)
    assert data["cancel_rate"] == 0.25
    assert data["average_party"] == round(8 / 3, 1)
    assert sum(day["bookings"] for day in data["weekdays"]) == 3
    assert insights.overview(session, venue, 365)["bookings"] == 4


def test_a_quiet_restaurant_has_no_rates_instead_of_zero_percent(
    session: Session, organiser: Organiser
) -> None:
    place = _place(session, organiser)
    data = insights.overview(session, session.get(Venue, place.venue_id), 90)
    assert data["bookings"] == 0 and data["no_show_rate"] is None and data["average_party"] is None


def test_the_busiest_tables_come_first_and_the_heat_is_relative(
    session: Session, organiser: Organiser
) -> None:
    place = _place(session, organiser)
    venue = session.get(Venue, place.venue_id)
    for index in range(4):
        _add(session, place, f"t1-{index}@example.com", index + 1, table="T1")
    _add(session, place, "t2@example.com", 2, table="T2")
    _add(session, place, "gone@example.com", 3, "cancelled", table="T2")  # never heats a table

    data = insights.table_demand(session, venue, 30)
    first, second = data["tables"][0], data["tables"][1]
    assert (first["label"], first["bookings"], first["heat"]) == ("T1", 4, 1.0)
    assert (second["label"], second["bookings"], second["heat"]) == ("T2", 1, 0.25)
    assert data["total"] == 5 and first["share"] == 0.8
    assert data["top"][:2] == [first["id"], second["id"]]
    # Tables nobody booked are on the plan with no heat, and are never "top".
    unbooked = [row for row in data["tables"] if row["bookings"] == 0]
    assert unbooked and all(row["heat"] == 0.0 for row in unbooked)
    assert all(row["id"] not in data["top"] for row in unbooked)


def test_returning_guests_are_those_who_booked_before_or_twice(
    session: Session, organiser: Organiser
) -> None:
    place = _place(session, organiser)
    venue = session.get(Venue, place.venue_id)
    _add(session, place, "old@example.com", 200)  # booked long before the period
    _add(session, place, "old@example.com", 5)
    _add(session, place, "twice@example.com", 20)
    _add(session, place, "twice@example.com", 10)
    _add(session, place, "new@example.com", 3)
    _add(session, place, "new2@example.com", 4)
    assert insights.overview(session, venue, 30)["returning_share"] == 0.5


def test_the_guest_book_groups_by_email_and_tells_who_to_win_back(
    session: Session, organiser: Organiser
) -> None:
    place = _place(session, organiser)
    venue = session.get(Venue, place.venue_id)
    for days in (200, 150, 100):
        _add(session, place, "Regular@Example.com", days, name="Rita Regular", party=4)
    _add(session, place, "once@example.com", 10, name="Olga Once")
    _add(session, place, "flaky@example.com", 30, "no_show", name="Fred Flaky")
    _add(session, place, "flaky@example.com", 20, "no_show", name="Fred Flaky")
    _add(session, place, "ghost@example.com", 5, "cancelled", name="Gina Ghost")
    _add(session, place, "later@example.com", -3, "confirmed", name="Lara Later")

    book = {g["email"]: g for g in insights.guest_book(session, venue)}
    rita = book["regular@example.com"]  # Regular@Example.com: same guest whatever the case
    assert (rita["visits"], rita["usual_party"], rita["covers"]) == (3, 4, 12)
    assert "regular" in rita["segments"] and "lapsed" in rita["segments"]
    assert book["once@example.com"]["segments"] == ["new"]
    assert "no_shows" in book["flaky@example.com"]["segments"]
    assert book["flaky@example.com"]["no_shows"] == 2
    assert (
        book["ghost@example.com"]["bookings"] == 0
        and book["ghost@example.com"]["cancellations"] == 1
    )
    assert book["later@example.com"]["next_booking"] is not None


def test_the_guest_list_searches_filters_sorts_and_counts_segments(
    session: Session, organiser: Organiser
) -> None:
    place = _place(session, organiser)
    venue = session.get(Venue, place.venue_id)
    for days in (200, 150, 100):
        _add(session, place, "rita@example.com", days, name="Rita Regular")
    _add(session, place, "olga@example.com", 10, name="Olga Once")
    everyone = insights.guests(session, venue)
    assert everyone["total"] == 2 and everyone["segments"]["regular"] == 1
    assert [g["name"] for g in everyone["guests"]] == [
        "Olga Once",
        "Rita Regular",
    ]  # most recent first
    by_visits = insights.guests(session, venue, sort="visits")["guests"]
    assert by_visits[0]["name"] == "Rita Regular"
    assert insights.guests(session, venue, query="OLG")["total"] == 1
    assert insights.guests(session, venue, segment="lapsed")["guests"][0]["name"] == "Rita Regular"
    assert insights.guests(session, venue, limit=1, offset=1)["guests"][0]["name"] == "Rita Regular"


def test_only_the_owner_sees_the_numbers(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = _place(session, organiser)
    _add(session, place, "a@example.com", 5)
    mine = auth_header(organiser)
    insight = client.get(f"/api/owner/restaurants/{place.public_id}/insights", headers=mine)
    assert insight.status_code == 200
    assert insight.json()["overview"]["bookings"] == 1
    assert (
        client.get(
            f"/api/owner/restaurants/{place.public_id}/insights?days=7", headers=mine
        ).status_code
        == 422
    )
    guests = client.get(f"/api/owner/restaurants/{place.public_id}/guests", headers=mine)
    assert guests.json()["guests"][0]["email"] == "a@example.com"
    assert (
        client.get(
            f"/api/owner/restaurants/{place.public_id}/guests?sort=hack", headers=mine
        ).status_code
        == 422
    )

    stranger = make_user(session, "stranger.owner@example.com")
    session.commit()
    for path in ("insights", "guests"):
        url = f"/api/owner/restaurants/{place.public_id}/{path}"
        assert client.get(url, headers=auth_header(stranger)).status_code == 404
        assert client.get(url).status_code == 401
