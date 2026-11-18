"""The owner's numbers about their own restaurant (/owner/restaurants/{vid}/insights, /guests)."""

from typing import Annotated, Any

from fastapi import APIRouter, Query

from app import db
from app.core.errors import ApiError
from app.restaurant_service import insights, profiles
from app.security import CurrentOrganiser

router = APIRouter(tags=["owner insights"])


def _days(days: int) -> int:
    try:
        return insights.check_period(days)
    except ValueError as error:
        raise ApiError(422, "validation", "Pick 30, 90 or 365 days.") from error


@router.get("/owner/restaurants/{vid}/insights")
def get_insights(
    vid: str, session: db.SessionDep, user: CurrentOrganiser, days: int = 90
) -> dict[str, Any]:
    venue = profiles.load(session, vid, user)
    period = _days(days)
    return {
        "overview": insights.overview(session, venue, period),
        "tables": insights.table_demand(session, venue, period),
    }


@router.get("/owner/restaurants/{vid}/guests")
def get_guests(
    vid: str,
    session: db.SessionDep,
    user: CurrentOrganiser,
    q: Annotated[str, Query(max_length=80)] = "",
    sort: str = "recent",
    segment: str | None = None,
    offset: Annotated[int, Query(ge=0, le=100000)] = 0,
) -> dict[str, Any]:
    venue = profiles.load(session, vid, user)
    try:
        return insights.guests(session, venue, q, sort, segment, offset)
    except ValueError as error:
        raise ApiError(422, "validation", "That sort or filter is not available.") from error
