"""Give the demo owner account three restaurants, each with a complete floor plan and a history of bookings.

    python -m app.seed.owner_demo                 a local SQLite demo database (DEMO_MODE=1)
    python -m app.seed.owner_demo --allow-remote  the shared demo database (Neon): only after a backup

What it does, repeatably:

1. keeps three restaurants with the demo owner (`organiser@example.com`) and hands every other demo restaurant to a
   second account (`catalogue@example.com`, nobody signs in with it), so the owner's page lists three restaurants
   while the public site keeps all of them;
2. draws each of the three a complete floor plan (a room with a glass wall, windows, a door, a bar, toilets,
   kitchen, plants and a dozen tables, and a second room or terrace), made up and different for each;
3. gives them 90 days of bookings, so the insights have something to show (skipped when a restaurant already has bookings);
4. sets every table of every demo restaurant to 90 minutes, and switches phone messages off everywhere (only the
   confirmation email is sent).

The plans, the bookings and the guests are made up for the demo.
"""

import argparse
import random
import secrets
import unicodedata
from datetime import timedelta

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app import db
from app.config import get_settings
from app.models import (
    Booking,
    Organiser,
    Room,
    RoomFixture,
    RoomOpening,
    Seat,
    TableSlot,
    TurnTime,
    Venue,
    VenueMessageSettings,
    VenueTable,
    Zone,
)
from app.restaurant_service import features, occupancy
from app.restaurant_service.clock import now_local
from app.security import hash_password
from app.seed.demo_restaurant import DEMO_ORGANISER_EMAIL, SERVICES, _seed_service, _table_size
from app.seed.demo_showcase import Fixture, Opening, ShowRoom, Table, _add_room, _rect
from app.seed.run import ensure_demo_users
from app.seed.tidy_layouts import footprint, tidy_all

KEEP = ("cervejaria-ramiro", "cafe-majestic", "escondidinho")
CATALOGUE_EMAIL = "catalogue@example.com"
HISTORY_DAYS = 90
UPCOMING_DAYS = 14
SIZES = (2, 2, 4, 4, 4, 6, 2, 4, 6, 2, 4, 8)


def _overlaps(table: Table, fixtures: tuple[Fixture, ...]) -> bool:
    _shape, w, h = _table_size(table.max_party)
    return any(
        table.x - 20 < f.x + f.w
        and f.x - 20 < table.x + w
        and table.y - 30 < f.y + f.h
        and f.y - 30 < table.y + h
        for f in fixtures
    )


def rich_rooms(slug: str) -> tuple[ShowRoom, ...]:
    """A complete, made-up plan: the main room with its glass wall, door, bar and toilets, and a terrace or a second room."""
    rng = random.Random(slug)
    right, bottom = 960, 600
    fixtures = (
        Fixture("bar", 700, 75, 200, 50, "Bar"),
        Fixture("kitchen", 80, 75, 150, 50, "Kitchen"),
        Fixture("wc", 860, 500, 70, 80, "Toilets"),
        Fixture("plant", 520, 75, 40, 40, ""),
    )
    tables = []
    for row in range(3):
        for col in range(4):
            size = SIZES[(row * 4 + col + rng.randrange(3)) % len(SIZES)]
            table = Table(
                f"{'ABC'[row]}{col + 1}",
                110 + col * 215 + rng.randrange(0, 15, 5),
                170 + row * 140 + rng.randrange(0, 10, 5),
                size,
                min_party=3 if size > 4 else 1,
                accessible=(row == 2 and col == 0),
                high_chair=(row == 1 and col == 1),
            )
            if not _overlaps(table, fixtures):
                tables.append(table)
    main = ShowRoom(
        "Main room",
        _rect(60, 60, right, bottom),
        tuple(tables),
        north=rng.choice((0, 90, 180, 270)),
        openings=(
            Opening(
                2, 0, 500, "glass_wall", "The street outside", ("street",), "The street lights"
            ),
            Opening(3, 200, 110, "window", "The street outside", ("street",), "The street lights"),
            Opening(0, 380, 90, "door", main=True),
        ),
        fixtures=fixtures,
    )
    second_kind = rng.choice(("terrace", "private"))
    if second_kind == "terrace":
        second = ShowRoom(
            "Terrace",
            _rect(60, 650, right, 880),
            tuple(Table(f"T{i + 1}", 120 + i * 175, 720, 2 if i % 2 == 0 else 4) for i in range(5)),
            outdoor=True,
            fixtures=(Fixture("awning", 500, 660, 440, 70, "Awning"),),
        )
    else:
        second = ShowRoom(
            "Private room",
            _rect(60, 650, right, 880),
            (Table("P1", 150, 720, 10, 6), Table("P2", 520, 720, 6, 3), Table("P3", 760, 720, 4)),
            fixtures=(Fixture("fireplace", 840, 880 - 40, 100, 30, "Fireplace"),),
            openings=(Opening(0, 700, 90, "door"),),
        )
    return (main, second)


