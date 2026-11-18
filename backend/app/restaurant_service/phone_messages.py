"""Phone messages (SMS and WhatsApp) for restaurant bookings.

Nobody is messaged without saying yes. A diner ticks the box while booking, types a
6-digit code sent to the number (so nobody can enter somebody else's), and only then
does the booking get a consent row. Everything after that is driven by that row:

    confirmation  -> sent right after the booking, if the restaurant turned it on
    reminders     -> the 15-minute cron finds the bookings whose reminder is due
    cancellation  -> queued when the booking is cancelled, sent by the next cron run

Messages are written to `message_outbox` first (a unique key makes every message go
out once), and the words are built when the message is sent, from the booking as it
is then. Real providers never message a demo restaurant's diners, except numbers in
MESSAGE_ALLOWLIST, so a public demo can never text a stranger.
"""

import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.core.errors import ApiError
from app.messaging import providers, templates
from app.messaging.phone import mask, normalise_pt_mobile
from app.models import (
    Booking,
    MessageConsent,
    MessageOutbox,
    PhoneCode,
    Venue,
    VenueMessageSettings,
    utc_now,
)
from app.restaurant_service import occupancy
from app.restaurant_service.booking_rows import table_labels
from app.restaurant_service.clock import venue_zone, when_text
from app.security import keyed_hash, rate_limit, tokens_match

CONSENT_VERSION = "2026-11-18"
CODE_TTL = timedelta(minutes=10)
PROOF_TTL = timedelta(minutes=30)
MAX_CODE_TRIES = 5
MAX_SENDS = 3
RESEND_AFTER = timedelta(seconds=30)
MAX_SEND_TRIES = 3
RETRY_MINUTES = (5, 20)
RETENTION = timedelta(days=30)
# A reminder is never sent later than this before the booking: it would be noise.
LATEST_BEFORE_START = timedelta(hours=1)
QUIET_FROM, QUIET_TO = 22, 9
CHANNELS = ("whatsapp", "sms")
CAP_MIN, CAP_MAX = 0, 5000
APPROX_COST_CENTS = {"sms": 5, "whatsapp": 2}


# ---------------------------------------------------------------- settings


@dataclass(frozen=True)
class MessageSettings:
    sms_enabled: bool = False
    whatsapp_enabled: bool = False
    send_confirmation: bool = False
    reminder_24h: bool = True
    reminder_3h: bool = True
    monthly_cap: int = 300


def read_settings(session: Session, venue: Venue) -> MessageSettings:
    row = session.get(VenueMessageSettings, venue.id)
    if row is None:
        return MessageSettings()
    return MessageSettings(
        row.sms_enabled,
        row.whatsapp_enabled,
        row.send_confirmation,
        row.reminder_24h,
        row.reminder_3h,
        row.monthly_cap,
    )


def save_settings(session: Session, venue: Venue, new: MessageSettings) -> None:
    if not CAP_MIN <= new.monthly_cap <= CAP_MAX:
        raise ApiError(422, "validation", f"The monthly limit is {CAP_MIN} to {CAP_MAX}.")
    row = session.get(VenueMessageSettings, venue.id)
    if row is None:
        row = VenueMessageSettings(venue_id=venue.id)
        session.add(row)
    row.sms_enabled = new.sms_enabled
    row.whatsapp_enabled = new.whatsapp_enabled
    row.send_confirmation = new.send_confirmation
    row.reminder_24h = new.reminder_24h
    row.reminder_3h = new.reminder_3h
    row.monthly_cap = new.monthly_cap
    row.updated_at = utc_now()


def channels_on(session: Session, venue: Venue) -> list[str]:
    found = read_settings(session, venue)
    return [c for c in CHANNELS if getattr(found, f"{c}_enabled")]


def public_view(session: Session, venue: Venue) -> dict[str, Any]:
    """What the booking page needs to offer phone reminders (nothing private)."""
    settings = get_settings()
    found = read_settings(session, venue)
    return {
        "channels": channels_on(session, venue),
        "confirmation": found.send_confirmation,
        "reminder_24h": found.reminder_24h,
        "reminder_3h": found.reminder_3h,
        "demo": _is_demo_provider(settings),
        "consent_version": CONSENT_VERSION,
    }


def _is_demo_provider(settings: Settings) -> bool:
    return settings.sms_provider == "demo" and settings.whatsapp_provider == "demo"


# ---------------------------------------------------------------- the code


def _hash_id(venue: Venue, verification_id: str) -> str:
    return keyed_hash(f"phone-verify:{venue.id}:{verification_id}")


