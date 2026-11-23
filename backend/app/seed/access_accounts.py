"""Two accounts anybody can sign in with to try the site: a guest and a restaurant owner.

    python -m app.seed.access_accounts                 a local SQLite database (DEMO_MODE=1)
    python -m app.seed.access_accounts --allow-remote  the shared database (Neon): only one that holds nothing but demo data

| Who   | Email                  | Password   | What they see                                                   |
|-------|------------------------|------------|-----------------------------------------------------------------|
| guest | consumer@example.com   | consumer   | "My account" with two saved restaurants, at /restaurants/account |
| owner | owner@example.com      | owner      | the four restaurants of `owner_demo`, at /owner/sign-in          |

The passwords are short and public on purpose: they are for trying the site, and only ever guard demo data. The sign-in
forms ask for an email address, so the user names are the two addresses above. Repeatable: running it again resets
the two passwords and adds nothing twice. Run it before `owner_demo`, which hands the owner their restaurants.
"""

import argparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import db
from app.config import get_settings
from app.models import DinerFavorite, GuestAccount, Organiser, Venue, utc_now
from app.security import hash_password

GUEST_EMAIL = "consumer@example.com"
GUEST_PASSWORD = "consumer"
OWNER_EMAIL = "owner@example.com"
OWNER_PASSWORD = "owner"
SAVED = ("cafe-piolho", "cervejaria-ramiro")
CONSENT_VERSION = "2026-11-23"


def run(session: Session) -> dict[str, str]:
    guest = session.scalar(select(GuestAccount).where(GuestAccount.email == GUEST_EMAIL))
    if guest is None:
        guest = GuestAccount(
            email=GUEST_EMAIL,
            name="Consumer",
            password_hash=hash_password(GUEST_PASSWORD),
            # An @example.com address cannot be proven, so this account never takes over an invited guest.
            email_proven=False,
            consent_at=utc_now(),
            consent_version=CONSENT_VERSION,
        )
        session.add(guest)
        session.flush()
    else:
        guest.password_hash = hash_password(GUEST_PASSWORD)

    owner = session.scalar(select(Organiser).where(Organiser.email == OWNER_EMAIL))
    if owner is None:
        owner = Organiser(email=OWNER_EMAIL)
        session.add(owner)
    owner.name = "Owner"
    owner.role = "organiser"
    owner.password_hash = hash_password(OWNER_PASSWORD)

    saved = 0
    for slug in SAVED:
        venue = session.scalar(select(Venue).where(Venue.slug == slug, Venue.kind == "restaurant"))
        if venue is None:
            continue
        if session.get(DinerFavorite, (guest.id, venue.id)) is None:
            session.add(DinerFavorite(account_id=guest.id, venue_id=venue.id))
            saved += 1
    session.flush()
    return {
        "guest": GUEST_EMAIL,
        "owner": OWNER_EMAIL,
        "restaurants saved for the guest": str(saved),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    parser.add_argument(
        "--allow-remote", action="store_true", help="run on the shared Postgres demo database"
    )
    args = parser.parse_args()
    settings = get_settings()
    local = settings.demo_mode and settings.database_url.startswith("sqlite:")
    if not local and not args.allow_remote:
        raise SystemExit(
            "Use DEMO_MODE=1 with a local SQLite demo database, or pass --allow-remote."
        )
    db.init_engine(settings.database_url)
    db.create_all()
    with db.new_session() as session:
        report = run(session)
        session.commit()
    for key, value in report.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