def _clear_rooms(session: Session, venue: Venue) -> None:
    table_ids = list(session.scalars(select(VenueTable.id).where(VenueTable.venue_id == venue.id)))
    room_ids = list(session.scalars(select(Room.id).where(Room.venue_id == venue.id)))
    if table_ids:
        session.execute(delete(Seat).where(Seat.table_id.in_(table_ids)))
    session.execute(delete(VenueTable).where(VenueTable.venue_id == venue.id))
    session.execute(delete(Zone).where(Zone.venue_id == venue.id))
    if room_ids:
        session.execute(delete(RoomOpening).where(RoomOpening.room_id.in_(room_ids)))
        session.execute(delete(RoomFixture).where(RoomFixture.room_id.in_(room_ids)))
    session.execute(delete(Room).where(Room.venue_id == venue.id))
    session.flush()


def _zones(session: Session, venue: Venue) -> None:
    """Named areas over the plan: the window row, the bar end and the terrace."""
    rooms = list(
        session.scalars(select(Room).where(Room.venue_id == venue.id).order_by(Room.position))
    )
    for room in rooms:
        if room.is_outdoor:
            session.add(
                Zone(
                    venue_id=venue.id,
                    room_id=room.id,
                    name="Terrace",
                    kind="terrace",
                    x=60,
                    y=650,
                    w=900,
                    h=230,
                )
            )
        else:
            session.add(
                Zone(
                    venue_id=venue.id,
                    room_id=room.id,
                    name="Window",
                    kind="window",
                    x=60,
                    y=440,
                    w=900,
                    h=160,
                )
            )
            session.add(
                Zone(
                    venue_id=venue.id,
                    room_id=room.id,
                    name="Bar area",
                    kind="bar",
                    x=640,
                    y=60,
                    w=320,
                    h=110,
                )
            )
    session.flush()


def fit_zones(session: Session) -> None:
    """Draw the Window and Bar areas around the tables that stand in them, on the plan as it is now.

    The tables are spread evenly by `tidy_all` (after the zones were made), so a fixed zone could cut across a table
    and its chairs. The Window zone starts halfway between the last two rows and runs to the glass wall; the Bar zone
    stops short of the first table under it.
    """
    for slug in KEEP:
        venue = session.scalar(select(Venue).where(Venue.slug == slug))
        if venue is None:
            continue
        seats: dict[int, list[Seat]] = {}
        for seat in session.scalars(select(Seat).where(Seat.venue_id == venue.id)):
            seats.setdefault(seat.table_id, []).append(seat)
        for room in session.scalars(select(Room).where(Room.venue_id == venue.id)):
            points = (room.outline or {}).get("points", [])
            if room.is_outdoor or len(points) != 4:
                continue
            left, right = min(p["x"] for p in points), max(p["x"] for p in points)
            top, bottom = min(p["y"] for p in points), max(p["y"] for p in points)
            boxes = sorted(
                (
                    footprint(table, seats.get(table.id, []))
                    for table in session.scalars(
                        select(VenueTable).where(VenueTable.room_id == room.id)
                    )
                ),
                key=lambda box: box.y0,
            )
            zones = {
                z.name: z for z in session.scalars(select(Zone).where(Zone.room_id == room.id))
            }
            rows: list[list] = []
            for box in boxes:
                if rows and box.y0 < max(b.y1 for b in rows[-1]) - 4:
                    rows[-1].append(box)
                else:
                    rows.append([box])
            # A pillar in the middle of the room would stand on a table's chairs once the tables are spread out.
            session.execute(
                delete(RoomFixture).where(
                    RoomFixture.room_id == room.id, RoomFixture.kind == "column"
                )
            )
            # The room may have grown when the tables were spread out: the fireplace goes back to the middle of the far wall.
            for fireplace in session.scalars(
                select(RoomFixture).where(
                    RoomFixture.room_id == room.id, RoomFixture.kind == "fireplace"
                )
            ):
                fireplace.x = round(left + (right - left - fireplace.w) / 2)
                fireplace.y = round(bottom - fireplace.h - 10)
            window = zones.get("Window")
            if window is not None and len(rows) >= 2:
                above = max(b.y1 for row in rows[:-1] for b in row)
                below = min(b.y0 for b in rows[-1])
                edge = round((above + below) / 2)
                window.x, window.w = left, right - left
                window.y, window.h = edge, bottom - edge
            bar = zones.get("Bar area") or zones.get("Bar")
            bar_fixture = session.scalar(
                select(RoomFixture).where(RoomFixture.room_id == room.id, RoomFixture.kind == "bar")
            )
            if bar is not None and bar_fixture is not None and rows:
                x0, x1 = bar_fixture.x - 130, right  # room for the name before the bar
                under = [b.y0 for b in boxes if b.x1 > x0 and b.x0 < x1]
                limit = min(under) - 8 if under else bar_fixture.y + bar_fixture.h + 40
                edge = round(min(limit, bar_fixture.y + bar_fixture.h + 40))
                bar.name = "Bar area"
                bar.x, bar.w = round(x0), round(x1 - x0)
                bar.y, bar.h = top, max(edge - top, 40)
    session.flush()


