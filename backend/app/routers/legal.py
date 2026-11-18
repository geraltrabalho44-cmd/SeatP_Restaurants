"""Terms, privacy and offers, diner side.

    GET  /r/{vid}/terms        the words the diner accepts on the last step of a booking
    GET  /u/{token}            where an offers email or message links to: still subscribed?
    POST /u/{token}/stop       no more offers from this restaurant
    POST /u/{token}/resume     the diner stopped by mistake
    POST /b/{manage_token}/offers   the same choice, from the booking page

The token in /u/ is signed by the server (see consents.unsubscribe_token). A wrong one is a 404.
"""

from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict

from app import db
from app.core.errors import ApiError
from app.core.privacy import mask_email
from app.models import OffersConsent, Venue
from app.restaurant_service import booking_rows, consents
from app.restaurant_service.venue_access import load_published
from app.security import client_ip, rate_limit

router = APIRouter(tags=["legal"])
LINK_LIMIT = 60


class OffersIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    opt_in: bool


@router.get("/r/{venue_public_id}/terms")
def terms(venue_public_id: str, request: Request, session: db.SessionDep) -> dict[str, Any]:
    rate_limit(session, f"legal-read:{client_ip(request)}", limit=120, window_s=60)
    venue = load_published(session, venue_public_id)
    return consents.terms_document(session, venue)


def _state(session: db.SessionDep, row: OffersConsent) -> dict[str, Any]:
    venue = session.get(Venue, row.venue_id)
    return {
        "venue_name": venue.name if venue else "",
        "email": mask_email(row.email),
        "subscribed": row.withdrawn_at is None,
    }


def _row(session: db.SessionDep, request: Request, token: str) -> OffersConsent:
    rate_limit(session, f"legal-link:{client_ip(request)}", limit=LINK_LIMIT, window_s=60)
    return consents.row_of_token(session, token)


@router.get("/u/{token}")
def view_subscription(token: str, request: Request, session: db.SessionDep) -> dict[str, Any]:
    return _state(session, _row(session, request, token))


@router.post("/u/{token}/stop")
def stop_offers(token: str, request: Request, session: db.SessionDep) -> dict[str, Any]:
    row = _row(session, request, token)
    venue = session.get(Venue, row.venue_id)
    if venue is not None:
        consents.withdraw(session, venue, row.email)
        session.commit()
    return _state(session, row)


@router.post("/u/{token}/resume")
def resume_offers(token: str, request: Request, session: db.SessionDep) -> dict[str, Any]:
    row = _row(session, request, token)
    venue = session.get(Venue, row.venue_id)
    if venue is not None:
        consents.opt_in(session, venue, row.email)
        session.commit()
    return _state(session, row)


@router.post("/b/{manage_token}/offers")
def set_offers(
    manage_token: str, body: OffersIn, request: Request, session: db.SessionDep
) -> dict[str, Any]:
    rate_limit(session, f"legal-manage:{client_ip(request)}", limit=LINK_LIMIT, window_s=60)
    booking = booking_rows.load_by_token(session, manage_token)
    venue = session.get(Venue, booking.venue_id)
    if venue is None:
        raise ApiError(404, "not_found", "Booking not found.")
    if body.opt_in:
        consents.opt_in(session, venue, booking.email)
    else:
        consents.withdraw(session, venue, booking.email)
    session.commit()
    return {"offers": consents.accepts_offers(session, venue, booking.email)}
