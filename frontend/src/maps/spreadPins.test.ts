import { describe, expect, it } from "vitest";
import { MAX_NUDGE, PIN_GAP, spreadPoints } from "./spreadPins";

const gaps = (points: { x: number; y: number }[]) => {
  let least = Infinity;
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) least = Math.min(least, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y));
  return least;
};

describe("spreading map pins", () => {
  it("leaves pins that are far enough apart exactly where they are", () => {
    const home = [{ x: 10, y: 10 }, { x: 200, y: 10 }, { x: 10, y: 300 }];
    expect(spreadPoints(home)).toEqual(home);
  });

  it("pushes two overlapping pins apart, evenly, around their true place", () => {
    const [a, b] = spreadPoints([{ x: 100, y: 100 }, { x: 110, y: 100 }]);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(PIN_GAP);
    expect((a.x + b.x) / 2).toBeCloseTo(105, 1);
    expect(a.y).toBeCloseTo(100, 5);
  });

  it("separates pins that sit on exactly the same spot", () => {
    const same = Array.from({ length: 6 }, () => ({ x: 50, y: 50 }));
    const out = spreadPoints(same);
    expect(gaps(out)).toBeGreaterThanOrEqual(PIN_GAP - 1);
    out.forEach((p) => expect(Math.hypot(p.x - 50, p.y - 50)).toBeLessThanOrEqual(MAX_NUDGE + 0.001));
  });

  it("uncrowds a neighbourhood of twelve pins without moving any of them far", () => {
    const home = Array.from({ length: 12 }, (_, k) => ({ x: 300 + (k % 4) * 9, y: 200 + Math.floor(k / 4) * 9 }));
    const out = spreadPoints(home);
    expect(gaps(out)).toBeGreaterThanOrEqual(PIN_GAP - 2);
    out.forEach((p, k) => expect(Math.hypot(p.x - home[k].x, p.y - home[k].y)).toBeLessThanOrEqual(MAX_NUDGE + 0.001));
  });

  it("does not change its input", () => {
    const home = [{ x: 1, y: 1 }, { x: 2, y: 1 }];
    spreadPoints(home);
    expect(home).toEqual([{ x: 1, y: 1 }, { x: 2, y: 1 }]);
  });
});
