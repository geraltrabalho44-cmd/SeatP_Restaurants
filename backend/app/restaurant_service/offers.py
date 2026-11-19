"""Discount offers a restaurant gives its guests.

The restaurant bears the cost: SeatPlan records the offer and who used it, and tells the staff on
the booking ("10% off the bill"). No money moves through SeatPlan, so there is nothing to refund.

Three ways to give an offer, chosen per offer by the owner:

- link: one shared code (and a link) the owner shares anywhere;
- send: the owner sends it to chosen guests (those who have not been in for 60 days, the regulars,
  new guests, everyone, or a list), and each gets a code of their own;
- auto: a rule gives it by itself (a guest who stopped coming, a thank-you after the first visit,
  a reward on the Nth visit).

Only guests who said yes to offers (consents.py) are ever emailed. Every email carries a one-tap
link to stop, a guest is never sent more than one offer in 14 days whatever the restaurant does,
and a restaurant sends at most 200 offer emails a day.
"""

import secrets
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.errors import ApiError
from app.mail.offer_template import offer_email
from app.mail.outbox import enqueue
from app.models import (
    Booking,
    Offer,
    OfferCode,
    OfferRedemption,
    OffersConsent,
    Venue,
)
from app.restaurant_service import consents, insights

KINDS = ("percent", "amount", "gift")
AUDIENCES = ("link", "send", "auto")
RULES = ("winback", "welcome", "nth_visit")
SEGMENTS = ("all", "lapsed", "regular", "new", "no_shows", "list")
MAX_OFFERS = 30
DAILY_SEND_CAP = 200
GUEST_COOLDOWN = timedelta(days=14)
MAX_LIST = 200
SWEEP_BATCH = 50
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I: a code is read out loud


# ---------------------------------------------------------------- words


def describe(offer: Offer) -> str:
    """What the guest gets, in one sentence fragment: '10% off your bill'."""
    if offer.kind == "percent":
        return f"{offer.value}% off your bill"
    if offer.kind == "amount":
        euros = offer.value / 100
        return (
            f"€{euros:g} off your bill" if offer.value % 100 == 0 else f"€{euros:.2f} off your bill"
        )
    return f"a free {offer.gift_text}"


def new_code() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(8))


def clean_code(raw: str) -> str:
    return "".join(raw.upper().split())[:16]


# ---------------------------------------------------------------- the owner's offers


def _check(data: dict[str, Any]) -> dict[str, Any]:
    """Validate an offer as the owner typed it. Returns the cleaned fields or raises 422."""

    def bad(message: str) -> ApiError:
        return ApiError(422, "validation", message)

    kind = data["kind"]
    if kind not in KINDS:
        raise bad("Pick a percentage, an amount or a free item.")
    value = int(data.get("value") or 0)
    if kind == "percent" and not 1 <= value <= 100:
        raise bad("A percentage is between 1 and 100.")
    if kind == "amount" and not 100 <= value <= 100_000:
        raise bad("An amount off is between €1 and €1000.")
    gift = (data.get("gift_text") or "").strip()
    if kind == "gift" and not gift:
        raise bad("Say what the free item is, for example 'dessert'.")
    audience = data["audience"]
    if audience not in AUDIENCES:
        raise bad("Pick how guests get this offer.")
    rule = dict(data.get("rule") or {})
    if audience == "auto":
        if rule.get("type") not in RULES:
            raise bad("Pick when this offer is given.")
        if rule["type"] == "winback" and not 14 <= int(rule.get("days") or 0) <= 365:
            raise bad("Win-back is for guests who have not been in for 14 to 365 days.")
        if rule["type"] == "nth_visit" and not 2 <= int(rule.get("visits") or 0) <= 50:
            raise bad("Choose a visit number from 2 to 50.")
        rule = {k: v for k, v in rule.items() if k in ("type", "days", "visits")}
    else:
        rule = {}
    starts, ends = data.get("starts_on"), data.get("ends_on")
    if starts and ends and ends < starts:
        raise bad("The offer cannot end before it starts.")
    weekdays = sorted({int(day) for day in data.get("weekdays") or []})
    if any(not 0 <= day <= 6 for day in weekdays):
        raise bad("Weekdays are Monday to Sunday.")
    max_uses = data.get("max_uses")
    if max_uses is not None and not 1 <= int(max_uses) <= 100_000:
        raise bad("The number of uses is between 1 and 100000.")
    return {
        "name": data["name"].strip(),
        "kind": kind,
        "value": value if kind != "gift" else 0,
        "gift_text": gift if kind == "gift" else "",
        "audience": audience,
        "rule": rule,
        "note": (data.get("note") or "").strip(),
        "starts_on": starts,
        "ends_on": ends,
        "max_uses": int(max_uses) if max_uses is not None else None,
        "min_party": max(1, int(data.get("min_party") or 1)),
        "weekdays": weekdays,
    }


