"""Discount offers: how the owner makes them, how guests get them, how a booking uses one, and what
can never happen (an email to someone who did not say yes, a code used twice, a code guessed)."""

import itertools
from datetime import timedelta
from typing import Any

import pytest
from conftest import auth_header, make_user
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_owner_insights import _add
from test_restaurant_helpers import Place, future_day, hold, make_restaurant

from app.mail.outbox import redact_links
from app.models import EmailOutbox, Offer, OfferCode, OfferRedemption, Organiser, Venue, utc_now
from app.restaurant_service import consents, offers

_SLOT = itertools.count()
PERCENT = {"name": "Spring offer", "kind": "percent", "value": 10, "audience": "link"}


def _url(place: Place, tail: str = "") -> str:
    return f"/api/owner/restaurants/{place.public_id}/offers{tail}"


def _make(client: TestClient, organiser: Organiser, place: Place, **over: Any) -> dict[str, Any]:
    answer = client.post(_url(place), json={**PERCENT, **over}, headers=auth_header(organiser))
    assert answer.status_code == 201, answer.text
    return answer.json()


def _book(client: TestClient, place: Place, email: str = "lia@example.com", **extra: Any) -> Any:
    held = hold(client, place, future_day(), "19:00", 2)
    assert held.status_code == 201, held.text
    body = {
        "hold_id": held.json()["hold_id"],
        "party": 2,
        "name": "Lia Moreno",
        "email": email,
        "accept_terms": True,
        **extra,
    }
    return client.post(f"/api/r/{place.public_id}/bookings", json=body)


def _guest(
    session: Session, place: Place, email: str, offers_yes: bool, days_ago: int = 90
) -> None:
    """A guest who came `days_ago` days ago, and did or did not say yes to offers."""
    n = next(_SLOT)  # a different table and hour each time, so two guests never collide
    _add(
        session,
        place,
        email,
        days_ago,
        name=email.split("@")[0].title(),
        table=f"T{1 + n % 6}",
        hour=8 + n % 14,
    )
    if offers_yes:
        consents.opt_in(session, session.get(Venue, place.venue_id), email)
        session.commit()


def _emails(session: Session) -> list[EmailOutbox]:
    session.expire_all()
    return list(session.scalars(select(EmailOutbox).where(EmailOutbox.kind == "offer")))


# ------------------------------------------------------------------ making offers


