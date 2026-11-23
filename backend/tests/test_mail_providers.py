"""Providers: the Resend request shape and that the API key never leaks.

No network: httpx.MockTransport answers instead of the real Resend server.
"""

import base64
import json
from dataclasses import fields, replace

import httpx
import pytest

from app.mail.logo import logo_base64
from app.mail.providers import ConsoleProvider, OutgoingEmail, ProviderError, ResendProvider

FAKE_KEY = "re_test_not_a_real_key_123"
MESSAGE = OutgoingEmail(
    to_email="ana.silva@example.com",
    subject="Booking confirmed",
    body_text="Hello",
    body_html="<p>Hello</p>",
    ics="BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n",
    idempotency_key="booking-confirmed-abc",
)


def _provider(handler: httpx.MockTransport) -> ResendProvider:
    return ResendProvider(
        FAKE_KEY, "SeatPlan <noreply@example.com>", client=httpx.Client(transport=handler)
    )


def test_resend_request_shape() -> None:
    seen: list[httpx.Request] = []

    def answer(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"id": "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794"})

    message_id = _provider(httpx.MockTransport(answer)).send(MESSAGE)
    assert message_id == "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794"
    request = seen[0]
    assert str(request.url) == "https://api.resend.com/emails"
    assert request.headers["Authorization"] == f"Bearer {FAKE_KEY}"
    assert request.headers["Idempotency-Key"] == "booking-confirmed-abc"
    assert request.headers["User-Agent"].startswith("seatplan/")
    body = json.loads(request.content)
    assert body["to"] == ["ana.silva@example.com"]
    assert body["from"] == "SeatPlan <noreply@example.com>"
    attachment = body["attachments"][0]
    assert attachment["filename"] == "invite.ics"
    assert base64.b64decode(attachment["content"]).decode() == MESSAGE.ics


def test_error_answer_raises_without_the_key() -> None:
    transport = httpx.MockTransport(lambda request: httpx.Response(429, text="slow down"))
    provider = _provider(transport)
    with pytest.raises(ProviderError) as caught:
        provider.send(MESSAGE)
    assert "429" in str(caught.value)
    assert FAKE_KEY not in str(caught.value)
    assert FAKE_KEY not in repr(provider)


def test_network_error_raises_without_the_key() -> None:
    def broken(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout(f"timed out calling with {request.headers['Authorization']}")

    with pytest.raises(ProviderError) as caught:
        _provider(httpx.MockTransport(broken)).send(MESSAGE)
    assert FAKE_KEY not in str(caught.value)
    assert caught.value.__cause__ is None


def test_console_provider_logs_without_the_body(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level("INFO", logger="seatplan.mail")
    secret_body = OutgoingEmail("ana@example.com", "Hi", "secret-link-xyz", "<p>x</p>", None, "k")
    message_id = ConsoleProvider().send(secret_body)
    assert message_id.startswith("console-")
    # Masked, so server logs never hold full addresses (docs/security.md, S4).
    assert "an***@example.com" in caplog.text
    assert "ana@example.com" not in caplog.text
    assert "secret-link-xyz" not in caplog.text


def _attachments_sent(message: OutgoingEmail) -> list[dict[str, str]]:
    seen: list[httpx.Request] = []

    def answer(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"id": "abc"})

    _provider(httpx.MockTransport(answer)).send(message)
    return json.loads(seen[0].content).get("attachments", [])


def test_the_logo_is_attached_inline_when_the_html_uses_it() -> None:
    message = replace(MESSAGE, body_html='<img src="cid:logo" alt="SeatPlan">')
    logo = [a for a in _attachments_sent(message) if a["filename"] == "logo.png"]
    assert logo == [{"filename": "logo.png", "content": logo_base64(), "content_id": "logo"}]


def test_no_logo_is_attached_when_the_html_does_not_use_it() -> None:
    assert [a["filename"] for a in _attachments_sent(MESSAGE)] == ["invite.ics"]


def test_attachments_go_in_a_fixed_order_invite_map_logo() -> None:
    message = replace(
        MESSAGE,
        body_html='<img src="cid:logo"><img src="cid:seatmap">',
        image_png="AAAA",
    )
    assert [a["filename"] for a in _attachments_sent(message)] == [
        "invite.ics",
        "seat-map.png",
        "logo.png",
    ]


def test_the_logo_is_not_a_field_of_the_outbox_message() -> None:
    assert "logo" not in {field.name for field in fields(OutgoingEmail)}
