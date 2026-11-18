"""What a diner agreed to on the last step of a booking, and how they take the offers back.

Two separate things are recorded, because the law treats them separately:

- the terms and privacy notice (required to book): `BookingConsent`, with the version of the words;
- offers from the restaurant (optional, never pre-ticked): `OffersConsent`, one row per restaurant
  and email, which a guest withdraws with the link in any message or on their booking page.

Nothing here sends anything. The offers feature reads `OffersConsent` and sends only to guests
who have a row and have not withdrawn.
"""

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models import (
    Booking,
    BookingConsent,
    OffersConsent,
    Venue,
    VenueTerms,
    utc_now,
)
from app.restaurant_service import legal_text
from app.security import keyed_hash, tokens_match


def require_terms(accepted: bool) -> None:
    """422 unless the diner ticked the terms. Checked before anything is held or saved."""
    if not accepted:
        raise ApiError(
            422, "terms_not_accepted", "Please accept the terms and conditions to book this table."
        )


def extra_text(session: Session, venue: Venue) -> str:
    row = session.get(VenueTerms, venue.id)
    return row.extra_text if row else ""


def save_extra_text(session: Session, venue: Venue, text: str) -> None:
    if len(text) > legal_text.EXTRA_MAX:
        raise ApiError(422, "validation", f"Keep it under {legal_text.EXTRA_MAX} characters.")
    row = session.get(VenueTerms, venue.id)
    if row is None:
        row = VenueTerms(venue_id=venue.id)
        session.add(row)
    row.extra_text = text.strip()
    row.updated_at = utc_now()


def terms_document(session: Session, venue: Venue) -> dict[str, Any]:
    return legal_text.document(venue.name, extra_text(session, venue), venue.is_demo)


def record(session: Session, venue: Venue, booking: Booking, offers: bool) -> BookingConsent:
    """Save what the diner ticked for this booking. Does not commit."""
    consent = BookingConsent(
        booking_id=booking.id,
        venue_id=venue.id,
        terms_version=legal_text.TERMS_VERSION,
        offers_opt_in=offers,
        offers_version=legal_text.OFFERS_VERSION if offers else None,
    )
    session.add(consent)
    if offers:
        opt_in(session, venue, booking.email)
    return consent


def opt_in(session: Session, venue: Venue, email: str) -> OffersConsent:
    """The guest says yes to offers. A new yes after a withdrawal starts a fresh consent."""
    key = email.strip().lower()
    row = session.scalar(
        select(OffersConsent).where(OffersConsent.venue_id == venue.id, OffersConsent.email == key)
    )
    if row is None:
        row = OffersConsent(venue_id=venue.id, email=key, version=legal_text.OFFERS_VERSION)
        session.add(row)
    elif row.withdrawn_at is not None:
        row.withdrawn_at = None
        row.opted_in_at = utc_now()
        row.version = legal_text.OFFERS_VERSION
    session.flush()
    return row


def withdraw(session: Session, venue: Venue, email: str) -> None:
    row = session.scalar(
        select(OffersConsent).where(
            OffersConsent.venue_id == venue.id, OffersConsent.email == email.strip().lower()
        )
    )
    if row is not None and row.withdrawn_at is None:
        row.withdrawn_at = utc_now()


def accepts_offers(session: Session, venue: Venue, email: str) -> bool:
    row = session.scalar(
        select(OffersConsent).where(
            OffersConsent.venue_id == venue.id, OffersConsent.email == email.strip().lower()
        )
    )
    return row is not None and row.withdrawn_at is None


def consenting_emails(session: Session, venue: Venue) -> set[str]:
    """Every guest who may be sent an offer right now."""
    return set(
        session.scalars(
            select(OffersConsent.email).where(
                OffersConsent.venue_id == venue.id, OffersConsent.withdrawn_at.is_(None)
            )
        )
    )


# ---------------------------------------------------------------- the link in every message


def unsubscribe_token(row: OffersConsent) -> str:
    """`<id>.<signature>`: made with the server's secret, so it is never stored and cannot be forged."""
    return f"{row.id}.{keyed_hash(f'offers-stop:{row.id}:{row.venue_id}:{row.email}')[:22]}"


def row_of_token(session: Session, token: str) -> OffersConsent:
    number, _, _ = token.partition(".")
    row = session.get(OffersConsent, int(number)) if number.isdigit() else None
    if row is None or not tokens_match(token, unsubscribe_token(row)):
        raise ApiError(404, "not_found", "This link no longer works.")
    return row
