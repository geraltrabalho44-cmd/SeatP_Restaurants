"""The words a restaurant adds to the terms its diners accept (/owner/restaurants/{vid}/terms)."""

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from app import db
from app.core.text import PlainText
from app.restaurant_service import consents, legal_text, profiles
from app.security import CurrentOrganiser

router = APIRouter(tags=["owner terms"])


class TermsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    extra_text: PlainText = Field(default="", max_length=legal_text.EXTRA_MAX)


def _view(session: db.SessionDep, venue: Any) -> dict[str, Any]:
    return {
        "extra_text": consents.extra_text(session, venue),
        "max_length": legal_text.EXTRA_MAX,
        "document": consents.terms_document(session, venue),
    }


@router.get("/owner/restaurants/{vid}/terms")
def get_terms(vid: str, session: db.SessionDep, user: CurrentOrganiser) -> dict[str, Any]:
    return _view(session, profiles.load(session, vid, user))


@router.put("/owner/restaurants/{vid}/terms")
def save_terms(
    vid: str, body: TermsIn, session: db.SessionDep, user: CurrentOrganiser
) -> dict[str, Any]:
    venue = profiles.load(session, vid, user)
    consents.save_extra_text(session, venue, body.extra_text)
    session.commit()
    return _view(session, venue)
