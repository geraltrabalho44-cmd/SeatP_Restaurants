"""The calendar file (.ics) of a restaurant booking, for the diner to add it to their own calendar.

It has no ORGANIZER and no ATTENDEE: nobody's address ends up in a file the diner may share. The UID is stable per booking,
so opening the file again after a change updates the entry instead of adding a second one (SEQUENCE grows with the change).
Written in the language the diner booked in.
"""

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.mail.ics import escape_text, fold_line, format_utc, make_uid
from app.mail.restaurant_text import known, party, text
from app.models import Booking, Venue
from app.restaurant_service import occupancy
from app.restaurant_service.booking_rows import table_labels

PRODUCT_ID = "-//SeatPlan//Restaurant booking//EN"
EPOCH = datetime(2026, 1, 1, tzinfo=UTC)


def booking_calendar(
    session: Session, venue: Venue, booking: Booking, link: str, now: datetime | None = None
) -> str:
    """The text of the .ics file for a confirmed booking."""
    locale = known(booking.locale)
    labels = table_labels(session, occupancy.tables_of(session, booking))
    lines_of_description = [party(booking.party_size, locale)]
    if labels:
        lines_of_description.append(text("table", locale, label=" + ".join(labels)))
    lines_of_description.append(text("calendar_manage", locale, link=link))
    stamp = now or datetime.now(UTC)
    # A booking keeps no edit counter, so the SEQUENCE is the minutes since the start of 2026: it only grows, and a file
    # downloaded after a change replaces the entry made from an older one.
    sequence = max(0, int((stamp - EPOCH).total_seconds() // 60))
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:{PRODUCT_ID}",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:{make_uid('booking', booking.public_id)}",
        f"DTSTAMP:{format_utc(stamp)}",
        f"DTSTART:{format_utc(booking.start_at)}",
        f"DTEND:{format_utc(booking.end_at)}",
        f"SEQUENCE:{sequence}",
        "STATUS:CONFIRMED",
        f"SUMMARY:{escape_text(text('calendar_summary', locale, restaurant=venue.name))}",
        f"LOCATION:{escape_text(', '.join(part for part in (venue.name, venue.address) if part))}",
        f"DESCRIPTION:{escape_text(chr(10).join(lines_of_description))}",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "".join(fold_line(line) + "\r\n" for line in lines)
