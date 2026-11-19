import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { loadCatalogue, setActiveLocale } from "../../i18n/locale";
import { serverText } from "./serverText";

beforeAll(() => loadCatalogue());
afterEach(() => setActiveLocale("en"));

describe("serverText", () => {
  it("leaves everything as it came in English", () => {
    expect(serverText("Direct sun until 14:30")).toBe("Direct sun until 14:30");
    expect(serverText("Exact fit for 4")).toBe("Exact fit for 4");
  });

  it("translates a fixed sentence", () => {
    setActiveLocale("pt");
    expect(serverText("Next to the bar")).toBe("Junto ao bar");
    expect(serverText("Facing the window")).toBe("De frente para a janela");
  });

  it("keeps the time inside a sentence that has one", () => {
    setActiveLocale("pt");
    expect(serverText("Direct sun until 14:30")).toBe("Sol direto até às 14:30");
    setActiveLocale("fr");
    expect(serverText("No sunny table is free at 20:15")).toBe("Aucune table ensoleillée n'est libre à 20:15");
  });

  it("translates the sentences with numbers and names", () => {
    setActiveLocale("es");
    expect(serverText("Seats 4, 2 spare")).toBe("4 plazas, 2 de sobra");
    expect(serverText("Joins tables T5 + T6 for a party of 8")).toBe("Une mesas T5 + T6 para un grupo de 8");
    expect(serverText("Window zone as requested")).toBe("Zona Window, como se pidió");
  });

  it("shows a restaurant's own words as they are", () => {
    setActiveLocale("pt");
    expect(serverText("Chef's counter")).toBe("Chef's counter");
  });
});