def _hash_code(venue: Venue, verification_id: str, phone: str, code: str) -> str:
    return keyed_hash(f"phone-code:{venue.id}:{verification_id}:{phone}:{code}")


def _usable_channel(session: Session, venue: Venue, channel: str) -> str:
    on = channels_on(session, venue)
    if not on:
        raise ApiError(409, "messages_off", "This restaurant does not send phone messages.")
    if channel not in on:
        raise ApiError(422, "validation", "Pick WhatsApp or SMS, whichever the restaurant offers.")
    return channel


def start_verification(
    session: Session, venue: Venue, raw_phone: str, channel: str, client: str
) -> dict[str, Any]:
    """Send a 6-digit code to the number. Answers with the id only this browser holds."""
    phone = normalise_pt_mobile(raw_phone)
    if phone is None:
        raise ApiError(
            422,
            "bad_phone",
            "This does not look like a Portuguese mobile number. Enter a number starting with 9.",
        )
    _usable_channel(session, venue, channel)
    phone_key = keyed_hash(f"phone:{phone}")
    # Each limit stops a different abuse: one person asking for many codes, one number
    # being flooded by many people, and the app as a whole paying for codes.
    rate_limit(session, f"phone-client:{client}", limit=6, window_s=3600)
    rate_limit(session, f"phone-number:{phone_key}", limit=3, window_s=3600)
    rate_limit(session, "phone-all", limit=300, window_s=3600)
    verification_id = secrets.token_urlsafe(16)
    code = f"{secrets.randbelow(1_000_000):06d}"
    now = utc_now()
    row = PhoneCode(
        verification_hash=_hash_id(venue, verification_id),
        venue_id=venue.id,
        channel=channel,
        phone_e164=phone,
        code_hash=_hash_code(venue, verification_id, phone, code),
        expires_at=now + CODE_TTL,
    )
    session.add(row)
    session.commit()
    _send_code(session, venue, row, phone, channel, code)
    answer: dict[str, Any] = {
        "verification_id": verification_id,
        "phone": mask(phone),
        "channel": channel,
    }
    if _is_demo_provider(get_settings()):
        # Demo only: nothing was sent, so the page shows the code instead.
        answer["demo_code"] = code
    return answer


def _send_code(
    session: Session, venue: Venue, row: PhoneCode, phone: str, channel: str, code: str
) -> None:
    """Send the code now. A failure undoes the row, so the diner is not left waiting."""
    settings = get_settings()
    refusal = _refusal(settings, venue, phone)
    if refusal is None:
        try:
            providers.provider_for(channel, settings).send(
                phone, templates.code_message(code), f"code-{row.id}-{row.sends}"
            )
            return
        except providers.MessageError as error:
            providers.log.warning("phone code not sent: %s", error)
    session.delete(row)
    session.commit()
    raise ApiError(
        502,
        "message_unavailable",
        "We could not send the code right now. Try again, or book without phone messages.",
    )


def check_code(session: Session, venue: Venue, verification_id: str, code: str) -> dict[str, Any]:
    """Mark the number verified when the code is right. Five wrong tries end it."""
    row = _find_code(session, venue, verification_id)
    now = utc_now()
    if row.expires_at <= now:
        raise ApiError(410, "code_expired", "This code has expired. Send a new code.")
    # One conditional UPDATE counts the try, so two simultaneous guesses cannot both
    # slip under the limit.
    counted = session.execute(
        update(PhoneCode)
        .where(PhoneCode.id == row.id, PhoneCode.attempts < MAX_CODE_TRIES)
        .values(attempts=PhoneCode.attempts + 1)
    )
    session.commit()
    if counted.rowcount != 1:
        raise ApiError(429, "rate_limited", "Too many wrong codes. Send a new code.")
    session.refresh(row)
    expected = _hash_code(venue, verification_id, row.phone_e164, code.strip())
    if not tokens_match(expected, row.code_hash):
        left = MAX_CODE_TRIES - row.attempts
        raise ApiError(422, "wrong_code", f"That code is not right. You have {left} tries left.")
    row.verified_at = now
    session.commit()
    return {"verified": True, "phone": mask(row.phone_e164), "channel": row.channel}


def _find_code(session: Session, venue: Venue, verification_id: str) -> PhoneCode:
    row = session.scalar(
        select(PhoneCode).where(PhoneCode.verification_hash == _hash_id(venue, verification_id))
    )
    if row is None or row.venue_id != venue.id:
        raise ApiError(410, "code_expired", "This code has expired. Send a new code.")
    return row


