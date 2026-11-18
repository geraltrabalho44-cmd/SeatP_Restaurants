"""The owner's phone message settings (/owner/restaurants/{vid}/messages)."""

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from app import db
from app.config import get_settings
from app.models import utc_now
from app.restaurant_service import phone_messages, profiles
from app.security import CurrentOrganiser

router = APIRouter(tags=["owner messages"])


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MessageSettingsIn(Strict):
    sms_enabled: bool
    whatsapp_enabled: bool
    send_confirmation: bool
    reminder_24h: bool
    reminder_3h: bool
    monthly_cap: int = Field(ge=phone_messages.CAP_MIN, le=phone_messages.CAP_MAX, strict=True)


def _view(session: db.SessionDep, venue: Any) -> dict[str, Any]:
    settings = get_settings()
    found = phone_messages.read_settings(session, venue)
    now = utc_now()
    return {
        # "demo": messages are written to the log and never sent.
        "sms_provider": settings.sms_provider,
        "whatsapp_provider": settings.whatsapp_provider,
        "settings": {
            "sms_enabled": found.sms_enabled,
            "whatsapp_enabled": found.whatsapp_enabled,
            "send_confirmation": found.send_confirmation,
            "reminder_24h": found.reminder_24h,
            "reminder_3h": found.reminder_3h,
            "monthly_cap": found.monthly_cap,
        },
        "usage": phone_messages.usage(session, venue, now),
        "recent": phone_messages.recent(session, venue),
    }


@router.get("/owner/restaurants/{vid}/messages")
def get_messages(vid: str, session: db.SessionDep, user: CurrentOrganiser) -> dict[str, Any]:
    return _view(session, profiles.load(session, vid, user))


@router.put("/owner/restaurants/{vid}/messages")
def save_messages(
    vid: str, body: MessageSettingsIn, session: db.SessionDep, user: CurrentOrganiser
) -> dict[str, Any]:
    venue = profiles.load(session, vid, user)
    phone_messages.save_settings(
        session, venue, phone_messages.MessageSettings(**body.model_dump())
    )
    session.commit()
    return _view(session, venue)
