"""What the owner learns from their own bookings: totals, the busiest tables, and their guests.

Everything here is worked out from the bookings the restaurant already has: no new table, no
copy of anyone's data. A "guest" is one email address at this restaurant; the same person booking
with another address counts as another guest, and says so nowhere else. Only the restaurant's
owner reads this (the router checks that), and only about their own restaurant.

Cancelled bookings never count as a visit. A visit is a booking that was seated, is finishing or
is completed; a no-show is its own number, and is how the owner sees who lets a table go empty.
"""

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Booking, Room, TableSlot, Venue, VenueTable
from app.restaurant_service import consents
from app.restaurant_service.clock import now_local, venue_zone

PERIODS = (30, 90, 365)
VISIT_STATUSES = ("seated", "finishing", "completed")
# A booking that was made and not cancelled. A no-show still counts here: the table was booked,
# and the owner is shown the no-shows separately.
HELD_STATUSES = ("confirmed", "seated", "finishing", "completed", "no_show")
REGULAR_VISITS = 3
LAPSED_DAYS = 60
TOP_TABLES = 5
PAGE_SIZE = 50
SORTS = ("recent", "visits", "name")
SEGMENTS = ("new", "regular", "lapsed", "no_shows", "offers")


def _since(venue: Venue, days: int) -> date:
    return now_local(venue).date() - timedelta(days=days)


def check_period(days: int) -> int:
    if days not in PERIODS:
        raise ValueError(f"days must be one of {PERIODS}")
    return days


# ---------------------------------------------------------------- totals


def overview(session: Session, venue: Venue, days: int) -> dict[str, Any]:
    """Bookings, covers, no-shows and when the restaurant fills, for the last `days` days."""
    zone = venue_zone(venue)
    today = now_local(venue).date()
    rows = session.scalars(
        select(Booking).where(
            Booking.venue_id == venue.id, Booking.date >= _since(venue, days), Booking.date <= today
        )
    ).all()
    by_status = Counter(row.status for row in rows)
    kept = [row for row in rows if row.status in HELD_STATUSES]
    weekdays = [{"weekday": index, "bookings": 0, "covers": 0} for index in range(7)]
    hours: Counter[int] = Counter()
    for row in kept:
        weekdays[row.date.weekday()]["bookings"] += 1
        weekdays[row.date.weekday()]["covers"] += row.party_size
        hours[row.start_at.astimezone(zone).hour] += 1
    finished = by_status["completed"] + by_status["no_show"]
    leads = [
        max(0, (row.start_at - row.created_at).total_seconds() / 86400)
        for row in kept
        if row.source == "diner"
    ]
    return {
        "days": days,
        "bookings": len(kept),
        "covers": sum(row.party_size for row in kept),
        "completed": by_status["completed"],
        "no_shows": by_status["no_show"],
        "cancelled": by_status["cancelled"],
        # No-shows out of the bookings that are over, so a quiet week does not look like a good one.
        "no_show_rate": round(by_status["no_show"] / finished, 3) if finished else None,
        "cancel_rate": round(by_status["cancelled"] / len(rows), 3) if rows else None,
        "average_party": round(sum(r.party_size for r in kept) / len(kept), 1) if kept else None,
        "average_lead_days": round(sum(leads) / len(leads), 1) if leads else None,
        "sources": dict(Counter(row.source for row in kept)),
        "weekdays": weekdays,
        "hours": [{"hour": hour, "bookings": hours[hour]} for hour in sorted(hours)],
        "returning_share": _returning_share(session, venue, kept),
    }


def _returning_share(session: Session, venue: Venue, kept: list[Booking]) -> float | None:
    """Of the guests in this period, the share who had booked here before (and were not cancelled)."""
    emails = {row.email.lower() for row in kept}
    if not emails:
        return None
    first = _first_booking_dates(session, venue)
    period_start = min(row.date for row in kept)
    # Returning: booked here before this period, or more than once inside it.
    counts = Counter(row.email.lower() for row in kept)
    returning = sum(
        1 for email in emails if first.get(email, period_start) < period_start or counts[email] > 1
    )
    return round(returning / len(emails), 3)


def _first_booking_dates(session: Session, venue: Venue) -> dict[str, date]:
    first: dict[str, date] = {}
    rows = session.execute(
        select(Booking.email, Booking.date).where(
            Booking.venue_id == venue.id, Booking.status.in_(HELD_STATUSES)
        )
    ).all()
    for email, day in rows:
        key = email.lower()
        if key not in first or day < first[key]:
            first[key] = day
    return first


# ---------------------------------------------------------------- tables


@dataclass(frozen=True)
class TableDemand:
    id: int
    label: str
    room_id: int | None
    bookings: int
    covers: int