def take_proof(session: Session, venue: Venue, verification_id: str) -> PhoneCode:
    """The verified number to attach to a booking. A proof is used once and lasts 30 minutes."""
    row = _find_code(session, venue, verification_id)
    now = utc_now()
    if row.verified_at is None:
        raise ApiError(422, "phone_not_verified", "Verify your number, or untick the box to book.")
    if row.consumed_at is not None or row.verified_at + PROOF_TTL <= now:
        raise ApiError(410, "code_expired", "This code has expired. Send a new code.")
    return row


# ---------------------------------------------------------------- consent and links


def link_consent(
    session: Session, venue: Venue, booking: Booking, proof: PhoneCode
) -> MessageConsent:
    """Save the diner's yes for this booking. Does not commit."""
    proof.consumed_at = utc_now()
    consent = MessageConsent(
        venue_id=venue.id,
        booking_id=booking.id,
        channel=proof.channel,
        phone_e164=proof.phone_e164,
        consent_version=CONSENT_VERSION,
        verified_at=proof.verified_at or utc_now(),
    )
    session.add(consent)
    session.flush()
    if not booking.phone:
        booking.phone = proof.phone_e164
    return consent


def action_token(consent: MessageConsent) -> str:
    """The secret in a reminder's link: the id, then a signature only the server can make.

    It is worked out again when needed, so nothing about it is stored.
    """
    return f"{consent.id}.{keyed_hash(f'msg-action:{consent.id}:{consent.booking_id}')[:22]}"


def consent_of_token(session: Session, token: str) -> MessageConsent:
    """The consent a link belongs to. Anything wrong with it is the same plain 404."""
    number, _, signature = token.partition(".")
    consent = session.get(MessageConsent, int(number)) if number.isdigit() else None
    if consent is None or not tokens_match(token, action_token(consent)) or not signature:
        raise ApiError(404, "not_found", "This link no longer works.")
    return consent


def consent_for(session: Session, booking: Booking) -> MessageConsent | None:
    return session.scalar(select(MessageConsent).where(MessageConsent.booking_id == booking.id))


def link_for(consent: MessageConsent) -> tuple[str, str]:
    token = action_token(consent)
    return f"{get_settings().public_base_url.rstrip('/')}/m/{token}", token


# ---------------------------------------------------------------- sending


def _refusal(settings: Settings, venue: Venue, phone: str) -> str | None:
    """Why a real message must not go to this number, or None.

    The demo provider sends nothing, so it is always fine. A real one never messages a
    demo restaurant's diners unless the number is on the team's own list.
    """
    real = settings.sms_provider != "demo" or settings.whatsapp_provider != "demo"
    if real and venue.is_demo and phone not in settings.message_allowlist:
        return "Skipped: demo restaurant"
    return None


def _month_start(now: datetime) -> datetime:
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def used_this_month(session: Session, venue: Venue, now: datetime) -> int:
    return (
        session.scalar(
            select(func.count())
            .select_from(MessageOutbox)
            .where(
                MessageOutbox.venue_id == venue.id,
                MessageOutbox.status.in_(("sent", "sending")),
                MessageOutbox.created_at >= _month_start(now),
            )
        )
        or 0
    )


def _facts(session: Session, venue: Venue, booking: Booking) -> templates.Facts:
    labels = table_labels(session, occupancy.tables_of(session, booking))
    return templates.Facts(
        venue.name, when_text(venue, booking.start_at), booking.party_size, ", ".join(labels)
    )


def _build(
    session: Session, venue: Venue, booking: Booking, consent: MessageConsent, kind: str
) -> templates.Message:
    facts = _facts(session, venue, booking)
    if kind == "booking_cancelled":
        return templates.cancelled(facts)
    link, token = link_for(consent)
    builders = {
        "booking_confirmed": templates.confirmed,
        "reminder_24h": templates.reminder_24h,
        "reminder_3h": templates.reminder_3h,
    }
    return builders[kind](facts, link, token)


def enqueue(
    session: Session, venue: Venue, booking: Booking, consent: MessageConsent, kind: str
) -> MessageOutbox | None:
    """Put one message in the outbox, once. Does not commit; None if it was already queued."""
    if consent.phone_e164 is None or consent.withdrawn_at is not None:
        return None
    key = f"msg-{kind}-{booking.public_id}"
    row = MessageOutbox(
        idempotency_key=key,
        venue_id=venue.id,
        consent_id=consent.id,
        channel=consent.channel,
        kind=kind,
        to_phone=consent.phone_e164,
        next_attempt_at=utc_now(),
    )
    try:
        with session.begin_nested():
            session.add(row)
            session.flush()
    except IntegrityError:
        return None
    return row