FIRST = (
    "Ana",
    "Bruno",
    "Carla",
    "Diogo",
    "Eva",
    "Filipe",
    "Graça",
    "Hugo",
    "Inês",
    "João",
    "Karina",
    "Luís",
    "Marta",
    "Nuno",
    "Olga",
    "Pedro",
    "Rita",
    "Sérgio",
    "Teresa",
    "Vasco",
    "Alice",
    "Bernardo",
    "Catarina",
    "David",
    "Elisa",
    "Francisco",
    "Helena",
    "Ivo",
    "Joana",
    "Leonor",
    "Miguel",
    "Nádia",
    "Paulo",
    "Rafaela",
    "Rui",
    "Sofia",
    "Tiago",
    "Vera",
    "Xavier",
    "Zita",
)
LAST = (
    "Almeida",
    "Barbosa",
    "Cardoso",
    "Dias",
    "Esteves",
    "Ferreira",
    "Gonçalves",
    "Henriques",
    "Lopes",
    "Machado",
    "Neves",
    "Oliveira",
    "Pereira",
    "Queirós",
    "Ribeiro",
    "Santos",
    "Teixeira",
    "Vaz",
    "Rocha",
    "Moreira",
    "Correia",
    "Pinto",
    "Marques",
    "Sousa",
    "Cunha",
    "Nunes",
    "Freitas",
    "Monteiro",
    "Matos",
    "Antunes",
)


def _plain(text: str) -> str:
    return (
        "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))
        .lower()
        .replace(" ", "")
    )


def _diversify(session: Session, venue: Venue) -> None:
    """Make the history read like a real restaurant's: many different guests (two in five are regulars), some who booked days
    ahead and some the same day, a few cancellations, and a few bookings made by the staff."""
    rng = random.Random(f"{venue.slug}-guests")
    people = [
        (f"{first} {last}", f"{_plain(first)}.{_plain(last)}@example.com")
        for first in FIRST
        for last in LAST
    ]
    rng.shuffle(people)
    regulars, others = people[:45], people[45:]
    bookings = list(session.scalars(select(Booking).where(Booking.venue_id == venue.id)))
    cancelled: list[int] = []
    for booking in bookings:
        name, email = rng.choice(regulars) if rng.random() < 0.4 else rng.choice(others)
        booking.name, booking.email = name, email
        lead_days = 0.0 if rng.random() < 0.15 else min(30.0, rng.expovariate(1 / 4.5))
        booking.created_at = booking.start_at - timedelta(days=lead_days, hours=rng.randint(0, 6))
        if rng.random() < 0.12:
            booking.source = "staff"
        if booking.status in ("completed", "confirmed") and rng.random() < 0.07:
            booking.status = "cancelled"
            cancelled.append(booking.id)
    if cancelled:
        session.execute(delete(TableSlot).where(TableSlot.booking_id.in_(cancelled)))
    session.flush()


