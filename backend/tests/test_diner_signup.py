"""A diner makes an account from the restaurant side, with no event link.

The code step is the same one events use (/guest/verify), so a restaurant account is a guest account:
one sign-in works on both sides. Nothing here may change how an event sign-up behaves.
"""

from guest_helpers import GUEST_PASSWORD, make_account
from sqlalchemy import func, select

from app.models import EmailOutbox, GuestAccount

BODY = {
    "name": "Ana Diner",
    "email": "ana@example.com",
    "password": GUEST_PASSWORD,
    "consent": True,
}


def sign_up(client, **changes):
    return client.post("/api/diner/sign-up", json={**BODY, **changes})


def verify(client, sent, code=None):
    body = {
        "email": BODY["email"],
        "code": code or sent["demo_code"],
        "signup_id": sent["signup_id"],
    }
    return client.post("/api/guest/verify", json=body)


def test_sign_up_then_code_makes_a_signed_in_account_that_joins_nothing(client, session):
    answer = sign_up(client)
    assert answer.status_code == 202
    sent = answer.json()
    assert sent["status"] == "code_sent" and sent["signup_id"] and sent["sent_to"] != BODY["email"]
    assert (
        session.scalar(select(func.count()).select_from(GuestAccount)) == 0
    )  # nothing until the code
    done = verify(client, sent)
    assert done.status_code == 201, done.text
    assert done.json()["join"]["event_id"] is None
    token = done.json()["token"]
    account = session.scalar(select(GuestAccount).where(GuestAccount.email == BODY["email"]))
    assert account.name == "Ana Diner"
    # The same session opens the restaurant history.
    mine = client.get("/api/diner/bookings", headers={"Authorization": f"Bearer {token}"})
    assert mine.status_code == 200 and mine.json()["items"] == []


def test_the_terms_box_and_a_decent_password_are_required(client):
    assert sign_up(client, consent=False).status_code == 422
    body = {k: v for k, v in BODY.items() if k != "consent"}
    assert client.post("/api/diner/sign-up", json=body).status_code == 422
    assert sign_up(client, password="short").status_code == 422
    assert sign_up(client, password=BODY["email"]).status_code == 422
    assert sign_up(client, name="   ").status_code == 422
    assert sign_up(client, email="not-an-email").status_code == 422
    assert sign_up(client, unknown="field").status_code == 422


def test_an_existing_address_gets_the_same_answer_and_a_note_not_a_code(client, session):
    make_account(session, "ana@example.com")
    answer = sign_up(client)
    assert answer.status_code == 202
    assert "demo_code" not in answer.json()
    kinds = session.scalars(
        select(EmailOutbox.kind).where(EmailOutbox.to_email == "ana@example.com")
    ).all()
    assert kinds == ["account_exists"]
    assert session.scalar(select(func.count()).select_from(GuestAccount)) == 1


def test_the_code_only_works_from_the_browser_that_asked_for_it(client, session):
    sent = sign_up(client).json()
    wrong = verify(client, {**sent, "signup_id": "someone-elses-id"})
    assert wrong.status_code == 404
    assert session.scalar(select(func.count()).select_from(GuestAccount)) == 0
    assert verify(client, sent, code="000000").status_code == 422
    assert verify(client, sent).status_code == 201


def test_a_demo_code_shown_on_screen_proves_nothing_about_the_inbox(client, session):
    sent = sign_up(client).json()
    verify(client, sent)
    account = session.scalar(select(GuestAccount).where(GuestAccount.email == BODY["email"]))
    assert account.email_proven is False  # so it never claims bookings made with that address


def test_asking_for_codes_is_limited_per_inbox_and_per_network(client):
    same = [sign_up(client).status_code for _ in range(5)]
    assert same[:3] == [202, 202, 202] and 429 in same[3:]
    many = [sign_up(client, email=f"user{n}@example.com").status_code for n in range(70)]
    assert 429 in many
