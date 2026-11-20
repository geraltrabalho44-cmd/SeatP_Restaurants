import { describe, expect, it } from "vitest";

// Labels are translated, so a selector that matches an aria-label or a title by its English text works in English only.
// (It once left the table step squeezed beside the photo in Portuguese, Spanish and French.) Mark the element with a
// class or a data attribute instead, as the booking stage bar does with data-stage.
const sheets = import.meta.glob("../**/*.css", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

describe("stylesheets", () => {
  it("are found", () => {
    expect(Object.keys(sheets).length).toBeGreaterThan(10);
  });

  it("never select an element by its translated text", () => {
    const offenders: string[] = [];
    for (const [file, css] of Object.entries(sheets)) {
      css.split("\n").forEach((line, index) => {
        if (/\[(aria-label|title|placeholder|alt)\s*[~|^$*]?=/.test(line)) offenders.push(`${file}:${index + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
