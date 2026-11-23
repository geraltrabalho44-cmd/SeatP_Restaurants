"""Remove the five made-up restaurants of the first demo, for good.

Casa Lumen, Tagus Terrace, Tasca do Bairro, Miradouro 7 and Pátio das Laranjeiras came before the Lisbon catalogue. They
have nothing real behind them, so Martim asked for them to go (2026-11-23). This deletes each of them with everything
that hangs off it (rooms, tables, chairs, opening hours, bookings, holds, reviews, menus, offers, messages and the rest)
and the demo links that led to them.

It only touches restaurants that are demo data (`is_demo`), have one of the five slugs and are not from the Lisbon
catalogue, so a restaurant an owner made is never removed. Rows elsewhere that merely mention a removed row through an
optional link (a guest account, an audit line) are kept and only lose that link. Repeatable: a second run removes nothing.

    python -m app.seed.remove_mock_restaurants                 a local SQLite demo database (DEMO_MODE=1)
    python -m app.seed.remove_mock_restaurants --allow-remote  the shared demo database (Neon): only after a backup

`python -m app.seed.run` and the demo reset still create them, because the automated tests are built on them.
"""

import sys
from collections.abc import Iterable
from typing import Any

from sqlalchemy import Table, and_, delete, or_, select, update
from sqlalchemy.orm import Session

from app import db
from app.config import get_settings
from app.models import Base, DemoLink, Venue
from app.seed.lisbon_data import DEMO_ID_PREFIX

MOCK_SLUGS = (
    "casa-lumen",
    "tagus-terrace",
    "tasca-do-bairro",
    "miradouro-7",
    "patio-das-laranjeiras",
)
CHUNK = 500

Row = dict[str, Any]


def mock_venues(session: Session) -> list[Venue]:
    """The made-up demo restaurants still in the database."""
    return list(
        session.scalars(
            select(Venue).where(
                Venue.kind == "restaurant",
                Venue.is_demo.is_(True),
                Venue.slug.in_(MOCK_SLUGS),
                ~Venue.public_id.startswith(DEMO_ID_PREFIX),
            )
        )
    )


def _key(table: Table, row: Row) -> tuple[Any, ...]:
    return tuple(row[column.name] for column in table.primary_key.columns)


def _chunks(values: list[Any]) -> Iterable[list[Any]]:
    for start in range(0, len(values), CHUNK):
        yield values[start : start + CHUNK]


def _rows_where(session: Session, table: Table, column_name: str, values: set[Any]) -> list[Row]:
    found: list[Row] = []
    for part in _chunks(sorted(values, key=repr)):
        result = session.execute(select(table).where(table.c[column_name].in_(part)))
        found.extend(dict(row._mapping) for row in result)
    return found


def _doomed(session: Session, venue_ids: list[int]) -> dict[str, dict[tuple[Any, ...], Row]]:
    """Every row that cannot live without one of these venues: followed through the required (NOT NULL) links only."""
    tables = Base.metadata.sorted_tables
    venues = Base.metadata.tables["venues"]
    doomed: dict[str, dict[tuple[Any, ...], Row]] = {table.name: {} for table in tables}
    for row in _rows_where(session, venues, "id", set(venue_ids)):
        doomed["venues"][_key(venues, row)] = row
    changed = True
    while changed:
        changed = False
        for table in tables:
            for fk in table.foreign_keys:
                parent = fk.column.table.name
                if fk.parent.nullable or not doomed.get(parent):
                    continue
                values = {row[fk.column.name] for row in doomed[parent].values()}
                for row in _rows_where(session, table, fk.parent.name, values):
                    key = _key(table, row)
                    if key not in doomed[table.name]:
                        doomed[table.name][key] = row
                        changed = True
    return doomed


def _match(table: Table, rows: list[Row]) -> Any:
    columns = list(table.primary_key.columns)
    if len(columns) == 1:
        return columns[0].in_([row[columns[0].name] for row in rows])
    return or_(*(and_(*(column == row[column.name] for column in columns)) for row in rows))


def _delete(session: Session, doomed: dict[str, dict[tuple[Any, ...], Row]]) -> None:
    tables = Base.metadata.sorted_tables
    # First every optional link that points at a doomed row is cleared, on doomed rows and on rows that stay. That breaks
    # the loops (a restaurant's cover photo points back at the restaurant) and keeps the rows that stay valid.
    for table in tables:
        for fk in table.foreign_keys:
            parent = fk.column.table.name
            if not fk.parent.nullable or not doomed.get(parent):
                continue
            values = sorted({row[fk.column.name] for row in doomed[parent].values()}, key=repr)
            for part in _chunks(values):
                session.execute(
                    update(table)
                    .where(table.c[fk.parent.name].in_(part))
                    .values({fk.parent.name: None})
                )
    # Then the rows go, children before parents.
    for table in reversed(tables):
        rows = list(doomed.get(table.name, {}).values())
        for part in _chunks(rows):
            session.execute(delete(table).where(_match(table, part)))


def remove(session: Session) -> list[str]:
    """Delete the made-up restaurants and the demo links to them. Returns their names. Does not commit."""
    venues = mock_venues(session)
    if not venues:
        return []
    names = [venue.name for venue in venues]
    addresses = [f"/r/{v.public_id}" for v in venues] + [f"/staff/{v.public_id}" for v in venues]
    addresses += [f"/restaurants/{v.slug}" for v in venues]
    venue_ids = [venue.id for venue in venues]
    session.flush()
    session.expunge_all()  # the rows are deleted below the ORM; nothing stale may be written back afterwards
    _delete(session, _doomed(session, venue_ids))
    session.execute(delete(DemoLink).where(DemoLink.path.in_(addresses)))
    return names


def main(argv: list[str]) -> None:
    settings = get_settings()
    remote = "--allow-remote" in argv
    if not settings.demo_mode or (settings.is_postgres and not remote):
        raise SystemExit(
            "Use DEMO_MODE=1 with a local SQLite demo database, or add --allow-remote for the shared demo database "
            "(only after a backup)."
        )
    db.init_engine(settings.database_url)
    with db.new_session() as session:
        removed = remove(session)
        session.commit()
    print(f"Removed {len(removed)} made-up restaurants: {', '.join(removed) or 'none left'}.")


if __name__ == "__main__":
    main(sys.argv[1:])
