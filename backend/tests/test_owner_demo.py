"""The demo owner has three restaurants with a complete floor plan and a history of bookings; everything else is theirs to see
only on the public site, and every table keeps its guests 90 minutes."""

from conftest import make_user
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Booking,
    Organiser,
    Room,
    RoomFixture,
    RoomOpening,
    Seat,
    TurnTime,
    Venue,
    VenueMessageSettings,
    VenueTable,
    Zone,
)
from app.restaurant_service import insights
from app.seed import lisbon_catalogue, owner_demo
from app.seed.lisbon_data import LISBON, PORTO
from app.seed.run import DEMO_ORGANISER_EMAIL
from app.seed.tidy_layouts import footprint, tidy_all


def test_the_demo_owner_has_three_complete_restaurants(session: Session) -> None:
    owner = make_user(session, DEMO_ORGANISER_EMAIL)
    lisbon_catalogue.seed(session, owner, LISBON)
    lisbon_catalogue.seed(session, owner, PORTO)
    session.add(VenueMessageSettings(venue_id=1, sms_enabled=True, whatsapp_enabled=True))
    session.flush()

    report = owner_demo.run(session)
    assert set(report) == set(owner_demo.KEEP)

    mine = list(session.scalars(select(Venue).where(Venue.organiser_id == owner.id)))
    assert sorted(v.slug for v in mine) == sorted(owner_demo.KEEP)
    catalogue = session.scalars(
        select(Organiser).where(Organiser.email == owner_demo.CATALOGUE_EMAIL)
    ).one()
    others = session.scalar(
        select(func.count()).select_from(Venue).where(Venue.organiser_id == catalogue.id)
    )
    assert others == 35 - 3

    for venue in mine:
        rooms = list(
            session.scalars(select(Room).where(Room.venue_id == venue.id).order_by(Room.position))
        )
        assert len(rooms) == 2 and not rooms[0].is_outdoor
        main = rooms[0]
        kinds = {
            o.kind
            for o in session.scalars(select(RoomOpening).where(RoomOpening.room_id == main.id))
        }
        assert {"glass_wall", "window", "door"} <= kinds
        fixtures = {
            f.kind
            for f in session.scalars(select(RoomFixture).where(RoomFixture.room_id == main.id))
        }
        assert {"bar", "kitchen", "wc"} <= fixtures
        # Every chair carries its room, so the room editor does not add an empty "Main room".
        assert (
            session.scalar(
                select(func.count())
                .select_from(Seat)
                .where(Seat.venue_id == venue.id, Seat.room_id.is_(None))
            )
            == 0
        )
        assert (
            session.scalar(
                select(func.count()).select_from(Booking).where(Booking.venue_id == venue.id)
            )
            > 500
        )
        view = insights.overview(session, venue, 90)
        assert (
            view["cancelled"] > 0 and view["no_shows"] > 0 and 0.1 < view["returning_share"] < 0.9
        )
        assert view["average_lead_days"] and view["average_lead_days"] > 1

    assert {t.minutes for t in session.scalars(select(TurnTime))} == {90}
    assert (
        session.get(VenueMessageSettings, 1).sms_enabled is False
    )  # only the confirmation email is sent

    again = owner_demo.run(session)
    assert all("kept" in text for text in again.values())  # nothing is drawn twice


def test_no_table_or_chair_crosses_the_edge_of_a_zone_or_a_piece_of_furniture(
    session: Session,
) -> None:
    owner = make_user(session, DEMO_ORGANISER_EMAIL)
    lisbon_catalogue.seed(session, owner, LISBON)
    owner_demo.run(session)
    tidy_all(session)
    owner_demo.fit_zones(session)
    session.flush()

    for venue in session.scalars(select(Venue).where(Venue.organiser_id == owner.id)):
        seats: dict[int, list[Seat]] = {}
        for seat in session.scalars(select(Seat).where(Seat.venue_id == venue.id)):
            seats.setdefault(seat.table_id, []).append(seat)
        zones = list(session.scalars(select(Zone).where(Zone.venue_id == venue.id)))
        room_ids = select(Room.id).where(Room.venue_id == venue.id)
        fixtures = list(
            session.scalars(select(RoomFixture).where(RoomFixture.room_id.in_(room_ids)))
        )
        for table in session.scalars(select(VenueTable).where(VenueTable.venue_id == venue.id)):
            box = footprint(table, seats.get(table.id, []))
            for zone in zones:
                if zone.room_id != table.room_id:
                    continue
                inside = zone.x <= box.x0 and box.x1 <= zone.x + zone.w
                inside = inside and zone.y <= box.y0 and box.y1 <= zone.y + zone.h
                outside = (
                    box.x1 <= zone.x
                    or box.x0 >= zone.x + zone.w
                    or box.y1 <= zone.y
                    or box.y0 >= zone.y + zone.h
                )
                assert inside or outside, f"{venue.slug} {table.label} crosses {zone.name}"
            for fixture in fixtures:
                if fixture.room_id != table.room_id:
                    continue
                apart = (
                    box.x1 <= fixture.x
                    or box.x0 >= fixture.x + fixture.w
                    or box.y1 <= fixture.y
                    or box.y0 >= fixture.y + fixture.h
                )
                assert apart, f"{venue.slug} {table.label} touches {fixture.label or fixture.kind}"
