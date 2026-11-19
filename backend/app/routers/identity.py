"""Sign-in for restaurant owners and staff through Supabase Auth, when it is switched on.

    GET  /identity/config                    which sign-in the site uses, and which "Continue with" buttons
    POST /identity/owner/signup              make an account; the service emails a confirmation link
    POST /identity/owner/login               password sign-in; answers with SeatPlan's own session token
    POST /identity/owner/oauth/start         where to send the browser for Google or Apple
    POST /identity/owner/oauth               finish a Google or Apple sign-in with the one-time token
    POST /identity/owner/mfa                 the second step: a code from the authenticator app
    POST /identity/owner/reset               email a password-reset link
    POST /identity/owner/set-password        choose a new password with the token from that link
    GET  /identity/owner/security            the signed-in owner's two-step verification state
    POST /identity/owner/security/start      begin turning two-step verification on (needs the password)
    POST /identity/owner/security/confirm    finish turning it on with a first code
    POST /identity/owner/security/disable    turn it off (needs the password and a current code)

With AUTH_PROVIDER unset (the default) every route but the first answers 404 and the built-in
email-and-password sign-in (/auth/login) is the only one, exactly as before. The browser talks only to
SeatPlan; SeatPlan talks to Supabase (auth_providers/supabase.py), so the page's Content-Security-Policy
does not change and no key reaches the browser.

A sign-in is finished only when the person has passed every step they set up: if an account has two-step
verification, no session is made from a password or a Google or Apple sign-in alone.
"""

import re
import time
from typing import Any

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import select

from app import db
from app.auth_providers.supabase import (
    SOCIAL,
    IdentityError,
    SignIn,
    SupabaseAuth,
    client_from_settings,
)
from app.config import get_settings
from app.core.errors import ApiError
from app.core.text import PlainText
from app.models import AuthIdentity, Organiser
from app.restaurant_service import identity
from app.security import CurrentOrganiser, client_ip, create_session_token, keyed_hash, rate_limit

router = APIRouter(prefix="/identity", tags=["identity"])
MIN_PASSWORD = 10
READY_FOR_SECONDS = 600
# What the service said about itself, and until when to believe it: key -> (until, social sign-ins on).
_ready: dict[str, tuple[float, frozenset[str]]] = {}
NONCE = re.compile(r"^[A-Za-z0-9_-]{16,64}$")


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


class OAuthStartIn(Strict):
    provider: str = Field(min_length=3, max_length=10)
    nonce: str = Field(min_length=16, max_length=64)


class OAuthIn(Strict):
    access_token: str = Field(min_length=10, max_length=4000)


class CodeIn(Strict):
    ticket: str = Field(min_length=10, max_length=4000)
    factor_id: str = Field(min_length=10, max_length=80)
    code: str = Field(pattern=r"^\d{6}$")


class PasswordIn(Strict):
    password: str = Field(min_length=1, max_length=200)


class DisableIn(Strict):
    password: str = Field(min_length=1, max_length=200)
    code: str = Field(pattern=r"^\d{6}$")


def get_client() -> SupabaseAuth | None:
    """The sign-in service, or None while the built-in sign-in is used. Tests replace this."""
    return client_from_settings(get_settings())


def _fail(error: IdentityError) -> ApiError:
    if error.kind == "invalid":
        return ApiError(401, "unauthorised", error.message)
    if error.kind == "rejected":
        return ApiError(422, "validation", error.message)
    return ApiError(503 if error.kind == "unsafe" else 502, "identity_unavailable", error.message)


def _service() -> tuple[SupabaseAuth, frozenset[str]]:
    """The service and the social sign-ins it offers, checked now and then that its project asks
    people to confirm their email."""
    client = get_client()
    if client is None:
        raise ApiError(404, "not_found", "Not found.")
    key = repr(client) + str(id(client))
    known = _ready.get(key)
    if known is None or known[0] < time.monotonic():
        try:
            social = frozenset(client.check_ready())
        except IdentityError as error:
            raise _fail(error) from error
        known = (time.monotonic() + READY_FOR_SECONDS, social)
        _ready[key] = known
    return client, known[1]


