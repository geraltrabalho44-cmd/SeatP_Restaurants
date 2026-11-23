"""The restaurant booking emails with the restaurant's own details (spec 10).

One layout for the three emails a booking sends the diner: confirmed, changed and
reminder. In this order: the cover photo, "You're booked at ...", the date, time and
party, "Table 4 · Seat 2 (facing the window)", the ambience sentences, the mini-map of
the room, the address with a link to the map and the phone, and two buttons (Change time,
Cancel booking) that open the manage page. The text version says the same without images,
with the manage link in words. Every value arrives already
formatted (app/restaurant_service/emails.py builds it from the booking), so this
module only chooses words and has no database access.

The cover photo is a remote image (an absolute https URL) because the inline images are
the mini-map (`cid:seatmap`) and the SeatPlan logo (`cid:logo`, added by the provider). Nothing in here names any other diner: the facts have no field for one.
"""

import html
from dataclasses import dataclass
from typing import Literal

from app.mail import style
from app.mail.restaurant_text import known, party, text
from app.mail.templates import (
    _PAGE,
    SENDER_NAME,
    EmailParts,
    _check_link,
    _heading,
    _one_line,
    _paragraph,
    _subject,
)

Kind = Literal["confirmed", "changed", "reminder"]

MAX_ALT_LENGTH = 300
PHOTO_WIDTH = 520
MAX_PHRASES = 4


@dataclass(frozen=True)
class RestaurantBooking:
    """What the email says about one booking."""

    diner_name: str
    restaurant: str
    day_text: str  # "Fri 21 Nov"
    time_text: str  # "20:00"
    party_size: int
    table_label: str  # "4" or "4 + 5"
    link: str
    seat_label: str | None = None
    seat_phrase: str | None = None  # "Facing the window"
    phrases: tuple[str, ...] = ()  # "Direct sun until 14:30"
    address: str = ""
    phone: str | None = None
    maps_url: str | None = None
    cover_url: str | None = None
    cover_alt: str = ""
    picture_width: int | None = None  # None: there is no mini-map
    picture_alt: str = ""
    # "€20, taken off your bill. Free cancellation until Fri 20 Nov, 19:30." Only on
    # bookings that needed a deposit; every other email is exactly as before.
    payment_line: str | None = None
    # The language of the email (restaurant_text.LOCALES). Unknown values read as English.
    locale: str = "en"


def seat_line(facts: RestaurantBooking) -> str:
    """ "Table 4 · Seat 2 (facing the window)", or just "Table 4"."""
    line = text("table", facts.locale, label=facts.table_label)
    if facts.seat_label:
        line += f" · {text('seat', facts.locale, label=facts.seat_label)}"
        if (
            facts.seat_phrase and known(facts.locale) == "en"
        ):  # the sentence is only written in English
            phrase = facts.seat_phrase
            line += f" ({phrase[:1].lower()}{phrase[1:]})"
    return line


def picture_alt(
    restaurant: str, table_label: str, seat_label: str | None, locale: str = "en"
) -> str:
    """The mini-map's alt text: the message in words, for screen readers."""
    alt = text(
        "picture_alt", locale, restaurant=_one_line(restaurant), table=_one_line(table_label)
    )
    if seat_label:
        alt += text("picture_alt_seat", locale, seat=_one_line(seat_label))
    return f"{alt}."[:MAX_ALT_LENGTH]


def _opening(kind: Kind, facts: RestaurantBooking) -> str:
    return text(f"opening_{kind}", facts.locale, restaurant=facts.restaurant)


def _closing(kind: Kind, locale: str) -> str:
    return text("closing_reminder" if kind == "reminder" else "closing", locale)


def _subject_line(kind: Kind, facts: RestaurantBooking) -> str:
    head = text(f"subject_{kind}", facts.locale)
    return text(
        "subject",
        facts.locale,
        head=head,
        restaurant=facts.restaurant,
        day=facts.day_text,
        time=facts.time_text,
    )


def _details(facts: RestaurantBooking) -> list[tuple[str, str]]:
    loc = facts.locale
    return [
        (text("label_date", loc), facts.day_text),
        (text("label_time", loc), facts.time_text),
        (text("label_people", loc), party(facts.party_size, loc)),
        (text("label_table", loc), seat_line(facts)),
        *([(text("label_deposit", loc), facts.payment_line)] if facts.payment_line else []),
    ]


def _text(kind: Kind, facts: RestaurantBooking) -> str:
    name = _one_line(facts.diner_name)
    loc = facts.locale
    lines = [
        text("hello_name", loc, name=name) if name else text("hello", loc),
        "",
        _opening(kind, facts),
        "",
    ]
    lines += [f"{label}: {value}" for label, value in _details(facts)]
    if facts.phrases:
        lines += ["", *[f"- {phrase}" for phrase in facts.phrases[:MAX_PHRASES]]]
    if facts.picture_width is not None:
        lines += ["", text("html_note", loc)]
    where = [part for part in (facts.address, facts.phone) if part]
    if where:
        lines += ["", f"{text('where', loc)}: {', '.join(where)}"]
    if facts.maps_url:
        lines += [f"{text('map', loc)}: {facts.maps_url}"]
    lines += [
        "",
        _closing(kind, loc),
        "",
        f"{text('manage', loc)}: {facts.link}",
        "",
        text("team", loc, sender=SENDER_NAME),
    ]
    lines += [
        "",
        "--",
        text("reason", loc, restaurant=facts.restaurant),
        text("stop", loc),
        text("no_reply", loc),
    ]
    return "\n".join(lines) + "\n"


