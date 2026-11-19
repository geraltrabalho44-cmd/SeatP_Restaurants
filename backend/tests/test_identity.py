"""Sign-in for owners and staff through Supabase Auth, tested against a small fake of its API
(httpx.MockTransport): nothing leaves the machine, and every request SeatPlan sends can be inspected."""

import json
from typing import Any

import httpx
import pytest
from conftest import make_user
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth_providers.supabase import Identity, SupabaseAuth
from app.config import load_settings
from app.models import AuthIdentity, Organiser
from app.restaurant_service import identity as identity_service
from app.routers import identity as router

URL = "https://project.supabase.co"
KEY = "anon-key-123"


class FakeSupabase:
    """Just enough of Supabase's sign-in API: sign up, confirm, sign in, reset, settings."""

    def __init__(self, autoconfirm: bool = False) -> None:
        self.autoconfirm = autoconfirm
        self.users: dict[str, dict[str, Any]] = {}
        self.calls: list[tuple[str, str, dict[str, Any], dict[str, str]]] = []
        self.down = False
        self.recovery_tokens = {"good-recovery-token"}

    def confirm(self, email: str) -> None:
        self.users[email]["email_confirmed_at"] = "2026-11-19T10:00:00Z"

    def user_json(self, email: str) -> dict[str, Any]:
        u = self.users[email]
        return {
            "id": u["id"],
            "email": email,
            "email_confirmed_at": u.get("email_confirmed_at"),
            "user_metadata": {"name": u["name"]},
        }

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if self.down:
            raise httpx.ConnectError("down", request=request)
        body = json.loads(request.content) if request.content else {}
        path = request.url.path.removeprefix("/auth/v1")
        self.calls.append((request.method, path, body, dict(request.headers)))
        if request.headers.get("apikey") != KEY:
            return httpx.Response(401, json={"msg": "no key"})
        if path == "/settings":
            return httpx.Response(200, json={"mailer_autoconfirm": self.autoconfirm})
        if path == "/signup":
            email = body["email"]
            if len(body["password"]) < 6:
                return httpx.Response(422, json={"error_code": "weak_password"})
            if email not in self.users:  # an existing address is answered the same way
                self.users[email] = {
                    "id": f"uid-{len(self.users) + 1}",
                    "password": body["password"],
                    "name": body["data"]["name"],
                }
                if self.autoconfirm:
                    self.confirm(email)
            return httpx.Response(200, json={"id": "x", "email": email})
        if path == "/token":
            user = self.users.get(body["email"])
            if (
                user is None
                or user["password"] != body["password"]
                or not user.get("email_confirmed_at")
            ):
                return httpx.Response(400, json={"error_code": "invalid_credentials"})
            return httpx.Response(
                200,
                json={
                    "access_token": "jwt-for-" + user["id"],
                    "user": self.user_json(body["email"]),
                },
            )
        if path == "/recover":
            return httpx.Response(200, json={})
        if path == "/user" and request.method == "PUT":
            token = request.headers.get("authorization", "").removeprefix("Bearer ")
            if token not in self.recovery_tokens:
                return httpx.Response(401, json={"msg": "bad token"})
            return httpx.Response(200, json={})
        return httpx.Response(404, json={})


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> FakeSupabase:
    fake = FakeSupabase()
    client = SupabaseAuth(URL, KEY, httpx.Client(transport=httpx.MockTransport(fake)))
    monkeypatch.setattr(router, "get_client", lambda: client)
    router._ready.clear()
    return fake


def _signup(client: TestClient, email: str = "owner@example.com", **over: Any) -> Any:
    body = {
        "name": "Olga Owner",
        "email": email,
        "password": "a-long-password",
        "consent": True,
        **over,
    }
    return client.post("/api/identity/owner/signup", json=body)


def _login(
    client: TestClient, email: str = "owner@example.com", password: str = "a-long-password"
) -> Any:
    return client.post("/api/identity/owner/login", json={"email": email, "password": password})


# ------------------------------------------------------------------ off by default


def test_the_built_in_sign_in_is_the_default_and_the_other_routes_do_not_exist(
    client: TestClient,
) -> None:
    assert client.get("/api/identity/config").json() == {
        "provider": "local",
        "password_reset": False,
        "oauth": [],
        "two_step": False,
    }
    assert _signup(client).status_code == 404
    assert _login(client).status_code == 404
    assert (
        client.post("/api/identity/owner/reset", json={"email": "a@example.com"}).status_code == 404
    )
    assert (
        client.post(
            "/api/auth/login", json={"email": "nobody@example.com", "password": "x"}
        ).status_code
        == 401
    )


