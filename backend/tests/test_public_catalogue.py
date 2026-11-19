"""The shared demo site shows only the Lisbon catalogue, with reviews; nothing is deleted."""

from conftest import make_user
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import RestaurantReview, Venue
from app.restaurant_service import discovery
from app.seed import demo_showcase, public_catalogue
from app.seed.lisbon_data import DEMO_ID_PREFIX
from app.seed.run import DEMO_ORGANISER_EMAIL


def test_lisbon_catalogue_becomes_the_only_public_list_and_nothing_is_deleted(session: Session) -> None:
    owner = make_user(session, DEMO_ORGANISER_EMAIL)
    demo_showcase.seed(session)
    session.flush()
    invented = list(session.scalars(select(Venue).where(Venue.kind == "restaurant")))
    assert invented

    result = public_catalogue.run(session, owner)
    assert result["created"] == 20 and len(result["hidden"]) == len(invented)  # type: ignore[arg-type]

    published = list(
        session.scalars(select(Venue).where(Venue.kind == "restaurant", Venue.status == "published"))
    )
    assert len(published) == 20 and all(v.public_id.startswith(DEMO_ID_PREFIX) for v in published)
    for venue in invented:
        session.refresh(venue)
        assert venue.status == "draft"

    listing = discovery.search_restaurants(session, discovery.Search())
    assert listing["total"] == 20
    for venue in published:
        count = session.scalar(
            select(func.count()).select_from(RestaurantReview).where(RestaurantReview.venue_id == venue.id)
        )
        assert count and count >= 10, venue.name
        assert discovery.public_page(session, venue, preview=False)["demo_booking"] is True

    before = session.scalar(select(func.count()).select_from(RestaurantReview))
    again = public_catalogue.run(session, owner)
    assert again["created"] == 0 and again["hidden"] == [] and again["reviews"] == 0
    assert session.scalar(select(func.count()).select_from(RestaurantReview)) == before
