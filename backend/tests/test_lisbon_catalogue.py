from datetime import date, time, timedelta
from urllib.parse import parse_qs, urlsplit

from conftest import make_user
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.requests import Request

from app.models import Room, Venue, VenuePhoto, VenueTable
from app.restaurant_service import discovery, publishing
from app.routers.restaurants import BookingIn, HoldIn, book, hold
from app.seed.lisbon_catalogue import seed


def test_lisbon_demo_is_bookable_and_repeatable(session: Session) -> None:
    owner = make_user(session, "catalogue@example.com")
    assert seed(session, owner) == (20, 20)
    session.flush()

    venues = list(session.scalars(select(Venue).where(Venue.organiser_id == owner.id)))
    assert len(venues) == len({venue.slug for venue in venues}) == 20
    assert len(list(session.scalars(select(VenuePhoto)))) == 20
    assert all(venue.is_demo and venue.status == "published" for venue in venues)
    for venue in venues:
        assert publishing.problems(session, venue) == [], venue.name
        page = discovery.public_page(session, venue, preview=False)
        assert page["demo_booking"] and page["max_party"] >= 4
        assert venue.name in parse_qs(urlsplit(page["maps_url"]).query)["query"][0]
        cover = page["photos"][0]
        assert cover["is_cover"] and cover["alt"] and cover["credit"]["author"]
        assert cover["credit"]["file"].startswith("https://commons.wikimedia.org/wiki/File:")
        assert cover["credit"]["license_url"].startswith("https://creativecommons.org/")

    evening = date.today() + timedelta(days=7)
    diners = discovery.search_restaurants(
        session, discovery.Search(day=evening, at=time(20), party=2, available=True)
    )
    assert diners["total"] == 20
    assert all(
        card["demo_booking"] and card["cover_url"] and card["next_times"]
        for card in diners["items"]
    )

    venue = venues[0]
    request = Request({"type": "http", "headers": [], "client": ("127.0.0.1", 0)})
    held = hold(venue.public_id, HoldIn(date=evening, time=time(20), party=2), request, session)
    assert isinstance(held, dict)
    booking = book(
        venue.public_id,
        BookingIn(
            hold_id=held["hold_id"],
            party=2,
            name="Demo guest",
            email="guest@example.com",
            accept_terms=True,
        ),
        request,
        session,
    )
    assert isinstance(booking, dict) and booking["booking"]["status"] == "confirmed"

    venues[0].description = "Owner edited this listing."
    session.flush()
    tables = len(list(session.scalars(select(VenueTable))))
    assert seed(session, owner) == (0, 0)
    assert venues[0].description == "Owner edited this listing."
    assert len(list(session.scalars(select(VenueTable)))) == tables


def _main_room(session: Session, venue: Venue) -> Room:
    return session.scalars(select(Room).where(Room.venue_id == venue.id, Room.position == 0)).one()


def _edges(room: Room) -> tuple[float, float]:
    points = room.outline["points"]
    return max(p["x"] for p in points), max(p["y"] for p in points)


def test_each_main_room_is_as_big_as_its_tables_need(session: Session) -> None:
    owner = make_user(session, "fit@example.com")
    seed(session, owner)
    session.flush()
    for venue in session.scalars(select(Venue).where(Venue.organiser_id == owner.id)):
        room = _main_room(session, venue)
        tables = list(
            session.scalars(
                select(VenueTable).where(
                    VenueTable.venue_id == venue.id, VenueTable.label.like("M%")
                )
            )
        )
        right, bottom = _edges(room)
        # Wall to the last table: a little air, never a big empty part of the plan.
        assert bottom - max(t.y + t.h for t in tables) <= 200, venue.name
        second = session.scalar(select(Room).where(Room.venue_id == venue.id, Room.position == 1))
        if second is None:
            assert right - max(t.x + t.w for t in tables) <= 260, venue.name


def test_a_catalogue_made_room_of_the_first_version_is_refitted_but_an_edited_one_is_not(
    session: Session,
) -> None:
    owner = make_user(session, "refit@example.com")
    seed(session, owner)
    session.flush()
    venues = list(session.scalars(select(Venue).where(Venue.organiser_id == owner.id)))
    fitted = {venue.id: _edges(_main_room(session, venue)) for venue in venues}

    old, edited = venues[0], venues[1]
    first_version = [
        {"x": 65, "y": 60},
        {"x": 935, "y": 60},
        {"x": 935, "y": 600},
        {"x": 65, "y": 600},
    ]
    _main_room(session, old).outline = {"points": [dict(p, curve=0) for p in first_version]}
    changed = [dict(p, curve=0) for p in first_version]
    changed[2]["y"] = changed[3]["y"] = 560  # an owner who moved the bottom wall
    _main_room(session, edited).outline = {"points": changed}
    session.flush()

    assert seed(session, owner) == (0, 0)
    session.flush()
    session.expire_all()
    assert _edges(_main_room(session, old)) == fitted[old.id]
    assert _edges(_main_room(session, edited)) == (935, 560)
    # The tables did not move, and a second run changes nothing more.
    assert seed(session, owner) == (0, 0)
