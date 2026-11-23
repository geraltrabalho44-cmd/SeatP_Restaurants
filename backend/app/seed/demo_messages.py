"""Switch on phone messages (SMS and WhatsApp, with the confirmation) for the demo restaurants.

A diner who gives a Portuguese mobile number, ticks the box and types the 6-digit code gets a message on the phone confirming
the booking, and reminders. Nothing is sent to a number that was not proven with the code. With the default demo providers no
message leaves the computer: a masked line is written to the log. A restaurant that already has settings of its own keeps them.

    python -m app.seed.demo_messages                 a local SQLite demo database (DEMO_MODE=1)
    python -m app.seed.demo_messages --allow-remote  the shared demo database (Neon)
"""

import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import db
from app.config import get_settings
from app.models import Venue, VenueMessageSettings
from app.restaurant_service import phone_messages


def seed(session: Session) -> int:
    """Settings for every demo restaurant that has none. Returns how many were made."""
    made = 0
    for venue in session.scalars(
        select(Venue).where(Venue.kind == "restaurant", Venue.is_demo.is_(True))
    ):
        if session.get(VenueMessageSettings, venue.id) is not None:
            continue
        phone_messages.save_settings(
            session,
            venue,
            phone_messages.MessageSettings(
                sms_enabled=True, whatsapp_enabled=True, send_confirmation=True
            ),
        )
        made += 1
    return made


def main(argv: list[str]) -> None:
    settings = get_settings()
    remote = "--allow-remote" in argv
    if not settings.demo_mode or (settings.is_postgres and not remote):
        raise SystemExit(
            "Use DEMO_MODE=1 with a local SQLite demo database, or add --allow-remote for the shared demo database."
        )
    db.init_engine(settings.database_url)
    with db.new_session() as session:
        made = seed(session)
        session.commit()
    print(f"Phone messages switched on for {made} demo restaurants.")


if __name__ == "__main__":
    main(sys.argv[1:])
