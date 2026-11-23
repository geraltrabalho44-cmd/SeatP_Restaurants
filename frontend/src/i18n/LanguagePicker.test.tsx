// One language control on every Restaurants page; the choice is remembered and changes every page.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, Link } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageShell } from "../design/components";
import { I18nProvider } from "./I18nProvider";
import { LanguagePicker } from "./LanguagePicker";
import { names, setActiveLocale } from "./locale";

// The languages are released through this setting, read when the provider is loaded.
vi.hoisted(() => { vi.stubEnv("VITE_I18N_LOCALES", "en,pt,es,fr"); });
afterEach(() => { setActiveLocale("en"); localStorage.clear(); });

const FOOTER = { en: "a student project at Nova SBE", pt: "um projeto de estudantes da Nova SBE", es: "un proyecto de estudiantes de Nova SBE", fr: "un projet d’étudiants de la Nova SBE" } as const;
const page = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <I18nProvider>
      <Routes>
        <Route path="/owner" element={<PageShell title="Owner"><p>owner</p><Link to="/restaurants/account">go</Link></PageShell>} />
        <Route path="/restaurants/account" element={<PageShell title="Diner"><p>diner</p></PageShell>} />
        <Route path="/staff/:id" element={<PageShell title="Staff"><p>staff</p></PageShell>} />
        <Route path="/my" element={<PageShell title="Events"><p>events</p></PageShell>} />
      </Routes>
    </I18nProvider>
  </MemoryRouter>,
);

describe("the language control", () => {
  it("is a small flag and name that every Restaurants page has, owner and staff included", () => {
    for (const path of ["/owner", "/restaurants/account", "/staff/abc"]) {
      const view = page(path);
      const trigger = screen.getByRole("button", { name: "Language: English" });
      expect(trigger.querySelector("svg.flag")).toBeTruthy();
      fireEvent.click(trigger);
      const options = screen.getAllByRole("option");
      expect(options.map(o => o.textContent)).toEqual(["English", "Português", "Español", "Français"]);
      for (const option of options) expect(option.querySelector("svg.flag")).toBeTruthy();
      expect(options[0]?.getAttribute("aria-selected")).toBe("true");
      view.unmount();
    }
  });

  it("is not on the Events pages, which stay English", () => {
    page("/my");
    expect(screen.queryByRole("button", { name: /Language/ })).toBeNull();
  });

  for (const language of ["pt", "es", "fr"] as const) {
    it(`changes the whole page to ${language} and keeps the choice on the next page`, async () => {
      page("/owner");
      expect(screen.getByText(new RegExp(FOOTER.en))).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Language: English" }));
      fireEvent.click(screen.getAllByRole("option").find(o => o.getAttribute("lang") === language)!);
      await waitFor(() => expect(screen.getByText(new RegExp(FOOTER[language]))).toBeTruthy());
      expect(document.documentElement.lang).toBe(language === "pt" ? "pt-PT" : language);
      fireEvent.click(screen.getByRole("link", { name: "go" }));
      await waitFor(() => expect(screen.getByText("diner")).toBeTruthy());
      expect(screen.getByText(new RegExp(FOOTER[language]))).toBeTruthy();
      expect(screen.getByRole("button", { name: new RegExp(`: ${names[language]}$`) })).toBeTruthy();
    });
  }

  it("works from the keyboard: arrows move, Enter chooses, Escape closes", async () => {
    page("/owner");
    const trigger = screen.getByRole("button", { name: "Language: English" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const options = screen.getAllByRole("option");
    expect(document.activeElement).toBe(options[0]);
    fireEvent.keyDown(options[0]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(options[1]);
    fireEvent.keyDown(options[1]!, { key: "Enter" });
    await waitFor(() => expect(screen.getByRole("button", { name: /: Português$/ })).toBeTruthy());
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /: Português$/ }));
    fireEvent.keyDown(screen.getAllByRole("option")[1]!, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("is hidden while only English is released", () => {
    const { container } = render(<MemoryRouter><LanguagePicker /></MemoryRouter>);
    expect(container.querySelector(".lang-picker")).toBeNull();
  });
});