def test_the_app_refuses_a_half_set_sign_in_service(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AUTH_PROVIDER", "carrier-pigeon")
    with pytest.raises(RuntimeError, match="AUTH_PROVIDER"):
        load_settings()
    monkeypatch.setenv("AUTH_PROVIDER", "supabase")
    with pytest.raises(RuntimeError, match="SUPABASE_URL and SUPABASE_ANON_KEY"):
        load_settings()
    monkeypatch.setenv("SUPABASE_URL", "http://project.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", KEY)
    with pytest.raises(RuntimeError, match="https"):
        load_settings()
    monkeypatch.setenv("SUPABASE_URL", "http://localhost:54321")  # a local Supabase for development
    assert load_settings().auth_provider == "supabase"
    assert KEY not in repr(load_settings())


# ------------------------------------------------------------------ signing up and in


def test_signing_up_sends_the_service_a_confirmation_and_makes_no_account_yet(
    client: TestClient, session: Session, fake: FakeSupabase
) -> None:
    assert client.get("/api/identity/config").json() == {
        "provider": "supabase",
        "password_reset": True,
        "oauth": [],
        "two_step": True,
    }
    answer = _signup(client)
    assert answer.status_code == 202 and answer.json() == {"status": "check_email"}
    _method, _path, body, headers = next(c for c in fake.calls if c[1] == "/signup")
    assert body["email"] == "owner@example.com" and body["data"] == {"name": "Olga Owner"}
    assert headers["apikey"] == KEY  # the project's public key, never any other
    session.expire_all()
    assert (
        session.scalar(
            select(func.count())
            .select_from(Organiser)
            .where(Organiser.email == "owner@example.com")
        )
        == 0
    )


def test_the_same_answer_whether_or_not_the_address_has_an_account(
    client: TestClient, fake: FakeSupabase
) -> None:
    first = _signup(client)
    again = _signup(client, name="Someone Else")
    assert first.status_code == again.status_code == 202 and first.json() == again.json()


@pytest.mark.parametrize(
    "bad", [{"password": "short"}, {"consent": False}, {"name": ""}, {"email": "not-an-email"}]
)
def test_a_bad_sign_up_is_refused(
    client: TestClient, fake: FakeSupabase, bad: dict[str, Any]
) -> None:
    assert _signup(client, **bad).status_code == 422
    assert not any(c[1] == "/signup" for c in fake.calls)  # refused before the service was asked


def test_an_unconfirmed_account_cannot_sign_in_and_is_told_nothing_more(
    client: TestClient, session: Session, fake: FakeSupabase
) -> None:
    _signup(client)
    unconfirmed = _login(client)
    wrong = _login(client, password="not-the-password")
    unknown = _login(client, email="nobody@example.com")
    for answer in (unconfirmed, wrong, unknown):
        assert answer.status_code == 401
        assert answer.json()["error"]["message"] == "Email or password is not correct."
    session.expire_all()
    assert session.scalars(select(AuthIdentity)).all() == []


def test_the_first_confirmed_sign_in_makes_the_account_and_gives_a_session(
    client: TestClient, session: Session, fake: FakeSupabase
) -> None:
    _signup(client)
    fake.confirm("owner@example.com")
    answer = _login(client)
    assert answer.status_code == 200, answer.text
    body = answer.json()
    assert body["user"] == {"email": "owner@example.com", "name": "Olga Owner", "role": "organiser"}
    # The token is SeatPlan's own: every other page works with it, as for any owner.
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {body['token']}"})
    assert me.status_code == 200 and me.json()["email"] == "owner@example.com"
    session.expire_all()
    assert (
        session.scalar(
            select(func.count())
            .select_from(Organiser)
            .where(Organiser.email == "owner@example.com")
        )
        == 1
    )
    link = session.scalars(select(AuthIdentity)).one()
    assert link.subject == "uid-1" and link.provider == "supabase"


def test_signing_in_again_uses_the_same_account(
    client: TestClient, session: Session, fake: FakeSupabase
) -> None:
    _signup(client)
    fake.confirm("owner@example.com")
    first, second = _login(client).json(), _login(client).json()
    assert first["user"] == second["user"]
    session.expire_all()
    assert session.scalar(select(func.count()).select_from(Organiser)) == 1
    assert session.scalar(select(func.count()).select_from(AuthIdentity)) == 1


def test_an_account_made_the_old_way_is_linked_by_its_confirmed_address(
    client: TestClient, session: Session, organiser: Organiser, fake: FakeSupabase
) -> None:
    _signup(client, organiser.email)
    fake.confirm(organiser.email)
    answer = _login(client, organiser.email)
    assert answer.status_code == 200
    session.expire_all()
    assert (
        session.scalar(
            select(func.count()).select_from(Organiser).where(Organiser.email == organiser.email)
        )
        == 1
    )
    assert session.scalars(select(AuthIdentity)).one().organiser_id == organiser.id
    # The restaurants of that owner are reachable with the new session.
    token = answer.json()["token"]
    assert (
        client.get(
            "/api/owner/restaurants", headers={"Authorization": f"Bearer {token}"}
        ).status_code
        == 200
    )


def test_staff_can_sign_in_through_the_service_too(
    client: TestClient, session: Session, fake: FakeSupabase
) -> None:
    staff = make_user(session, "waiter@example.com", role="staff")
    session.commit()
    _signup(client, "waiter@example.com")
    fake.confirm("waiter@example.com")
    answer = _login(client, "waiter@example.com")
    assert answer.status_code == 200 and answer.json()["user"]["role"] == "staff"
    session.expire_all()
    assert session.scalars(select(AuthIdentity)).one().organiser_id == staff.id


def test_other_kinds_of_account_cannot_be_reached_through_the_service(
    client: TestClient, session: Session, fake: FakeSupabase
) -> None:
    make_user(session, "admin@example.com", role="admin")
    session.commit()
    _signup(client, "admin@example.com")
    fake.confirm("admin@example.com")
    assert _login(client, "admin@example.com").status_code == 401


def test_nothing_is_made_or_linked_for_an_unconfirmed_identity(
    session: Session, organiser: Organiser
) -> None:
    for email in (organiser.email, "new@example.com"):
        with pytest.raises(Exception) as error:
            identity_service.organiser_for(
                session, Identity("uid-9", email, "X", email_confirmed=False)
            )
        assert getattr(error.value, "status", None) == 401
    assert session.scalars(select(AuthIdentity)).all() == []
    assert session.scalar(select(Organiser).where(Organiser.email == "new@example.com")) is None


def test_the_same_person_keeps_their_account_when_their_address_changes(
    client: TestClient, session: Session, fake: FakeSupabase
) -> None:
    _signup(client)
    fake.confirm("owner@example.com")
    first = _login(client).json()["user"]
    # Supabase now reports the same person (same id) under another address.
    user = fake.users.pop("owner@example.com")
    fake.users["new.address@example.com"] = user
    again = _login(client, "new.address@example.com").json()["user"]
    assert again["email"] == first["email"] == "owner@example.com"


# ------------------------------------------------------------------ safety


def test_a_project_that_does_not_ask_for_confirmation_is_refused(
    client: TestClient, session: Session, fake: FakeSupabase
) -> None:
    """With "Confirm email" off, anyone could sign up with somebody else's address: so nothing works."""
    fake.autoconfirm = True
    for call in (lambda: _signup(client), lambda: _login(client)):
        answer = call()
        assert (
            answer.status_code == 503 and answer.json()["error"]["code"] == "identity_unavailable"
        )
    session.expire_all()
    assert session.scalars(select(Organiser)).all() == []
    assert not any(c[1] in ("/signup", "/token") for c in fake.calls)


def test_when_the_service_is_down_the_owner_is_told_and_nothing_breaks(
    client: TestClient, fake: FakeSupabase
) -> None:
    _signup(client)
    fake.confirm("owner@example.com")
    fake.down = True
    router._ready.clear()
    answer = _login(client)
    assert answer.status_code == 502 and answer.json()["error"]["code"] == "identity_unavailable"
    assert KEY not in answer.text
    # The built-in sign-in is untouched.
    assert (
        client.post(
            "/api/auth/login", json={"email": "owner@example.com", "password": "x"}
        ).status_code
        == 401
    )


def test_the_key_never_shows_in_repr_or_errors() -> None:
    service = SupabaseAuth(
        URL, KEY, httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(500)))
    )
    assert KEY not in repr(service)


