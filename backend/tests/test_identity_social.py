"""Google and Apple sign-in and two-step verification (authenticator app), tested against the same small
fake of Supabase's API as test_identity.py, extended with social sign-ins and authenticator-app factors."""

from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_identity import KEY, URL, FakeSupabase, _login, _signup

from app.auth_providers.supabase import SupabaseAuth
from app.models import AuthIdentity, GuestAccount, Organiser, utc_now
from app.routers import identity as router
from app.security import create_session_token, hash_password


class FakeSocial(FakeSupabase):
    def __init__(self) -> None:
        super().__init__()
        self.social = {"google": True, "apple": False}
        self.oauth_tokens: dict[str, str] = {}  # a one-time token from Google or Apple -> email

    def user_json(self, email: str) -> dict[str, Any]:
        u = self.users[email]
        factors = [
            {"id": f, "factor_type": "totp", "status": status}
            for f, status in u.get("factors", {}).items()
        ]
        base = super().user_json(email)
        return {**base, "factors": factors}

    def by_token(self, token: str) -> str | None:
        """The email a bearer token belongs to: a password sign-in (aal1), a code-checked one (aal2) or an OAuth one."""
        for prefix in ("aal2-", "jwt-for-"):
            if token.startswith(prefix):
                uid = token.removeprefix(prefix)
                return next((e for e, u in self.users.items() if u["id"] == uid), None)
        return self.oauth_tokens.get(token)

    def enrol(self, email: str, verified: bool = True) -> str:
        factor = f"factor-{self.users[email]['id']}"
        self.users[email].setdefault("factors", {})[factor] = (
            "verified" if verified else "unverified"
        )
        return factor

    def __call__(self, request: httpx.Request) -> httpx.Response:
        import json

        path = request.url.path.removeprefix("/auth/v1")
        body = json.loads(request.content) if request.content else {}
        token = request.headers.get("authorization", "").removeprefix("Bearer ")
        if self.down or request.headers.get("apikey") != KEY:
            return super().__call__(request)
        if path == "/settings":
            self.calls.append((request.method, path, body, dict(request.headers)))
            return httpx.Response(
                200,
                json={
                    "mailer_autoconfirm": self.autoconfirm,
                    "external": {"email": True, **self.social},
                },
            )
        if path == "/user" and request.method == "GET":
            email = self.by_token(token)
            return (
                httpx.Response(200, json=self.user_json(email))
                if email
                else httpx.Response(401, json={})
            )
        if path == "/factors" and request.method == "POST":
            email = self.by_token(token)
            if email is None:
                return httpx.Response(401, json={})
            factor = f"factor-{self.users[email]['id']}"
            self.users[email].setdefault("factors", {})[factor] = "unverified"
            uri = f"otpauth://totp/SeatPlan:{email}?secret=JBSWY3DPEHPK3PXP&issuer=SeatPlan"
            return httpx.Response(
                200, json={"id": factor, "totp": {"secret": "JBSWY3DPEHPK3PXP", "uri": uri}}
            )
        if path.startswith("/factors/") and path.endswith("/challenge"):
            return (
                httpx.Response(200, json={"id": "challenge-1"})
                if self.by_token(token)
                else httpx.Response(401, json={})
            )
        if path.startswith("/factors/") and path.endswith("/verify"):
            email = self.by_token(token)
            if email is None:
                return httpx.Response(401, json={})
            if body.get("code") != "123456":
                return httpx.Response(400, json={"error_code": "mfa_verification_failed"})
            factor = path.split("/")[2]
            self.users[email].setdefault("factors", {})[factor] = "verified"
            return httpx.Response(
                200,
                json={
                    "access_token": "aal2-" + self.users[email]["id"],
                    "user": self.user_json(email),
                },
            )
        if path.startswith("/factors/") and request.method == "DELETE":
            if not token.startswith("aal2-"):
                return httpx.Response(
                    401, json={}
                )  # only a token that passed the second step may remove it
            email = self.by_token(token)
            self.users[email]["factors"].pop(path.split("/")[2], None)
            return httpx.Response(200, json={})
        return super().__call__(request)


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> FakeSocial:
    fake = FakeSocial()
    client = SupabaseAuth(URL, KEY, httpx.Client(transport=httpx.MockTransport(fake)))
    monkeypatch.setattr(router, "get_client", lambda: client)
    router._ready.clear()
    return fake