def _history(session: Session, venue: Venue) -> int:
    """90 days of bookings and the next two weeks, placed by the optimiser like guests booking one by one."""
    specs = occupancy.table_specs(
        occupancy.venue_tables(session, venue), occupancy.zone_kinds(session, venue)
    )
    rng = random.Random(venue.slug)
    today = now_local(venue).date()
    for offset in range(-HISTORY_DAYS, UPCOMING_DAYS):
        day = today + timedelta(days=offset)
        for service in SERVICES:
            if day.weekday() in service[1]:
                _seed_service(session, venue, specs, day, service, rng)
    _diversify(session, venue)
    return (
        session.scalar(
            select(func.count()).select_from(Booking).where(Booking.venue_id == venue.id)
        )
        or 0
    )


def run(session: Session, keep: tuple[str, ...] = KEEP) -> dict[str, object]:
    settings = get_settings()
    owner = session.scalar(select(Organiser).where(Organiser.email == DEMO_ORGANISER_EMAIL))
    if owner is None:
        ensure_demo_users(session, settings)
        owner = session.scalars(
            select(Organiser).where(Organiser.email == DEMO_ORGANISER_EMAIL)
        ).one()
    catalogue = session.scalar(select(Organiser).where(Organiser.email == CATALOGUE_EMAIL))
    if catalogue is None:
        catalogue = Organiser(
            email=CATALOGUE_EMAIL,
            name="SeatPlan catalogue",
            password_hash=hash_password(
                secrets.token_urlsafe(24)
            ),  # nobody signs in with this account
            role="organiser",
        )
        session.add(catalogue)
        session.flush()
    session.execute(
        update(Venue)
        .where(Venue.kind == "restaurant", Venue.slug.not_in(keep))
        .values(organiser_id=catalogue.id)
    )
    session.execute(
        update(Venue)
        .where(Venue.kind == "restaurant", Venue.slug.in_(keep))
        .values(organiser_id=owner.id)
    )
    session.flush()
    report: dict[str, object] = {}
    for slug in keep:
        venue = session.scalar(select(Venue).where(Venue.slug == slug, Venue.kind == "restaurant"))
        if venue is None:
            report[slug] = "not found"
            continue
        has_bookings = bool(
            session.scalar(
                select(func.count()).select_from(Booking).where(Booking.venue_id == venue.id)
            )
        )
        if has_bookings:
            report[slug] = "kept (has bookings)"
            continue
        _clear_rooms(session, venue)
        for position, room in enumerate(rich_rooms(slug)):
            _add_room(session, venue, position, room)
        _zones(session, venue)
        features.refresh_features(session, venue)
        report[slug] = f"{_history(session, venue)} bookings"
    # Chairs made before they carried their room: without it the room editor shows an extra empty "Main room".
    session.execute(
        update(Seat)
        .where(Seat.room_id.is_(None))
        .values(
            room_id=select(VenueTable.room_id)
            .where(VenueTable.id == Seat.table_id)
            .scalar_subquery()
        )
    )
    # Every table of every demo restaurant keeps its guests 90 minutes, and only the confirmation email is sent.
    session.execute(update(TurnTime).values(minutes=90))
    session.execute(
        update(VenueMessageSettings).values(
            sms_enabled=False, whatsapp_enabled=False, send_confirmation=False
        )
    )
    session.flush()
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    parser.add_argument(
        "--allow-remote", action="store_true", help="run on the shared Postgres demo database"
    )
    args = parser.parse_args()
    settings = get_settings()
    local = settings.demo_mode and settings.database_url.startswith("sqlite:")
    if not local and not args.allow_remote:
        raise SystemExit(
            "Use DEMO_MODE=1 with a local SQLite demo database, or pass --allow-remote."
        )
    db.init_engine(settings.database_url)
    db.create_all()
    with db.new_session() as session:
        report = run(session)
        session.commit()
        tidy_all(session)
        fit_zones(session)
        session.commit()
    for slug, text in report.items():
        print(f"{slug}: {text}")


if __name__ == "__main__":
    main()