def test_the_owner_makes_changes_and_archives_an_offer(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    made = _make(client, organiser, place)
    assert made["what"] == "10% off your bill" and made["audience"] == "link"
    assert len(made["code"]) == 8 and made["link"].endswith(
        f"/r/{place.public_id}?offer={made['code']}"
    )
    changed = client.put(
        _url(place, f"/{made['id']}"),
        json={**PERCENT, "value": 15, "min_party": 4},
        headers=auth_header(organiser),
    )
    assert changed.json()["what"] == "15% off your bill" and changed.json()["min_party"] == 4
    assert changed.json()["code"] == made["code"]  # the shared code never changes under the owner
    archived = client.post(_url(place, f"/{made['id']}/archive"), headers=auth_header(organiser))
    assert archived.json()["active"] is False
    assert (
        client.post(_url(place, f"/{made['id']}/archive"), headers=auth_header(organiser)).json()[
            "active"
        ]
        is True
    )
    assert len(client.get(_url(place), headers=auth_header(organiser)).json()["offers"]) == 1


@pytest.mark.parametrize(
    "bad",
    [
        {"kind": "percent", "value": 0},
        {"kind": "percent", "value": 101},
        {"kind": "amount", "value": 50},
        {"kind": "amount", "value": 5_000_000},
        {"kind": "gift", "gift_text": "  "},
        {"starts_on": "2030-05-10", "ends_on": "2030-05-01"},
        {"weekdays": [0, 9]},
        {"audience": "auto"},  # an automatic offer needs a rule
        {"audience": "auto", "rule": {"type": "winback", "days": 3}},
        {"audience": "auto", "rule": {"type": "nth_visit", "visits": 1}},
        {"name": ""},
        {"kind": "bribe"},
    ],
)
def test_a_nonsense_offer_is_refused(
    client: TestClient, session: Session, organiser: Organiser, bad: dict[str, Any]
) -> None:
    place = make_restaurant(session, organiser)
    answer = client.post(_url(place), json={**PERCENT, **bad}, headers=auth_header(organiser))
    assert answer.status_code == 422, bad


def test_the_other_kinds_of_offer_say_what_the_guest_gets(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    assert _make(client, organiser, place, kind="amount", value=500)["what"] == "€5 off your bill"
    assert (
        _make(client, organiser, place, kind="amount", value=750)["what"] == "€7.50 off your bill"
    )
    gift = _make(client, organiser, place, kind="gift", gift_text="dessert")
    assert gift["what"] == "a free dessert"


def test_how_an_offer_is_given_cannot_change_once_made(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    made = _make(client, organiser, place, audience="send")
    switched = client.put(
        _url(place, f"/{made['id']}"),
        json={**PERCENT, "audience": "link"},
        headers=auth_header(organiser),
    )
    assert switched.status_code == 409


def test_only_the_owner_sees_or_changes_offers(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    made = _make(client, organiser, place)
    stranger = make_user(session, "stranger.owner@example.com")
    session.commit()
    for call in (
        lambda h: client.get(_url(place), headers=h),
        lambda h: client.post(_url(place), json=PERCENT, headers=h),
        lambda h: client.put(_url(place, f"/{made['id']}"), json=PERCENT, headers=h),
        lambda h: client.post(_url(place, f"/{made['id']}/archive"), headers=h),
        lambda h: client.post(_url(place, "/audience"), json={"segment": "all"}, headers=h),
        lambda h: client.post(
            _url(place, f"/{made['id']}/send"), json={"segment": "all"}, headers=h
        ),
    ):
        assert call(auth_header(stranger)).status_code == 404
        assert call({}).status_code == 401


# ------------------------------------------------------------------ using a shared code


def test_a_shared_code_gives_the_discount_and_the_staff_see_it(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    made = _make(client, organiser, place)
    day = future_day().isoformat()
    shown = client.get(
        f"/api/r/{place.public_id}/offers/check",
        params={"code": made["code"].lower(), "email": "lia@example.com", "day": day, "party": 2},
    )
    assert shown.status_code == 200 and shown.json()["what"] == "10% off your bill"
    booked = _book(client, place, offer_code=made["code"])
    assert booked.status_code == 201, booked.text
    assert booked.json()["offer"] == {"name": "Spring offer", "what": "10% off your bill"}
    # The restaurant's own staff see what to take off the bill, and the diner on their page.
    floor = client.get(
        f"/api/staff/{place.public_id}/floor",
        params={"date": day, "time": "19:00"},
        headers=auth_header(organiser),
    )
    assert floor.json()["bookings"][0]["offer"]["what"] == "10% off your bill"
    manage = client.get(f"/api/b/{booked.json()['manage_token']}").json()
    assert manage["offer"]["name"] == "Spring offer"


def test_a_code_cannot_be_used_twice_by_the_same_guest_but_another_guest_may(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    code = _make(client, organiser, place)["code"]
    assert _book(client, place, "lia@example.com", offer_code=code).status_code == 201
    again = _book(client, place, "LIA@example.com", offer_code=code)
    assert again.status_code == 422 and "already used" in again.json()["error"]["message"]
    assert _book(client, place, "rui@example.com", offer_code=code).status_code == 201


def test_a_bad_offer_refuses_the_booking_before_anything_is_held_or_saved(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    code = _make(client, organiser, place, min_party=6)["code"]
    refused = _book(client, place, offer_code=code)
    assert refused.status_code == 422 and refused.json()["error"]["code"] == "offer_invalid"
    assert "6 or more" in refused.json()["error"]["message"]
    session.expire_all()
    assert session.scalars(select(OfferRedemption)).all() == []
    # The same hold works with no code: nothing was spent.
    plain = _book(client, place)
    assert plain.status_code == 201 and "offer" not in plain.json()


@pytest.mark.parametrize(
    ("over", "words"),
    [
        ({"ends_on": (future_day(-1)).isoformat()}, "has ended"),
        ({"starts_on": (future_day(40)).isoformat()}, "starts on"),
        ({"weekdays": [(future_day().weekday() + 1) % 7]}, "valid on"),
    ],
)
def test_an_offer_is_checked_against_the_day_of_the_booking(
    client: TestClient, session: Session, organiser: Organiser, over: dict[str, Any], words: str
) -> None:
    place = make_restaurant(session, organiser)
    code = _make(client, organiser, place, **over)["code"]
    answer = _book(client, place, offer_code=code)
    assert answer.status_code == 422 and words in answer.json()["error"]["message"]


def test_an_offer_with_a_limit_stops_when_it_is_used_up_and_cancelling_gives_the_use_back(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    code = _make(client, organiser, place, max_uses=1)["code"]
    first = _book(client, place, "lia@example.com", offer_code=code)
    assert first.status_code == 201
    full = _book(client, place, "rui@example.com", offer_code=code)
    assert full.status_code == 422 and "fully used" in full.json()["error"]["message"]
    assert client.delete(f"/api/b/{first.json()['manage_token']}").status_code == 200
    assert _book(client, place, "rui@example.com", offer_code=code).status_code == 201
    session.expire_all()
    spent = session.scalars(select(OfferRedemption)).all()
    assert sorted(bool(r.released_at) for r in spent) == [False, True]


def test_an_archived_offer_cannot_be_used(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    made = _make(client, organiser, place)
    client.post(_url(place, f"/{made['id']}/archive"), headers=auth_header(organiser))
    answer = _book(client, place, offer_code=made["code"])
    assert answer.status_code == 422 and "no longer available" in answer.json()["error"]["message"]


def test_codes_cannot_be_probed(client: TestClient, session: Session, organiser: Organiser) -> None:
    place = make_restaurant(session, organiser)
    other = make_restaurant(session, organiser)
    code = _make(client, organiser, other)["code"]  # a real code, but of another restaurant
    params = {"email": "lia@example.com", "day": future_day().isoformat(), "party": 2}
    wrong = client.get(
        f"/api/r/{place.public_id}/offers/check", params={**params, "code": "ZZZZZZZZ"}
    )
    foreign = client.get(f"/api/r/{place.public_id}/offers/check", params={**params, "code": code})
    assert wrong.status_code == foreign.status_code == 422
    assert wrong.json()["error"] == foreign.json()["error"]
    # And asking over and over is stopped.
    codes = [
        client.get(
            f"/api/r/{place.public_id}/offers/check", params={**params, "code": f"AAAAAAA{i}"}
        ).status_code
        for i in range(20)
    ]
    assert 429 in codes
    assert (
        client.get(
            f"/api/r/{place.public_id}/offers/check",
            params={"code": "x", "email": "not-an-email", "day": "2030-01-01"},
        ).status_code
        == 422
    )


# ------------------------------------------------------------------ sending to guests


def test_a_send_reaches_only_guests_who_said_yes_and_never_the_others(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    made = _make(client, organiser, place, audience="send")
    _guest(session, place, "yes1@example.com", True)
    _guest(session, place, "yes2@example.com", True)
    _guest(session, place, "no@example.com", False)

    preview = client.post(
        _url(place, "/audience"), json={"segment": "all"}, headers=auth_header(organiser)
    ).json()
    assert preview == {"segment": "all", "in_segment": 3, "reachable": 2, "skipped_no_consent": 1}
    sent = client.post(
        _url(place, f"/{made['id']}/send"), json={"segment": "all"}, headers=auth_header(organiser)
    ).json()
    assert sent["sent"] == 2 and sent["skipped_no_consent"] == 1
    mails = _emails(session)
    assert sorted(m.to_email for m in mails) == ["yes1@example.com", "yes2@example.com"]
    assert not any(m.to_email == "no@example.com" for m in mails)
    # Sending again changes nothing: each guest holds one code per offer.
    again = client.post(
        _url(place, f"/{made['id']}/send"), json={"segment": "all"}, headers=auth_header(organiser)
    ).json()
    assert again["sent"] == 0
    assert len(_emails(session)) == 2


def test_the_email_has_the_code_a_stop_link_and_says_why_it_was_sent(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    made = _make(
        client,
        organiser,
        place,
        audience="send",
        note="Come back and see the new menu.",
        ends_on=(future_day(30)).isoformat(),
    )
    _guest(session, place, "yes@example.com", True)
    client.post(
        _url(place, f"/{made['id']}/send"), json={"segment": "all"}, headers=auth_header(organiser)
    )
    (mail,) = _emails(session)
    code = session.scalars(select(OfferCode)).one().code
    assert code in mail.body_text and "10% off your bill" in mail.body_text
    assert "Come back and see the new menu." in mail.body_text
    assert "you said yes to offers from Test Bistro" in mail.body_text
    assert f"/r/{place.public_id}?offer={code}" in mail.body_text
    # The one-tap stop link works, and finished emails lose it with the other personal links.
    stop = next(word for word in mail.body_text.split() if "/u/" in word)
    token = stop.split("/u/")[1]
    assert client.get(f"/api/u/{token}").json()["subscribed"] is True
    assert "/u/" not in redact_links(mail.body_text).replace("[personal link removed]", "")


def test_a_guest_who_stops_offers_gets_nothing_more(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    made = _make(client, organiser, place, audience="send")
    _guest(session, place, "yes@example.com", True)
    venue = session.get(Venue, place.venue_id)
    consents.withdraw(session, venue, "yes@example.com")
    session.commit()
    sent = client.post(
        _url(place, f"/{made['id']}/send"), json={"segment": "all"}, headers=auth_header(organiser)
    ).json()
    assert sent["sent"] == 0 and _emails(session) == []


def test_a_guest_is_never_sent_two_offers_within_two_weeks_and_the_day_has_a_cap(
    client: TestClient, session: Session, organiser: Organiser, monkeypatch: pytest.MonkeyPatch
) -> None:
    place = make_restaurant(session, organiser)
    first = _make(client, organiser, place, name="First", audience="send")
    second = _make(client, organiser, place, name="Second", audience="send")
    _guest(session, place, "yes@example.com", True)
    assert (
        client.post(
            _url(place, f"/{first['id']}/send"),
            json={"segment": "all"},
            headers=auth_header(organiser),
        ).json()["sent"]
        == 1
    )
    blocked = client.post(
        _url(place, f"/{second['id']}/send"),
        json={"segment": "all"},
        headers=auth_header(organiser),
    ).json()
    assert blocked["sent"] == 0 and blocked["skipped_recent_or_already"] == 1
    # The restaurant's daily cap.
    monkeypatch.setattr(offers, "DAILY_SEND_CAP", 1)
    _guest(session, place, "two@example.com", True)
    _guest(session, place, "three@example.com", True)
    third = _make(client, organiser, place, name="Third", audience="send")
    capped = client.post(
        _url(place, f"/{third['id']}/send"),
        json={"segment": "list", "emails": ["two@example.com", "three@example.com"]},
        headers=auth_header(organiser),
    ).json()
    assert capped["sent"] == 0 and capped["left_for_today"] == 0


def test_segments_pick_the_right_guests(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    for days in (200, 150, 100):
        _guest(session, place, "regular@example.com", True, days)
    _guest(session, place, "new@example.com", True, 10)
    _guest(session, place, "lapsed@example.com", True, 90)

    def reach(segment: str, **extra: Any) -> int:
        body = {"segment": segment, **extra}
        return client.post(
            _url(place, "/audience"), json=body, headers=auth_header(organiser)
        ).json()["reachable"]

    assert reach("all") == 3
    assert reach("regular") == 1
    assert reach("lapsed") == 2  # the regular's last visit was also 100 days ago
    assert reach("list", emails=["new@example.com", "stranger@example.com"]) == 1
    assert (
        client.post(
            _url(place, "/audience"), json={"segment": "everyone"}, headers=auth_header(organiser)
        ).status_code
        == 422
    )


def test_only_an_offer_you_send_yourself_can_be_sent_and_only_while_active(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    shared = _make(client, organiser, place)
    assert (
        client.post(
            _url(place, f"/{shared['id']}/send"),
            json={"segment": "all"},
            headers=auth_header(organiser),
        ).status_code
        == 409
    )
    mine = _make(client, organiser, place, audience="send")
    client.post(_url(place, f"/{mine['id']}/archive"), headers=auth_header(organiser))
    assert (
        client.post(
            _url(place, f"/{mine['id']}/send"),
            json={"segment": "all"},
            headers=auth_header(organiser),
        ).status_code
        == 409
    )


# ------------------------------------------------------------------ a guest's own code


def test_a_guests_own_code_works_only_for_that_guest(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    made = _make(client, organiser, place, audience="send")
    _guest(session, place, "yes@example.com", True)
    client.post(
        _url(place, f"/{made['id']}/send"), json={"segment": "all"}, headers=auth_header(organiser)
    )
    code = session.scalars(select(OfferCode)).one().code
    elsewhere = _book(client, place, "someone.else@example.com", offer_code=code)
    assert (
        elsewhere.status_code == 422
        and elsewhere.json()["error"]["message"] == "This code is not valid."
    )
    mine = _book(client, place, "YES@example.com", offer_code=code)
    assert mine.status_code == 201 and mine.json()["offer"]["name"] == "Spring offer"


# ------------------------------------------------------------------ automatic offers


def test_a_win_back_offer_goes_to_guests_who_stopped_coming_and_said_yes(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    _make(client, organiser, place, audience="auto", rule={"type": "winback", "days": 60})
    _guest(session, place, "gone@example.com", True, 90)
    _guest(session, place, "recent@example.com", True, 10)
    _guest(session, place, "gone.no@example.com", False, 90)
    assert offers.sweep_auto(session, utc_now()) == 1
    assert [m.to_email for m in _emails(session)] == ["gone@example.com"]
    assert offers.sweep_auto(session, utc_now()) == 0  # once per guest per offer
    assert len(_emails(session)) == 1


def test_a_welcome_and_an_nth_visit_offer(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    _make(client, organiser, place, name="Welcome", audience="auto", rule={"type": "welcome"})
    _guest(session, place, "first@example.com", True, 2)  # one visit, two days ago
    _guest(
        session, place, "old@example.com", True, 40
    )  # one visit, but long ago: too late to welcome
    assert offers.sweep_auto(session, utc_now()) == 1
    assert [m.to_email for m in _emails(session)] == ["first@example.com"]


def test_nothing_is_given_for_an_archived_or_ended_automatic_offer(
    client: TestClient, session: Session, organiser: Organiser
) -> None:
    place = make_restaurant(session, organiser)
    made = _make(client, organiser, place, audience="auto", rule={"type": "winback", "days": 30})
    _guest(session, place, "gone@example.com", True, 90)
    client.post(_url(place, f"/{made['id']}/archive"), headers=auth_header(organiser))
    assert offers.sweep_auto(session, utc_now()) == 0
    client.post(_url(place, f"/{made['id']}/archive"), headers=auth_header(organiser))
    row = session.get(Offer, made["id"])
    row.ends_on = (utc_now() - timedelta(days=1)).date()
    session.commit()
    assert offers.sweep_auto(session, utc_now()) == 0
    assert _emails(session) == []


def test_a_codes_look_is_easy_to_read_aloud() -> None:
    for _ in range(50):
        code = offers.new_code()
        assert len(code) == 8 and not set(code) & set("01OI")