def _unique_code(session: Session, venue: Venue) -> str:
    for _ in range(20):
        code = new_code()
        taken = session.scalar(
            select(Offer.id).where(Offer.venue_id == venue.id, Offer.code == code)
        ) or session.scalar(select(OfferCode.id).where(OfferCode.code == code))
        if taken is None:
            return code
    raise ApiError(500, "internal", "Could not make a code. Try again.")


def create(session: Session, venue: Venue, data: dict[str, Any]) -> Offer:
    count = session.scalar(
        select(func.count()).select_from(Offer).where(Offer.venue_id == venue.id)
    )
    if (count or 0) >= MAX_OFFERS:
        raise ApiError(
            409, "conflict", f"A restaurant can have up to {MAX_OFFERS} offers. Archive some."
        )
    fields = _check(data)
    offer = Offer(venue_id=venue.id, **fields)
    if offer.audience == "link":
        offer.code = _unique_code(session, venue)
    session.add(offer)
    session.flush()
    return offer


def update(session: Session, offer: Offer, data: dict[str, Any]) -> Offer:
    """Change an offer. How it is given (the audience) cannot change once guests hold codes."""
    fields = _check(data)
    if fields["audience"] != offer.audience:
        raise ApiError(409, "conflict", "Create a new offer to give it a different way.")
    for key, value in fields.items():
        setattr(offer, key, value)
    session.flush()
    return offer


def load(session: Session, venue: Venue, offer_id: int) -> Offer:
    offer = session.get(Offer, offer_id)
    if offer is None or offer.venue_id != venue.id:
        raise ApiError(404, "not_found", "Offer not found.")
    return offer


def uses(session: Session, offer: Offer) -> int:
    return (
        session.scalar(
            select(func.count())
            .select_from(OfferRedemption)
            .where(OfferRedemption.offer_id == offer.id, OfferRedemption.released_at.is_(None))
        )
        or 0
    )


def view(session: Session, offer: Offer) -> dict[str, Any]:
    """An offer as the owner sees it, with how it is doing."""
    sent = (
        session.scalar(
            select(func.count()).select_from(OfferCode).where(OfferCode.offer_id == offer.id)
        )
        or 0
    )
    base = get_settings().public_base_url.rstrip("/")
    venue = session.get(Venue, offer.venue_id)
    return {
        "id": offer.id,
        "name": offer.name,
        "kind": offer.kind,
        "value": offer.value,
        "gift_text": offer.gift_text,
        "what": describe(offer),
        "audience": offer.audience,
        "rule": offer.rule,
        "note": offer.note,
        "starts_on": offer.starts_on.isoformat() if offer.starts_on else None,
        "ends_on": offer.ends_on.isoformat() if offer.ends_on else None,
        "max_uses": offer.max_uses,
        "min_party": offer.min_party,
        "weekdays": offer.weekdays,
        "active": offer.active,
        "code": offer.code or None,
        "link": f"{base}/r/{venue.public_id}?offer={offer.code}" if offer.code and venue else None,
        "uses": uses(session, offer),
        "codes_issued": sent,
    }


# ---------------------------------------------------------------- using an offer


def _problem(offer: Offer, day: date, party: int) -> str | None:
    if not offer.active:
        return "This offer is no longer available."
    if offer.starts_on and day < offer.starts_on:
        return f"This offer starts on {offer.starts_on:%d %B}."
    if offer.ends_on and day > offer.ends_on:
        return "This offer has ended."
    if offer.weekdays and day.weekday() not in offer.weekdays:
        names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        return "This offer is valid on " + ", ".join(names[d] for d in offer.weekdays) + "."
    if party < offer.min_party:
        return f"This offer is for parties of {offer.min_party} or more."
    return None