# ================================================================== Google and Apple


NONCE = "n" * 20


def _oauth_user(
    fake: FakeSocial,
    email: str = "social@example.com",
    name: str = "Sam Social",
    confirmed: bool = True,
) -> str:
    fake.users[email] = {"id": f"uid-{len(fake.users) + 1}", "password": "unused", "name": name}
    if confirmed:
        fake.confirm(email)
    fake.oauth_tokens["social-token-123"] = email
    return "social-token-123"


def test_only_the_social_sign_ins_the_project_has_switched_on_are_offered(
    client: TestClient, fake: FakeSocial
) -> None:
    assert client.get("/api/identity/config").json()["oauth"] == ["google"]
    fake.social = {"google": True, "apple": True}
    router._ready.clear()
    assert client.get("/api/identity/config").json()["oauth"] == ["google", "apple"]
    fake.social = {"google": False, "apple": False}
    router._ready.clear()
    assert client.get("/api/identity/config").json()["oauth"] == []


def test_the_button_sends_the_browser_to_the_service_and_back_to_the_site_with_a_nonce(
    client: TestClient, fake: FakeSocial
) -> None:
    answer = client.post(
        "/api/identity/owner/oauth/start", json={"provider": "google", "nonce": NONCE}
    )
    assert answer.status_code == 200
    url = answer.json()["url"]
    assert url.startswith(f"{URL}/auth/v1/authorize?provider=google&redirect_to=")
    assert f"%2Fowner%2Fsign-in%2Fcallback%3Fn%3D{NONCE}" in url
    assert KEY not in url  # no key in an address the browser sees


@pytest.mark.parametrize(
    "body",
    [
        {"provider": "apple", "nonce": NONCE},  # not switched on in the project
        {"provider": "facebook", "nonce": NONCE},  # not one we offer
        {"provider": "google", "nonce": "short"},
        {"provider": "google", "nonce": "bad nonce with spaces!"},
        {"provider": "google", "nonce": "x" * 80},
    ],
)
def test_a_sign_in_that_is_not_offered_or_has_no_proper_nonce_is_refused(
    client: TestClient, fake: FakeSocial, body: dict[str, str]
) -> None:
    assert client.post("/api/identity/owner/oauth/start", json=body).status_code == 422


def test_a_google_sign_in_makes_the_account_with_the_name_google_gave(
    client: TestClient, session: Session, fake: FakeSocial
) -> None:
    token = _oauth_user(fake)
    answer = client.post("/api/identity/owner/oauth", json={"access_token": token})
    assert answer.status_code == 200, answer.text
    assert answer.json()["user"] == {
        "email": "social@example.com",
        "name": "Sam Social",
        "role": "organiser",
    }
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {answer.json()['token']}"})
    assert me.status_code == 200
    session.expire_all()
    assert session.scalars(select(AuthIdentity)).one().email == "social@example.com"


def test_a_token_the_service_does_not_know_opens_nothing(
    client: TestClient, session: Session, fake: FakeSocial
) -> None:
    answer = client.post("/api/identity/owner/oauth", json={"access_token": "made-up-token-123"})
    assert answer.status_code == 401
    session.expire_all()
    assert session.scalars(select(Organiser)).all() == []


def test_a_social_sign_in_whose_address_is_not_confirmed_opens_nothing(
    client: TestClient, session: Session, organiser: Organiser, fake: FakeSocial
) -> None:
    token = _oauth_user(
        fake, organiser.email, confirmed=False
    )  # claims an owner's address without proving it
    assert client.post("/api/identity/owner/oauth", json={"access_token": token}).status_code == 401
    session.expire_all()
    assert session.scalars(select(AuthIdentity)).all() == []


def test_a_confirmed_social_address_reaches_the_existing_account_with_that_address(
    client: TestClient, session: Session, organiser: Organiser, fake: FakeSocial
) -> None:
    token = _oauth_user(fake, organiser.email, "Same Person")
    answer = client.post("/api/identity/owner/oauth", json={"access_token": token})
    assert answer.status_code == 200
    session.expire_all()
    assert session.scalars(select(AuthIdentity)).one().organiser_id == organiser.id