def _site(path: str) -> str:
    return get_settings().public_base_url.rstrip("/") + path


def _session(organiser: Organiser) -> dict[str, Any]:
    return {
        "token": create_session_token(organiser.id),
        "user": {"email": organiser.email, "name": organiser.name, "role": organiser.role},
    }


def _finish(session: db.SessionDep, signed: SignIn) -> dict[str, Any]:
    """A sign-in is over only when every step the person set up has been passed."""
    if signed.factors:
        # Nothing is made or linked yet. The page asks for a code and comes back to /owner/mfa.
        return {"mfa_required": True, "factor_id": signed.factors[0], "ticket": signed.access_token}
    return _complete(session, signed)


def _complete(session: db.SessionDep, signed: SignIn) -> dict[str, Any]:
    organiser = identity.organiser_for(session, signed.identity)
    identity.remember_second_step(session, signed.identity.subject, bool(signed.factors))
    return _session(organiser)


@router.get("/config")
def config() -> dict[str, Any]:
    if get_client() is None:
        return {"provider": "local", "password_reset": False, "oauth": [], "two_step": False}
    try:
        _, social = _service()
    except ApiError:
        social = frozenset()
    return {
        "provider": "supabase",
        "password_reset": True,
        "oauth": [name for name in SOCIAL if name in social],
        "two_step": True,
    }


@router.post("/owner/signup", status_code=202)
def sign_up(body: SignUpIn, request: Request, session: db.SessionDep) -> dict[str, str]:
    client, _ = _service()
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
    client, _ = _service()
    email = str(body.email).lower()
    rate_limit(session, f"identity-login:{client_ip(request)}", limit=10, window_s=60)
    rate_limit(session, f"identity-login-mail:{keyed_hash(email)}", limit=8, window_s=60)
    try:
        signed = client.sign_in(email, body.password)
    except IdentityError as error:
        raise _fail(error) from error
    return _finish(session, signed)


@router.post("/owner/oauth/start")
def oauth_start(body: OAuthStartIn, request: Request, session: db.SessionDep) -> dict[str, str]:
    """Where to send the browser. The nonce comes back in the address and must match the one the page
    kept, so a link someone else made cannot sign a visitor in as them."""
    client, social = _service()
    rate_limit(session, f"identity-oauth:{client_ip(request)}", limit=20, window_s=60)
    if body.provider not in social or not NONCE.match(body.nonce):
        raise ApiError(422, "validation", "That sign-in is not available.")
    try:
        url = client.authorize_url(body.provider, _site(f"/owner/sign-in/callback?n={body.nonce}"))
    except IdentityError as error:
        raise _fail(error) from error
    return {"url": url}


@router.post("/owner/oauth")
def oauth_finish(body: OAuthIn, request: Request, session: db.SessionDep) -> dict[str, Any]:
    client, _ = _service()
    rate_limit(session, f"identity-oauth-finish:{client_ip(request)}", limit=20, window_s=60)
    try:
        signed = client.user(body.access_token)
    except IdentityError as error:
        raise _fail(error) from error
    return _finish(session, signed)


@router.post("/owner/mfa")
def second_step(body: CodeIn, request: Request, session: db.SessionDep) -> dict[str, Any]:
    client, _ = _service()
    rate_limit(session, f"identity-mfa:{client_ip(request)}", limit=10, window_s=300)
    rate_limit(session, f"identity-mfa-factor:{keyed_hash(body.factor_id)}", limit=10, window_s=300)
    try:
        signed = client.mfa_verify(body.ticket, body.factor_id, body.code)
    except IdentityError as error:
        raise _fail(error) from error
    return _complete(session, signed)


