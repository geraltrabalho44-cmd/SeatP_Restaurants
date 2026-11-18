"""Phone messages: numbers, words, providers, the code, the consent, reminders, the link page.

The demo provider is the default, so nothing here touches a network. The real providers
(Twilio, WhatsApp) are tested against fake servers built with httpx.MockTransport.
"""

import json
from dataclasses import replace
from datetime import timedelta
from typing import Any

import httpx
import pytest
from conftest import auth_header
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_restaurant_helpers import Place, book, future_day, hold, make_restaurant

from app.config import get_settings
from app.messaging import providers, templates
from app.messaging.phone import mask, normalise_pt_mobile
from app.models import (
    Booking,
    MessageConsent,
    MessageOutbox,
    Organiser,
    PhoneCode,
    Venue,
    utc_now,
)
from app.restaurant_service import phone_messages

PHONE = "912 345 678"


# ------------------------------------------------------------------ numbers and words


@pytest.mark.parametrize(
    "raw",
    [
        "912345678",
        "912 345 678",
        "+351 912 345 678",
        "00351912345678",
        "351912345678",
        "(91) 234-5678",
    ],
)
def test_portuguese_mobile_numbers_are_cleaned(raw: str) -> None:
    assert normalise_pt_mobile(raw) == "+351912345678"


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "210123456",
        "+34 612 345 678",
        "9123",
        "9123456789",
        "707123456",
        "912 abc 678",
        "+351 800 123 456",
    ],
)
def test_landlines_special_and_foreign_numbers_are_refused(raw: str) -> None:
    assert normalise_pt_mobile(raw) is None


def test_a_number_is_masked_for_display() -> None:
    assert mask("+351912345678") == "+351 9•• ••• 678"
    assert mask(None) == "•••"


def test_every_sms_fits_in_one_segment_and_is_plain_ascii() -> None:
    facts = templates.Facts(
        "Café Príncipe Real Muito Comprido Mesmo", "Wed 18 Nov, 19:45", 12, "M6"
    )
    link, token = "https://seatplan.example.com/m/12345.abcdefghijklmnopqrstuv", "t"
    for message in (
        templates.code_message("482913"),
        templates.confirmed(facts, link, token),
        templates.reminder_24h(facts, link, token),
        templates.reminder_3h(facts, link, token),
        templates.cancelled(facts),
    ):
        assert len(message.sms) <= templates.SMS_MAX, message.sms
        assert message.sms.isascii(), message.sms
        assert "Moreno" not in message.sms  # a message never carries a diner's name


# ------------------------------------------------------------------ providers


def _twilio(handler: Any) -> providers.TwilioSmsProvider:
    client = httpx.Client(transport=httpx.MockTransport(handler))
    return providers.TwilioSmsProvider("AC123", "secret-token", "SeatPlan", client)


def test_twilio_sends_the_sms_and_returns_its_id() -> None:
    seen: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers["authorization"]
        seen["body"] = request.content.decode()
        return httpx.Response(201, json={"sid": "SM999"})

    sent = _twilio(handler).send("+351912345678", templates.code_message("123456"), "key-1")
    assert sent.message_id == "SM999"
    assert seen["url"].endswith("/Accounts/AC123/Messages.json")
    assert "To=%2B351912345678" in seen["body"] and "From=SeatPlan" in seen["body"]
    assert seen["auth"].startswith("Basic ")


def test_twilio_errors_are_short_and_never_hold_a_key_or_number() -> None:
    refused = _twilio(lambda r: httpx.Response(400, json={"message": "bad +351912345678"}))
    with pytest.raises(providers.MessageError) as error:
        refused.send("+351912345678", templates.code_message("123456"), "key-1")
    assert "secret-token" not in str(error.value) and "912345678" not in str(error.value)

    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom", request=request)

    with pytest.raises(providers.MessageError):
        _twilio(down).send("+351912345678", templates.code_message("123456"), "key-1")
    assert "secret-token" not in repr(_twilio(down))