# ================================================================== two-step verification


def _owner_with_second_step(
    client: TestClient, fake: FakeSocial, email: str = "owner@example.com"
) -> None:
    _signup(client, email)
    fake.confirm(email)
    fake.enrol(email)


def test_a_password_alone_is_not_enough_when_two_step_is_on(
    client: TestClient, session: Session, fake: FakeSocial
) -> None:
    _owner_with_second_step(client, fake)
    answer = _login(client)
    assert answer.status_code == 200
    body = answer.json()
    assert body["mfa_required"] is True and body["factor_id"].startswith("factor-")
    assert "token" not in body and "user" not in body  # no SeatPlan session yet
    session.expire_all()
    assert session.scalars(select(Organiser)).all() == []  # nothing made before the second step
    assert session.scalars(select(AuthIdentity)).all() == []


def test_a_google_sign_in_does_not_skip_the_second_step_either(
    client: TestClient, fake: FakeSocial
) -> None:
    token = _oauth_user(fake)
    fake.enrol("social@example.com")
    body = client.post("/api/identity/owner/oauth", json={"access_token": token}).json()
    assert body["mfa_required"] is True and "user" not in body


def test_the_right_code_finishes_the_sign_in_and_a_wrong_one_does_not(
    client: TestClient, session: Session, fake: FakeSocial
) -> None:
    _owner_with_second_step(client, fake)
    first = _login(client).json()
    asked = {"ticket": first["ticket"], "factor_id": first["factor_id"]}
    wrong = client.post("/api/identity/owner/mfa", json={**asked, "code": "000000"})
    assert (
        wrong.status_code == 401 and wrong.json()["error"]["message"] == "That code is not right."
    )
    session.expire_all()
    assert session.scalars(select(Organiser)).all() == []
    right = client.post("/api/identity/owner/mfa", json={**asked, "code": "123456"})
    assert right.status_code == 200, right.text
    assert right.json()["user"]["email"] == "owner@example.com"
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {right.json()['token']}"})
    assert me.status_code == 200
    session.expire_all()
    assert session.scalars(select(AuthIdentity)).one().mfa_enabled is True


@pytest.mark.parametrize("code", ["12345", "1234567", "abcdef", "", "123 456"])
def test_a_code_that_is_not_six_digits_is_refused_before_the_service_is_asked(
    client: TestClient, fake: FakeSocial, code: str
) -> None:
    _owner_with_second_step(client, fake)
    first = _login(client).json()
    sent = len(fake.calls)
    answer = client.post(
        "/api/identity/owner/mfa",
        json={"ticket": first["ticket"], "factor_id": first["factor_id"], "code": code},
    )
    assert answer.status_code == 422 and len(fake.calls) == sent


def test_a_made_up_ticket_gives_nothing(client: TestClient, fake: FakeSocial) -> None:
    answer = client.post(
        "/api/identity/owner/mfa",
        json={"ticket": "not-a-real-ticket-1", "factor_id": "factor-uid-1", "code": "123456"},
    )
    assert answer.status_code == 401


def test_code_guessing_is_limited(client: TestClient, fake: FakeSocial) -> None:
    _owner_with_second_step(client, fake)
    first = _login(client).json()
    codes = [
        client.post(
            "/api/identity/owner/mfa",
            json={"ticket": first["ticket"], "factor_id": first["factor_id"], "code": f"{i:06d}"},
        ).status_code
        for i in range(14)
    ]
    assert codes[0] == 401 and 429 in codes


def test_an_unverified_factor_does_not_ask_for_a_code(client: TestClient, fake: FakeSocial) -> None:
    """A setup that was started and never finished must not lock the owner out."""
    _signup(client)
    fake.confirm("owner@example.com")
    fake.enrol("owner@example.com", verified=False)
    assert "mfa_required" not in _login(client).json()


# ---- turning it on and off from the security page


def _signed_in(
    client: TestClient, fake: FakeSocial, email: str = "owner@example.com"
) -> dict[str, str]:
    _signup(client, email)
    fake.confirm(email)
    token = _login(client, email).json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_the_security_page_says_where_things_stand(client: TestClient, fake: FakeSocial) -> None:
    headers = _signed_in(client, fake)
    assert client.get("/api/identity/owner/security", headers=headers).json() == {
        "provider": "supabase",
        "linked": True,
        "two_step": False,
    }
    assert client.get("/api/identity/owner/security").status_code == 401


