"""The restaurant booking emails with photo, address, table, chair, ambience and mini-map (spec 10).

A confirmed booking queues one email carrying the cover photo (a remote image), the
table and chair, the ambience sentences, the room from above as an inline PNG
(`cid:seatmap`), the address with a map link and the phone. A change and the
reminder carry the same. The queue stays idempotent, and nothing names anyone else.
"""

import base64
import html
import re
import struct
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_chosen_seat import add_seats, booked, room_with_window
from test_restaurant_helpers import future_day, make_restaurant

from app.mail.restaurant_templates import RestaurantBooking, booking_email, picture_alt, seat_line
from app.mail.templates import NO_REPLY_TEXT
from app.models import EmailOutbox, Organiser, Seat, Venue, VenuePhoto

PNG = b"\x89PNG\r\n\x1a\n"


def decorate(session: Session, venue_id: int) -> Venue:
    venue = session.get(Venue, venue_id)
    assert venue is not None
    venue.address, venue.phone = "Rua Augusta 1, Lisboa", "+351 210 000 000"
    session.add(
        VenuePhoto(
            venue_id=venue.id,
            kind="gallery",
            content_type="image/png",
            data=b"x",
            width=1,
            height=1,
            alt_text="The dining room by the river",
            position=0,
            is_cover=True,
        )
    )
    session.commit()
    return venue


def rows(session: Session, kind: str) -> list[EmailOutbox]:
    return list(session.scalars(select(EmailOutbox).where(EmailOutbox.kind == kind)))


def seated_booking(client: TestClient, session: Session, organiser: Organiser, day: date):
    place = make_restaurant(session, organiser)
    room_with_window(session, place)
    decorate(session, place.venue_id)
    north, _ = add_seats(session, place, "T1")
    seat = session.get(Seat, north)
    assert seat is not None
    seat.x, seat.y = 500, 612  # on the north edge: looking south at the window
    session.commit()
    _, answer = booked(client, place, day, 2, north, table_id=place.table["T1"])
    assert answer.status_code == 201, answer.text
    return place, answer.json()["manage_token"]


# ---------------------------------------------------------------- the confirmation