def check(
    session: Session, venue: Venue, raw_code: str, email: str, day: date, party: int
) -> Offer:
    """The offer a code gives, for this guest and booking, or 422 `offer_invalid` with the reason.

    A wrong code and somebody else's code get the same words, so codes cannot be probed.
    """
    code = clean_code(raw_code)
    not_valid = ApiError(422, "offer_invalid", "This code is not valid.")
    if not code:
        raise not_valid
    key = email.strip().lower()
    offer = session.scalar(
        select(Offer).where(
            Offer.venue_id == venue.id, Offer.audience == "link", Offer.code == code
        )
    )
    if offer is None:
        held = session.scalar(
            select(OfferCode).where(OfferCode.code == code, OfferCode.venue_id == venue.id)
        )
        if held is None or held.email != key:
            raise not_valid
        offer = session.get(Offer, held.offer_id)
        if offer is None:
            raise not_valid
    reason = _problem(offer, day, party)
    if reason:
        raise ApiError(422, "offer_invalid", reason)
    if offer.max_uses is not None and uses(session, offer) >= offer.max_uses:
        raise ApiError(422, "offer_invalid", "This offer has been fully used.")
    again = session.scalar(
        select(OfferRedemption.id).where(
            OfferRedemption.offer_id == offer.id,
            OfferRedemption.email == key,
            OfferRedemption.released_at.is_(None),
        )
    )
    if again is not None:
        raise ApiError(422, "offer_invalid", "You have already used this offer.")
    return offer


def redeem(session: Session, offer: Offer, booking: Booking) -> OfferRedemption:
    """Record that this booking uses the offer. Does not commit."""
    row = OfferRedemption(offer_id=offer.id, booking_id=booking.id, email=booking.email.lower())
    session.add(row)
    session.flush()
    return row


def release(session: Session, booking: Booking, now: datetime) -> None:
    """A cancelled booking gives its use back. Does not commit."""
    row = session.scalar(
        select(OfferRedemption).where(
            OfferRedemption.booking_id == booking.id, OfferRedemption.released_at.is_(None)
        )
    )
    if row is not None:
        row.released_at = now


def for_bookings(session: Session, booking_ids: list[int]) -> dict[int, dict[str, str]]:
    """The offer each of these bookings uses, for the staff and the diner's page."""
    if not booking_ids:
        return {}
    rows = session.execute(
        select(OfferRedemption, Offer)
        .join(Offer, Offer.id == OfferRedemption.offer_id)
        .where(OfferRedemption.booking_id.in_(booking_ids), OfferRedemption.released_at.is_(None))
    ).all()
    return {r.booking_id: {"name": o.name, "what": describe(o)} for r, o in rows}


# ---------------------------------------------------------------- giving offers to guests


def audience(
    session: Session, venue: Venue, segment: str, emails: list[str] | None = None
) -> dict[str, Any]:
    """Who a send would reach: the guests in the segment who said yes to offers.

    `skipped_no_consent` is how many in the segment did not, so the owner sees why the number is
    smaller; those guests are never contacted and their addresses are not shown.
    """
    if segment not in SEGMENTS:
        raise ApiError(422, "validation", "Pick who to send this to.")
    book = insights.guest_book(session, venue)
    if segment == "list":
        wanted = {e.strip().lower() for e in (emails or [])[:MAX_LIST]}
        chosen = [g for g in book if g["email"] in wanted]
    elif segment == "all":
        chosen = book
    else:
        chosen = [g for g in book if segment in g["segments"]]
    taking = consents.consenting_emails(session, venue)
    reachable = [g for g in chosen if g["email"] in taking]
    return {
        "segment": segment,
        "in_segment": len(chosen),
        "reachable": len(reachable),
        "skipped_no_consent": len(chosen) - len(reachable),
        "guests": reachable,
    }


def _recent(session: Session, venue: Venue, email: str, now: datetime) -> bool:
    return (
        session.scalar(
            select(OfferCode.id).where(
                OfferCode.venue_id == venue.id,
                OfferCode.email == email,
                OfferCode.emailed_at.is_not(None),
                OfferCode.emailed_at > now - GUEST_COOLDOWN,
            )
        )
        is not None
    )


def _sent_today(session: Session, venue: Venue, now: datetime) -> int:
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return (
        session.scalar(
            select(func.count())
            .select_from(OfferCode)
            .where(OfferCode.venue_id == venue.id, OfferCode.emailed_at >= start)
        )
        or 0
    )