def _claim(session: Session, row: MessageOutbox) -> bool:
    """queued -> sending, by one conditional UPDATE: two runs cannot send the same row."""
    claimed = session.execute(
        update(MessageOutbox)
        .where(MessageOutbox.id == row.id, MessageOutbox.status == "queued")
        .values(status="sending", attempts=MessageOutbox.attempts + 1)
    )
    session.commit()
    session.refresh(row)
    return claimed.rowcount == 1


def _skip(session: Session, row: MessageOutbox, why: str) -> None:
    row.status = "skipped"
    row.last_error = why
    session.commit()


def deliver(session: Session, row: MessageOutbox, now: datetime) -> str:
    """Send one queued message. Returns the new status. Commits."""
    consent = session.get(MessageConsent, row.consent_id) if row.consent_id else None
    booking = session.get(Booking, consent.booking_id) if consent else None
    venue = session.get(Venue, row.venue_id)
    if consent is None or booking is None or venue is None:
        _skip(session, row, "Skipped: booking gone")
        return row.status
    refusal = _skip_reason(session, venue, booking, consent, row, now)
    if refusal is not None:
        _skip(session, row, refusal)
        return row.status
    if not _claim(session, row):
        return row.status
    message = _build(session, venue, booking, consent, row.kind)
    row.body_preview = message.sms.replace(link_for(consent)[0], "[link]")
    settings = get_settings()
    try:
        sent = providers.provider_for(row.channel, settings).send(
            row.to_phone, message, row.idempotency_key
        )
    except providers.MessageError as error:
        row.last_error = str(error)
        if row.attempts >= MAX_SEND_TRIES:
            row.status = "failed"
        else:
            row.status = "queued"
            row.next_attempt_at = now + timedelta(minutes=RETRY_MINUTES[row.attempts - 1])
        session.commit()
        return row.status
    row.status = "sent"
    row.sent_at = now
    row.provider_message_id = sent.message_id
    row.last_error = None
    session.commit()
    return "sent"


def _skip_reason(
    session: Session,
    venue: Venue,
    booking: Booking,
    consent: MessageConsent,
    row: MessageOutbox,
    now: datetime,
) -> str | None:
    found = read_settings(session, venue)
    if consent.phone_e164 is None or consent.withdrawn_at is not None:
        return "Skipped: messages stopped"
    if not getattr(found, f"{row.channel}_enabled"):
        return "Skipped: channel switched off"
    if row.kind != "booking_cancelled" and booking.status != "confirmed":
        return "Skipped: booking not active"
    if row.kind.startswith("reminder") and booking.start_at - now < LATEST_BEFORE_START:
        return "Skipped: too late"
    refusal = _refusal(get_settings(), venue, row.to_phone)
    if refusal:
        return refusal
    if used_this_month(session, venue, now) >= found.monthly_cap:
        return "Skipped: monthly limit"
    return None


def send_confirmation(session: Session, venue: Venue, booking: Booking) -> None:
    """After the booking is saved: queue and send the confirmation, if the restaurant wants it."""
    consent = consent_for(session, booking)
    if consent is None or not read_settings(session, venue).send_confirmation:
        return
    row = enqueue(session, venue, booking, consent, "booking_confirmed")
    session.commit()
    if row is not None:
        deliver(session, row, utc_now())


def on_cancel(session: Session, venue: Venue, booking: Booking) -> None:
    """Queue a cancellation notice, only if this diner was messaged about the booking.

    Does not commit and does not send: the next cron run does, so a slow provider
    can never hold up a cancellation.
    """
    consent = consent_for(session, booking)
    if consent is None:
        return
    heard = session.scalar(
        select(func.count())
        .select_from(MessageOutbox)
        .where(MessageOutbox.consent_id == consent.id, MessageOutbox.status == "sent")
    )
    if heard:
        enqueue(session, venue, booking, consent, "booking_cancelled")


# ---------------------------------------------------------------- the cron


def in_quiet_hours(venue: Venue, now: datetime) -> bool:
    hour = now.astimezone(venue_zone(venue)).hour
    return hour >= QUIET_FROM or hour < QUIET_TO


def reminder_kinds_due(
    found: MessageSettings, booking: Booking, consent: MessageConsent, now: datetime
) -> list[str]:
    """Which reminders of this booking may go out now (pure: the rules, no database)."""
    left = booking.start_at - now
    if left < LATEST_BEFORE_START:
        return []
    lead = booking.start_at - booking.created_at
    due: list[str] = []
    if found.reminder_24h and left <= timedelta(hours=24) and lead >= timedelta(hours=26):
        due.append("reminder_24h")
    # Someone who already said "I'm coming" is not nagged 3 hours before.
    if (
        found.reminder_3h
        and left <= timedelta(hours=3)
        and lead >= timedelta(hours=4)
        and consent.confirmed_at is None
    ):
        due.append("reminder_3h")
    return due


