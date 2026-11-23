"""Even table layouts for the demo restaurants: no two tables (with their chairs) touch, everything stays inside the area,
and the gaps are the same all round."""

import itertools

from sqlalchemy.orm import Session

from app.models import Organiser, Room, Seat, Venue, VenueTable, Zone
from app.security import hash_password
from app.seed.tidy_layouts import MIN_GAP, Box, distribute, footprint, tidy_venue


def _boxes(sizes, spots):
    return [Box(x, y, x + w, y + h) for (w, h), (x, y) in zip(sizes, spots, strict=True)]


def test_boxes_are_spread_evenly_inside_the_area_and_never_touch() -> None:
    area = Box(0, 0, 1000, 600)
    for count in (1, 2, 5, 6, 9, 12):
        sizes = [(120.0 + 20 * (i % 3), 110.0) for i in range(count)]
        spots = distribute(sizes, area)
        assert spots is not None
        boxes = _boxes(sizes, spots)
        assert all(
            b.x0 >= area.x0 and b.y0 >= area.y0 and b.x1 <= area.x1 and b.y1 <= area.y1
            for b in boxes
        )
        for a, b in itertools.combinations(boxes, 2):
            assert not a.overlaps(b, MIN_GAP), (count, a, b)


def test_the_same_gap_on_both_sides_of_a_row_and_between_rows() -> None:
    area = Box(0, 0, 900, 500)
    sizes = [(100.0, 100.0)] * 6
    spots = distribute(sizes, area)
    assert spots is not None
    boxes = _boxes(sizes, spots)
    rows = sorted({round(b.y0) for b in boxes})
    first = [b for b in boxes if round(b.y0) == rows[0]]
    gaps = (
        [first[0].x0 - area.x0]
        + [q.x0 - p.x1 for p, q in itertools.pairwise(first)]
        + [area.x1 - first[-1].x1]
    )
    assert max(gaps) - min(gaps) < 1
    vertical = (
        [rows[0] - area.y0]
        + [b - (a + 100) for a, b in itertools.pairwise(rows)]
        + [area.y1 - (rows[-1] + 100)]
    )
    assert max(vertical) - min(vertical) < 1


def test_an_area_that_is_too_small_gives_nothing_instead_of_overlap() -> None:
    assert distribute([(300.0, 300.0)] * 4, Box(0, 0, 400, 400)) is None


def test_a_demo_restaurant_is_tidied_and_its_chairs_move_with_each_table(session: Session) -> None:
    owner = Organiser(
        email="o@example.com",
        name="O",
        password_hash=hash_password("a long password"),
        role="organiser",
    )
    session.add(owner)
    session.flush()
    venue = Venue(
        name="V",
        kind="restaurant",
        slug="v",
        public_id="v",
        organiser_id=owner.id,
        width=1000,
        height=700,
        is_demo=True,
    )
    session.add(venue)
    session.flush()
    room = Room(
        venue_id=venue.id,
        name="Main",
        outline={
            "points": [
                {"x": x, "y": y, "curve": 0} for x, y in ((0, 0), (1000, 0), (1000, 600), (0, 600))
            ]
        },
    )
    session.add(room)
    session.flush()
    placed = []
    for index in range(6):  # all piled in one corner, touching
        table = VenueTable(
            venue_id=venue.id,
            room_id=room.id,
            label=f"M{index + 1}",
            shape="rect",
            x=40 + 30 * index,
            y=60,
            w=80,
            h=60,
            max_party=4,
        )
        session.add(table)
        session.flush()
        for n, (dx, dy) in enumerate(((20, -25), (60, -25), (20, 85), (60, 85))):
            session.add(
                Seat(
                    venue_id=venue.id,
                    table_id=table.id,
                    label=str(n + 1),
                    x=table.x + dx,
                    y=table.y + dy,
                    room_id=room.id,
                )
            )
        placed.append(table)
    session.commit()
    before = {
        t.id: [(s.x - t.x, s.y - t.y) for s in session.query(Seat).filter_by(table_id=t.id)]
        for t in placed
    }
    moved, skipped = tidy_venue(session, venue)
    session.commit()
    assert (moved, skipped) == (6, 0)
    boxes = []
    for t in placed:
        seats = list(session.query(Seat).filter_by(table_id=t.id))
        assert sorted((s.x - t.x, s.y - t.y) for s in seats) == sorted(
            before[t.id]
        )  # chairs kept their place around the table
        boxes.append(footprint(t, seats))
    assert all(a.overlaps(b, MIN_GAP) is False for a, b in itertools.combinations(boxes, 2))
    assert all(b.x0 >= 0 and b.x1 <= 1000 and b.y0 >= 0 and b.y1 <= 600 for b in boxes)
    assert venue.layout_version == 1


def test_zones_keep_their_tables_inside_them(session: Session) -> None:
    owner = Organiser(
        email="o@example.com",
        name="O",
        password_hash=hash_password("a long password"),
        role="organiser",
    )
    session.add(owner)
    session.flush()
    venue = Venue(
        name="V",
        kind="restaurant",
        slug="v",
        public_id="v",
        organiser_id=owner.id,
        width=1000,
        height=700,
        is_demo=True,
    )
    session.add(venue)
    session.flush()
    zone = Zone(venue_id=venue.id, name="Window", kind="window", x=0, y=0, w=1000, h=150)
    session.add(zone)
    session.flush()
    for index in range(4):
        table = VenueTable(
            venue_id=venue.id,
            zone_id=zone.id,
            label=f"W{index + 1}",
            shape="round",
            x=40 + 20 * index,
            y=50,
            w=50,
            h=50,
            max_party=2,
        )
        session.add(table)
        session.flush()
        session.add(
            Seat(venue_id=venue.id, table_id=table.id, label="1", x=table.x - 30, y=table.y + 25)
        )
        session.add(
            Seat(venue_id=venue.id, table_id=table.id, label="2", x=table.x + 80, y=table.y + 25)
        )
    session.commit()
    assert tidy_venue(session, venue) == (4, 0)
    session.commit()
    for table in session.query(VenueTable):
        assert (
            0 <= table.x - 30 and table.x + 80 <= 1000 and 0 <= table.y and table.y + table.h <= 150
        )
