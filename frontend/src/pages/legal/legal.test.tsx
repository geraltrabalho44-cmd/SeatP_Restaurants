// The last step of a booking (terms and offers), the link that stops offers, and the owner's words.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NO_CONSENT } from "../../api/legal";
import type { Consent } from "../../api/legal";
import TermsPage from "../owner/TermsPage";
import { ConsentBoxes } from "../restaurant/ConsentBoxes";
import { apiError, callsTo, mockApi } from "../restaurant/__tests__/mockApi";
import UnsubscribePage from "./UnsubscribePage";

afterEach(() => vi.unstubAllGlobals());

const DOCUMENT = {
  version: "2026-11-18",
  offers_version: "2026-11-18",
  title: "Terms and privacy: Casa Linho",
  sections: [
    { title: "Who is responsible for your data", paragraphs: ["Casa Linho is responsible for the personal data it collects."] },
    { title: "From Casa Linho", paragraphs: ["Contact privacy@casa.example."] },
  ],
  terms_label: "I accept the terms and conditions and the privacy notice.",
  offers_label: "I'd like to receive offers and news from this restaurant (optional).",
  offers_hint: "x",
  draft: false,
};

function Boxes({ onValue }: { onValue?: (value: Consent) => void }) {
  const [value, setValue] = useState<Consent>(NO_CONSENT);
  return (
    <ConsentBoxes
      venueId="casa"
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
    />
  );
}

describe("The two boxes on the last step", () => {
  it("start unticked, and the offers box says it is optional and changes nothing about the booking", () => {
    mockApi({});
    render(<Boxes />);
    const terms = screen.getByRole("checkbox", { name: /accept the terms and conditions/ }) as HTMLInputElement;
    const offers = screen.getByRole("checkbox", { name: /offers and news from this restaurant \(optional\)/ }) as HTMLInputElement;
    expect(terms.checked).toBe(false);
    expect(offers.checked).toBe(false);
    expect(screen.getByText(/Not ticking this changes nothing about your booking/)).toBeTruthy();
  });

  it("ticking one never ticks the other", () => {
    mockApi({});
    const seen: Consent[] = [];
    render(<Boxes onValue={(value) => seen.push(value)} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /offers and news/ }));
    expect(seen.at(-1)).toEqual({ terms: false, offers: true });
    fireEvent.click(screen.getByRole("checkbox", { name: /accept the terms/ }));
    expect(seen.at(-1)).toEqual({ terms: true, offers: true });
  });

  it("opens the terms in a window, with the restaurant's own words, without leaving the form", async () => {
    const calls = mockApi({ "GET /api/r/casa/terms": () => DOCUMENT });
    render(<Boxes />);
    fireEvent.click(screen.getByRole("button", { name: "Read the terms and privacy notice" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Casa Linho is responsible for the personal data it collects.")).toBeTruthy();
    expect(within(dialog).getByText("Contact privacy@casa.example.")).toBeTruthy();
    expect(within(dialog).queryByText(/not been reviewed by a lawyer/)).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Accept and close" }));
    expect((screen.getByRole("checkbox", { name: /accept the terms/ }) as HTMLInputElement).checked).toBe(true);
    expect(callsTo(calls, "GET", "/api/r/casa/terms")).toHaveLength(1);
  });

  it("says so when the terms cannot be loaded, and still lets the diner read them again", async () => {
    mockApi({ "GET /api/r/casa/terms": () => apiError(502, "internal", "Down.") });
    render(<Boxes />);
    fireEvent.click(screen.getByRole("button", { name: "Read the terms and privacy notice" }));
    expect(await within(await screen.findByRole("dialog")).findByRole("alert")).toBeTruthy();
  });

  it("shows the terms of a draft document without a demo label", async () => {
    mockApi({ "GET /api/r/casa/terms": () => ({ ...DOCUMENT, draft: true }) });
    render(<Boxes />);
    fireEvent.click(screen.getByRole("button", { name: "Read the terms and privacy notice" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.queryByText(/not been reviewed by a lawyer/)).toBeNull();
  });
});

function openLink(): void {
  render(
    <MemoryRouter initialEntries={["/u/7.abc"]}>
      <Routes>
        <Route path="/u/:token" element={<UnsubscribePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("The link that stops offers", () => {
  it("stops offers in one tap, says bookings are not affected, and can be undone", async () => {
    let on = true;
    mockApi({
      "GET /api/u/7.abc": () => ({ venue_name: "Casa Linho", email: "l•••@example.com", subscribed: on }),
      "POST /api/u/7.abc/stop": () => {
        on = false;
        return { venue_name: "Casa Linho", email: "l•••@example.com", subscribed: false };
      },
      "POST /api/u/7.abc/resume": () => {
        on = true;
        return { venue_name: "Casa Linho", email: "l•••@example.com", subscribed: true };
      },
    });
    openLink();
    fireEvent.click(await screen.findByRole("button", { name: "Stop offers from this restaurant" }));
    expect(await screen.findByText(/will not send offers to l•••@example.com. Your bookings and their reminders are not affected/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /I stopped by mistake/ }));
    expect(await screen.findByText(/gets offers and news from Casa Linho/)).toBeTruthy();
  });

  it("an old or made-up link is a plain \"no longer works\"", async () => {
    mockApi({ "GET /api/u/7.abc": () => apiError(404, "not_found", "This link no longer works.") });
    openLink();
    expect(await screen.findByText("This link no longer works")).toBeTruthy();
  });
});

describe("The owner's terms page", () => {
  function openOwner(): void {
    render(
      <MemoryRouter initialEntries={["/owner/casa/terms"]}>
        <Routes>
          <Route path="/owner/:venueId/terms" element={<TermsPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("says who prepared the terms, saves the owner's words and shows what guests read", async () => {
    const calls = mockApi({
      "GET /api/owner/restaurants/casa/terms": () => ({ extra_text: "", max_length: 2000, document: DOCUMENT }),
      "PUT /api/owner/restaurants/casa/terms": () => ({ extra_text: "Contact privacy@casa.example.", max_length: 2000, document: DOCUMENT }),
    });
    openOwner();
    expect(await screen.findByText(/prepared by a team of lawyers/)).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "What guests read" })).getByText("Contact privacy@casa.example.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Your own words (optional)"), { target: { value: "Contact privacy@casa.example." } });
    fireEvent.click(screen.getByRole("button", { name: "Save your words" }));
    await waitFor(() => expect(callsTo(calls, "PUT", "/api/owner/restaurants/casa/terms")).toHaveLength(1));
    expect(callsTo(calls, "PUT", "/api/owner/restaurants/casa/terms")[0]?.body).toEqual({ extra_text: "Contact privacy@casa.example." });
  });
});
