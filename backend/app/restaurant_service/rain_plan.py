"""Optional indoor moves for existing terrace bookings. GET never moves a diner."""

from datetime import timedelta
from html import escape

from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError

from app import db
from app.config import get_settings
from app.core.errors import ApiError
from app.core.holds import confirm_hold
from app.mail.outbox import enqueue
from app.models import (
    Booking,
    Hold,
    RainOffer,
    RainPlanPolicy,
    Room,
    TableSlot,
    Venue,
    VenueTable,
    utc_now,
)
from app.restaurant_service import booking_rows, emails, holding, manage_flow, occupancy
from app.restaurant_service.changes import record_change
from app.restaurant_service.clock import venue_zone
from app.restaurant_service.map_view import fit_problem
from app.restaurant_service.weather_view import hourly
from app.security import hash_token, new_token


def candidates(session, now):
    return list(
        session.scalars(
            select(Booking)
            .join(Venue, Venue.id == Booking.venue_id)
            .join(RainPlanPolicy, RainPlanPolicy.venue_id == Booking.venue_id)
            .outerjoin(RainOffer, RainOffer.booking_id == Booking.id)
            .where(
                RainPlanPolicy.enabled.is_(True),
                Venue.lat.is_not(None),
                Venue.lng.is_not(None),
                Booking.status == "confirmed",
                Booking.start_at > now + timedelta(hours=2),
                Booking.start_at <= now + timedelta(hours=36),
                Booking.email != "",
                (RainOffer.booking_id.is_(None))
                | (
                    (RainOffer.status == "watching")
                    & (RainOffer.checked < now - timedelta(hours=2))
                ),
            )
            .order_by(RainOffer.checked.asc().nullsfirst(), Booking.start_at)
            .limit(12)
        )
    )


def process(session):
    now = utc_now()
    count = 0
    for booking in candidates(session, now):
        venue = session.get(Venue, booking.venue_id)
        db.insert_ignoring_duplicates(
            session,
            RainOffer,
            {"booking_id": booking.id, "checked": now, "status": "watching", "snapshot": {}},
        )
        offer = session.get(RainOffer, booking.id)
        offer.checked = now
        session.commit()
        table_ids = occupancy.tables_of(session, booking)
        kinds = occupancy.zone_kinds(session, venue)
        tables = occupancy.venue_tables(session, venue)
        outdoor = set(
            session.scalars(
                select(Room.id).where(Room.venue_id == venue.id, Room.is_outdoor.is_(True))
            )
        )

        outside_ids = {
            row.id
            for row in tables
            if row.room_id in outdoor or kinds.get(row.zone_id) == "terrace"
        }
        if not outside_ids.intersection(table_ids):
            continue
        hours, state = hourly(session, venue, booking.date, now)
        wet = next(
            (
                h
                for h in hours
                if h["condition"] == "Rain expected"
                and h["stamp"] < booking.end_at.timestamp()
                and h["stamp"] + 3600 > booking.start_at.timestamp()
            ),
            None,
        )
        if not wet or state != "fresh":
            continue
        slots = list(
            session.scalars(select(TableSlot.slot_index).where(TableSlot.booking_id == booking.id))
        )
        if not slots:
            continue
        window = min(slots), max(slots) + 1
        busy = occupancy.merge(
            occupancy.booked_slots(session, venue, booking.date),
            occupancy.held_slots(session, venue, booking.date),
        )
        needs = manage_flow.needs_of(booking, booking.party_size)
        indoors = sorted(
            (
                row
                for row in tables
                if row.id not in outside_ids
                and not fit_problem(row, needs)
                and occupancy.is_free((row.id,), busy, window)
            ),
            key=lambda r: (r.max_party - booking.party_size, r.id),
        )
        if not indoors:
            continue
        row = indoors[0]
        token = new_token()
        expires = min(booking.start_at - timedelta(hours=1), now + timedelta(hours=4))
        try:
            holding.check_hold_caps(
                session, venue, booking.date, "rain", ((row.id,), window), len(tables)
            )
            claim = session.execute(
                update(RainOffer)
                .where(RainOffer.booking_id == booking.id, RainOffer.status == "watching")
                .values(
                    status="offered",
                    token_hash=hash_token(token),
                    expires_at=expires,
                    snapshot={
                        "start": booking.start_at.isoformat(),
                        "end": booking.end_at.isoformat(),
                        "party": booking.party_size,
                        "original": list(table_ids),
                        "table": row.id,
                        "label": row.label,
                        "window": list(window),
                        "probability": wet["probability"],
                        "rain_at": wet["time"],
                    },
                )
            )
            if not claim.rowcount:
                continue
            scope = occupancy.scope_for(venue, booking.date)
            for index in range(*window):
                session.execute(
                    delete(Hold).where(
                        Hold.scope == scope,
                        Hold.resource_kind == "table",
                        Hold.resource_id == row.id,
                        Hold.slot_key == str(index),
                        Hold.expires_at <= now,
                    )
                )
                session.add(
                    Hold(
                        scope=scope,
                        resource_kind="table",
                        resource_id=row.id,
                        slot_key=str(index),
                        holder_key=f"rain:{booking.id}",
                        expires_at=expires,
                    )
                )
            link = get_settings().public_base_url.rstrip("/") + "/b/rain/" + token
            source = (
                "Simulated weather (demo)"
                if get_settings().weather_provider == "demo"
                else "Weather data by Open-Meteo.com"
            )
            message = f"Rain expected at {wet['time']} ({wet['probability']}%). Indoor table {row.label} is held until {expires.astimezone(venue_zone(venue)):%H:%M}. Your reservation stays unchanged unless you accept. {source}."
            enqueue(
                session,
                idempotency_key=f"rain-offer-{booking.public_id}",
                to_email=booking.email,
                kind="rain_offer",
                subject=f"An indoor table is available at {venue.name}",
                body_text=message + " " + link,
                body_html=f'<p>{escape(message)}</p><p><a href="{escape(link, quote=True)}">Review indoor table</a></p>',
            )
            session.commit()
            count += 1
        except (IntegrityError, ApiError):
            session.rollback()
    return count


