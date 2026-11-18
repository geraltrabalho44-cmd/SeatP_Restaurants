"""Phone message providers: a demo one (default) and the real ones, chosen by environment.

    SMS_PROVIDER=twilio       TWILIO_ACCOUNT_SID  TWILIO_AUTH_TOKEN  TWILIO_SMS_FROM
    WHATSAPP_PROVIDER=meta    WHATSAPP_ACCESS_TOKEN  WHATSAPP_PHONE_NUMBER_ID

The rest of the app talks to a `MessageProvider` and never knows which one it has.
The demo provider only writes a masked line to the log. The real ones call plain
HTTPS APIs through httpx (no vendor library) with a short timeout, and they hide
their keys from repr() and from every error text they raise.
"""

import logging
from dataclasses import dataclass
from typing import Any, Protocol

import httpx

from app.config import APP_VERSION, Settings
from app.messaging.phone import mask
from app.messaging.templates import Message

TWILIO_URL = "https://api.twilio.com/2010-04-01/Accounts"
GRAPH_URL = "https://graph.facebook.com"
GRAPH_VERSION = "v21.0"
TIMEOUT = httpx.Timeout(10.0, connect=5.0)
log = logging.getLogger("seatplan.messages")


class MessageError(Exception):
    """A send failed. The text is short and fixed: it never holds a key, a number or a message."""


@dataclass(frozen=True)
class SendResult:
    message_id: str


class MessageProvider(Protocol):
    name: str  # "demo", "twilio" or "meta"
    channel: str  # "sms" or "whatsapp"

    def send(self, to: str, message: Message, idempotency_key: str) -> SendResult: ...


class DemoProvider:
    """Sends nothing. It writes who it would have messaged (masked) and what kind."""

    name = "demo"

    def __init__(self, channel: str) -> None:
        self.channel = channel

    def send(self, to: str, message: Message, idempotency_key: str) -> SendResult:
        log.info("demo %s to %s: %s", self.channel, mask(to), message.kind)
        return SendResult(f"demo-{idempotency_key[-24:]}")


class TwilioSmsProvider:
    name = "twilio"
    channel = "sms"

    def __init__(
        self, sid: str, token: str, sender: str, client: httpx.Client | None = None
    ) -> None:
        self._sid = sid
        self._token = token
        self._sender = sender
        self._client = client or httpx.Client(timeout=TIMEOUT)

    def __repr__(self) -> str:
        return "TwilioSmsProvider(sid=..., token=...)"

    def send(self, to: str, message: Message, idempotency_key: str) -> SendResult:
        try:
            answer = self._client.post(
                f"{TWILIO_URL}/{self._sid}/Messages.json",
                auth=(self._sid, self._token),
                data={"To": to, "From": self._sender, "Body": message.sms},
                headers={"User-Agent": f"seatplan/{APP_VERSION}"},
            )
        except httpx.HTTPError as error:
            raise MessageError("Twilio could not be reached.") from error
        if answer.status_code not in (200, 201):
            raise MessageError(f"Twilio refused the message (HTTP {answer.status_code}).")
        sid = _json(answer).get("sid")
        if not isinstance(sid, str):
            raise MessageError("Twilio's answer had no message id.")
        return SendResult(sid)


class WhatsAppCloudProvider:
    """Meta's WhatsApp Cloud API. A message that starts a chat must be an approved template."""

    name = "meta"
    channel = "whatsapp"

    def __init__(self, token: str, phone_id: str, client: httpx.Client | None = None) -> None:
        self._token = token
        self._phone_id = phone_id
        self._client = client or httpx.Client(timeout=TIMEOUT)

    def __repr__(self) -> str:
        return "WhatsAppCloudProvider(token=...)"

    def send(self, to: str, message: Message, idempotency_key: str) -> SendResult:
        components: list[dict[str, Any]] = [
            {"type": "body", "parameters": [{"type": "text", "text": p} for p in message.params]}
        ]
        if message.button:
            components.append(
                {
                    "type": "button",
                    "sub_type": "url",
                    "index": "0",
                    "parameters": [{"type": "text", "text": message.button}],
                }
            )
        body = {
            "messaging_product": "whatsapp",
            "to": to.lstrip("+"),
            "type": "template",
            "template": {
                "name": message.template,
                "language": {"code": "en"},
                "components": components,
            },
        }
        try:
            answer = self._client.post(
                f"{GRAPH_URL}/{GRAPH_VERSION}/{self._phone_id}/messages",
                json=body,
                headers={
                    "Authorization": f"Bearer {self._token}",
                    "User-Agent": f"seatplan/{APP_VERSION}",
                },
            )
        except httpx.HTTPError as error:
            raise MessageError("WhatsApp could not be reached.") from error
        if answer.status_code not in (200, 201):
            raise MessageError(f"WhatsApp refused the message (HTTP {answer.status_code}).")
        sent = _json(answer).get("messages")
        found = sent[0].get("id") if isinstance(sent, list) and sent else None
        if not isinstance(found, str):
            raise MessageError("WhatsApp's answer had no message id.")
        return SendResult(found)


def _json(answer: httpx.Response) -> dict[str, Any]:
    try:
        data = answer.json()
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def provider_for(channel: str, settings: Settings) -> MessageProvider:
    """The provider of one channel, from the settings. Demo unless real keys were given."""
    if channel == "sms" and settings.sms_provider == "twilio":
        return TwilioSmsProvider(
            settings.twilio_account_sid, settings.twilio_auth_token, settings.twilio_sms_from
        )
    if channel == "whatsapp" and settings.whatsapp_provider == "meta":
        return WhatsAppCloudProvider(
            settings.whatsapp_access_token, settings.whatsapp_phone_number_id
        )
    return DemoProvider(channel)