@router.post("/owner/reset", status_code=202)
def reset(body: ResetIn, request: Request, session: db.SessionDep) -> dict[str, str]:
    client, _ = _service()
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
    client, _ = _service()
    rate_limit(session, f"identity-setpw:{client_ip(request)}", limit=10, window_s=3600)
    try:
        client.set_password(body.token, body.password)
    except IdentityError as error:
        raise _fail(error) from error
    return Response(status_code=204)


# ---------------------------------------------------------------- two-step verification settings


def _link(session: db.SessionDep, user: Organiser) -> AuthIdentity | None:
    return session.scalar(
        select(AuthIdentity).where(
            AuthIdentity.provider == identity.PROVIDER, AuthIdentity.organiser_id == user.id
        )
    )


def _own_signin(
    client: SupabaseAuth, session: db.SessionDep, user: Organiser, password: str
) -> tuple[SignIn, AuthIdentity]:
    """Prove it is the owner at the keyboard (the password again) and that the service knows the same
    person as this SeatPlan account."""
    link = _link(session, user)
    if link is None:
        raise ApiError(409, "conflict", "Sign in once with the new sign-in first.")
    try:
        signed = client.sign_in(link.email, password)
    except IdentityError as error:
        raise _fail(error) from error
    if signed.identity.subject != link.subject:
        raise ApiError(401, "unauthorised", "Email or password is not correct.")
    return signed, link


@router.get("/owner/security")
def security(session: db.SessionDep, user: CurrentOrganiser) -> dict[str, Any]:
    if get_client() is None:
        return {"provider": "local", "linked": False, "two_step": False}
    link = _link(session, user)
    return {
        "provider": "supabase",
        "linked": link is not None,
        "two_step": bool(link and link.mfa_enabled),
    }


@router.post("/owner/security/start")
def security_start(
    body: PasswordIn, request: Request, session: db.SessionDep, user: CurrentOrganiser
) -> dict[str, str]:
    client, _ = _service()
    rate_limit(session, f"identity-2fa-start:{user.id}", limit=5, window_s=3600)
    signed, _ = _own_signin(client, session, user, body.password)
    if signed.factors:
        raise ApiError(409, "conflict", "Two-step verification is already on.")
    try:
        found = client.mfa_enroll(signed.access_token, f"SeatPlan {int(time.time())}")
    except IdentityError as error:
        raise _fail(error) from error
    return {
        "factor_id": found.factor_id,
        "secret": found.secret,
        "uri": found.uri,
        "ticket": signed.access_token,
    }


@router.post("/owner/security/confirm", status_code=204)
def security_confirm(
    body: CodeIn, request: Request, session: db.SessionDep, user: CurrentOrganiser
) -> Response:
    client, _ = _service()
    rate_limit(session, f"identity-2fa-confirm:{user.id}", limit=10, window_s=300)
    link = _link(session, user)
    if link is None:
        raise ApiError(409, "conflict", "Sign in once with the new sign-in first.")
    try:
        signed = client.mfa_verify(body.ticket, body.factor_id, body.code)
    except IdentityError as error:
        raise _fail(error) from error
    if signed.identity.subject != link.subject:
        raise ApiError(401, "unauthorised", "That code is not right.")
    link.mfa_enabled = True
    session.commit()
    return Response(status_code=204)


@router.post("/owner/security/disable", status_code=204)
def security_disable(
    body: DisableIn, request: Request, session: db.SessionDep, user: CurrentOrganiser
) -> Response:
    """Turning it off needs both the password and a current code, so a stolen session cannot do it."""
    client, _ = _service()
    rate_limit(session, f"identity-2fa-off:{user.id}", limit=5, window_s=600)
    signed, link = _own_signin(client, session, user, body.password)
    try:
        if signed.factors:
            strong = client.mfa_verify(signed.access_token, signed.factors[0], body.code)
            for factor in signed.factors:
                client.mfa_unenroll(strong.access_token, factor)
    except IdentityError as error:
        raise _fail(error) from error
    link.mfa_enabled = False
    session.commit()
    return Response(status_code=204)
