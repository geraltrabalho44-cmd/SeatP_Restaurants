from datetime import date, time
from typing import Annotated, Literal

from fastapi import APIRouter, Header, Query, Request
from pydantic import BaseModel

from app import db
from app.models import RainPlanPolicy
from app.restaurant_service import profiles, rain_plan
from app.restaurant_service.availability import PartyNeeds
from app.restaurant_service.venue_access import load_published
from app.restaurant_service.weather_view import view
from app.routers.emails import _check_cron_secret
from app.security import CurrentOrganiser, client_ip, rate_limit

router = APIRouter(tags=["restaurant weather"])


class Policy(BaseModel):
    enabled: bool


@router.put("/owner/restaurants/{vid}/rain-plan")
def rain_policy(vid: str, body: Policy, user: CurrentOrganiser, session: db.SessionDep):
    venue = profiles.load(session, vid, user)
    session.merge(RainPlanPolicy(venue_id=venue.id, enabled=body.enabled))
    session.commit()
    return body


@router.post("/internal/weather/process")
def rain_cron(
    request: Request, session: db.SessionDep, x_cron_secret: Annotated[str | None, Header()] = None
):
    _check_cron_secret(x_cron_secret)
    rate_limit(session, f"weather-cron:{client_ip(request)}", limit=12, window_s=60)
    return {"offered": rain_plan.process(session)}


def by_manage(session, token):
    from app.models import RainOffer
    from app.restaurant_service.booking_rows import load_by_token

    booking = load_by_token(session, token)
    return session.get(RainOffer, booking.id)


@router.get("/b/{token}/rain")
def manage_offer(token: str, request: Request, session: db.SessionDep):
    rate_limit(session, f"rain:{client_ip(request)}", limit=120, window_s=60)
    row = by_manage(session, token)
    return rain_plan.describe(session, row) if row and row.token_hash else None


@router.post("/b/{token}/rain/{choice}")
def manage_decision(
    token: str, choice: Literal["accept", "decline"], request: Request, session: db.SessionDep
):
    from app.core.errors import ApiError

    rate_limit(session, f"rain-choice:{client_ip(request)}", limit=20, window_s=60)
    row = by_manage(session, token)
    if not row or not row.token_hash:
        raise ApiError(404, "not_found", "This rain offer is unavailable.")
    return rain_plan.decide(session, row, choice == "accept")


@router.get("/rain/{token}")
def read_offer(token: str, request: Request, session: db.SessionDep):
    rate_limit(session, f"rain:{client_ip(request)}", limit=120, window_s=60)
    return rain_plan.describe(session, rain_plan.load(session, token))


@router.post("/rain/{token}/{choice}")
def choose_offer(
    token: str, choice: Literal["accept", "decline"], request: Request, session: db.SessionDep
):
    rate_limit(session, f"rain-choice:{client_ip(request)}", limit=20, window_s=60)
    return rain_plan.decide(session, rain_plan.load(session, token), choice == "accept")


@router.get("/r/{venue_id}/weather")
def forecast(
    venue_id: str,
    day: date,
    request: Request,
    session: db.SessionDep,
    at: time | None = None,
    party: Annotated[int, Query(ge=1, le=50)] = 2,
    accessible: bool = False,
    high_chairs: Annotated[int, Query(ge=0, le=6)] = 0,
):
    rate_limit(session, f"r-read:{client_ip(request)}", limit=120, window_s=60)
    venue = load_published(session, venue_id)
    return view(session, venue, day, at, PartyNeeds(party, accessible, high_chairs))