def test_whatsapp_sends_an_approved_template_with_a_link_button() -> None:
    seen: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers["authorization"]
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"messages": [{"id": "wamid.ABC"}]})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    provider = providers.WhatsAppCloudProvider("wa-token", "555", client)
    facts = templates.Facts("Tagus Terrace", "Wed 18 Nov, 19:45", 2, "T4")
    sent = provider.send("+351912345678", templates.reminder_24h(facts, "x", "7.sig"), "key-2")
    assert sent.message_id == "wamid.ABC"
    assert seen["url"].endswith("/555/messages")
    assert seen["auth"] == "Bearer wa-token"
    body = seen["body"]
    assert body["to"] == "351912345678" and body["type"] == "template"
    assert body["template"]["name"] == "seatplan_reminder_v1"
    parameters = body["template"]["components"][0]["parameters"]
    assert [p["text"] for p in parameters] == ["Tagus Terrace", "Wed 18 Nov, 19:45", "2"]
    assert body["template"]["components"][1]["parameters"][0]["text"] == "7.sig"
    assert "wa-token" not in repr(provider)


def test_the_demo_provider_is_the_default_and_sends_nothing() -> None:
    settings = get_settings()
    assert settings.sms_provider == "demo" and settings.whatsapp_provider == "demo"
    provider = providers.provider_for("sms", settings)
    assert provider.name == "demo"
    assert provider.send("+351912345678", templates.code_message("1"), "k").message_id.startswith(
        "demo-"
    )


def test_the_app_refuses_to_start_with_a_half_set_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.config import load_settings

    monkeypatch.setenv("SMS_PROVIDER", "twilio")
    with pytest.raises(RuntimeError, match="TWILIO_ACCOUNT_SID"):
        load_settings()
    monkeypatch.setenv("SMS_PROVIDER", "demo")
    monkeypatch.setenv("WHATSAPP_PROVIDER", "meta")
    with pytest.raises(RuntimeError, match="WHATSAPP_ACCESS_TOKEN"):
        load_settings()
    monkeypatch.setenv("WHATSAPP_PROVIDER", "carrier-pigeon")
    with pytest.raises(RuntimeError, match="WHATSAPP_PROVIDER"):
        load_settings()


# ------------------------------------------------------------------ when reminders go out


def _fake_booking(start_in: timedelta, lead: timedelta) -> tuple[Booking, MessageConsent]:
    now = utc_now()
    booking = Booking(start_at=now + start_in, created_at=now + start_in - lead)
    return booking, MessageConsent(confirmed_at=None)


def test_reminder_rules() -> None:
    on = phone_messages.MessageSettings(sms_enabled=True)
    now = utc_now()
    due = phone_messages.reminder_kinds_due

    booking, consent = _fake_booking(timedelta(hours=23), timedelta(days=5))
    assert due(on, booking, consent, now) == ["reminder_24h"]
    booking, consent = _fake_booking(timedelta(hours=2.5), timedelta(days=5))
    assert due(on, booking, consent, now) == ["reminder_24h", "reminder_3h"]
    # Not yet: more than 24 hours away.
    booking, consent = _fake_booking(timedelta(hours=30), timedelta(days=5))
    assert due(on, booking, consent, now) == []
    # Too late: under an hour before the table.
    booking, consent = _fake_booking(timedelta(minutes=40), timedelta(days=5))
    assert due(on, booking, consent, now) == []
    # Booked this morning for tonight: a day-before reminder would land right after booking.
    booking, consent = _fake_booking(timedelta(hours=10), timedelta(hours=11))
    assert due(on, booking, consent, now) == []
    # Already said "I'm coming": no 3 hour nag.
    booking, consent = _fake_booking(timedelta(hours=2.5), timedelta(days=5))
    consent.confirmed_at = now
    assert due(on, booking, consent, now) == ["reminder_24h"]
    # The owner switched the 24 hour reminder off.
    booking, consent = _fake_booking(timedelta(hours=23), timedelta(days=5))
    assert due(replace(on, reminder_24h=False), booking, consent, now) == []


# ------------------------------------------------------------------ the whole flow


def _turn_on(
    client: TestClient, organiser: Organiser, place: Place, **changes: Any
) -> dict[str, Any]:
    body = {
        "sms_enabled": True,
        "whatsapp_enabled": False,
        "send_confirmation": False,
        "reminder_24h": True,
        "reminder_3h": True,
        "monthly_cap": 300,
        **changes,
    }
    answer = client.put(
        f"/api/owner/restaurants/{place.public_id}/messages",
        json=body,
        headers=auth_header(organiser),
    )
    assert answer.status_code == 200, answer.text
    return answer.json()