def give(
    session: Session, venue: Venue, offer: Offer, guest: dict[str, Any], now: datetime
) -> bool:
    """Give one guest their code and queue the email. False when it must not be sent (again).

    Does not commit. Safe to call twice: a guest holds at most one code per offer.
    """
    email = guest["email"]
    if session.scalar(
        select(OfferCode.id).where(OfferCode.offer_id == offer.id, OfferCode.email == email)
    ):
        return False
    if _recent(session, venue, email, now):
        return False
    row = OfferCode(
        offer_id=offer.id, venue_id=venue.id, email=email, code=_unique_code(session, venue)
    )
    session.add(row)
    session.flush()
    consent = session.scalar(
        select(OffersConsent).where(
            OffersConsent.venue_id == venue.id, OffersConsent.email == email
        )
    )
    if consent is None or consent.withdrawn_at is not None:
        session.delete(row)
        return False
    base = get_settings().public_base_url.rstrip("/")
    parts = offer_email(
        guest_name=guest["name"],
        restaurant=venue.name,
        offer_name=offer.name,
        what=describe(offer),
        code=row.code,
        valid_until=f"{offer.ends_on:%d %B %Y}" if offer.ends_on else None,
        note=offer.note,
        book_link=f"{base}/r/{venue.public_id}?offer={row.code}",
        stop_link=f"{base}/u/{consents.unsubscribe_token(consent)}",
    )
    enqueue(
        session,
        idempotency_key=f"offer-{offer.id}-{row.id}",
        to_email=email,
        kind="offer",
        subject=parts.subject,
        body_text=parts.body_text,
        body_html=parts.body_html,
    )
    row.emailed_at = now
    return True


def send(
    session: Session,
    venue: Venue,
    offer: Offer,
    segment: str,
    emails: list[str] | None,
    now: datetime,
) -> dict[str, int]:
    """Send a "send" offer to a segment. Commits."""
    if offer.audience != "send":
        raise ApiError(409, "conflict", "Only an offer you send yourself can be sent from here.")
    if not offer.active:
        raise ApiError(409, "conflict", "This offer is archived.")
    reach = audience(session, venue, segment, emails)
    room = max(0, DAILY_SEND_CAP - _sent_today(session, venue, now))
    sent = already = 0
    for guest in reach["guests"]:
        if sent >= room:
            break
        if give(session, venue, offer, guest, now):
            sent += 1
        else:
            already += 1
    session.commit()
    return {
        "sent": sent,
        "skipped_no_consent": reach["skipped_no_consent"],
        "skipped_recent_or_already": already,
        "left_for_today": max(0, room - sent),
    }


# ---------------------------------------------------------------- automatic offers


def _matches(rule: dict[str, Any], guest: dict[str, Any], today: date) -> bool:
    last = date.fromisoformat(guest["last_visit"]) if guest["last_visit"] else None
    if last is None or guest["next_booking"]:
        return False
    since = (today - last).days
    if rule["type"] == "winback":
        return since >= rule["days"]
    if rule["type"] == "welcome":
        return guest["visits"] == 1 and 1 <= since <= 7
    if rule["type"] == "nth_visit":
        return guest["visits"] == rule["visits"] and 1 <= since <= 7
    return False


def sweep_auto(session: Session, now: datetime) -> int:
    """Give automatic offers to the guests whose rule matches today. Commits each restaurant."""
    given = 0
    offers = session.scalars(
        select(Offer).where(Offer.audience == "auto", Offer.active.is_(True))
    ).all()
    for offer in offers:
        venue = session.get(Venue, offer.venue_id)
        if venue is None or (offer.ends_on and offer.ends_on < now.date()):
            continue
        today = now.astimezone(ZoneInfo(venue.timezone)).date()
        taking = consents.consenting_emails(session, venue)
        room = max(0, DAILY_SEND_CAP - _sent_today(session, venue, now))
        batch = 0
        for guest in insights.guest_book(session, venue):
            if batch >= min(SWEEP_BATCH, room):
                break
            wanted = guest["email"] in taking and _matches(offer.rule, guest, today)
            if wanted and give(session, venue, offer, guest, now):
                batch += 1
        session.commit()
        given += batch
    return given
