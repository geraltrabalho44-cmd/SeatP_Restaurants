"""Spread the tables of the demo restaurants evenly inside their rooms, so none touches another.

The demo plans were placed with a little random jitter, so some tables (with their chairs) touched. This puts them on
an even grid instead: the tables of a zone inside that zone, the tables of a room without zones inside the room, with
the same gap between neighbours and from the walls, and clear of the bar, toilets and other furniture.

    python -m app.seed.tidy_layouts                 a local SQLite demo database (DEMO_MODE=1)
    python -m app.seed.tidy_layouts --allow-remote  the shared demo database (Neon): only after a backup

The Lisbon catalogue command runs this at its end. `app.seed.run` does not (the browser tests rely on the showcase plan staying as it is).
Only demo restaurants are touched (never one an owner drew). Repeatable: tidy plans come out the same.
Bookings keep their tables: only x and y change, and each table's chairs move with it.
"""

import math
import re
import sys
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import db
from app.config import get_settings
from app.models import Room, RoomFixture, Seat, Venue, VenueTable, Zone

CHAIR = (
    20.0  # half the size of a chair, in cm: the plan draws a chair about this big around its centre
)
WALL_MARGIN = 40.0  # clear space between a wall and the nearest chair
ZONE_MARGIN = 12.0
MIN_GAP = 24.0  # the clear space between two tables' chairs that reads as comfortable
TIGHT_GAPS = (24.0, 16.0, 10.0)  # tried in this order; a plan never goes below the last one
OBSTACLE_KINDS = {
    "bar",
    "kitchen",
    "wc",
    "column",
    "stairs",
    "plant",
    "stage",
    "fireplace",
    "tv",
    "host_stand",
}


@dataclass(frozen=True)
class Box:
    x0: float
    y0: float
    x1: float
    y1: float

    @property
    def w(self) -> float:
        return self.x1 - self.x0

    @property
    def h(self) -> float:
        return self.y1 - self.y0

    def overlaps(self, other: "Box", gap: float = 0.0) -> bool:
        return (
            self.x0 < other.x1 + gap
            and other.x0 < self.x1 + gap
            and self.y0 < other.y1 + gap
            and other.y0 < self.y1 + gap
        )


def footprint(table: VenueTable, seats: list[Seat]) -> Box:
    """The box around a table and all its chairs (a turned table is turned first)."""
    cx, cy = table.x + table.w / 2, table.y + table.h / 2
    angle = math.radians(table.rotation or 0.0)
    points = []
    for dx, dy in ((0, 0), (table.w, 0), (table.w, table.h), (0, table.h)):
        px, py = table.x + dx - cx, table.y + dy - cy
        points.append(
            (
                cx + px * math.cos(angle) - py * math.sin(angle),
                cy + px * math.sin(angle) + py * math.cos(angle),
            )
        )
    for seat in seats:
        points += [(seat.x - CHAIR, seat.y - CHAIR), (seat.x + CHAIR, seat.y + CHAIR)]
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    return Box(min(xs), min(ys), max(xs), max(ys))


def distribute(
    sizes: list[tuple[float, float]], area: Box, min_gap: float = MIN_GAP
) -> list[tuple[float, float]] | None:
    """Top-left corners for boxes of the given (width, height), in order, evenly spread over `area`.

    The boxes go in rows. Every row has the same gap between its boxes and from the area's sides, and the rows have
    the same gap between them and from the area's top and bottom. The number of rows is the one that gives the biggest
    smallest gap. None when even that leaves the boxes touching (the area is too small).
    """
    count = len(sizes)
    if count == 0:
        return []
    best: tuple[float, float, list[tuple[float, float]]] | None = None
    for rows in range(1, count + 1):
        per = math.ceil(count / rows)
        chunks = [sizes[i : i + per] for i in range(0, count, per)]
        if len(chunks) != rows:
            continue
        horizontal = min((area.w - sum(w for w, _ in chunk)) / (len(chunk) + 1) for chunk in chunks)
        heights = [max(h for _, h in chunk) for chunk in chunks]
        vertical = (area.h - sum(heights)) / (rows + 1)
        # Rows that are not full look ragged: prefer plans where the rows hold the same number of boxes.
        tidy = 0.0 if count % rows == 0 else -2.0
        score = min(horizontal, vertical) + tidy
        if best is None or score > best[0]:
            worst = min(horizontal, vertical)
            spots = []
            y = area.y0 + vertical
            for chunk, height in zip(chunks, heights, strict=True):
                gap = (area.w - sum(w for w, _ in chunk)) / (len(chunk) + 1)
                x = area.x0 + gap
                for w, h in chunk:
                    spots.append((x, y + (height - h) / 2))
                    x += w + gap
                y += height + vertical
            best = (score, worst, spots)
    if best is None or best[1] < min_gap:
        return None
    return best[2]


