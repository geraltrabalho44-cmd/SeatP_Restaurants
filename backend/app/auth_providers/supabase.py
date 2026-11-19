"""Supabase Auth as the proof of who someone is, called over plain HTTPS (no SDK).

SeatPlan keeps its own session tokens and its own accounts. Supabase only answers one question: "is
this person the owner of this email address?" The browser never talks to Supabase: it talks to
SeatPlan, which talks to Supabase with the project's public ("anon") key. So the page's strict
Content-Security-Policy stays as it is and no Supabase code runs in the browser.

Needed (only when AUTH_PROVIDER=supabase): SUPABASE_URL (https://<project>.supabase.co) and
SUPABASE_ANON_KEY. In the Supabase dashboard, "Confirm email" must be ON: if it is off, anybody
could sign up with somebody else's address, so `check_ready` refuses to work until it is on.
"""

from dataclasses import dataclass
from typing import Any

import httpx

from app.config import APP_VERSION, Settings

TIMEOUT = httpx.Timeout(8.0, connect=4.0)


class IdentityError(Exception):
    """Supabase said no, or could not be reached. The text is short, fixed and safe to show."""

    def __init__(self, kind: str, message: str) -> None:
        super().__init__(message)
        self.kind = kind  # "invalid", "unavailable", "unsafe" or "rejected"
        self.message = message


@dataclass(frozen=True)
class Identity:
    """Who Supabase says someone is."""

    subject: str  # Supabase's id for the person
    email: str
    name: str
    email_confirmed: bool


@dataclass(frozen=True)
class SignIn:
    identity: Identity
    access_token: str


class SupabaseAuth:
    name = "supabase"

    def __init__(self, url: str, anon_key: str, client: httpx.Client | None = None) -> None:
        self._base = url.rstrip("/") + "/auth/v1"
        self._key = anon_key
        self._client = client or httpx.Client(timeout=TIMEOUT)

    def __repr__(self) -> str:
        return "SupabaseAuth(key=...)"

    # ------------------------------------------------------------ plumbing

    def _headers(self, bearer: str | None = None) -> dict[str, str]:
        return {
            "apikey": self._key,
            "Authorization": f"Bearer {bearer or self._key}",
            "User-Agent": f"seatplan/{APP_VERSION}",
        }

    def _call(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
        params: dict[str, str] | None = None,
        bearer: str | None = None,
    ) -> httpx.Response:
        try:
            return self._client.request(
                method, self._base + path, json=json, params=params, headers=self._headers(bearer)
            )
        except httpx.HTTPError as error:
            raise IdentityError(
                "unavailable", "The sign-in service could not be reached."
            ) from error

    @staticmethod
    def _json(answer: httpx.Response) -> dict[str, Any]:
        try:
            data = answer.json()
        except ValueError:
            return {}
        return data if isinstance(data, dict) else {}

    @staticmethod
    def _identity(user: dict[str, Any]) -> Identity:
        raw_meta = user.get("user_metadata")
        meta: dict[str, Any] = raw_meta if isinstance(raw_meta, dict) else {}
        subject, email = user.get("id"), user.get("email")
        if not isinstance(subject, str) or not isinstance(email, str):
            raise IdentityError("unavailable", "The sign-in service sent an unexpected answer.")
        raw_name = meta.get("name")
        name = raw_name if isinstance(raw_name, str) else ""
        return Identity(
            subject=subject,
            email=email.strip().lower(),
            name=name.strip() or email.split("@")[0],
            email_confirmed=bool(user.get("email_confirmed_at") or user.get("confirmed_at")),
        )

    # ------------------------------------------------------------ the project's own safety

    def check_ready(self) -> None:
        """Refuse to work if the project would let anyone sign up with somebody else's address."""
        answer = self._call("GET", "/settings")
        if answer.status_code != 200:
            raise IdentityError("unavailable", "The sign-in service could not be reached.")
        if self._json(answer).get("mailer_autoconfirm") is not False:
            raise IdentityError(
                "unsafe",
                "Sign-in is switched off: the sign-in project does not ask people to confirm their email.",
            )

    # ------------------------------------------------------------ what people do

    def sign_up(self, email: str, password: str, name: str, redirect_to: str) -> None:
        """Create the account; Supabase emails a confirmation link. Says nothing about whether the
        address was already taken, so nobody can learn who has an account."""
        answer = self._call(
            "POST",
            "/signup",
            json={"email": email, "password": password, "data": {"name": name}},
            params={"redirect_to": redirect_to},
        )
        if answer.status_code in (200, 201):
            return
        body = self._json(answer)
        code = str(body.get("error_code") or body.get("code") or "")
        if code in ("weak_password", "validation_failed") or answer.status_code == 422:
            raise IdentityError("rejected", "Choose a stronger password (at least 10 characters).")
        if answer.status_code == 429:
            raise IdentityError("rejected", "Too many attempts. Try again later.")
        raise IdentityError("unavailable", "The sign-in service could not create the account.")

    def sign_in(self, email: str, password: str) -> SignIn:
        answer = self._call(
            "POST",
            "/token",
            params={"grant_type": "password"},
            json={"email": email, "password": password},
        )
        if answer.status_code in (400, 401, 403):
            # Wrong password, unknown address and unconfirmed address all look the same.
            raise IdentityError("invalid", "Email or password is not correct.")
        if answer.status_code != 200:
            raise IdentityError("unavailable", "The sign-in service could not be reached.")
        body = self._json(answer)
        token = body.get("access_token")
        user = body.get("user")
        if not isinstance(token, str) or not isinstance(user, dict):
            raise IdentityError("unavailable", "The sign-in service sent an unexpected answer.")
        return SignIn(self._identity(user), token)

    def recover(self, email: str, redirect_to: str) -> None:
        """Email a password-reset link. Silent about whether the address has an account."""
        answer = self._call(
            "POST", "/recover", json={"email": email}, params={"redirect_to": redirect_to}
        )
        if answer.status_code == 429:
            raise IdentityError("rejected", "Too many attempts. Try again later.")
        if answer.status_code >= 500:
            raise IdentityError("unavailable", "The sign-in service could not be reached.")

    def set_password(self, recovery_token: str, password: str) -> None:
        """Set a new password with the token from the reset link."""
        answer = self._call("PUT", "/user", json={"password": password}, bearer=recovery_token)
        if answer.status_code in (401, 403):
            raise IdentityError("invalid", "This reset link has expired. Ask for a new one.")
        if answer.status_code == 422:
            raise IdentityError("rejected", "Choose a stronger password (at least 10 characters).")
        if answer.status_code != 200:
            raise IdentityError("unavailable", "The sign-in service could not be reached.")


def client_from_settings(settings: Settings) -> SupabaseAuth | None:
    """The Supabase client, or None while sign-in is the built-in one (the default)."""
    if settings.auth_provider != "supabase":
        return None
    return SupabaseAuth(settings.supabase_url, settings.supabase_anon_key)
