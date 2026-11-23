"""A demo restaurant can be given the average its reviews should show."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import GuestAccount, Organiser, RestaurantReview, Venue, utc_now
from app.security import hash_password
from app.seed import demo_reviews


def test_the_average_of_a_restaurant_is_set_and_the_order_of_its_reviews_is_kept(
    session: Session,
) -> None:
    owner = Organiser(
        email="o@example.com",
        name="O",
        password_hash=hash_password("a long password"),
        role="organiser",
    )
    session.add(owner)
    session.flush()
    venue = Venue(
        name="Casa da Índia",
        kind="restaurant",
        slug="casa-da-india",
        public_id="cdi",
        organiser_id=owner.id,
        width=1000,
        height=700,
    )
    session.add(venue)
    session.flush()
    for index, score in enumerate((10, 8, 8, 6, 6, 4, 10, 8)):
        account = GuestAccount(
            email=f"g{index}@example.com",
            name=f"G{index}",
            password_hash="x",
            consent_at=utc_now(),
            consent_version="v",
        )
        session.add(account)
        session.flush()
        session.add(
            RestaurantReview(
                venue_id=venue.id, account_id=account.id, score=score, comment="Nice", verified=True
            )
        )
    session.commit()
    assert demo_reviews.apply_target_averages(session) > 0
    session.commit()
    scores = sorted(
        session.scalars(select(RestaurantReview.score).where(RestaurantReview.venue_id == venue.id))
    )
    assert round(sum(scores) / len(scores), 1) == 4.9 and len(scores) == 8
    assert max(scores) - min(scores) <= 1  # shifted evenly
    assert session.scalar(select(func.count()).select_from(RestaurantReview)) == 8
    assert demo_reviews.apply_target_averages(session) == 0  # again: nothing to change