def _natural(label: str) -> list[object]:
    return [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", label)]


def _free_area(room_box: Box, obstacles: list[Box]) -> Box:
    """The room inside its walls, with the side that a bar, toilets or a fireplace stands against taken away."""
    x0, y0, x1, y1 = (
        room_box.x0 + WALL_MARGIN,
        room_box.y0 + WALL_MARGIN,
        room_box.x1 - WALL_MARGIN,
        room_box.y1 - WALL_MARGIN,
    )
    for o in obstacles:
        near = {
            "left": o.x0 - room_box.x0,
            "right": room_box.x1 - o.x1,
            "top": o.y0 - room_box.y0,
            "bottom": room_box.y1 - o.y1,
        }
        side = min(near, key=lambda key: near[key])
        if near[side] > 140:
            continue  # stands in the middle of the room: left to the owner
        if side == "left":
            x0 = max(x0, o.x1 + 30)
        elif side == "right":
            x1 = min(x1, o.x0 - 30)
        elif side == "top":
            y0 = max(y0, o.y1 + 30)
        else:
            y1 = min(y1, o.y0 - 30)
    return Box(x0, y0, x1, y1)


def _tidy_once(session: Session, venue: Venue) -> tuple[int, int]:
    """One pass over the restaurant. Returns (tables moved, groups that did not fit and were left as they are)."""
    tables = list(session.scalars(select(VenueTable).where(VenueTable.venue_id == venue.id)))
    if not tables:
        return 0, 0
    seats: dict[int, list[Seat]] = {}
    for seat in session.scalars(select(Seat).where(Seat.venue_id == venue.id)):
        seats.setdefault(seat.table_id, []).append(seat)
    zones = {z.id: z for z in session.scalars(select(Zone).where(Zone.venue_id == venue.id))}
    rooms = {r.id: r for r in session.scalars(select(Room).where(Room.venue_id == venue.id))}
    groups: dict[tuple[int | None, int | None], list[VenueTable]] = {}
    for table in tables:
        groups.setdefault((table.room_id, table.zone_id), []).append(table)
    moved = skipped = 0
    for (room_id, zone_id), members in groups.items():
        if zone_id is not None and zone_id in zones:
            z = zones[zone_id]
            area = Box(
                z.x + ZONE_MARGIN,
                z.y + ZONE_MARGIN,
                z.x + z.w - ZONE_MARGIN,
                z.y + z.h - ZONE_MARGIN,
            )
        elif room_id in rooms:
            points = rooms[room_id].outline.get("points", [])
            if len(points) != 4:
                skipped += 1  # not a plain rectangle: leave it to the owner
                continue
            xs, ys = [p["x"] for p in points], [p["y"] for p in points]
            fixtures = session.scalars(select(RoomFixture).where(RoomFixture.room_id == room_id))
            obstacles = [
                Box(f.x, f.y, f.x + f.w, f.y + f.h) for f in fixtures if f.kind in OBSTACLE_KINDS
            ]
            area = _free_area(Box(min(xs), min(ys), max(xs), max(ys)), obstacles)
        else:
            skipped += 1
            continue
        members.sort(key=lambda t: _natural(t.label))
        boxes = [footprint(t, seats.get(t.id, [])) for t in members]
        sizes = [(b.w, b.h) for b in boxes]
        spots = next(
            (got for gap in TIGHT_GAPS if (got := distribute(sizes, area, gap)) is not None), None
        )
        if spots is None and zone_id is None and room_id in rooms:
            # The room is too small for its tables (demo plans were drawn small): make it bigger until they sit well.
            room = rooms[room_id]
            for _ in range(12):
                points = room.outline["points"]
                x0, y0 = min(p["x"] for p in points), min(p["y"] for p in points)
                x1, y1 = max(p["x"] for p in points) + 60, max(p["y"] for p in points) + 40
                room.outline = {
                    "points": [
                        {"x": x, "y": y, "curve": 0}
                        for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))
                    ]
                }
                area = _free_area(Box(x0, y0, x1, y1), obstacles)
                spots = next(
                    (
                        got
                        for gap in TIGHT_GAPS
                        if (got := distribute(sizes, area, gap)) is not None
                    ),
                    None,
                )
                if spots is not None:
                    break
        if spots is None:
            skipped += 1
            continue
        for table, box, (x, y) in zip(members, boxes, spots, strict=True):
            dx, dy = x - box.x0, y - box.y0
            table.x, table.y = round(table.x + dx), round(table.y + dy)
            for seat in seats.get(table.id, []):
                seat.x, seat.y = round(seat.x + dx), round(seat.y + dy)
            moved += 1
    return moved, skipped