def test_the_confirmation_has_the_photo_the_table_the_chair_the_sentences_and_the_map(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    day = future_day(7)
    _, token = seated_booking(client, session, organiser, day)
    (row,) = rows(session, "booking_confirmed")
    assert row.subject.startswith("Booked: Test Bistro, ") and row.subject.endswith(" at 19:00")
    for body in (row.body_text, row.body_html):
        assert "Table T1 · Seat 1 (facing the window)" in body
        assert "Rua Augusta 1, Lisboa" in body and "+351 210 000 000" in body
        assert f"/b/{token}" in body
    # The cover photo is a remote image with an absolute address and its alt text.
    assert re.search(
        r'<img src="https?://[^"]+/api/photos/[^"]+" width="520" alt="The dining room by the river"',
        row.body_html,
    )
    # The mini-map is the one inline image, with words for screen readers.
    assert 'src="cid:seatmap"' in row.body_html and "Floor plan of Test Bistro" in row.body_html
    assert "https://www.google.com/maps/search/" in row.body_html
    assert row.body_html.count("<img") == 3  # the logo, the photo and the map
    # Ambience sentences for the stay (the table is by a window of a room with a north).
    assert "<ul" in row.body_html and "- " in row.body_text
    # The calendar invite names the address too.
    assert row.ics is not None and "Rua Augusta 1" in row.ics


def test_the_picture_is_a_real_png_of_the_room_and_has_no_names(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    _, _ = seated_booking(client, session, organiser, future_day(7))
    (row,) = rows(session, "booking_confirmed")
    assert row.image_png is not None
    png = base64.b64decode(row.image_png)
    assert png.startswith(PNG)
    width, height = struct.unpack(">II", png[16:24])
    assert 100 < width <= 1000 and 100 < height < 1000
    # The width in the email is never wider than the picture, and no diner's name or email is in the words.
    match = re.search(r'<img src="cid:seatmap" width="(\d+)"', row.body_html)
    assert match is not None and int(match[1]) <= min(width, 560)
    assert "Lia Moreno" in row.body_text  # the greeting is the diner's own name, once
    assert row.body_text.count("Lia Moreno") == 1
    assert "lia.moreno@example.com" not in row.body_html + row.body_text


def test_a_restaurant_without_rooms_still_gets_a_plain_confirmation(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    _, answer = booked(client, place, future_day(), 2, None, table_id=place.table["T1"])
    assert answer.status_code == 201
    (row,) = rows(session, "booking_confirmed")
    assert row.subject.startswith("Booked: Test Bistro, ")
    assert "Table T1" in row.body_text and "Seat" not in row.body_text.split("Manage my booking")[0]
    assert row.image_png is not None  # the implicit room is drawn too
    assert "<img" in row.body_html and "/api/photos/" not in row.body_html  # no photo yet


# ---------------------------------------------------------------- change and reminder


def test_a_change_and_the_reminder_carry_the_same_details(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    _, token = seated_booking(client, session, organiser, future_day(7))
    moved = client.patch(f"/api/b/{token}", json={"time": "20:00"})
    assert moved.status_code == 200, moved.text
    (changed,) = rows(session, "booking_changed")
    assert changed.subject.startswith("Updated: Test Bistro, ") and changed.subject.endswith(
        " at 20:00"
    )
    assert "Table T1 · Seat 1" in changed.body_html and changed.image_png is not None
    reminders = rows(session, "booking_reminder")
    assert reminders and all(r.image_png is not None for r in reminders)
    latest = max(reminders, key=lambda r: r.idempotency_key)
    assert latest.subject.startswith("Reminder: Test Bistro, ")
    assert "Rua Augusta 1" in latest.body_html


def test_a_booking_email_does_not_promise_that_nothing_but_the_booking_is_ever_sent() -> None:
    # A diner may tick the box for the restaurant's offers; those come as separate emails with their own stop link, so the
    # booking emails must not claim "We never send marketing" (that sentence belongs to the Events emails).
    facts = RestaurantBooking(
        diner_name="Lia",
        restaurant="Test Bistro",
        day_text="Fri 21 Nov",
        time_text="20:00",
        party_size=2,
        table_label="T1",
        link="https://example.com/b/token",
    )
    for kind in ("confirmed", "changed", "reminder"):
        parts = booking_email(kind, facts)
        for body in (parts.body_text, parts.body_html):
            assert "never send marketing" not in body.lower(), kind
            assert "only about your booking" in body, kind
            assert "offers from this restaurant" in body, kind


def test_the_queue_stays_idempotent(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    from app.models import Booking
    from app.restaurant_service import emails

    _, _ = seated_booking(client, session, organiser, future_day(7))
    booking = session.scalars(select(Booking)).one()
    venue = session.get(Venue, booking.venue_id)
    assert venue is not None
    emails.queue_confirmation(session, venue, booking, "another-token")
    session.commit()
    assert len(rows(session, "booking_confirmed")) == 1


# ---------------------------------------------------------------- the template alone


def facts(**patch) -> RestaurantBooking:
    base = RestaurantBooking(
        diner_name="Ana",
        restaurant="Casa Azul",
        day_text="Fri 21 Nov",
        time_text="20:00",
        party_size=2,
        table_label="4",
        link="https://seatplan.example/b/tok",
    )
    return RestaurantBooking(**{**base.__dict__, **patch})


def test_the_seat_line_and_the_words_for_the_picture() -> None:
    assert seat_line(facts()) == "Table 4"
    assert seat_line(facts(seat_label="2")) == "Table 4 · Seat 2"
    assert (
        seat_line(facts(seat_label="2", seat_phrase="Facing the window"))
        == "Table 4 · Seat 2 (facing the window)"
    )
    assert "seat 2" in picture_alt("Casa Azul", "4", "2")
    assert "seat" not in picture_alt("Casa Azul", "4", None).replace("seen from above", "")


def test_restaurant_emails_say_not_to_reply() -> None:
    parts = booking_email("confirmed", facts())
    assert NO_REPLY_TEXT in parts.body_text and html.escape(NO_REPLY_TEXT) in parts.body_html


def test_an_email_with_no_photo_map_or_address_leaves_those_parts_out() -> None:
    parts = booking_email("confirmed", facts())
    assert parts.body_html.count("<img") == 1  # only the logo
    assert "cid:seatmap" not in parts.body_html
    assert "Where:" not in parts.body_text and "Map:" not in parts.body_text
    assert parts.subject == "Booked: Casa Azul, Fri 21 Nov at 20:00"


def test_text_from_the_restaurant_is_escaped_in_the_html_and_links_must_be_web_links() -> None:
    parts = booking_email(
        "confirmed",
        facts(restaurant="<b>Casa</b>", address="Rua <script>", phrases=("Sun & shade",)),
    )
    assert "<script>" not in parts.body_html and "&lt;script&gt;" in parts.body_html
    assert "Sun &amp; shade" in parts.body_html
    for bad in (
        {"link": "javascript:alert(1)"},
        {"cover_url": "javascript:alert(1)"},
        {"maps_url": "ftp://x"},
    ):
        try:
            booking_email("confirmed", facts(**bad))
        except ValueError:
            continue
        raise AssertionError(f"{bad} was accepted")


def test_a_reminder_asks_to_cancel_if_the_diner_cannot_come() -> None:
    assert "cancel" in booking_email("reminder", facts()).body_text.lower()
    assert booking_email("changed", facts()).subject.startswith("Updated: ")


# ---------------------------------------------------------------- a booking that joins tables


def test_the_map_marks_the_chair_at_the_second_joined_table_and_highlights_both_tables(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    from unittest.mock import patch

    from test_restaurant_helpers import book, hold

    from app.restaurant_service import email_facts

    place = make_restaurant(session, organiser)
    (chair,) = add_seats(session, place, "T6", count=1)
    t5, t6 = place.table["T5"], place.table["T6"]
    held = hold(client, place, future_day(), "19:00", 7, table_ids=[t5, t6])
    assert held.status_code == 201, held.text
    real = email_facts.render_restaurant_picture
    with patch.object(email_facts, "render_restaurant_picture", wraps=real) as spy:
        answer = book(client, place, held.json()["hold_id"], 7, seat_id=chair)
    assert answer.status_code == 201, answer.text
    assert spy.call_count >= 1
    args, kwargs = spy.call_args
    # The chair belongs to the second table, so that table is the main one and the first is highlighted too.
    assert args[3] == t6 and args[4] == chair
    assert list(kwargs["also_tables"]) == [t5]
    (row,) = rows(session, "booking_confirmed")
    assert row.image_png is not None
    assert "T5" in row.body_text and "T6" in row.body_text


# ---------------------------------------------------------------- sent at once


def test_with_resend_the_confirmation_is_sent_at_once_and_the_cron_does_not_send_it_again(
    client: TestClient, session: Session, organiser: Organiser, monkeypatch
) -> None:
    import httpx

    from app.config import get_settings
    from app.mail.providers import ResendProvider

    monkeypatch.setenv("EMAIL_PROVIDER", "resend")
    monkeypatch.setenv("RESEND_API_KEY", "re_test_not_a_real_key_123")
    monkeypatch.setenv("EMAIL_ALLOWLIST", "lia.moreno@example.com")
    get_settings.cache_clear()
    sent: list[dict] = []

    def answer(request: httpx.Request) -> httpx.Response:
        import json

        sent.append(json.loads(request.content))
        return httpx.Response(200, json={"id": "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794"})

    monkeypatch.setattr(
        "app.restaurant_service.emails.provider_from_settings",
        lambda settings: ResendProvider(
            settings.resend_api_key,
            "SeatPlan <noreply@example.com>",
            client=httpx.Client(transport=httpx.MockTransport(answer)),
        ),
    )
    try:
        seated_booking(client, session, organiser, future_day(7))
    finally:
        get_settings.cache_clear()
    (row,) = rows(session, "booking_confirmed")
    session.refresh(row)
    assert row.status == "sent" and row.attempts >= 0
    assert [message["to"] for message in sent] == [["lia.moreno@example.com"]]
    assert sent[0]["subject"].startswith("Booked: ")


def test_with_the_console_provider_the_confirmation_stays_queued(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    seated_booking(client, session, organiser, future_day(7))
    (row,) = rows(session, "booking_confirmed")
    assert row.status == "queued"


KINDS = ["confirmed", "changed", "reminder"]


@pytest.mark.parametrize("kind", KINDS)
def test_two_buttons_open_the_manage_page_on_the_right_panel(kind: str) -> None:
    parts = booking_email(kind, facts())
    page = parts.body_html
    assert 'href="https://seatplan.example/b/tok?action=change"' in page
    assert 'href="https://seatplan.example/b/tok?action=cancel"' in page
    assert ">Change time</a>" in page and ">Cancel booking</a>" in page
    change = re.search(r'<a href="[^"]*action=change"[^>]*>', page)
    cancel = re.search(r'<a href="[^"]*action=cancel"[^>]*>', page)
    assert change and "background:#b0347a" in change.group(0)  # the site's pink main action
    assert cancel and "color:#923b31" in cancel.group(0)  # the site's red-outlined cancel
    assert "background:#b0347a" not in cancel.group(0)
    # The buttons are the links: no web address is printed.
    assert "copy this link" not in page
    assert "seatplan.example/b/tok" not in re.sub(r'href="[^"]*"', "", page)
    # Apps that show no buttons still get the address in the text version.
    assert "Manage my booking: https://seatplan.example/b/tok" in parts.body_text


def test_a_link_with_a_query_gets_the_action_after_an_ampersand() -> None:
    page = booking_email("confirmed", facts(link="https://seatplan.example/b/tok?x=1")).body_html
    assert 'href="https://seatplan.example/b/tok?x=1&amp;action=cancel"' in page
    assert "?x=1?action" not in page


@pytest.mark.parametrize("kind", KINDS)
def test_the_phone_line_helps_a_diner_who_cannot_tap_a_button(kind: str) -> None:
    with_phone = booking_email(kind, facts(phone="+351 210 000 000")).body_html
    assert "Cannot tap a button? Call +351 210 000 000." in with_phone
    assert "Cannot tap" not in booking_email(kind, facts(phone=None)).body_html


def test_the_phone_line_escapes_the_phone() -> None:
    page = booking_email("confirmed", facts(phone="<b>1</b>")).body_html
    assert "Cannot tap a button? Call &lt;b&gt;1&lt;/b&gt;." in page and "<b>1</b>" not in page


def test_the_headline_is_a_purple_heading() -> None:
    page = booking_email("confirmed", facts()).body_html
    heading = re.search(r"<h1 [^>]*>(.*?)</h1>", page)
    assert heading and "You&#x27;re booked at Casa Azul." in heading.group(1)
    assert "color:#4f3f8f" in heading.group(0) and "font-weight:800" in heading.group(0)


def test_the_two_buttons_are_separated_by_a_space() -> None:
    # Outlook for Windows ignores the margin on links; a plain space keeps the buttons apart,
    # and in an app that strips styles the two labels do not run together.
    page = booking_email("confirmed", facts()).body_html
    assert "Change time</a> <a " in page


def test_the_footer_names_the_button_as_well_as_the_link() -> None:
    page = booking_email("confirmed", facts()).body_html
    assert "using the button or link above" in page