def _photo_html(facts: RestaurantBooking) -> str:
    if not facts.cover_url:
        return ""
    return (
        f'<img src="{html.escape(facts.cover_url, quote=True)}" width="{PHOTO_WIDTH}" '
        f'alt="{html.escape(facts.cover_alt[:MAX_ALT_LENGTH], quote=True)}" '
        f'style="display:block;width:100%;max-width:{PHOTO_WIDTH}px;height:auto;'
        'border-radius:12px;margin:0 0 20px;">'
    )


def _details_html(facts: RestaurantBooking) -> str:
    rows = "".join(
        '<tr><th scope="row" style="text-align:left;padding:6px 16px 6px 0;font-weight:600;white-space:nowrap;'
        f'color:{style.MUTED};vertical-align:top;">{html.escape(label)}</th>'
        f'<td style="padding:6px 0;">{html.escape(value)}</td></tr>'
        for label, value in _details(facts)
    )
    return f'<table role="presentation" style="margin:0 0 16px;border-collapse:collapse;">{rows}</table>'


def _phrases_html(facts: RestaurantBooking) -> str:
    if not facts.phrases:
        return ""
    items = "".join(f"<li>{html.escape(p)}</li>" for p in facts.phrases[:MAX_PHRASES])
    return f'<ul style="margin:0 0 16px;padding-left:20px;">{items}</ul>'


def _picture_html(facts: RestaurantBooking) -> str:
    if facts.picture_width is None:
        return ""
    width = min(facts.picture_width, 560)
    return (
        f'<img src="cid:seatmap" width="{width}" alt="{html.escape(facts.picture_alt, quote=True)}" '
        f'style="display:block;width:100%;max-width:{width}px;height:auto;'
        f'border:1px solid {style.BORDER};border-radius:12px;margin:0 0 16px;">'
    )


def _where_html(facts: RestaurantBooking) -> str:
    parts = []
    if facts.address:
        address = html.escape(facts.address)
        if facts.maps_url:
            href = html.escape(facts.maps_url, quote=True)
            address = f'<a href="{href}" style="color:{style.PRIMARY};">{address}</a>'
        parts.append(address)
    if facts.phone:
        parts.append(html.escape(facts.phone))
    return f'<p style="margin:0 0 16px;">{"<br>".join(parts)}</p>' if parts else ""


def _buttons(link: str, phone: str | None, locale: str) -> str:
    """Change time (the site's pink main action) and Cancel booking (its red-outlined button).

    The buttons are the links: no web address is printed, and a diner who cannot
    tap one is told to phone the restaurant."""
    pair = (
        style.button_html(style.with_action(link, "change"), text("change_time", locale))
        + " "
        + style.button_html(
            style.with_action(link, "cancel"), text("cancel_booking", locale), kind="danger"
        )
    )
    block = f'<p style="margin:24px 0 8px;">{pair}</p>'
    if phone:
        line = html.escape(text("cannot_tap", locale, phone=phone))
        block += f'<p style="margin:0 0 16px;font-size:13px;color:{style.MUTED};">{line}</p>'
    return block


def _html(kind: Kind, facts: RestaurantBooking) -> str:
    loc = facts.locale
    name = _one_line(facts.diner_name)
    content = _photo_html(facts)
    content += _paragraph(text("hello_name", loc, name=name) if name else text("hello", loc))
    content += _heading(_opening(kind, facts))
    content += (
        _details_html(facts) + _phrases_html(facts) + _picture_html(facts) + _where_html(facts)
    )
    content += _paragraph(_closing(kind, loc)) + _buttons(facts.link, facts.phone, loc)
    content += f'<p style="margin:0;">{html.escape(text("team", loc, sender=SENDER_NAME))}</p>'
    footer = (
        f"{html.escape(text('reason', loc, restaurant=facts.restaurant))}"
        f"<br>{html.escape(text('stop', loc))}<br>{html.escape(text('no_reply', loc))}"
    )
    page = _PAGE.format(sender=SENDER_NAME, content=content, footer=footer)
    # The language of the email, on the shared page frame (the site's restaurants look).
    return page.replace('<html lang="en">', f'<html lang="{known(loc)}">', 1)


def booking_email(kind: Kind, facts: RestaurantBooking) -> EmailParts:
    """Confirmed, changed or reminder email, as subject, text and HTML."""
    _check_link(facts.link)
    for optional in (facts.cover_url, facts.maps_url):
        if optional:
            _check_link(optional)
    return EmailParts(
        subject=_subject(_subject_line(kind, facts)),
        body_text=_text(kind, facts),
        body_html=_html(kind, facts),
    )
