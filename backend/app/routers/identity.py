"""Sign-in for restaurant owners and staff through Supabase Auth, when it is switched on.

    GET  /identity/config                 which sign-in the site uses ("local" or "supabase")
    POST /identity/owner/signup           make an account; the service emails a confirmation link
    POST /identity/owner/login            sign in; answers with SeatPlan's own session token
    POST /identity/owner/reset            email a password-reset link
    POST /identity/owner/set-password     choose a new password with the token from that link

With AUTH_PROVIDER unset (the default) every route but the first answers 404 and the built-in
email-and-password sign-in (/auth/login) is the only one, exactly as before. The browser talks only to
SeatPlan; SeatPlan talks to Supabase (auth_providers/supabase.py), so the page's Content-Security-Policy
does not change and no key reaches the browser.
"""

import time
from typing import Any

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app import db
from app.auth_providers.supabase import IdentityError, SupabaseAuth, client_from_settings
from app.config import get_settings
from app.core.errors import ApiError
from app.core.text import PlainText
from app.restaurant_service import identity
from app.security import client_ip, create_session_token, keyed_hash, rate_limit

router = APIRouter(prefix="/identity", tags=["identity"])
MIN_PASSWORD = 10
READY_FOR_SECONDS = 600
_ready_until: dict[str, float] = {}


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SignUpIn(Strict):
    name: PlainText = Field(min_length=1, max_length=120)
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=MIN_PASSWORD, max_length=200)
    consent: bool


class LoginIn(Strict):
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=1, max_length=200)


class ResetIn(Strict):
    email: EmailStr = Field(max_length=254)


class SetPasswordIn(Strict):
    token: str = Field(min_length=10, max_length=4000)
    password: str = Field(min_length=MIN_PASSWORD, max_length=200)


def get_client() -> SupabaseAuth | None:
    """The sign-in service, or None while the built-in sign-in is used. Tests replace this."""
    return client_from_settings(get_settings())


def _fail(error: IdentityError) -> ApiError:
    if error.kind == "invalid":
        return ApiError(401, "unauthorised", error.message)
    if error.kind == "rejected":
        return ApiError(422, "validation", error.message)
    return ApiError(503 if error.kind == "unsafe" else 502, "identity_unavailable", error.message)


def _service() -> SupabaseAuth:
    """The service, checked now and then that its project asks people to confirm their email."""
    client = get_client()
    if client is None:
        raise ApiError(404, "not_found", "Not found.")
    key = repr(client) + str(id(client))
    if _ready_until.get(key, 0.0) < time.monotonic():
        try:
            client.check_ready()
        except IdentityError as error:
            raise _fail(error) from error
        _ready_until[key] = time.monotonic() + READY_FOR_SECONDS
    return client


def _site(path: str) -> str:
    return get_settings().public_base_url.rstrip("/") + path


@router.get("/config")
def config() -> dict[str, Any]:
    provider = "supabase" if get_client() is not None else "local"
    return {"provider": provider, "password_reset": provider == "supabase"}


@router.post("/owner/signup", status_code=202)
def sign_up(body: SignUpIn, request: Request, session: db.SessionDep) -> dict[str, str]:
    client = _service()
    rate_limit(session, f"identity-signup:{client_ip(request)}", limit=5, window_s=3600)
    rate_limit(
        session,
        f"identity-signup-mail:{keyed_hash(str(body.email).lower())}",
        limit=3,
        window_s=3600,
    )
    if not body.consent:
        raise ApiError(422, "validation", "Please agree to create your owner account.")
    try:
        client.sign_up(str(body.email).lower(), body.password, body.name, _site("/owner/sign-in"))
    except IdentityError as error:
        raise _fail(error) from error
    # The same answer whether or not the address already had an account.
    return {"status": "check_email"}


@router.post("/owner/login")
def sign_in(body: LoginIn, request: Request, session: db.SessionDep) -> dict[str, Any]:
    client = _service()
    email = str(body.email).lower()
    rate_limit(session, f"identity-login:{client_ip(request)}", limit=10, window_s=60)
    rate_limit(session, f"identity-login-mail:{keyed_hash(email)}", limit=8, window_s=60)
    try:
        signed = client.sign_in(email, body.password)
    except IdentityError as error:
        raise _fail(error) from error
    organiser = identity.organiser_for(session, signed.identity)
    return {
        "token": create_session_token(organiser.id),
        "user": {"email": organiser.email, "name": organiser.name, "role": organiser.role},
    }


@router.post("/owner/reset", status_code=202)
def reset(body: ResetIn, request: Request, session: db.SessionDep) -> dict[str, str]:
    client = _service()
    rate_limit(session, f"identity-reset:{client_ip(request)}", limit=10, window_s=3600)
    rate_limit(
        session,
        f"identity-reset-mail:{keyed_hash(str(body.email).lower())}",
        limit=3,
        window_s=3600,
    )
    try:
        client.recover(str(body.email).lower(), _site("/owner/reset-password"))
    except IdentityError as error:
        raise _fail(error) from error
    return {"status": "check_email"}


@router.post("/owner/set-password", status_code=204)
def set_password(body: SetPasswordIn, request: Request, session: db.SessionDep) -> Response:
    client = _service()
    rate_limit(session, f"identity-setpw:{client_ip(request)}", limit=10, window_s=3600)
    try:
        client.set_password(body.token, body.password)
    except IdentityError as error:
        raise _fail(error) from error
    return Response(status_code=204)
