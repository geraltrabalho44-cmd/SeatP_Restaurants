"""Find the restaurant named in the URL, for diners and for staff."""

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models import Organiser, Venue, utc_now

logger = logging.getLogger("seatplan.payments")


def release_unpaid_deposits(session: Session, venue: Venue) -> None:
    """Give back the tables of this restaurant's deposits whose wait ran out.

    The cron does this for every restaurant, but the cron may be off (it is a
    separate schedule) and an unpaid booking must never keep a table forever. So
    each lookup of a restaurant also settles its own overdue waits: one cheap
    query, and a write only when something is actually overdue. A failure here
    never breaks the page being read.
    """
    from app.restaurant_service import booking_payments  # lazy: it imports a lot

    try:
        if booking_payments.expire_due(session, utc_now(), venue):
            session.commit()
    except Exception:
        session.rollback()
        logger.exception("could not release unpaid deposits for %s", venue.public_id)


def load_restaurant(session: Session, public_id: str) -> Venue:
    """Public lookup: any restaurant venue by its public id, else 404.

    Event venues answer 404 too, so the diner endpoints never reveal them.
    """
    venue = session.scalars(select(Venue).where(Venue.public_id == public_id)).first()
    if venue is None or venue.kind != "restaurant":
        raise ApiError(404, "not_found", "Restaurant not found.")
    release_unpaid_deposits(session, venue)
    return venue


def load_published(session: Session, public_id: str) -> Venue:
    """Diner lookup: only published restaurants. A draft or an unpublished one takes
    no new bookings and looks exactly like a restaurant that does not exist (404).
    Bookings that already exist are reached through their own manage links."""
    venue = load_restaurant(session, public_id)
    if venue.status != "published":
        raise ApiError(404, "not_found", "Restaurant not found.")
    return venue


def load_for_staff(session: Session, public_id: str, user: Organiser) -> Venue:
    """Owners see their restaurants, demo staff only demo restaurants.

    Forbidden looks the same as missing (404).
    """
    venue = load_restaurant(session, public_id)
    if (user.role == "staff" and not venue.is_demo) or (
        user.role != "staff" and venue.organiser_id != user.id
    ):
        raise ApiError(404, "not_found", "Restaurant not found.")
    return venue
