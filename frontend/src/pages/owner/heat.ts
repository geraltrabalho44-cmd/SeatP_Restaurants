// The colours of the busiest-tables plan. One hue (the restaurant purple), light to dark, so a
// darker table always means a busier one. The number is written on every table as well, so the
// colour never has to be read on its own.

/** Fill colours from "never booked" to "the busiest table". Dark text on the light ones. */
export const HEAT_FILLS = ["#efecf8", "#d6cff0", "#b3a7e2", "#6a58b0", "#4f3f8f"] as const;
const DARK_TEXT = "#201a3d";
const LIGHT_TEXT = "#ffffff";

/** Which of the five steps a table falls in. 0 is only for a table nobody booked. */
export function heatStep(heat: number): number {
  if (heat <= 0) return 0;
  if (heat < 0.34) return 1;
  if (heat < 0.67) return 2;
  if (heat < 0.9) return 3;
  return 4;
}

export function heatFill(heat: number): string {
  return HEAT_FILLS[heatStep(heat)] ?? HEAT_FILLS[0];
}

/** Text that stays readable on that fill. */
export function heatText(heat: number): string {
  return heatStep(heat) >= 3 ? LIGHT_TEXT : DARK_TEXT;
}

/** "12%" for 0.123, "–" for no data. */
export function percent(value: number | null): string {
  return value === null ? "–" : `${Math.round(value * 100)}%`;
}
