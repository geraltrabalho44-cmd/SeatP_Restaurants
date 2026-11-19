"""An offer code, diner side: GET /r/{vid}/offers/check says what a code gives for this booking.

The booking itself carries `offer_code` (see routers/restaurants.py). This route only lets the form
show "10% off your bill" before the diner confirms. It is rate limited hard, and a wrong code and
somebody else's code answer the same, so codes cannot be probed.
"""

from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Query, Request
from pydantic import EmailStr

from app import db
from app.restaurant_service import offers
from app.restaurant_service.venue_access import load_published
from app.security import client_ip, rate_limit

router = APIRouter(tags=["offers"])


@router.get("/r/{venue_public_id}/offers/check")
def check_code(
    venue_public_id: str,
    request: Request,
    session: db.SessionDep,
    code: Annotated[str, Query(max_length=40)],
    email: Annotated[EmailStr, Query(max_length=254)],
    day: date,
    party: Annotated[int, Query(ge=1, le=50)] = 2,
) -> dict[str, Any]:
    rate_limit(session, f"offer-check:{client_ip(request)}", limit=12, window_s=60)
    venue = load_published(session, venue_public_id)
    offer = offers.check(session, venue, code, str(email), day, party)
    return {"name": offer.name, "what": offers.describe(offer), "note": offer.note}