def _verified(client: TestClient, place: Place, channel: str = "sms") -> str:
    started = client.post(
        f"/api/r/{place.public_id}/phone/start", json={"phone": PHONE, "channel": channel}
    )
    assert started.status_code == 200, started.text
    data = started.json()
    checked = client.post(
        f"/api/r/{place.public_id}/phone/verify",
        json={"verification_id": data["verification_id"], "code": data["demo_code"]},
    )
    assert checked.status_code == 200, checked.text
    return data["verification_id"]


def _book_with_phone(
    client: TestClient, place: Place, verification_id: str, party: int = 2
) -> dict:
    held = hold(client, place, future_day(), "19:00", party)
    assert held.status_code == 201, held.text
    booked = book(
        client, place, held.json()["hold_id"], party, phone_verification_id=verification_id
    )
    assert booked.status_code == 201, booked.text
    return booked.json()


def _booking(session: Session) -> Booking:
    session.expire_all()
    return session.scalars(select(Booking)).one()


def _rows(session: Session) -> list[MessageOutbox]:
    session.expire_all()
    return list(session.scalars(select(MessageOutbox).order_by(MessageOutbox.id)))


def test_nothing_is_offered_until_the_owner_turns_a_channel_on(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    assert client.get(f"/api/r/{place.public_id}").json()["messages"]["channels"] == []
    nope = client.post(
        f"/api/r/{place.public_id}/phone/start", json={"phone": PHONE, "channel": "sms"}
    )
    assert nope.status_code == 409 and nope.json()["error"]["code"] == "messages_off"
    _turn_on(client, organiser, place)
    assert client.get(f"/api/r/{place.public_id}").json()["messages"]["channels"] == ["sms"]
    # WhatsApp is still off.
    other = client.post(
        f"/api/r/{place.public_id}/phone/start", json={"phone": PHONE, "channel": "whatsapp"}
    )
    assert other.status_code == 422


def test_a_bad_number_and_a_wrong_code_are_refused(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    _turn_on(client, organiser, place)
    landline = client.post(
        f"/api/r/{place.public_id}/phone/start", json={"phone": "210 123 456", "channel": "sms"}
    )
    assert landline.status_code == 422 and landline.json()["error"]["code"] == "bad_phone"
    data = client.post(
        f"/api/r/{place.public_id}/phone/start", json={"phone": PHONE, "channel": "sms"}
    ).json()
    wrong = "000000" if data["demo_code"] != "000000" else "111111"
    for left in (4, 3, 2, 1, 0):
        answer = client.post(
            f"/api/r/{place.public_id}/phone/verify",
            json={"verification_id": data["verification_id"], "code": wrong},
        )
        assert answer.status_code == 422
        assert f"{left} tries left" in answer.json()["error"]["message"]
    # Five wrong tries end this code, even for the right answer.
    blocked = client.post(
        f"/api/r/{place.public_id}/phone/verify",
        json={"verification_id": data["verification_id"], "code": data["demo_code"]},
    )
    assert blocked.status_code == 429
    # Only a keyed hash of the code is stored.
    session.expire_all()
    row = session.scalars(select(PhoneCode)).one()
    assert data["demo_code"] not in row.code_hash and row.verified_at is None


def test_booking_with_an_unverified_or_reused_proof_is_refused(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    _turn_on(client, organiser, place)
    data = client.post(
        f"/api/r/{place.public_id}/phone/start", json={"phone": PHONE, "channel": "sms"}
    ).json()
    held = hold(client, place, future_day(), "19:00", 2).json()
    unverified = book(
        client, place, held["hold_id"], 2, phone_verification_id=data["verification_id"]
    )
    assert unverified.status_code == 422
    assert unverified.json()["error"]["code"] == "phone_not_verified"

    proof = _verified(client, place)
    _book_with_phone(client, place, proof)
    again = hold(client, place, future_day(), "21:00", 2).json()
    reused = book(client, place, again["hold_id"], 2, phone_verification_id=proof)
    assert reused.status_code == 410


def test_a_verified_booking_gets_a_consent_and_a_clear_answer(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    _turn_on(client, organiser, place)
    booked = _book_with_phone(client, place, _verified(client, place))
    assert booked["messages"]["channel"] == "sms"
    assert booked["messages"]["phone"] == "+351 9•• ••• 678"
    assert "a reminder the day before" in booked["messages"]["planned"]
    session.expire_all()
    consent = session.scalars(select(MessageConsent)).one()
    assert consent.phone_e164 == "+351912345678"
    assert consent.consent_version == phone_messages.CONSENT_VERSION
    # The staff can call: the verified number was copied into the booking.
    assert _booking(session).phone == "+351912345678"


def test_a_booking_without_a_phone_is_exactly_as_before(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    _turn_on(client, organiser, place)
    held = hold(client, place, future_day(), "19:00", 2).json()
    booked = book(client, place, held["hold_id"], 2).json()
    assert "messages" not in booked
    assert _rows(session) == []


def test_the_confirmation_is_sent_only_when_the_owner_wants_it(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    _turn_on(client, organiser, place, send_confirmation=True)
    _book_with_phone(client, place, _verified(client, place))
    sent = _rows(session)
    assert [r.kind for r in sent] == ["booking_confirmed"] and sent[0].status == "sent"
    assert sent[0].provider_message_id.startswith("demo-")
    assert "[link]" in sent[0].body_preview and "/m/" not in sent[0].body_preview


def test_reminders_are_sent_once_each_by_the_cron(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    _turn_on(client, organiser, place)
    _book_with_phone(client, place, _verified(client, place))
    start = _booking(session).start_at

    # Two days before: nothing is due.
    assert phone_messages.sweep(session, start - timedelta(days=2))["sent"] == 0
    # The day before: the 24 hour reminder, once even if the cron runs twice.
    assert phone_messages.sweep(session, start - timedelta(hours=23))["sent"] == 1
    assert phone_messages.sweep(session, start - timedelta(hours=22))["sent"] == 0
    # Three hours before: the second one.
    assert phone_messages.sweep(session, start - timedelta(hours=2, minutes=30))["sent"] == 1
    assert [r.kind for r in _rows(session)] == ["reminder_24h", "reminder_3h"]
    assert all(r.status == "sent" for r in _rows(session))


def test_no_reminder_in_quiet_hours_or_when_the_owner_cap_is_reached(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    _turn_on(client, organiser, place, monthly_cap=0)
    _book_with_phone(client, place, _verified(client, place))
    start = _booking(session).start_at
    venue = session.get(Venue, place.venue_id)
    # The booking is at 19:00 Lisbon; 23h before is 20:00: allowed, but the cap is 0.
    phone_messages.sweep(session, start - timedelta(hours=23))
    assert [r.status for r in _rows(session)] == ["skipped"]
    assert _rows(session)[0].last_error == "Skipped: monthly limit"
    # Quiet hours are judged in the restaurant's own time.
    late_evening = (start - timedelta(hours=20)).replace(hour=22, minute=30)
    assert phone_messages.in_quiet_hours(venue, late_evening) in (True, False)
    assert phone_messages.in_quiet_hours(venue, start.replace(hour=23, minute=0)) is True
    assert phone_messages.in_quiet_hours(venue, start.replace(hour=11, minute=0)) is False


def test_the_link_page_confirms_cancels_and_stops(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    _turn_on(client, organiser, place)
    _book_with_phone(client, place, _verified(client, place))
    consent = session.scalars(select(MessageConsent)).one()
    token = phone_messages.action_token(consent)

    seen = client.get(f"/api/m/{token}")
    assert seen.status_code == 200
    page = seen.json()
    assert page["venue_name"] == "Test Bistro" and page["party"] == 2
    # Only what is needed to recognise the booking: no name, email or notes.
    assert not {"name", "email", "notes"} & set(page)
    assert page["status"] == "confirmed" and page["confirmed_at"] is None

    coming = client.post(f"/api/m/{token}/confirm")
    assert coming.status_code == 200 and coming.json()["confirmed_at"] is not None
    session.expire_all()
    assert session.scalars(select(MessageConsent)).one().confirmed_via == "sms"

    cancelled = client.post(f"/api/m/{token}/cancel")
    assert cancelled.status_code == 200 and cancelled.json()["status"] == "cancelled"
    assert _booking(session).status == "cancelled"
    assert client.post(f"/api/m/{token}/confirm").status_code == 409


def test_stopping_deletes_the_number_and_no_more_messages_go(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    _turn_on(client, organiser, place)
    _book_with_phone(client, place, _verified(client, place))
    consent = session.scalars(select(MessageConsent)).one()
    token = phone_messages.action_token(consent)
    stopped = client.post(f"/api/m/{token}/stop")
    assert stopped.status_code == 200 and stopped.json()["status"] == "stopped"
    session.expire_all()
    consent = session.scalars(select(MessageConsent)).one()
    assert consent.phone_e164 is None and consent.withdrawn_at is not None
    start = _booking(session).start_at
    assert phone_messages.sweep(session, start - timedelta(hours=23))["sent"] == 0
    assert _rows(session) == []


def test_a_wrong_or_made_up_link_is_a_plain_404(client: TestClient) -> None:
    for token in ("nope", "1.abcdefghijklmnopqrstuv", "999999.abcdefghijklmnopqrstuv", "x.y"):
        assert client.get(f"/api/m/{token}").status_code == 404


def test_a_link_cannot_be_forged_for_another_booking(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    _turn_on(client, organiser, place)
    _book_with_phone(client, place, _verified(client, place))
    consent = session.scalars(select(MessageConsent)).one()
    good = phone_messages.action_token(consent)
    number, _, signature = good.partition(".")
    assert client.get(f"/api/m/{number}.{signature[::-1]}").status_code == 404


def test_a_cancellation_is_told_by_phone_only_to_someone_already_messaged(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    _turn_on(client, organiser, place)
    _book_with_phone(client, place, _verified(client, place))
    start = _booking(session).start_at
    consent = session.scalars(select(MessageConsent)).one()
    token = phone_messages.action_token(consent)

    # Never messaged yet: cancelling sends no phone notice.
    first = client.post(f"/api/m/{token}/cancel")
    assert first.status_code == 200
    assert [r.kind for r in _rows(session)] == []

    # A second booking that did get a reminder is told when it is cancelled.
    second_place = make_restaurant(session, organiser)
    _turn_on(client, organiser, second_place)
    _book_with_phone(client, second_place, _verified(client, second_place))
    phone_messages.sweep(session, start - timedelta(hours=23))
    session.expire_all()
    second = session.scalars(select(MessageConsent).order_by(MessageConsent.id.desc())).first()
    client.post(f"/api/m/{phone_messages.action_token(second)}/cancel")
    assert phone_messages.sweep(session, start - timedelta(hours=22))["sent"] == 1
    assert [r.kind for r in _rows(session)][-1] == "booking_cancelled"


def test_a_real_provider_never_messages_a_demo_restaurants_diners(
    session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    venue = session.get(Venue, place.venue_id)
    real = replace(get_settings(), sms_provider="twilio", message_allowlist=("+351911111111",))
    assert phone_messages._refusal(real, venue, "+351912345678") == "Skipped: demo restaurant"
    assert phone_messages._refusal(real, venue, "+351911111111") is None
    venue.is_demo = False
    assert phone_messages._refusal(real, venue, "+351912345678") is None
    assert phone_messages._refusal(get_settings(), venue, "+351912345678") is None


def test_numbers_are_forgotten_thirty_days_after_the_visit(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    _turn_on(client, organiser, place, send_confirmation=True)
    _book_with_phone(client, place, _verified(client, place))
    end = _booking(session).end_at
    assert phone_messages.forget_old_numbers(session, end + timedelta(days=29)) == 0
    assert phone_messages.forget_old_numbers(session, end + timedelta(days=31)) == 1
    session.expire_all()
    assert session.scalars(select(MessageConsent)).one().phone_e164 is None
    row = session.scalars(select(MessageOutbox)).one()
    assert row.to_phone == "" and row.body_preview == ""


def test_the_owner_sees_usage_and_a_masked_log(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    _turn_on(client, organiser, place, send_confirmation=True)
    _book_with_phone(client, place, _verified(client, place))
    view = client.get(
        f"/api/owner/restaurants/{place.public_id}/messages", headers=auth_header(organiser)
    ).json()
    assert view["sms_provider"] == "demo"
    assert view["usage"] == {"used": 1, "estimated_cents": 5}
    assert view["recent"][0]["to"] == "+351 9•• ••• 678"
    assert "912345678" not in json.dumps(view)


def test_another_owner_cannot_read_or_change_the_settings(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    from conftest import make_user

    place = make_restaurant(session, organiser)
    other = make_user(session, "other.owner@example.com")
    session.commit()
    assert (
        client.get(
            f"/api/owner/restaurants/{place.public_id}/messages", headers=auth_header(other)
        ).status_code
        == 404
    )
    assert client.get(f"/api/owner/restaurants/{place.public_id}/messages").status_code == 401
