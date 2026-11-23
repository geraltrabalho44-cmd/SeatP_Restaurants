"""The booking emails follow the language the diner booked in (English, Portuguese, Spanish, French), in the site's colours."""

import re

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_restaurant_helpers import book, future_day, hold, make_restaurant

from app.mail.restaurant_templates import RestaurantBooking, booking_email
from app.models import Booking, EmailOutbox, Organiser

FACTS = {
    "pt": (
        "Reservado:",
        "sex 21 nov",
        "às 20:00",
        "A tua reserva em Casa Lumen está confirmada.",
        "Gerir a minha reserva",
        "Mesa 4",
    ),
    "es": (
        "Reservado:",
        "vie 21 nov",
        "a las 20:00",
        "Tu reserva en Casa Lumen está confirmada.",
        "Gestionar mi reserva",
        "Mesa 4",
    ),
    "fr": (
        "Réservé :",
        "ven 21 nov",
        "à 20:00",
        "Votre réservation chez Casa Lumen est confirmée.",
        "Gérer ma réservation",
        "Table 4",
    ),
}
ENGLISH_MARKERS = (
    "Hello",
    "You're booked",
    "Manage my booking",
    "Your table",
    "If the button does not work",
    "The SeatPlan team",
    "Change time",
    "Cancel booking",
    "Cannot tap",
    "Please do not reply",
)


def facts(locale: str, **more: object) -> RestaurantBooking:
    return RestaurantBooking(
        diner_name="Lia",
        restaurant="Casa Lumen",
        day_text={"pt": "sex 21 nov", "es": "vie 21 nov", "fr": "ven 21 nov"}.get(
            locale, "Fri 21 Nov"
        ),
        time_text="20:00",
        party_size=2,
        table_label="4",
        link="https://example.com/b/token",
        locale=locale,
        **more,  # type: ignore[arg-type]
    )


@pytest.mark.parametrize("locale", ["pt", "es", "fr"])
def test_an_email_in_another_language_has_no_english_in_it(locale: str) -> None:
    head, day, at, opening, manage, table = FACTS[locale]
    parts = booking_email("confirmed", facts(locale))
    assert parts.subject == f"{head} Casa Lumen, {day} {at}"
    # The text version has the manage link; the HTML has the two buttons instead (tested below).
    assert manage in parts.body_text, locale
    for body in (parts.body_text, parts.body_html):
        assert opening in body and table in body, locale
        for english in ENGLISH_MARKERS:
            assert english not in body, (locale, english)
    assert f'<html lang="{locale}">' in parts.body_html


def test_the_three_kinds_and_the_footer_are_translated() -> None:
    for locale in ("pt", "es", "fr"):
        subjects = {
            kind: booking_email(kind, facts(locale)).subject
            for kind in ("confirmed", "changed", "reminder")
        }  # type: ignore[arg-type]
        assert len(set(subjects.values())) == 3, locale
        body = booking_email("reminder", facts(locale)).body_text
        assert "never send marketing" not in body.lower()
        assert "marketing" not in body.lower().replace(
            "offers", ""
        )  # no promise about marketing in any language


def test_english_is_unchanged_and_an_unknown_language_reads_as_english() -> None:
    english = booking_email("confirmed", facts("en"))
    assert english.subject == "Booked: Casa Lumen, Fri 21 Nov at 20:00"
    assert '<html lang="en">' in english.body_html
    odd = booking_email("confirmed", facts("xx"))
    assert odd.subject == english.subject and odd.body_text == english.body_text


def test_the_email_wears_the_site_look_not_the_old_blue() -> None:
    html = booking_email(
        "confirmed", facts("pt", maps_url="https://maps.example.com/x", address="Rua Augusta 1")
    ).body_html
    assert "#b0347a" in html  # the main button: the site's pink
    assert "#1d4ed8" not in html  # the old blue
    assert "#f8f7fc" in html  # the site's paper
    assert "#4f3f8f" in html  # the headline and the map link: the site's purple
    assert re.search(r"<a [^>]*background:#b0347a[^>]*>Alterar hora</a>", html)
    assert re.search(r"<a [^>]*color:#923b31[^>]*>Cancelar reserva</a>", html)


