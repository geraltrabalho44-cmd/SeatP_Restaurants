// The room editor speaks the language of the page: its panels, its messages and the words it keeps in English
// inside the plan (a zone called "Terrace", a table called "Table 3"). What is saved never changes.
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { catalogue } from "../../i18n/catalogue";
import { I18nProvider } from "../../i18n/I18nProvider";
import { loadCatalogue, setActiveLocale } from "../../i18n/locale";
import type { Locale } from "../../i18n/locale";
import { createRoom, nextRoomName } from "./roomModel";
import type { Room } from "./roomModel";
import { roomName, tableLabel, word } from "./names";
import { FIXTURE_NAMES } from "./roomObjects";
import { addTable, TABLE_NAMES } from "./tableModel";
import { SURROUNDINGS, directionWord } from "./surroundings";
import { TableTools } from "./TableTools";
import { validateRooms } from "./validation";
import { WallTools } from "./WallTools";

// The languages are released through this setting, read when the provider is loaded.
vi.hoisted(() => { vi.stubEnv("VITE_I18N_LOCALES", "en,pt,es,fr"); });

const OTHER = ["pt", "es", "fr"] as const satisfies readonly Locale[];
const INDEX = { pt: 0, es: 1, fr: 2 } as const;
const say = (english: string, language: Locale): string => (catalogue as Record<string, readonly string[]>)[english][INDEX[language as "pt"]];
// Words that read the same in some language (a TV is a TV).
const SAME = new Set(["TV", "WC", "Zone", "Bar", "Rectangle", "Plant"]);

beforeAll(() => loadCatalogue());
afterEach(() => { setActiveLocale("en"); localStorage.clear(); });

describe("the words the editor keeps in English", () => {
  it("have a translation in every language", () => {
    const names = [...Object.values(FIXTURE_NAMES), ...Object.values(TABLE_NAMES), "Terrace", "Quiet zone", "Zone", ...SURROUNDINGS.map(s => s.label),
      ...[0, 45, 90, 135, 180, 225, 270, 315].map(degrees => `to the ${directionWord(degrees)}`)];
    for (const name of names) {
      const entry = (catalogue as Record<string, readonly string[]>)[name];
      expect(entry, name).toBeTruthy();
      for (const language of OTHER) if (!SAME.has(name)) expect(entry[INDEX[language]], `${name} in ${language}`).not.toBe(name);
    }
  });

  it("are shown in the language in use, and an owner's own words are left alone", () => {
    setActiveLocale("pt");
    expect(word("Open kitchen")).toBe("Cozinha aberta");
    expect(tableLabel("Table 12")).toBe("Mesa 12");
    expect(tableLabel("Window seat")).toBe("Window seat");
    expect(word("Chef's corner")).toBe("Chef's corner");
    // The name that is saved starts in English; the dialog shows it in the language in use. A room already called "Sala 2" counts as taken.
    expect(nextRoomName([{ name: "Room 1" }])).toBe("Room 2");
    expect(roomName("Room 2")).toBe("Sala 2");
    expect(nextRoomName([{ name: "Sala 2" }])).toBe("Room 3");
    setActiveLocale("en");
    expect(roomName("Room 2")).toBe("Room 2");
  });
});

describe("the messages about a plan", () => {
  it("come in the language in use and stay English by default", () => {
    const room = addTable(createRoom("Main", 1000, 700), "square", { x: 5000, y: 5000 });
    setActiveLocale("en");
    expect(validateRooms([room]).map(p => p.message)).toEqual(["Table 1 is outside the walls."]);
    setActiveLocale("pt");
    expect(validateRooms([room]).map(p => p.message)).toEqual(["A mesa 1 está fora das paredes."]);
    setActiveLocale("es");
    expect(validateRooms([room]).map(p => p.message)).toEqual(["La mesa 1 está fuera de las paredes."]);
    setActiveLocale("fr");
    expect(validateRooms([room]).map(p => p.message)).toEqual(["La table 1 est en dehors des murs."]);
  });
});

function inLanguage(language: Locale, view: (room: Room) => React.ReactElement) {
  localStorage.setItem("seatplan:lang", language);
  const room = addTable(createRoom("Room 1", 1000, 700), "round", { x: 300, y: 300 });
  return render(<MemoryRouter initialEntries={["/owner/venue/rooms"]}><I18nProvider>{view(room)}</I18nProvider></MemoryRouter>);
}

describe("the panels", () => {
  for (const language of OTHER) {
    it(`speak ${language} in the walls panel`, async () => {
      const view = inLanguage(language, room => <WallTools room={room} selection={null} selected={null} onSelect={vi.fn()} onSide={vi.fn()} onChange={vi.fn()} onError={vi.fn()} />);
      await waitFor(() => expect(view.container.textContent).toContain(say("Around the room", language)));
      for (const english of ["Main entrance", "Around the room", "Add window", "What is outside", "Selected opening"]) expect(view.container.textContent ?? "", english).not.toContain(english);
      expect(screen.getAllByRole("heading", { level: 3 })[0]?.textContent).toBe(say("Main entrance", language));
    });

    it(`speak ${language} in the tables panel, including the table names`, async () => {
      const view = inLanguage(language, room => <TableTools room={room} selected={room.tables[0].key} onSelect={vi.fn()} onPlace={vi.fn()} onChange={vi.fn()} onError={vi.fn()} />);
      await waitFor(() => expect(view.container.textContent).toContain(say("Add a table", language)));
      for (const english of ["Round table", "Square table", "Selected table", "Table zone", "chairs"]) expect(view.container.textContent ?? "", english).not.toContain(english);
      const picked = within(view.container).getByRole("combobox", { name: say("Selected table", language) }) as HTMLSelectElement;
      expect(picked.selectedOptions[0]?.textContent).toBe(say("Table {n}", language).replace("{n}", "1"));
    });
  }
});
