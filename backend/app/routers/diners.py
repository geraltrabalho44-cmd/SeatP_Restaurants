"""Account-owned restaurant bookings and saved restaurants; never exposes manage tokens."""

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Query, Request
from pydantic import EmailStr, Field
from sqlalchemy import delete, func, select

from app import db
from app.core.errors import ApiError
from app.events_service import accounts
from app.events_service.schemas import Password, PlainText, Strict
from app.models import Booking, DinerFavorite, Venue, utc_now
from app.restaurant_service import diner_accounts, diner_signup, discovery, manage_flow
from app.security import CurrentGuestAccount, client_ip, rate_limit

router = APIRouter(prefix="/diner", tags=["diner account"])


class SignUpIn(Strict):
    name: PlainText = Field(min_length=1, max_length=120)
    email: EmailStr = Field(max_length=254)
    password: str = Password
    # Literal[True]: the box must be ticked; false or missing is a 422.
    consent: Literal[True]


@router.post("/sign-up", status_code=202)
def sign_up(body: SignUpIn, request: Request, session: db.SessionDep) -> dict[str, Any]:
    """Email a code (or an "you already have an account" note). The same answer either way.

    The account is made only when the code comes back through /guest/verify, the same step events use,
    so there is one account for both sides. No event is involved.
    """
    email = accounts.normalise_email(body.email)
    if not body.name.strip():
        raise ApiError(422, "validation", "name: Type your name.")
    accounts.check_new_password(body.password, email)
    accounts.count_code_send(session, request, email, "register")
    accounts.count_app_send(session)
    show_code = accounts.may_show_code(session, email)
    key, code, signup_id = diner_signup.start(
        session, body.name.strip(), email, body.password, show_code
    )
    accounts.send_at_once(session, key)
    return accounts.code_sent(email, code, signup_id)


def _limit(session: db.SessionDep, request: Request, account_id: int) -> None:
    rate_limit(session, f"diner:{account_id}:{client_ip(request)}", limit=60, window_s=60)


@router.get("/bookings")
def history(
    request: Request,
    session: db.SessionDep,
    account: CurrentGuestAccount,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    offset: Annotated[int, Query(ge=0, le=100_000)] = 0,
) -> dict[str, Any]:
    _limit(session, request, account.id)
    diner_accounts.claim_bookings(session, account)
    total = session.scalar(
        select(func.count()).select_from(Booking).where(Booking.account_id == account.id)
    )
    rows = session.execute(
        select(Booking, Venue)
        .join(Venue, Booking.venue_id == Venue.id)
        .where(Booking.account_id == account.id)
        .order_by(Booking.start_at.desc(), Booking.id.desc())
        .offset(offset)
        .limit(limit)
    )
    items = [diner_accounts.describe(session, venue, row) for row, venue in rows]
    session.commit()
    return {"items": items, "total": total}


@router.delete("/bookings/{booking_id}")
def cancel(
    booking_id: str,
    request: Request,
    session: db.SessionDep,
    account: CurrentGuestAccount,
) -> dict[str, Any]:
    _limit(session, request, account.id)
    row = diner_accounts.owned_booking(session, account, booking_id)
    venue = session.get(Venue, row.venue_id)
    if row.status != "confirmed" or row.start_at <= utc_now():
        raise ApiError(409, "conflict", "This booking can no longer be cancelled.")
    manage_flow.cancel_booking(session, venue, row, actor="diner")
    result = diner_accounts.describe(session, venue, row)
    session.commit()
    return result


@router.get("/favorites")
def favorites(
    request: Request, session: db.SessionDep, account: CurrentGuestAccount
) -> dict[str, Any]:
    _limit(session, request, account.id)
    rows = session.scalars(
        select(Venue)
        .join(DinerFavorite, DinerFavorite.venue_id == Venue.id)
        .where(
            DinerFavorite.account_id == account.id,
            Venue.kind == "restaurant",
            Venue.status == "published",
            Venue.slug.is_not(None),
        )
        .order_by(DinerFavorite.created_at.desc(), Venue.id.desc())
    )
    return {"items": [{"slug": row.slug, "name": row.name} for row in rows]}


def _published(session: db.SessionDep, slug: str) -> Venue:
    row = discovery.find_by_slug(session, slug)
    if row is None or row.status != "published":
        raise ApiError(404, "not_found", "Restaurant not found.")
    return row


@router.put("/favorites/{slug}")
def save_favorite(
    slug: str, request: Request, session: db.SessionDep, account: CurrentGuestAccount
) -> dict[str, bool]:
    _limit(session, request, account.id)
    row = _published(session, slug)
    db.insert_ignoring_duplicates(
        session,
        DinerFavorite,
        {"account_id": account.id, "venue_id": row.id, "created_at": utc_now()},
    )
    session.commit()
    return {"saved": True}


@router.delete("/favorites/{slug}")
def remove_favorite(
    slug: str, request: Request, session: db.SessionDep, account: CurrentGuestAccount
) -> dict[str, bool]:
    _limit(session, request, account.id)
    # Deletion also works for an unpublished restaurant, so stale saves can be removed.
    row = discovery.find_by_slug(session, slug)
    if row is not None:
        session.execute(
            delete(DinerFavorite).where(
                DinerFavorite.account_id == account.id, DinerFavorite.venue_id == row.id
            )
        )
    session.commit()
    return {"saved": False}