def load(session, token):
    row = session.scalar(select(RainOffer).where(RainOffer.token_hash == hash_token(token)))
    if row is None:
        raise ApiError(404, "not_found", "This rain offer is unavailable.")
    return row


def describe(session, row):
    booking = session.get(Booking, row.booking_id)
    venue = session.get(Venue, booking.venue_id)
    data = row.snapshot
    status = row.status
    if status == "offered":
        if row.expires_at <= utc_now():
            status = "expired"
        elif (
            booking.status != "confirmed"
            or data["start"] != booking.start_at.isoformat()
            or data["end"] != booking.end_at.isoformat()
            or data["party"] != booking.party_size
            or set(data["original"]) != set(occupancy.tables_of(session, booking))
        ):
            status = "withdrawn"
    return {
        "restaurant": venue.name,
        "status": status,
        "table": data["label"],
        "rain_at": data["rain_at"],
        "probability": data["probability"],
        "expires": row.expires_at.astimezone(venue_zone(venue)).isoformat(),
    }


def decide(session, row, accept):
    booking = session.get(Booking, row.booking_id, with_for_update=True, populate_existing=True)
    row = session.get(RainOffer, booking.id, with_for_update=True, populate_existing=True)
    if describe(session, row)["status"] != "offered":
        raise ApiError(409, "conflict", "This offer is no longer available.")
    venue = session.get(Venue, booking.venue_id)
    data = row.snapshot
    holder = f"rain:{booking.id}"
    if accept:
        manage_flow.check_changeable(venue, booking)
        table = session.get(VenueTable, data["table"])
        if (
            not table
            or not table.is_active
            or fit_problem(table, manage_flow.needs_of(booking, booking.party_size))
        ):
            raise ApiError(409, "conflict", "The indoor table is no longer suitable.")
        for index in range(*data["window"]):
            confirm_hold(
                session,
                scope=occupancy.scope_for(venue, booking.date),
                resource_kind="table",
                resource_id=table.id,
                slot_key=str(index),
                holder_key=holder,
            )
        booking_rows.release_slots(session, booking)
        booking.chosen_seat_id = None
        booking_rows.write_slots(session, booking, (table.id,), tuple(data["window"]))
        emails.drop_reminder(session, booking)
        emails.queue_change(session, venue, booking)
        row.status = "accepted"
    else:
        session.execute(delete(Hold).where(Hold.holder_key == holder))
        row.status = "declined"
    record_change(
        session,
        venue,
        [booking.date],
        actor="diner",
        action="rain." + row.status,
        entity="booking",
        entity_id=booking.public_id,
        detail={},
    )
    session.commit()
    return describe(session, row)
