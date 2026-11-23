"""The sample-review seeder: plain-looking reviews; the Lisbon restaurants stay flagged as demo data."""

from conftest import make_user
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import RestaurantReview, Venue
from app.restaurant_service import discovery
from app.seed import demo_reviews, demo_showcase
from app.seed.lisbon_catalogue import seed as seed_lisbon
from app.seed.lisbon_data import DEMO_ID_PREFIX
from app.seed.run import DEMO_ORGANISER_EMAIL


def _comments(session: Session, venue: Venue) -> list[str]:
    return list(
        session.scalars(
            select(RestaurantReview.comment).where(RestaurantReview.venue_id == venue.id)
        )
    )


def _setup(session: Session) -> list[Venue]:
    owner = make_user(session, DEMO_ORGANISER_EMAIL)
    demo_showcase.seed(session)
    seed_lisbon(session, owner)
    session.flush()
    return list(session.scalars(select(Venue).where(Venue.is_demo.is_(True))))


def test_a_labelled_run_labels_every_review(session: Session) -> None:
    venues = _setup(session)
    assert len(venues) > 20
    demo_reviews.seed(session, plain=False)
    for venue in venues:
        comments = _comments(session, venue)
        assert comments and all(c.startswith(demo_reviews.LABEL) for c in comments), venue.name


def test_the_default_run_leaves_the_label_out(session: Session) -> None:
    venues = _setup(session)
    demo_reviews.seed(session)
    for venue in venues:
        assert not any("Demo review" in comment for comment in _comments(session, venue)), (
            venue.name
        )


def test_plain_run_reviews_every_demo_restaurant_without_the_label(session: Session) -> None:
    venues = _setup(session)
    count, added = demo_reviews.seed(session, plain=True)
    assert count == len(venues) and added > 0
    for venue in venues:
        comments = _comments(session, venue)
        assert len(comments) >= 10
        assert not any("Demo review" in comment for comment in comments), venue.name


def test_lisbon_restaurants_stay_flagged_as_demo_data(session: Session) -> None:
    venues = _setup(session)
    demo_reviews.seed(session, plain=True)
    session.flush()
    real = [venue for venue in venues if venue.public_id.startswith(DEMO_ID_PREFIX)]
    assert len(real) == 20
    for venue in real:
        page = discovery.public_page(session, venue, preview=False)
        assert page["demo_booking"] is True, venue.name


def test_plain_run_relabels_what_a_labelled_run_made_and_is_repeatable(session: Session) -> None:
    venues = _setup(session)
    demo_reviews.seed(session, plain=False)
    demo_reviews.seed(session, plain=True)
    session.flush()
    count = session.scalar(select(func.count()).select_from(RestaurantReview))
    for venue in venues:
        assert not any("Demo review" in comment for comment in _comments(session, venue))
    demo_reviews.seed(session, plain=True)
    session.flush()
    assert session.scalar(select(func.count()).select_from(RestaurantReview)) == count