def _grow(session: Session, venue: Venue, factor: float) -> None:
    """Move the zones and the tables apart (not make them bigger): the plan of a restaurant whose zones are too tight."""
    tables = list(session.scalars(select(VenueTable).where(VenueTable.venue_id == venue.id)))
    seats: dict[int, list[Seat]] = {}
    for seat in session.scalars(select(Seat).where(Seat.venue_id == venue.id)):
        seats.setdefault(seat.table_id, []).append(seat)
    for table in tables:
        nx, ny = round(table.x * factor), round(table.y * factor)
        for seat in seats.get(table.id, []):
            seat.x, seat.y = round(seat.x + nx - table.x), round(seat.y + ny - table.y)
        table.x, table.y = nx, ny
    for zone in session.scalars(select(Zone).where(Zone.venue_id == venue.id)):
        zone.x, zone.y, zone.w, zone.h = (
            round(v * factor) for v in (zone.x, zone.y, zone.w, zone.h)
        )
    if venue.width and venue.height:
        venue.width, venue.height = round(venue.width * factor), round(venue.height * factor)


def tidy_venue(session: Session, venue: Venue) -> tuple[int, int]:
    """Spread one restaurant's tables. Returns (tables moved, groups that did not fit and were left as they are).

    When a zone is too tight for its tables, the whole plan is spread out a little (up to three times) and tried again.
    """
    moved, skipped = _tidy_once(session, venue)
    for _ in range(3):
        if skipped == 0 or not session.scalar(
            select(Zone.id).where(Zone.venue_id == venue.id).limit(1)
        ):
            break
        _grow(session, venue, 1.2)
        moved, skipped = _tidy_once(session, venue)
    venue.layout_version = (venue.layout_version or 0) + 1
    return moved, skipped


def tidy_all(session: Session) -> tuple[int, int, int]:
    """Every demo restaurant. Returns (restaurants, tables moved, groups left as they were)."""
    venues = list(
        session.scalars(select(Venue).where(Venue.kind == "restaurant", Venue.is_demo.is_(True)))
    )
    total_moved = total_skipped = 0
    for venue in venues:
        moved, skipped = tidy_venue(session, venue)
        total_moved += moved
        total_skipped += skipped
    return len(venues), total_moved, total_skipped


def main(argv: list[str]) -> None:
    settings = get_settings()
    remote = "--allow-remote" in argv
    if not settings.demo_mode or (settings.is_postgres and not remote):
        raise SystemExit(
            "Use DEMO_MODE=1 with a local SQLite demo database, or add --allow-remote for the shared demo database."
        )
    db.init_engine(settings.database_url)
    with db.new_session() as session:
        venues, moved, skipped = tidy_all(session)
        session.commit()
    print(
        f"Tidy layouts: {venues} restaurants, {moved} tables placed, {skipped} groups left as they were."
    )


if __name__ == "__main__":
    main(sys.argv[1:])
