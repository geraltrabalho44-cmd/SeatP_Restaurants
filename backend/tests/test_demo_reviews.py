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


def test_reviews_are_varied_human_and_spread_over_the_whole_scale(session: Session) -> None:
    """No two reviews of a restaurant are the same, almost none repeat across restaurants, and the scores are not all even."""
    venues = _setup(session)
    demo_reviews.seed(session, plain=True)
    session.flush()
    everything: list[str] = []
    for venue in venues:
        comments = _comments(session, venue)
        assert len(set(comments)) == len(comments), venue.name
        everything.extend(comments)
    assert len(set(everything)) == len(everything)  # not one sentence is used twice
    most_used = max(everything.count(text) for text in set(everything))
    assert most_used == 1
    scores = set(session.scalars(select(RestaurantReview.score)))
    assert {1, 2, 3, 4, 5, 6, 7, 8, 9, 10} & scores >= {5, 7, 9}  # odd scores exist now
    authors = set(session.scalars(select(RestaurantReview.account_id)))
    assert len(authors) >= 60


def test_the_food_is_talked_about_and_nothing_gives_the_seed_away(session: Session) -> None:
    venues = _setup(session)
    demo_reviews.seed(session, plain=True)
    session.flush()
    text = " ".join(c for v in venues for c in _comments(session, v)).lower()
    assert "bacalhau" in text and "pasta" in text or "sea bream" in text
    for word in ("demo", "sample", "lorem", "test review", "{", "}", "none", "undefined"):
        assert word not in text, word


def test_reviews_of_the_first_version_are_replaced_once_and_only_theirs(session: Session) -> None:
    from app.models import GuestAccount
    from app.models import utc_now as now

    venues = _setup(session)
    venue = venues[0]
    old_guest = GuestAccount(
        email=f"review-1@{demo_reviews.LEGACY_DOMAIN}",
        name="Inês",
        password_hash="disabled",
        email_proven=False,
        consent_at=now(),
        consent_version="demo",
    )
    real_guest = GuestAccount(
        email="someone.real@example.com",
        name="Someone",
        password_hash="x",
        email_proven=True,
        consent_at=now(),
        consent_version="1",
    )
    session.add_all([old_guest, real_guest])
    session.flush()
    for guest, text in (
        (old_guest, "We could talk easily and had plenty of room at the table. We booked for two."),
        (
            real_guest,
            "The room worked well for an unhurried dinner.",
        ),  # a real guest's own words stay
    ):
        session.add(
            RestaurantReview(
                venue_id=venue.id, account_id=guest.id, score=8, comment=text, verified=False
            )
        )
    session.flush()
    demo_reviews.seed(session, plain=True)
    session.flush()
    comments = _comments(session, venue)
    assert not any(c.startswith("We could talk easily and had plenty") for c in comments)
    assert "The room worked well for an unhurried dinner." in comments
    count = session.scalar(select(func.count()).select_from(RestaurantReview))
    demo_reviews.seed(session, plain=True)  # a second run changes nothing
    session.flush()
    assert session.scalar(select(func.count()).select_from(RestaurantReview)) == count
