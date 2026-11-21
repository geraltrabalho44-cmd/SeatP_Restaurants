"""A party is given a table that suits its size: two people are not given a table for four, unless the restaurant allows it."""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from test_restaurant_helpers import future_day, hold, make_restaurant

from app.models import Organiser, Venue
from app.restaurant_service import occupancy
from app.restaurant_service.availability import PartyNeeds
from app.restaurant_service.map_view import fit_problem


def test_the_smallest_party_a_table_is_offered_to() -> None:
    from types import SimpleNamespace

    four = SimpleNamespace(min_party=1, max_party=4)
    two = SimpleNamespace(min_party=1, max_party=2)
    owner_set = SimpleNamespace(min_party=3, max_party=4)
    ten = SimpleNamespace(min_party=1, max_party=10)
    assert occupancy.right_size_min(four, False) == 3  # a table for 4 takes 3 or 4
    assert occupancy.right_size_min(two, False) == 1  # a table for 2 takes 1 or 2
    assert occupancy.right_size_min(owner_set, False) == 3  # the owner's own minimum is kept
    assert occupancy.right_size_min(ten, False) == 9
    assert occupancy.right_size_min(four, True) == 1  # allowed: back to the table's own minimum
    assert occupancy.right_size_min(owner_set, True) == 3


def test_a_couple_does_not_fit_a_table_for_four_by_default_and_does_when_allowed() -> None:
    from types import SimpleNamespace

    four = SimpleNamespace(min_party=1, max_party=4, is_accessible=False, high_chair_ok=False)
    couple = PartyNeeds(size=2, needs_accessible=False, high_chairs=0)
    trio = PartyNeeds(size=3, needs_accessible=False, high_chairs=0)
    assert fit_problem(four, couple) == "blocked"
    assert fit_problem(four, trio) is None
    assert fit_problem(four, couple, allow_larger=True) is None


def test_the_map_and_the_hold_follow_the_setting(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser, allow_larger=False)
    session.commit()
    day = future_day(3)
    params = {"date": day.isoformat(), "time": "20:00", "party": 2}
    tables = {
        t["label"]: t
        for t in client.get(f"/api/r/{place.public_id}/map", params=params).json()["tables"]
    }
    assert tables["T1"]["fits_party"] is True  # a table for 2
    assert tables["T4"]["fits_party"] is False or tables["T4"]["accessible"]  # (T4 is for 2 too)
    assert tables["T2"]["fits_party"] is False  # a table for 4: not for a couple
    # The server refuses to hold it, even if the page is asked to.
    refused = hold(client, place, day, "20:00", 2, table_ids=[place.table["T2"]])
    assert refused.status_code == 422, refused.text
    # The owner allows it: now the same hold works.
    venue = session.get(Venue, place.venue_id)
    venue.allow_larger_tables = True
    session.commit()
    allowed = client.get(f"/api/r/{place.public_id}/map", params=params).json()["tables"]
    assert {t["label"]: t["fits_party"] for t in allowed}["T2"] is True
    assert hold(client, place, day, "20:00", 2, table_ids=[place.table["T2"]]).status_code in (
        200,
        201,
    )
