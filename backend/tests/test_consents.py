"""Terms, privacy and offers: what a diner ticks on the last step, and how they take offers back."""

from typing import Any

from conftest import auth_header, make_user
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_restaurant_helpers import Place, future_day, hold, make_restaurant

from app.models import Booking, BookingConsent, OffersConsent, Organiser, Venue
from app.restaurant_service import consents, insights, legal_text


def _book(client: TestClient, place: Place, email: str = "lia@example.com", **extra: Any) -> Any:
    held = hold(client, place, future_day(), "19:00", 2)
    assert held.status_code == 201, held.text
    body = {
        "hold_id": held.json()["hold_id"],
        "party": 2,
        "name": "Lia Moreno",
        "email": email,
        **extra,
    }
    return client.post(f"/api/r/{place.public_id}/bookings", json=body)


def test_a_booking_without_the_terms_is_refused_before_anything_is_held(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    refused = _book(client, place)  # accept_terms missing
    assert refused.status_code == 422
    assert refused.json()["error"]["code"] == "terms_not_accepted"
    explicit = _book(client, place, accept_terms=False)
    assert explicit.status_code == 422
    session.expire_all()
    assert session.scalars(select(Booking)).all() == []
    # The hold is still there: the diner ticks the box and tries again with the same hold.
    held = hold(client, place, future_day(), "21:00", 2).json()
    body = {"hold_id": held["hold_id"], "party": 2, "name": "Lia", "email": "lia@example.com"}
    assert client.post(f"/api/r/{place.public_id}/bookings", json=body).status_code == 422
    ok = client.post(f"/api/r/{place.public_id}/bookings", json={**body, "accept_terms": True})
    assert ok.status_code == 201, ok.text


def test_accepting_the_terms_records_the_version_and_no_offers(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    assert _book(client, place, accept_terms=True).status_code == 201
    session.expire_all()
    consent = session.scalars(select(BookingConsent)).one()
    assert consent.terms_version == legal_text.TERMS_VERSION
    assert consent.offers_opt_in is False and consent.offers_version is None
    assert session.scalars(select(OffersConsent)).all() == []


def test_the_offers_box_is_separate_and_unticked_means_no_offers(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    assert (
        _book(client, place, "yes@example.com", accept_terms=True, accept_offers=True).status_code
        == 201
    )
    session.expire_all()
    venue = session.get(Venue, place.venue_id)
    assert consents.consenting_emails(session, venue) == {"yes@example.com"}
    consent = session.scalars(select(BookingConsent)).one()
    assert consent.offers_opt_in and consent.offers_version == legal_text.OFFERS_VERSION
    # Ticking offers without the terms still refuses the booking: offers never replace the terms.
    assert _book(client, place, "no@example.com", accept_offers=True).status_code == 422


def test_the_terms_document_names_the_restaurant_and_the_two_boxes(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    document = client.get(f"/api/r/{place.public_id}/terms").json()
    assert document["version"] == legal_text.TERMS_VERSION
    assert "Test Bistro" in document["title"]
    text = " ".join(p for s in document["sections"] for p in s["paragraphs"])
    # The restaurant's own statistics are in the words the diner accepts.
    assert "statistics" in text and "responsible" in text
    assert (
        "offers" in document["offers_label"].lower()
        and "optional" in document["offers_label"].lower()
    )
    assert "terms" in document["terms_label"].lower()
    # The restaurant's own text is added as its own section, and never as markup.
    assert not any(s["title"].startswith("From ") for s in document["sections"])


def test_the_owner_adds_text_and_it_reaches_the_document(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    url = f"/api/owner/restaurants/{place.public_id}/terms"
    saved = client.put(
        url,
        json={"extra_text": "Contact privacy@casa.example.\n\nNo pets inside."},
        headers=auth_header(organiser),
    )
    assert saved.status_code == 200 and saved.json()["max_length"] == legal_text.EXTRA_MAX
    document = client.get(f"/api/r/{place.public_id}/terms").json()
    mine = next(s for s in document["sections"] if s["title"] == "From Test Bistro")
    assert mine["paragraphs"] == ["Contact privacy@casa.example.", "No pets inside."]
    too_long = client.put(
        url, json={"extra_text": "x" * (legal_text.EXTRA_MAX + 1)}, headers=auth_header(organiser)
    )
    assert too_long.status_code == 422
    stranger = make_user(session, "other.owner@example.com")
    session.commit()
    assert client.get(url, headers=auth_header(stranger)).status_code == 404
    assert client.get(url).status_code == 401


def test_the_link_in_a_message_stops_offers_and_can_undo_it(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    _book(client, place, "lia@example.com", accept_terms=True, accept_offers=True)
    session.expire_all()
    row = session.scalars(select(OffersConsent)).one()
    token = consents.unsubscribe_token(row)

    seen = client.get(f"/api/u/{token}").json()
    assert seen == {"venue_name": "Test Bistro", "email": seen["email"], "subscribed": True}
    assert "lia@example.com" not in seen["email"]  # masked

    assert client.post(f"/api/u/{token}/stop").json()["subscribed"] is False
    venue = session.get(Venue, place.venue_id)
    session.expire_all()
    assert consents.consenting_emails(session, venue) == set()
    assert client.post(f"/api/u/{token}/resume").json()["subscribed"] is True
    session.expire_all()
    assert consents.consenting_emails(session, venue) == {"lia@example.com"}


def test_a_forged_unsubscribe_link_is_a_plain_404(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    _book(client, place, accept_terms=True, accept_offers=True)
    row = session.scalars(select(OffersConsent)).one()
    number, _, signature = consents.unsubscribe_token(row).partition(".")
    for token in ("x", "1.aaaa", f"{number}.{signature[::-1]}", f"999.{signature}"):
        assert client.get(f"/api/u/{token}").status_code == 404
        assert client.post(f"/api/u/{token}/stop").status_code == 404


def test_the_booking_page_shows_and_changes_the_choice(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    token = _book(client, place, accept_terms=True).json()["manage_token"]
    assert client.get(f"/api/b/{token}").json()["offers"] is False
    assert client.post(f"/api/b/{token}/offers", json={"opt_in": True}).json() == {"offers": True}
    assert client.get(f"/api/b/{token}").json()["offers"] is True
    assert client.post(f"/api/b/{token}/offers", json={"opt_in": False}).json() == {"offers": False}
    assert client.post("/api/b/nope/offers", json={"opt_in": True}).status_code == 404


def test_offers_are_per_restaurant(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    first = make_restaurant(session, organiser)
    second = make_restaurant(session, organiser)
    _book(client, first, "lia@example.com", accept_terms=True, accept_offers=True)
    session.expire_all()
    assert consents.consenting_emails(session, session.get(Venue, first.venue_id)) == {
        "lia@example.com"
    }
    assert consents.consenting_emails(session, session.get(Venue, second.venue_id)) == set()


def test_the_guest_book_tells_who_accepted_offers(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    _book(client, place, "yes@example.com", accept_terms=True, accept_offers=True)
    held = hold(client, place, future_day(), "21:00", 2).json()
    client.post(
        f"/api/r/{place.public_id}/bookings",
        json={
            "hold_id": held["hold_id"],
            "party": 2,
            "name": "No Offers",
            "email": "no@example.com",
            "accept_terms": True,
        },
    )
    session.expire_all()
    venue = session.get(Venue, place.venue_id)
    book = {g["email"]: g for g in insights.guest_book(session, venue)}
    assert (
        book["yes@example.com"]["offers"] is True
        and "offers" in book["yes@example.com"]["segments"]
    )
    assert book["no@example.com"]["offers"] is False
    only = insights.guests(session, venue, segment="offers")
    assert [g["email"] for g in only["guests"]] == ["yes@example.com"]
    assert only["segments"]["offers"] == 1
