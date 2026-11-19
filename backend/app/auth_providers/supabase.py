"""Supabase Auth as the proof of who someone is, called over plain HTTPS (no SDK).

SeatPlan keeps its own session tokens and its own accounts. Supabase only answers one question: "is
this person the owner of this email address, and did they pass the second step they set up?" The
browser never talks to Supabase's API: it talks to SeatPlan, which talks to Supabase with the project's
public ("anon") key. (The one exception is the "Continue with Google / Apple" button, which sends the
browser to Supabase's sign-in page by an ordinary link, the way any "sign in with" button works.) So the
page's strict Content-Security-Policy stays as it is and no Supabase code runs in the browser.

Needed (only when AUTH_PROVIDER=supabase): SUPABASE_URL (https://<project>.supabase.co) and
SUPABASE_ANON_KEY. In the Supabase dashboard, "Confirm email" must be ON: if it is off, anybody could
sign up with somebody else's address, so `check_ready` refuses to work until it is on. Google and Apple
are switched on in the dashboard (Authentication > Providers); SeatPlan offers only those that are.
"""

from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

import httpx

from app.config import APP_VERSION, Settings

TIMEOUT = httpx.Timeout(8.0, connect=4.0)
SOCIAL = ("google", "apple")


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
    # The person's verified authenticator-app factors. When there are any, signing in is not finished
    # until a code from one of them has been checked.
    factors: tuple[str, ...] = ()


@dataclass(frozen=True)
class Enrollment:
    factor_id: str
    secret: str
    uri: str  # the otpauth:// address an authenticator app reads (drawn as a QR code by the page)


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
        raw_name = meta.get("name") or meta.get("full_name")
        name = raw_name if isinstance(raw_name, str) else ""
        return Identity(
            subject=subject,
            email=email.strip().lower(),
            name=name.strip() or email.split("@")[0],
            email_confirmed=bool(user.get("email_confirmed_at") or user.get("confirmed_at")),
        )

    @staticmethod
    def _factors(user: dict[str, Any]) -> tuple[str, ...]:
        found = user.get("factors")
        if not isinstance(found, list):
            return ()
        return tuple(
            f["id"]
            for f in found
            if isinstance(f, dict)
            and f.get("status") == "verified"
            and f.get("factor_type") == "totp"
            and isinstance(f.get("id"), str)
        )

    def _signed(self, body: dict[str, Any]) -> SignIn:
        token = body.get("access_token")
        user = body.get("user")
        if not isinstance(token, str) or not isinstance(user, dict):
            raise IdentityError("unavailable", "The sign-in service sent an unexpected answer.")
        return SignIn(self._identity(user), token, self._factors(user))

    # ------------------------------------------------------------ the project's own safety

    def check_ready(self) -> set[str]:
        """Refuse to work if the project would let anyone sign up with somebody else's address.

        Returns the social sign-ins (Google, Apple) the project has switched on.
        """
        answer = self._call("GET", "/settings")
        if answer.status_code != 200:
            raise IdentityError("unavailable", "The sign-in service could not be reached.")
        body = self._json(answer)
        if body.get("mailer_autoconfirm") is not False:
            raise IdentityError(
                "unsafe",
                "Sign-in is switched off: the sign-in project does not ask people to confirm their email.",
            )
        external = body.get("external")
        on = external if isinstance(external, dict) else {}
        return {name for name in SOCIAL if on.get(name) is True}

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
        return self._signed(self._json(answer))

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

    # ------------------------------------------------------------ Google and Apple

    def authorize_url(self, provider: str, redirect_to: str) -> str:
        """Where the browser goes to sign in with Google or Apple. It comes back to `redirect_to` with
        a one-time token after the "#", which SeatPlan then checks with `user`."""
        if provider not in SOCIAL:
            raise IdentityError("rejected", "That sign-in is not available.")
        return (
            f"{self._base}/authorize?provider={provider}&redirect_to={quote(redirect_to, safe='')}"
        )

    def user(self, access_token: str) -> SignIn:
        """Who a token belongs to. Supabase checks the token itself; SeatPlan trusts nothing else."""
        answer = self._call("GET", "/user", bearer=access_token)
        if answer.status_code in (400, 401, 403):
            raise IdentityError("invalid", "This sign-in has expired. Please try again.")
        if answer.status_code != 200:
            raise IdentityError("unavailable", "The sign-in service could not be reached.")
        user = self._json(answer)
        return SignIn(self._identity(user), access_token, self._factors(user))

    # ------------------------------------------------------------ the second step (authenticator app)

    def mfa_verify(self, access_token: str, factor_id: str, code: str) -> SignIn:
        """Check a code from the authenticator app. On success the person has passed both steps."""
        asked = self._call(
            "POST", f"/factors/{quote(factor_id, safe='')}/challenge", bearer=access_token
        )
        if asked.status_code in (400, 401, 403, 404):
            raise IdentityError("invalid", "This sign-in has expired. Please start again.")
        challenge = self._json(asked).get("id")
        if asked.status_code != 200 or not isinstance(challenge, str):
            raise IdentityError("unavailable", "The sign-in service could not be reached.")
        answer = self._call(
            "POST",
            f"/factors/{quote(factor_id, safe='')}/verify",
            json={"challenge_id": challenge, "code": code},
            bearer=access_token,
        )
        if answer.status_code in (400, 401, 403, 422):
            raise IdentityError("invalid", "That code is not right.")
        if answer.status_code == 429:
            raise IdentityError("rejected", "Too many attempts. Try again in a few minutes.")
        if answer.status_code != 200:
            raise IdentityError("unavailable", "The sign-in service could not be reached.")
        return self._signed(self._json(answer))

    def mfa_enroll(self, access_token: str, friendly_name: str) -> Enrollment:
        answer = self._call(
            "POST",
            "/factors",
            json={"factor_type": "totp", "friendly_name": friendly_name, "issuer": "SeatPlan"},
            bearer=access_token,
        )
        if answer.status_code in (401, 403):
            raise IdentityError("invalid", "This sign-in has expired. Please start again.")
        body = self._json(answer)
        raw_totp = body.get("totp")
        totp: dict[str, Any] = raw_totp if isinstance(raw_totp, dict) else {}
        factor, secret, uri = body.get("id"), totp.get("secret"), totp.get("uri")
        if answer.status_code not in (200, 201) or not all(
            isinstance(v, str) for v in (factor, secret, uri)
        ):
            raise IdentityError("unavailable", "The sign-in service could not start the setup.")
        return Enrollment(str(factor), str(secret), str(uri))

    def mfa_unenroll(self, strong_token: str, factor_id: str) -> None:
        """Remove a factor. Supabase only allows it with a token that already passed the second step."""
        answer = self._call("DELETE", f"/factors/{quote(factor_id, safe='')}", bearer=strong_token)
        if answer.status_code in (401, 403):
            raise IdentityError("invalid", "That code is not right.")
        if answer.status_code not in (200, 204):
            raise IdentityError("unavailable", "The sign-in service could not be reached.")


def client_from_settings(settings: Settings) -> SupabaseAuth | None:
    """The Supabase client, or None while sign-in is the built-in one (the default)."""
    if settings.auth_provider != "supabase":
        return None
    return SupabaseAuth(settings.supabase_url, settings.supabase_anon_key)