def test_sign_in_attempts_are_limited(client: TestClient, fake: FakeSupabase) -> None:
    codes = [_login(client, password=f"guess-{i}").status_code for i in range(14)]
    assert 429 in codes
    assert codes[0] == 401


# ------------------------------------------------------------------ forgotten passwords


def test_a_reset_is_requested_for_anyone_and_says_the_same_to_all(
    client: TestClient, fake: FakeSupabase
) -> None:
    known, unknown = (
        client.post("/api/identity/owner/reset", json={"email": e})
        for e in ("owner@example.com", "nobody@example.com")
    )
    assert known.status_code == unknown.status_code == 202 and known.json() == unknown.json()
    _, _, body, _ = next(c for c in fake.calls if c[1] == "/recover")
    assert body == {"email": "owner@example.com"}


def test_a_new_password_needs_the_token_from_the_link(
    client: TestClient, fake: FakeSupabase
) -> None:
    ok = client.post(
        "/api/identity/owner/set-password",
        json={"token": "good-recovery-token", "password": "a-new-long-password"},
    )
    assert ok.status_code == 204
    old = client.post(
        "/api/identity/owner/set-password",
        json={"token": "expired-token-xxxx", "password": "a-new-long-password"},
    )
    assert old.status_code == 401 and "expired" in old.json()["error"]["message"]
    weak = client.post(
        "/api/identity/owner/set-password",
        json={"token": "good-recovery-token", "password": "short"},
    )
    assert weak.status_code == 422
    # It sets a password; it never signs anyone in.
    assert "token" not in ok.text
