"""The 15 Porto restaurants: listings, covers with credit, positions, rooms, menus and reviews."""

from conftest import make_user
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Organiser, RestaurantMenu, RestaurantReview, Venue, VenuePhoto, VenueTable
from app.restaurant_service import discovery
from app.seed import demo_reviews, lisbon_catalogue, lisbon_data, lisbon_menus
from app.seed.run import DEMO_ORGANISER_EMAIL

PORTO = lisbon_data.PORTO


def _seed(session: Session) -> Organiser:
    owner = make_user(session, DEMO_ORGANISER_EMAIL)
    lisbon_catalogue.seed(session, owner, PORTO)
    session.flush()
    return owner


def test_the_porto_catalogue_has_fifteen_restaurants_with_everything(session: Session) -> None:
    listings = lisbon_data.catalogue(PORTO)
    assert len(listings) == 15
    _seed(session)
    venues = list(session.scalars(select(Venue).where(Venue.public_id.startswith(PORTO.id_prefix))))
    assert len(venues) == 15
    for venue, listing in zip(
        sorted(venues, key=lambda v: v.name), sorted(listings, key=lambda i: i["name"]), strict=True
    ):
        assert venue.status == "published" and venue.is_demo
        # In Porto: a box around the city.
        assert venue.lat is not None and 41.10 < venue.lat < 41.20, venue.name
        assert venue.lng is not None and -8.70 < venue.lng < -8.55, venue.name
        assert venue.address.endswith("Porto") and venue.google_maps_url
        assert session.scalar(
            select(func.count()).select_from(VenueTable).where(VenueTable.venue_id == venue.id)
        )
        cover = session.scalars(select(VenuePhoto).where(VenuePhoto.venue_id == venue.id)).one()
        assert cover.is_cover and cover.alt_text == listing["photo"]["alt"]
        credit = lisbon_data.cover_credit(cover.public_id)
        assert credit and credit["author"] and credit["license"].startswith("CC")
        page = discovery.public_page(session, venue, preview=False)
        assert page["demo_booking"] is True, venue.name


def test_seeding_porto_twice_adds_nothing_and_menus_and_reviews_follow(session: Session) -> None:
    owner = _seed(session)
    again = lisbon_catalogue.seed(session, owner, PORTO)
    assert again == (0, 0)
    written, _missing = lisbon_menus.seed(session)
    session.flush()
    assert written >= 15
    for venue in session.scalars(select(Venue).where(Venue.public_id.startswith(PORTO.id_prefix))):
        menu = session.get(RestaurantMenu, venue.id)
        assert menu is not None and len(menu.items) >= 9, venue.name
    demo_reviews.seed(session)
    session.flush()
    for venue in session.scalars(select(Venue).where(Venue.public_id.startswith(PORTO.id_prefix))):
        count = session.scalar(
            select(func.count())
            .select_from(RestaurantReview)
            .where(RestaurantReview.venue_id == venue.id)
        )
        assert count and count >= 10, venue.name
