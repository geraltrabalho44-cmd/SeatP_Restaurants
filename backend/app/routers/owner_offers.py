"""The owner's offers (/owner/restaurants/{vid}/offers): create, change, archive, see who it would
reach, and send. Only the restaurant's own owner; another owner gets 404."""

from datetime import date
from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from app import db
from app.core.text import PlainText
from app.models import Offer, utc_now
from app.restaurant_service import offers, profiles
from app.security import CurrentOrganiser

router = APIRouter(tags=["owner offers"])


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Rule(Strict):
    type: Literal["winback", "welcome", "nth_visit"]
    days: int | None = Field(default=None, ge=1, le=1000)
    visits: int | None = Field(default=None, ge=1, le=100)


class OfferIn(Strict):
    name: PlainText = Field(min_length=1, max_length=80)
    kind: Literal["percent", "amount", "gift"]
    value: int = Field(default=0, ge=0, le=100_000, strict=True)
    gift_text: PlainText = Field(default="", max_length=80)
    audience: Literal["link", "send", "auto"]
    rule: Rule | None = None
    note: PlainText = Field(default="", max_length=300)
    starts_on: date | None = None
    ends_on: date | None = None
    max_uses: int | None = Field(default=None, ge=1, le=100_000)
    min_party: int = Field(default=1, ge=1, le=50)
    weekdays: list[int] = Field(default_factory=list, max_length=7)


class SendIn(Strict):
    segment: Literal["all", "lapsed", "regular", "new", "no_shows", "list"]
    emails: list[str] = Field(default_factory=list, max_length=offers.MAX_LIST)


def _data(body: OfferIn) -> dict[str, Any]:
    data = body.model_dump()
    data["rule"] = body.rule.model_dump(exclude_none=True) if body.rule else {}
    return data


@router.get("/owner/restaurants/{vid}/offers")
def list_offers(vid: str, session: db.SessionDep, user: CurrentOrganiser) -> dict[str, Any]:
    venue = profiles.load(session, vid, user)
    rows = session.query(Offer).filter(Offer.venue_id == venue.id).order_by(Offer.id.desc()).all()
    return {
        "offers": [offers.view(session, row) for row in rows],
        "daily_cap": offers.DAILY_SEND_CAP,
        "guest_cooldown_days": offers.GUEST_COOLDOWN.days,
    }


@router.post("/owner/restaurants/{vid}/offers", status_code=201)
def create_offer(
    vid: str, body: OfferIn, session: db.SessionDep, user: CurrentOrganiser
) -> dict[str, Any]:
    venue = profiles.load(session, vid, user)
    offer = offers.create(session, venue, _data(body))
    session.commit()
    return offers.view(session, offer)


@router.put("/owner/restaurants/{vid}/offers/{offer_id}")
def change_offer(
    vid: str, offer_id: int, body: OfferIn, session: db.SessionDep, user: CurrentOrganiser
) -> dict[str, Any]:
    venue = profiles.load(session, vid, user)
    offer = offers.update(session, offers.load(session, venue, offer_id), _data(body))
    session.commit()
    return offers.view(session, offer)


@router.post("/owner/restaurants/{vid}/offers/{offer_id}/archive")
def archive_offer(
    vid: str, offer_id: int, session: db.SessionDep, user: CurrentOrganiser
) -> dict[str, Any]:
    venue = profiles.load(session, vid, user)
    offer = offers.load(session, venue, offer_id)
    offer.active = not offer.active
    session.commit()
    return offers.view(session, offer)


@router.post("/owner/restaurants/{vid}/offers/audience")
def preview_audience(
    vid: str, body: SendIn, session: db.SessionDep, user: CurrentOrganiser
) -> dict[str, Any]:
    """How many guests a send would reach. Counts only: no address leaves this call."""
    venue = profiles.load(session, vid, user)
    reach = offers.audience(session, venue, body.segment, body.emails)
    return {k: v for k, v in reach.items() if k != "guests"}


@router.post("/owner/restaurants/{vid}/offers/{offer_id}/send")
def send_offer(
    vid: str, offer_id: int, body: SendIn, session: db.SessionDep, user: CurrentOrganiser
) -> dict[str, Any]:
    venue = profiles.load(session, vid, user)
    offer = offers.load(session, venue, offer_id)
    return offers.send(session, venue, offer, body.segment, body.emails, utc_now())