@pytest.mark.parametrize(
    ("locale", "change", "cancel", "tap", "no_reply"),
    [
        ("pt", "Alterar hora", "Cancelar reserva", "Liga para +351 210 000 000", "Não respondas"),
        ("es", "Cambiar la hora", "Cancelar reserva", "Llama al +351 210 000 000", "No respondas"),
        (
            "fr",
            "Modifier l&#x27;heure",
            "Annuler la réservation",
            "Appelez le +351 210 000 000",
            "Merci de ne pas répondre",
        ),
    ],
)
def test_the_buttons_the_phone_line_and_the_no_reply_line_are_translated(
    locale: str, change: str, cancel: str, tap: str, no_reply: str
) -> None:
    parts = booking_email("confirmed", facts(locale, phone="+351 210 000 000"))
    assert f">{change}</a>" in parts.body_html and f">{cancel}</a>" in parts.body_html
    assert tap in parts.body_html
    assert no_reply in parts.body_html and no_reply in parts.body_text


def test_a_chair_and_the_deposit_are_written_in_the_language_without_the_english_sentences() -> (
    None
):
    parts = booking_email(
        "confirmed",
        facts(
            "pt",
            seat_label="2",
            seat_phrase="Facing the window",
            phrases=("Direct sun until 14:30",),
            payment_line="€20, descontados na conta. Cancelamento gratuito até qui 20 nov, 19:30.",
        ),
    )
    assert "Mesa 4 · Lugar 2" in parts.body_text
    assert "Depósito: €20, descontados na conta" in parts.body_text
    assert "Facing the window" not in parts.body_text  # only written in English


def test_the_language_of_the_booking_reaches_its_emails(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    day = future_day(9)
    for lang, email, head in (
        ("pt", "ana@example.com", "Reservado: "),
        ("es", "eva@example.com", "Reservado: "),
        ("fr", "luc@example.com", "Réservé : "),
    ):
        held = hold(client, place, day, "19:00", 2)
        assert held.status_code == 201, held.text
        answer = book(client, place, held.json()["hold_id"], 2, email=email, lang=lang)
        assert answer.status_code == 201, answer.text
        row = session.scalar(
            select(EmailOutbox).where(
                EmailOutbox.to_email == email, EmailOutbox.kind == "booking_confirmed"
            )
        )
        assert row is not None and row.subject.startswith(head), (lang, row and row.subject)
        assert f'<html lang="{lang}">' in row.body_html
        stored = session.scalar(select(Booking).where(Booking.email == email))
        assert stored is not None and stored.locale == lang


def test_a_booking_without_a_language_is_in_english_and_a_bad_language_is_refused(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    held = hold(client, place, future_day(10), "19:00", 2)
    assert book(client, place, held.json()["hold_id"], 2, lang="klingon").status_code == 422
    plain = book(client, place, held.json()["hold_id"], 2)
    assert plain.status_code == 201, plain.text
    row = session.scalar(select(EmailOutbox).where(EmailOutbox.kind == "booking_confirmed"))
    assert row is not None and row.subject.startswith("Booked: ")


def test_the_table_sentences_and_the_chair_are_in_the_language_of_the_booking(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    from test_restaurant_emails import seated_booking

    from app.restaurant_service import booking_rows, email_facts
    from app.restaurant_service.venue_access import load_restaurant

    place, token = seated_booking(client, session, organiser, future_day(7))
    booking = booking_rows.load_by_token(session, token)
    booking.locale = "pt"
    session.commit()
    venue = load_restaurant(session, place.public_id)
    data = email_facts.booking_email_data(session, venue, booking, "https://example.test/b/x")
    facts = data.facts
    assert facts.seat_phrase in (
        "De frente para a janela",
        "De costas para a janela",
        "De lado para a janela",
    )
    assert facts.phrases, "the window table has light sentences"
    assert all(
        re.search(r"Direct|Sunset|Facing|window|View of", p) is None for p in facts.phrases
    ), facts.phrases