def test_turning_two_step_on_needs_the_password_and_then_a_first_code(
    client: TestClient, session: Session, fake: FakeSocial
) -> None:
    headers = _signed_in(client, fake)
    refused = client.post(
        "/api/identity/owner/security/start", json={"password": "not-the-password"}, headers=headers
    )
    assert refused.status_code == 401
    started = client.post(
        "/api/identity/owner/security/start", json={"password": "a-long-password"}, headers=headers
    )
    assert started.status_code == 200, started.text
    begun = started.json()
    assert begun["uri"].startswith("otpauth://totp/") and begun["secret"] == "JBSWY3DPEHPK3PXP"
    # Not on until a code from the app has been checked.
    assert client.get("/api/identity/owner/security", headers=headers).json()["two_step"] is False
    wrong = client.post(
        "/api/identity/owner/security/confirm",
        json={"ticket": begun["ticket"], "factor_id": begun["factor_id"], "code": "000000"},
        headers=headers,
    )
    assert wrong.status_code == 401
    ok = client.post(
        "/api/identity/owner/security/confirm",
        json={"ticket": begun["ticket"], "factor_id": begun["factor_id"], "code": "123456"},
        headers=headers,
    )
    assert ok.status_code == 204
    assert client.get("/api/identity/owner/security", headers=headers).json()["two_step"] is True
    # From now on the password alone is not enough.
    assert _login(client).json()["mfa_required"] is True
    # And it cannot be started twice.
    again = client.post(
        "/api/identity/owner/security/start", json={"password": "a-long-password"}, headers=headers
    )
    assert again.status_code == 409


def test_starting_twice_when_it_is_already_on_is_refused(
    client: TestClient, fake: FakeSocial
) -> None:
    headers = _signed_in(client, fake)
    fake.enrol("owner@example.com")
    again = client.post(
        "/api/identity/owner/security/start", json={"password": "a-long-password"}, headers=headers
    )
    assert again.status_code == 409


def test_turning_it_off_needs_the_password_and_a_current_code(
    client: TestClient, session: Session, fake: FakeSocial
) -> None:
    headers = _signed_in(client, fake)
    fake.enrol("owner@example.com")
    link = session.scalars(select(AuthIdentity)).one()
    link.mfa_enabled = True
    session.commit()
    no_code = client.post(
        "/api/identity/owner/security/disable",
        json={"password": "a-long-password", "code": "000000"},
        headers=headers,
    )
    assert no_code.status_code == 401
    no_password = client.post(
        "/api/identity/owner/security/disable",
        json={"password": "wrong-password", "code": "123456"},
        headers=headers,
    )
    assert no_password.status_code == 401
    assert fake.users["owner@example.com"]["factors"]  # still there
    off = client.post(
        "/api/identity/owner/security/disable",
        json={"password": "a-long-password", "code": "123456"},
        headers=headers,
    )
    assert off.status_code == 204
    assert fake.users["owner@example.com"]["factors"] == {}
    assert client.get("/api/identity/owner/security", headers=headers).json()["two_step"] is False
    assert "mfa_required" not in _login(client).json()


def test_the_security_routes_need_a_signed_in_owner_and_the_service(
    client: TestClient, fake: FakeSocial
) -> None:
    for path, body in (
        ("start", {"password": "x"}),
        ("disable", {"password": "x", "code": "123456"}),
    ):
        assert client.post(f"/api/identity/owner/security/{path}", json=body).status_code == 401


def test_an_owner_who_never_used_the_new_sign_in_is_told_to_do_that_first(
    client: TestClient, session: Session, organiser: Organiser, fake: FakeSocial
) -> None:
    headers = {"Authorization": f"Bearer {create_session_token(organiser.id)}"}
    started = client.post(
        "/api/identity/owner/security/start", json={"password": "x"}, headers=headers
    )
    assert started.status_code == 409
    assert client.get("/api/identity/owner/security", headers=headers).json()["linked"] is False


