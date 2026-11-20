"""Import the Lisbon restaurant catalogue into a local SeatPlan demo database."""

from dataclasses import dataclass
from pathlib import Path
from random import Random
from urllib.parse import quote_plus, urlsplit

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import db
from app.config import get_settings
from app.models import Organiser, Room, Venue, VenuePhoto, utc_now
from app.restaurant_service import features
from app.restaurant_service.clock import now_local
from app.restaurant_service.photos import MAX_BYTES, image_info
from app.seed import lisbon_data
from app.seed.demo_restaurant import _schedule, free_slug
from app.seed.demo_showcase import Opening, ShowRoom, Table, _add_room, _rect
from app.seed.run import DEMO_ORGANISER_EMAIL, ensure_demo_users

PHOTO_DIR = Path(__file__).with_name("lisbon_photos")


@dataclass(frozen=True)
class Photo:
    data: bytes
    mime: str
    width: int
    height: int


def _photo(listing: lisbon_data.Listing) -> Photo:
    cover = listing["photo"]
    path = PHOTO_DIR / (listing["slug"] + Path(urlsplit(cover["url"]).path).suffix)
    with path.open("rb") as source:
        data = source.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError(f"{path.name} exceeds the gallery size limit")
    mime, width, height = image_info(data)
    return Photo(data, mime, width, height)


def _plan(slug: str) -> tuple[ShowRoom, ...]:
    """Build a reproducible synthetic plan without using a real venue's floor."""
    rng = Random(slug)
    two_rooms = rng.choice((False, False, True))
    columns = rng.choice((3, 4))
    rows = rng.choice((2, 3))
    tables = []
    for index in range(columns * rows):
        capacity = 2 if index < 2 else rng.choice((2, 4, 4, 6))
        tables.append(
            Table(
                f"M{index + 1}",
                115 + 205 * (index % columns) + rng.randrange(0, 22, 5),
                125 + 125 * (index // columns) + rng.randrange(0, 22, 5),
                capacity,
                min_party=3 if capacity > 4 else 1,
                accessible=index == 1,
                high_chair=index == 2,
            )
        )
    # The main room is as big as its tables need, with air around them and enough wall for the window and the door. A fixed
    # 870 x 540 room left most of the plan empty when there were six tables. (With a second room the width stays as it was.)
    right = 935 if two_rooms else max(650, round(max(table.x for table in tables)) + 170)
    bottom = round(max(table.y for table in tables)) + 130
    main = ShowRoom(
        "Main room",
        _rect(65, 60, right, bottom),
        tuple(tables),
        north=rng.choice((0, 45, 90, 180, 270)),
        openings=(Opening(0, 150, 290, "window"), Opening(2, 180, 105, "door", main=True)),
    )
    if not two_rooms:
        return (main,)
    second = ShowRoom(
        "Second room",
        _rect(65, 530, 935, 680),
        tuple(Table(f"S{index + 1}", 145 + index * 230, 570, 4) for index in range(4)),
    )
    return (main, second)


def _new_venue(session: Session, owner: Organiser, listing: lisbon_data.Listing) -> Venue:
    lat, lng = listing["location"]
    maps_query = quote_plus(f"{listing['name']}, {listing['address']}")
    venue = Venue(
        public_id=lisbon_data.venue_id(listing["slug"]),
        organiser_id=owner.id,
        kind="restaurant",
        is_demo=True,
        status="published",
        published_at=utc_now(),
        slug=free_slug(session, listing["slug"]),
        name=listing["name"],
        address=listing["address"],
        description=listing["description"],
        cuisines=listing["cuisines"],
        price_level=listing["price_level"],
        google_maps_url=f"https://www.google.com/maps/search/?api=1&query={maps_query}",
        website=listing["source"],
        timezone="Europe/Lisbon",
        lat=lat,
        lng=lng,
        width=1000,
        height=700,
    )
    session.add(venue)
    session.flush()
    for position, room in enumerate(_plan(listing["slug"])):
        _add_room(session, venue, position, room)
    _schedule(session, venue, now_local(venue).date())
    session.flush()
    features.refresh_features(session, venue)
    return venue


# The main rooms of the first version of this catalogue: a fixed rectangle, whatever the tables.
_OLD_MAIN_BOTTOMS = (600, 490)


def _refit_main_room(session: Session, venue: Venue, slug: str) -> bool:
    """Fit an existing venue's main room to its tables, only if nobody has changed the room since the catalogue made it."""
    room = session.scalar(select(Room).where(Room.venue_id == venue.id, Room.position == 0))
    if room is None:
        return False
    points = [(round(p["x"]), round(p["y"])) for p in (room.outline or {}).get("points", [])]
    first_version = [
        [(65, 60), (935, 60), (935, bottom), (65, bottom)] for bottom in _OLD_MAIN_BOTTOMS
    ]
    if points not in first_version:
        return False
    fitted = _plan(slug)[0].outline
    if [(round(x), round(y)) for x, y, _curve in fitted] == points:
        return False
    room.outline = {"points": [{"x": x, "y": y, "curve": curve} for x, y, curve in fitted]}
    return True


def seed(session: Session, owner: Organiser) -> tuple[int, int]:
    """Only add missing demo venues and covers. Leave existing edits and bookings in place."""
    created = 0
    added = 0
    for listing in lisbon_data.catalogue():
        venue = session.scalar(
            select(Venue).where(Venue.public_id == lisbon_data.venue_id(listing["slug"]))
        )
        if venue is None:
            venue = _new_venue(session, owner, listing)
            created += 1
        else:
            _refit_main_room(session, venue, listing["slug"])
        gallery = session.scalar(
            select(VenuePhoto.id)
            .where(VenuePhoto.venue_id == venue.id, VenuePhoto.kind == "gallery")
            .limit(1)
        )
        if gallery is not None:
            continue
        photo = _photo(listing)
        session.add(
            VenuePhoto(
                venue_id=venue.id,
                public_id=lisbon_data.cover_id(listing["slug"]),
                data=photo.data,
                content_type=photo.mime,
                width=photo.width,
                height=photo.height,
                alt_text=listing["photo"]["alt"],
                kind="gallery",
                position=0,
                is_cover=True,
            )
        )
        added += 1
    return created, added


def main() -> None:
    settings = get_settings()
    if not settings.demo_mode or settings.is_postgres:
        raise SystemExit("Use DEMO_MODE=1 with a local SQLite demo database.")
    db.init_engine(settings.database_url)
    db.create_all()
    with db.new_session() as session:
        owner = session.scalar(select(Organiser).where(Organiser.email == DEMO_ORGANISER_EMAIL))
        if owner is None:
            ensure_demo_users(session, settings)
            owner = session.scalars(
                select(Organiser).where(Organiser.email == DEMO_ORGANISER_EMAIL)
            ).one()
        created, photos = seed(session, owner)
        session.commit()
    print(f"Lisbon demo catalogue: {created} restaurants created, {photos} covers added.")


if __name__ == "__main__":
    main()
