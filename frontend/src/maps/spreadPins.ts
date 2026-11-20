// Keeps numbered map pins readable: where several stand closer than a pin is wide, they are pushed apart, never far from
// their true place. Plain geometry in screen pixels; ResultsMap converts to and from map coordinates.
export interface Px { x: number; y: number }

/** A numbered pin's disc plus a little air. */
export const PIN_GAP = 31;
/** The furthest a pin may move from its true place. */
export const MAX_NUDGE = 60;

/** Screen positions for pins whose true positions are `home`: pushed apart until none overlaps, none far from home. */
export function spreadPoints(home: Px[], gap = PIN_GAP, maxNudge = MAX_NUDGE): Px[] {
  const points = home.map((p) => ({ x: p.x, y: p.y }));
  for (let round = 0; round < 40; round++) {
    let moved = false;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        let dx = points[j].x - points[i].x, dy = points[j].y - points[i].y, d = Math.hypot(dx, dy);
        if (d >= gap) continue;
        if (d < 0.5) { const angle = (i + j + 1) * 2.399963; dx = Math.cos(angle); dy = Math.sin(angle); d = 1; } // the same spot: split by the golden angle
        const push = (gap - d) / 2 + 0.01, ux = dx / d, uy = dy / d;
        points[i].x -= ux * push; points[i].y -= uy * push;
        points[j].x += ux * push; points[j].y += uy * push;
        moved = true;
      }
    }
    points.forEach((p, k) => {
      const ox = p.x - home[k].x, oy = p.y - home[k].y, away = Math.hypot(ox, oy);
      if (away > maxNudge) { p.x = home[k].x + (ox / away) * maxNudge; p.y = home[k].y + (oy / away) * maxNudge; }
    });
    if (!moved) break;
  }
  return points;
}
