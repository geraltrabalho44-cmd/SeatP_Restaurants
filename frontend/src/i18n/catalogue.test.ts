// Every translation must say the same thing as its English key: present, not empty, and with the
// same {placeholders}, so a sentence can never lose the name or the number it is about.
import { describe, expect, it } from "vitest";
import { catalogue } from "./catalogue";
import { detect, names, released, tags, translate } from "./locale";
import type { Locale } from "./locale";
import type { Message } from "./catalogue";

const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? "").sort();

describe("the catalogue", () => {
  const entries = Object.entries(catalogue) as [Message, readonly [string, string, string]][];

  it("has Portuguese, Spanish and French for every English sentence", () => {
    expect(entries.length).toBeGreaterThan(100);
    for (const [english, translations] of entries) {
      expect(translations, english).toHaveLength(3);
      for (const text of translations) expect(text.trim().length, english).toBeGreaterThan(0);
    }
  });

  it("keeps the placeholders of the English sentence in every language", () => {
    for (const [english, translations] of entries) {
      for (const text of translations) expect(placeholders(text), `${english} -> ${text}`).toEqual(placeholders(english));
    }
  });

  it("never leaves a translation equal to a different sentence's English key by mistake", () => {
    const keys = new Set(Object.keys(catalogue));
    for (const [english, translations] of entries) {
      for (const text of translations) {
        if (text !== english) expect(keys.has(text), `${english} -> ${text}`).toBe(false);
      }
    }
  });
});

describe("choosing and using a language", () => {
  it("offers only the released languages, and always English", () => {
    expect(released("")).toEqual(["en"]);
    expect(released("pt")).toEqual(["en", "pt"]);
    expect(released("en, pt ,fr")).toEqual(["en", "pt", "fr"]);
    expect(released("klingon,de")).toEqual(["en"]);
  });

  it("goes: the link, the saved choice, the browser, then English", () => {
    const all = released("en,pt,es,fr");
    expect(detect("fr", "es", ["pt"], all)).toBe("fr");
    expect(detect(null, "es", ["pt"], all)).toBe("es");
    expect(detect(null, null, ["fr-CA", "en"], all)).toBe("fr");
    expect(detect(null, null, ["de-DE"], all)).toBe("en");
    expect(detect("pt-BR", null, [], all)).toBe("pt"); // Brazilian Portuguese gets pt-PT
    expect(detect("xx", "yy", [], all)).toBe("en"); // nonsense is ignored
    expect(detect("pt", null, ["pt"], released("es"))).toBe("en"); // a language not released yet
  });

  it("has a name and a formatting tag for every language", () => {
    for (const code of Object.keys(names) as Locale[]) {
      expect(names[code].length).toBeGreaterThan(1);
      expect(tags[code]).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
    }
    expect(tags.pt).toBe("pt-PT");
  });

  it("falls back to English text for anything not in the catalogue, and keeps unknown placeholders", () => {
    expect(translate("pt", "Not in the catalogue" as Message)).toBe("Not in the catalogue");
    expect(translate("en", "{count} people" as Message, { count: 3 })).toBe("3 people");
    expect(translate("pt", "{distance} from you", {})).toContain("{distance}");
  });

  it("puts parameters in as plain text, never as markup", () => {
    expect(translate("pt", "{distance} from you", { distance: "<b>3 km</b>" })).toContain("<b>3 km</b>");
  });
});
