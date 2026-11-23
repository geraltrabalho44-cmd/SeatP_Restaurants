import type { Message } from "../../i18n/catalogue";
import { tr } from "../../i18n/locale";

/**
 * The words the editor keeps in English inside its data (a zone called "Terrace", a table called "Table 3",
 * a fixed element called "Open kitchen") put into the language in use for the screen. What is saved stays
 * English, so a restaurant's plan reads the same for every diner and every device. A name an owner typed
 * is left exactly as written.
 */
export function word(english: string): string {
  const exact = tr(english as Message);
  if (exact !== english) return exact;
  // A name with a number after it ("Terrace 2", "Quiet zone 3"): the number stays.
  const numbered = /^(.+) (\d+)$/.exec(english);
  if (!numbered) return english;
  const base = tr(numbered[1] as Message);
  return base === numbered[1] ? english : `${base} ${numbered[2]}`;
}

/** "Table 12" shows as "Mesa 12"; any other label (the owner's own) is left alone. */
export function tableLabel(label: string): string {
  const match = /^Table (\d+)$/.exec(label);
  return match ? tr("Table {n}", { n: match[1] }) : label;
}

/** "Room 2" shows as "Sala 2" and the first room, "Main room", as "Sala principal"; the restaurant's own room names are left alone. */
export function roomName(name: string): string {
  if (name === "Main room") return tr("Main room");
  const match = /^Room (\d+)$/.exec(name);
  return match ? tr("Room {n}", { n: match[1] }) : name;
}