def sweep(session: Session, now: datetime) -> dict[str, int]:
    """Send what is due: reminders, cancellation notices, retries. Forget old numbers."""
    queued = _queue_reminders(session, now)
    sent = 0
    for row in session.scalars(
        select(MessageOutbox)
        .where(MessageOutbox.status == "queued", MessageOutbox.next_attempt_at <= now)
        .order_by(MessageOutbox.id)
        .limit(200)
    ).all():
        if deliver(session, row, now) == "sent":
            sent += 1
    forgotten = forget_old_numbers(session, now)
    return {"queued": queued, "sent": sent, "forgotten": forgotten}


def _queue_reminders(session: Session, now: datetime) -> int:
    rows = session.execute(
        select(Booking, MessageConsent)
        .join(MessageConsent, MessageConsent.booking_id == Booking.id)
        .where(
            Booking.status == "confirmed",
            Booking.start_at > now,
            Booking.start_at <= now + timedelta(hours=25),
            MessageConsent.withdrawn_at.is_(None),
            MessageConsent.phone_e164.is_not(None),
        )
    ).all()
    made = 0
    for booking, consent in rows:
        venue = session.get(Venue, booking.venue_id)
        if venue is None or in_quiet_hours(venue, now):
            continue
        for kind in reminder_kinds_due(read_settings(session, venue), booking, consent, now):
            if enqueue(session, venue, booking, consent, kind) is not None:
                made += 1
    session.commit()
    return made


def forget_old_numbers(session: Session, now: datetime) -> int:
    """Delete the number 30 days after the visit (the promise made when the diner ticked)."""
    old = session.scalars(
        select(MessageConsent)
        .join(Booking, Booking.id == MessageConsent.booking_id)
        .where(MessageConsent.phone_e164.is_not(None), Booking.end_at < now - RETENTION)
    ).all()
    for consent in old:
        consent.phone_e164 = None
    for row in session.scalars(
        select(MessageOutbox).where(
            MessageOutbox.to_phone != "", MessageOutbox.created_at < now - RETENTION
        )
    ).all():
        row.to_phone = ""
        row.body_preview = ""
    session.commit()
    return len(old)


# ---------------------------------------------------------------- the diner's link


def confirm_coming(session: Session, consent: MessageConsent, via: str) -> None:
    if consent.confirmed_at is None:
        consent.confirmed_at = utc_now()
        consent.confirmed_via = via


def stop(session: Session, consent: MessageConsent) -> None:
    """The diner's no: no more messages, and the number is deleted from this booking."""
    consent.withdrawn_at = consent.withdrawn_at or utc_now()
    consent.phone_e164 = None


def planned(session: Session, venue: Venue, consent: MessageConsent) -> list[str]:
    """Which messages the diner will get, in words (shown on the confirmation page)."""
    found = read_settings(session, venue)
    out = []
    if found.send_confirmation:
        out.append("a confirmation")
    if found.reminder_24h:
        out.append("a reminder the day before")
    if found.reminder_3h:
        out.append("a reminder 3 hours before")
    return out


def usage(session: Session, venue: Venue, now: datetime) -> dict[str, Any]:
    used = used_this_month(session, venue, now)
    rows = session.execute(
        select(MessageOutbox.channel, func.count())
        .where(
            MessageOutbox.venue_id == venue.id,
            MessageOutbox.status == "sent",
            MessageOutbox.created_at >= _month_start(now),
        )
        .group_by(MessageOutbox.channel)
    ).all()
    cents = sum(APPROX_COST_CENTS.get(channel, 0) * count for channel, count in rows)
    return {"used": used, "estimated_cents": cents}


def recent(session: Session, venue: Venue, limit: int = 30) -> list[dict[str, Any]]:
    rows = session.scalars(
        select(MessageOutbox)
        .where(MessageOutbox.venue_id == venue.id)
        .order_by(MessageOutbox.id.desc())
        .limit(limit)
    ).all()
    return [
        {
            "id": row.id,
            "at": (row.sent_at or row.created_at).isoformat(),
            "to": mask(row.to_phone) if row.to_phone else "deleted",
            "kind": row.kind,
            "channel": row.channel,
            "status": row.status,
            "note": row.last_error if row.status in ("skipped", "failed") else None,
        }
        for row in rows
    ]
