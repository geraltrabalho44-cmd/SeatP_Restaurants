// The server writes the short sentences next to a table (the light, the view, what is close by) and
// the reasons for a suggestion in English. They come from a closed set, so this puts the ones it
// knows in the language in use. Anything else, such as a restaurant's own words ("Tagus river"), is
// shown as it came: it is the restaurant's text, not ours.
import type { Message } from "../../i18n/catalogue";
import { hasMessage, tr } from "../../i18n/locale";

const known = hasMessage;

/** "table T5" or "tables T5 + T6", as the optimiser writes them. */
function tablesText(text: string): string {
  const match = /^(tables?) (.+)$/.exec(text);
  if (!match) return text;
  return match[1] === "table" ? tr("table {names}", { names: match[2] }) : tr("tables {names}", { names: match[2] });
}

type Params = (match: RegExpExecArray) => Record<string, string | number>;

// Sentences with a number or a name inside. A time ("14:30") is handled before these, for every sentence that has one.
const PATTERNS: Array<[RegExp, Message, Params]> = [
  [/^View of the (.+)$/, "View of the {place}", (m) => ({ place: m[1] })],
  [/^Joins (.+) for a party of (\d+)$/, "Joins {tables} for a party of {n}", (m) => ({ tables: tablesText(m[1]), n: m[2] })],
  [/^Exact fit for (\d+)$/, "Exact fit for {n}", (m) => ({ n: m[1] })],
  [/^Seats (\d+), (\d+) spare$/, "Seats {seats}, {spare} spare", (m) => ({ seats: m[1], spare: m[2] })],
  [/^Keeps the table for (\d+) free for a larger party$/, "Keeps the table for {n} free for a larger party", (m) => ({ n: m[1] })],
  [/^Room for (\d+) high chair\(s\)$/, "Room for {n} high chair(s)", (m) => ({ n: m[1] })],
  [/^(.+) zone as requested$/, "{zone} zone as requested", (m) => ({ zone: m[1] })],
  [/^Outside the (.+) zone$/, "Outside the {zone} zone", (m) => ({ zone: m[1] })],
];

/** Translates a sentence the server wrote, or returns it unchanged when it is not one we know. */
export function serverText(text: string): string {
  if (known(text)) return tr(text as Message);
  const time = /\d{2}:\d{2}/.exec(text)?.[0];
  if (time) {
    const key = text.replace(time, "{time}");
    if (known(key)) return tr(key as Message, { time });
  }
  for (const [pattern, key, params] of PATTERNS) {
    const match = pattern.exec(text);
    if (match) return tr(key, params(match));
  }
  return text;
}
