"""Make the Lisbon catalogue the only public restaurants of a demo database, with reviews.

Meant for the shared demo site (the Neon database behind Vercel), which has only the made-up restaurants.
Run from `backend/`:

    python -m app.seed.public_catalogue --allow-remote

It does four things, all repeatable:

1. adds the 20 Lisbon restaurants with their rooms, tables and licensed cover photos;
2. unpublishes every other demo restaurant (back to a draft: gone from search, nothing is deleted, the
   owner can publish it again);
3. adds ordinary-looking sample reviews, so every restaurant has a rating;
4. leaves the Events data alone.

The site is a university demo and says so on its landing page and in every footer. The Lisbon restaurants are
real businesses and their reviews, opening hours, floor plan and availability are invented, so keep that
wording if the site is ever shown beyond the course. Only use a database that holds nothing but demo data.
"""

import argparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import db
from app.config import get_settings
from app.models import Organiser, Venue
from app.restaurant_service import publishing
from app.seed import demo_reviews
from app.seed.lisbon_catalogue import seed as seed_lisbon
from app.seed.lisbon_data import DEMO_ID_PREFIX
from app.seed.run import DEMO_ORGANISER_EMAIL


def unpublish_invented(session: Session) -> list[str]:
    """Back to a draft: every published demo restaurant that is not from the Lisbon catalogue."""
    venues = session.scalars(
        select(Venue).where(
            Venue.kind == "restaurant", Venue.is_demo.is_(True), Venue.status == "published"
        )
    ).all()
    hidden = []
    for venue in venues:
        if not venue.public_id.startswith(DEMO_ID_PREFIX):
            publishing.unpublish(session, venue, actor="seed.public_catalogue")
            hidden.append(venue.name)
    return hidden


def run(session: Session, owner: Organiser) -> dict[str, object]:
    created, covers = seed_lisbon(session, owner)
    session.flush()
    hidden = unpublish_invented(session)
    venues, reviews = demo_reviews.seed(session, plain=True)
    session.commit()
    return {
        "created": created,
        "covers": covers,
        "hidden": hidden,
        "venues": venues,
        "reviews": reviews,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    parser.add_argument(
        "--allow-remote",
        action="store_true",
        help="run on a Postgres database (only one that holds nothing but demo data)",
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
        owner = session.scalar(select(Organiser).where(Organiser.email == DEMO_ORGANISER_EMAIL))
        if owner is None:
            raise SystemExit(
                "The demo organiser does not exist. Run app.seed.run on this database first."
            )
        result = run(session, owner)
    print(f"Lisbon restaurants created: {result['created']}, covers added: {result['covers']}.")
    print(f"Unpublished (drafts, nothing deleted): {', '.join(result['hidden']) or 'none'}.")  # type: ignore[arg-type]
    print(
        f"Reviews: {result['reviews']} added across {result['venues']} published demo restaurants."
    )


if __name__ == "__main__":
    main()
