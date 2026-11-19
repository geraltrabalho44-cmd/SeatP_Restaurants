from datetime import timedelta

from sqlalchemy import select
from test_restaurant_helpers import book, future_day, hold, make_restaurant

from app.mail.outbox import redact_links
from app.models import Booking, EmailOutbox, RainPlanPolicy, Venue
from app.restaurant_service import occupancy, rain_plan


def test_offer_holds_indoor_table_until_diner_accepts(client, session, organiser, monkeypatch):
    place = make_restaurant(session, organiser)
    venue = session.get(Venue, place.venue_id)
    venue.lat, venue.lng = 38.72, -9.14
    session.add(RainPlanPolicy(venue_id=venue.id, enabled=True))
    session.commit()
    day = future_day()
    held = hold(client, place, day, "19:00", 3, table_id=place.table["T3"]).json()
    confirmed = book(client, place, held["hold_id"], 3).json()
    booking = session.scalar(select(Booking))
    original = occupancy.tables_of(session, booking)
    now = booking.start_at - timedelta(hours=23)
    monkeypatch.setattr(rain_plan, "utc_now", lambda: now)
    monkeypatch.setattr(
        rain_plan,
        "hourly",
        lambda *args: (
            [
                {
                    "stamp": booking.start_at.timestamp(),
                    "condition": "Rain expected",
                    "time": "19:00",
                    "probability": 82,
                }
            ],
            "fresh",
        ),
    )
    assert rain_plan.process(session) == 1
    assert rain_plan.process(session) == 0
    email = session.scalar(select(EmailOutbox).where(EmailOutbox.kind == "rain_offer"))
    link = email.body_text.split()[-1]
    assert link.split("/")[-1] not in redact_links(link)
    path = "/api/b/" + confirmed["manage_token"] + "/rain"
    assert client.get(path).json()["status"] == "offered"
    assert occupancy.tables_of(session, booking) == original
    # The test clock is advanced only for planning; the hold is live at acceptance.
    reply = client.post(path + "/accept")
    assert reply.status_code == 200, reply.text
    assert reply.json()["status"] == "accepted"
    session.expire_all()
    assert occupancy.tables_of(session, booking) != original
    assert client.post(path + "/accept").status_code == 409
