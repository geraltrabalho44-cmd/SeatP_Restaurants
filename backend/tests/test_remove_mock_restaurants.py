"""The five made-up restaurants of the first demo (Casa Lumen, Tagus Terrace, Tasca do Bairro, Miradouro 7, Pátio das
Laranjeiras) can be removed for good, with everything that hangs off them, while the Lisbon catalogue, anything an owner
made, guest accounts and the Events data stay exactly as they were."""

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Base, Booking, DemoLink, GuestAccount, Organiser, Venue, VenueTable
from app.seed import public_catalogue
from app.seed.lisbon_data import DEMO_ID_PREFIX
from app.seed.remove_mock_restaurants import MOCK_SLUGS, remove
from app.seed.run import DEMO_ORGANISER_EMAIL, seed_all


def _count(session: Session, model: type[Base], *where: object) -> int:
    return session.scalar(select(func.count()).select_from(model).where(*where)) or 0  # type: ignore[arg-type]


def _full_demo(session: Session) -> Organiser:
    seed_all(session, get_settings(), actor="test")
    owner = session.scalar(select(Organiser).where(Organiser.email == DEMO_ORGANISER_EMAIL))
    assert owner is not None
    public_catalogue.run(session, owner)
    return owner


def test_the_made_up_restaurants_go_with_everything_that_hangs_off_them(session: Session) -> None:
    _full_demo(session)
    mock = list(session.scalars(select(Venue).where(Venue.slug.in_(MOCK_SLUGS))))
    assert len(mock) == 5
    mock_ids = [venue.id for venue in mock]
    assert (
        _count(session, Booking, Booking.venue_id.in_(mock_ids)) > 0
    )  # Casa Lumen has its weeks of bookings
    lisbon_before = _count(session, Venue, Venue.public_id.startswith(DEMO_ID_PREFIX))
    others_before = _count(session, Venue, Venue.kind != "restaurant")
    accounts_before = _count(session, GuestAccount)
    event_links_before = sorted(
        link.name
        for link in session.scalars(select(DemoLink))
        if not link.name.startswith(("restaurant_", "showcase_"))
    )

    removed = remove(session)
    session.commit()

    assert sorted(removed) == sorted(venue.name for venue in mock)
    assert _count(session, Venue, Venue.slug.in_(MOCK_SLUGS)) == 0
    assert _count(session, Booking, Booking.venue_id.in_(mock_ids)) == 0
    assert _count(session, VenueTable, VenueTable.venue_id.in_(mock_ids)) == 0
    # The rest is untouched: the Lisbon catalogue, the Events venues, the guest accounts, the Events demo links.
    assert _count(session, Venue, Venue.public_id.startswith(DEMO_ID_PREFIX)) == lisbon_before == 20
    assert _count(session, Venue, Venue.kind != "restaurant") == others_before
    assert _count(session, GuestAccount) == accounts_before
    links = [link.name for link in session.scalars(select(DemoLink))]
    assert (
        sorted(links) == event_links_before
    )  # the links to the removed restaurants are gone, the rest stay
    # Nothing points at a removed row any more.
    if session.bind is not None and session.bind.dialect.name == "sqlite":
        assert session.execute(text("PRAGMA foreign_key_check")).all() == []


def test_running_it_again_changes_nothing(session: Session) -> None:
    _full_demo(session)
    assert remove(session)
    session.commit()
    assert remove(session) == []


def test_a_restaurant_that_is_not_demo_data_is_never_removed(session: Session) -> None:
    _full_demo(session)
    real = session.scalar(select(Venue).where(Venue.slug == "casa-lumen"))
    assert real is not None
    real.is_demo = False  # as if an owner had made it
    session.commit()
    removed = remove(session)
    session.commit()
    assert "Casa Lumen" not in removed and len(removed) == 4
    assert _count(session, Venue, Venue.slug == "casa-lumen") == 1