def table_demand(session: Session, venue: Venue, days: int) -> dict[str, Any]:
    """How often each table was booked, most booked first, with its place on the floor plan.

    A booking that joins two tables counts for both. The share is each table's bookings out of
    all table-bookings, so the numbers add up to 100%.
    """
    today = now_local(venue).date()
    pairs = session.execute(
        select(TableSlot.table_id, Booking.id, Booking.party_size)
        .join(Booking, Booking.id == TableSlot.booking_id)
        .where(
            Booking.venue_id == venue.id,
            Booking.status.in_(HELD_STATUSES),
            Booking.date >= _since(venue, days),
            Booking.date <= today,
        )
        .distinct()
    ).all()
    counts: Counter[int] = Counter()
    covers: Counter[int] = Counter()
    for table_id, _, party in pairs:
        counts[table_id] += 1
        covers[table_id] += party
    tables = session.scalars(
        select(VenueTable).where(VenueTable.venue_id == venue.id, VenueTable.is_active.is_(True))
    ).all()
    total = sum(counts[table.id] for table in tables)
    top = max((counts[table.id] for table in tables), default=0)
    rows = [
        {
            "id": table.id,
            "label": table.label,
            "room_id": table.room_id,
            "shape": table.shape,
            "x": table.x,
            "y": table.y,
            "w": table.w,
            "h": table.h,
            "rotation": table.rotation,
            "seats": table.max_party,
            "bookings": counts[table.id],
            "covers": covers[table.id],
            "share": round(counts[table.id] / total, 3) if total else 0.0,
            # 0 to 1 against the busiest table: what the colour on the plan shows.
            "heat": round(counts[table.id] / top, 3) if top else 0.0,
        }
        for table in tables
    ]
    rows.sort(key=lambda row: (-row["bookings"], row["label"]))
    rooms = session.scalars(
        select(Room).where(Room.venue_id == venue.id).order_by(Room.position, Room.id)
    ).all()
    return {
        "days": days,
        "total": total,
        "rooms": [{"id": room.id, "name": room.name} for room in rooms],
        "tables": rows,
        # The busiest few, which is what the owner is told first. Only tables that were booked.
        "top": [row["id"] for row in rows[:TOP_TABLES] if row["bookings"] > 0],
    }


# ---------------------------------------------------------------- guests


def _segment_flags(entry: dict[str, Any], today: date) -> list[str]:
    flags = []
    if entry["bookings"] == 1:
        flags.append("new")
    if entry["visits"] >= REGULAR_VISITS:
        flags.append("regular")
    last = entry["last_visit"]
    if last is not None and (today - date.fromisoformat(last)).days > LAPSED_DAYS:
        flags.append("lapsed")
    if entry["no_shows"] >= 2:
        flags.append("no_shows")
    if entry["offers"]:
        flags.append("offers")
    return flags


def guest_book(session: Session, venue: Venue) -> list[dict[str, Any]]:
    """Every guest of the restaurant, one row per email, from all their bookings."""
    today = now_local(venue).date()
    groups: dict[str, list[Booking]] = defaultdict(list)
    for row in session.scalars(select(Booking).where(Booking.venue_id == venue.id)):
        groups[row.email.lower()].append(row)
    takers = consents.consenting_emails(session, venue)
    book = []
    for email, rows in groups.items():
        rows.sort(key=lambda r: r.start_at)
        latest = rows[-1]
        visits = [r for r in rows if r.status in VISIT_STATUSES]
        upcoming = [r for r in rows if r.status in ("confirmed", "pending") and r.date >= today]
        entry = {
            "email": email,
            "name": latest.name,
            "phone": next((r.phone for r in reversed(rows) if r.phone), None),
            "bookings": len([r for r in rows if r.status != "cancelled"]),
            "visits": len(visits),
            "no_shows": sum(1 for r in rows if r.status == "no_show"),
            "cancellations": sum(1 for r in rows if r.status == "cancelled"),
            "covers": sum(r.party_size for r in visits),
            "first_booking": rows[0].date.isoformat(),
            "last_visit": visits[-1].date.isoformat() if visits else None,
            "next_booking": min(r.date for r in upcoming).isoformat() if upcoming else None,
            "usual_party": Counter(r.party_size for r in visits).most_common(1)[0][0]
            if visits
            else None,
            "allergies": _latest_text(rows, "allergies"),
            "dietary": _latest_text(rows, "dietary_requirements"),
        }
        entry["offers"] = email in takers
        entry["segments"] = _segment_flags(entry, today)
        book.append(entry)
    return book


def _latest_text(rows: list[Booking], field: str) -> str:
    for row in reversed(rows):
        text = getattr(row, field, "")
        if text:
            return text
    return ""


def guests(
    session: Session,
    venue: Venue,
    query: str = "",
    sort: str = "recent",
    segment: str | None = None,
    offset: int = 0,
    limit: int = PAGE_SIZE,
) -> dict[str, Any]:
    if sort not in SORTS:
        raise ValueError("unknown sort")
    if segment is not None and segment not in SEGMENTS:
        raise ValueError("unknown segment")
    book = guest_book(session, venue)
    needle = query.strip().lower()
    if needle:
        book = [g for g in book if needle in g["email"] or needle in g["name"].lower()]
    counts = {name: sum(1 for g in book if name in g["segments"]) for name in SEGMENTS}
    if segment:
        book = [g for g in book if segment in g["segments"]]
    if sort == "visits":
        book.sort(key=lambda g: (-g["visits"], g["name"].lower()))
    elif sort == "name":
        book.sort(key=lambda g: g["name"].lower())
    else:
        book.sort(key=lambda g: g["last_visit"] or g["first_booking"], reverse=True)
    return {
        "total": len(book),
        "segments": counts,
        "guests": book[offset : offset + limit],
        "offset": offset,
        "limit": limit,
    }
