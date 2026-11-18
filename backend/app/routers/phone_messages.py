"""Phone messages, diner side: verify a number, and the page a reminder links to.

    POST /r/{vid}/phone/start     send a 6-digit code to a Portuguese mobile
    POST /r/{vid}/phone/verify    check the code
    GET  /m/{token}               what the reminder's link shows (no name, no email)
    POST /m/{token}/confirm       "Yes, I'm coming"
    POST /m/{token}/cancel        cancel the booking, like the manage link does
    POST /m/{token}/stop          no more messages, and the number is deleted

The token in /m/ is signed by the server and tied to one booking. Every wrong or
old token is the same plain 404.
"""

from typing import Any, Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field

from app import db
from app.core.errors import ApiError
from app.messaging.phone import mask
from app.models import Booking, MessageConsent, Venue, utc_now
from app.restaurant_service import manage_flow, phone_messages
from app.restaurant_service.clock import hhmm, venue_zone
from app.restaurant_service.venue_access import load_published
from app.security import client_ip, rate_limit

router = APIRouter(tags=["phone messages"])
LINK_LIMIT = 60


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class StartIn(Strict):
    phone: str = Field(min_length=6, max_length=24)
    channel: Literal["sms", "whatsapp"]


class VerifyIn(Strict):
    verification_id: str = Field(min_length=10, max_length=100)
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


@router.post("/r/{venue_public_id}/phone/start")
def start(
    venue_public_id: str, body: StartIn, request: Request, session: db.SessionDep
) -> dict[str, Any]:
    venue = load_published(session, venue_public_id)
    return phone_messages.start_verification(
        session, venue, body.phone, body.channel, client_ip(request)
    )


@router.post("/r/{venue_public_id}/phone/verify")
def verify(
    venue_public_id: str, body: VerifyIn, request: Request, session: db.SessionDep
) -> dict[str, Any]:
    rate_limit(session, f"phone-verify:{client_ip(request)}", limit=30, window_s=3600)
    venue = load_published(session, venue_public_id)
    return phone_messages.check_code(session, venue, body.verification_id, body.code)


def _load(
    session: db.SessionDep, request: Request, token: str
) -> tuple[MessageConsent, Booking, Venue]:
    rate_limit(session, f"m-link:{client_ip(request)}", limit=LINK_LIMIT, window_s=60)
    consent = phone_messages.consent_of_token(session, token)
    booking = session.get(Booking, consent.booking_id)
    venue = session.get(Venue, consent.venue_id)
    if booking is None or venue is None:
        raise ApiError(404, "not_found", "This link no longer works.")
    return consent, booking, venue


def _view(
    session: db.SessionDep, consent: MessageConsent, booking: Booking, venue: Venue
) -> dict[str, Any]:
    """The least that is needed: where, when, how many. No name, no notes, no email."""
    from app.restaurant_service import occupancy
    from app.restaurant_service.booking_rows import table_labels

    local = booking.start_at.astimezone(venue_zone(venue))
    started = booking.start_at <= utc_now()
    state = "stopped" if consent.withdrawn_at else booking.status
    return {
        "venue_name": venue.name,
        "venue_public_id": venue.public_id,
        "phone": mask(consent.phone_e164),
        "address": venue.address or "",
        "venue_phone": venue.phone or "",
        "date": booking.date.isoformat(),
        "time": hhmm(local.time()),
        "weekday": f"{local:%A}",
        "party": booking.party_size,
        "table": ", ".join(table_labels(session, occupancy.tables_of(session, booking))),
        "status": state,
        "started": started,
        "confirmed_at": consent.confirmed_at.isoformat() if consent.confirmed_at else None,
    }


@router.get("/m/{token}")
def view(token: str, request: Request, session: db.SessionDep) -> dict[str, Any]:
    return _view(session, *_load(session, request, token))


def _open(booking: Booking) -> None:
    if booking.status != "confirmed" or booking.start_at <= utc_now():
        raise ApiError(409, "conflict", "This booking can no longer be changed.")


@router.post("/m/{token}/confirm")
def confirm(token: str, request: Request, session: db.SessionDep) -> dict[str, Any]:
    consent, booking, venue = _load(session, request, token)
    _open(booking)
    phone_messages.confirm_coming(session, consent, consent.channel)
    session.commit()
    return _view(session, consent, booking, venue)


@router.post("/m/{token}/cancel")
def cancel(token: str, request: Request, session: db.SessionDep) -> dict[str, Any]:
    consent, booking, venue = _load(session, request, token)
    _open(booking)
    manage_flow.cancel_booking(session, venue, booking, actor="diner-message")
    session.commit()
    return _view(session, consent, booking, venue)


@router.post("/m/{token}/stop")
def stop(token: str, request: Request, session: db.SessionDep) -> dict[str, Any]:
    consent, booking, venue = _load(session, request, token)
    phone_messages.stop(session, consent)
    session.commit()
    return _view(session, consent, booking, venue)