def test_the_built_in_sign_in_has_no_security_settings(
    client: TestClient, organiser: Organiser
) -> None:
    headers = {"Authorization": f"Bearer {create_session_token(organiser.id)}"}
    assert client.get("/api/identity/owner/security", headers=headers).json() == {
        "provider": "local",
        "linked": False,
        "two_step": False,
    }
    assert (
        client.post(
            "/api/identity/owner/security/start", json={"password": "x"}, headers=headers
        ).status_code
        == 404
    )


# ================================================================== a diner with Google or Apple


def test_a_diner_button_comes_back_to_the_diner_page(client: TestClient, fake: FakeSocial) -> None:
    answer = client.post(
        "/api/identity/diner/oauth/start", json={"provider": "google", "nonce": NONCE}
    )
    assert answer.status_code == 200
    assert f"%2Frestaurants%2Faccount%2Fcallback%3Fn%3D{NONCE}" in answer.json()["url"]
    assert KEY not in answer.json()["url"]
    assert (
        client.post(
            "/api/identity/diner/oauth/start", json={"provider": "apple", "nonce": NONCE}
        ).status_code
        == 422
    )  # a sign-in the project has not switched on


def test_a_first_google_sign_in_makes_a_diner_account_and_no_owner_account(
    client: TestClient, session: Session, fake: FakeSocial
) -> None:
    token = _oauth_user(fake, "diner@example.com", "Dana Diner")
    answer = client.post("/api/identity/diner/oauth", json={"access_token": token})
    assert answer.status_code == 200, answer.text
    assert answer.json()["account"]["email"] == "diner@example.com"
    assert answer.json()["account"]["name"] == "Dana Diner"
    me = client.get("/api/guest/me", headers={"Authorization": f"Bearer {answer.json()['token']}"})
    assert me.status_code == 200, me.text
    session.expire_all()
    account = session.scalars(select(GuestAccount)).one()
    assert account.email == "diner@example.com" and account.email_proven is True
    assert account.consent_at is not None and account.consent_version
    # Nothing in the owner's world was made or opened.
    assert session.scalars(select(Organiser)).all() == []
    assert session.scalars(select(AuthIdentity)).all() == []


def test_a_second_sign_in_and_an_older_account_use_the_same_diner_account(
    client: TestClient, session: Session, fake: FakeSocial
) -> None:
    older = GuestAccount(
        email="diner@example.com",
        name="Dana",
        password_hash=hash_password("a long old password"),
        consent_at=utc_now(),
        consent_version="2026-11-10",
    )
    session.add(older)
    session.commit()
    token = _oauth_user(fake, "diner@example.com", "Someone Else")
    first = client.post("/api/identity/diner/oauth", json={"access_token": token}).json()
    second = client.post("/api/identity/diner/oauth", json={"access_token": token}).json()
    assert (
        first["account"]["name"] == second["account"]["name"] == "Dana"
    )  # the account keeps its own name
    session.expire_all()
    assert len(session.scalars(select(GuestAccount)).all()) == 1
    # Its own password still works.
    assert (
        client.post(
            "/api/guest/login",
            json={"email": "diner@example.com", "password": "a long old password"},
        ).status_code
        == 200
    )


def test_an_unconfirmed_address_and_a_made_up_token_open_no_diner_account(
    client: TestClient, session: Session, fake: FakeSocial
) -> None:
    token = _oauth_user(fake, "diner@example.com", confirmed=False)
    assert client.post("/api/identity/diner/oauth", json={"access_token": token}).status_code == 401
    assert (
        client.post(
            "/api/identity/diner/oauth", json={"access_token": "made-up-token-123"}
        ).status_code
        == 401
    )
    session.expire_all()
    assert session.scalars(select(GuestAccount)).all() == []


def test_the_diner_button_does_not_open_an_account_that_has_two_step_verification(
    client: TestClient, session: Session, fake: FakeSocial
) -> None:
    token = _oauth_user(fake, "diner@example.com")
    fake.enrol("diner@example.com")
    answer = client.post("/api/identity/diner/oauth", json={"access_token": token})
    assert answer.status_code == 422
    session.expire_all()
    assert session.scalars(select(GuestAccount)).all() == []


def test_the_diner_routes_do_not_exist_while_the_built_in_sign_in_is_used(
    client: TestClient,
) -> None:
    assert (
        client.post("/api/identity/diner/oauth", json={"access_token": "x" * 12}).status_code == 404
    )
