// An offer code on the details form: typed or brought by a link, checked before confirming, sent with
// the booking, and shown afterwards on the confirmation and to the staff.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BookingPage from "../BookingPage";
import { NO_OFFER, OfferCodeField, codeFromAddress } from "../OfferCodeField";
import type { OfferChoice } from "../OfferCodeField";
import { Route, Routes } from "react-router-dom";
import { CONFIRMATION, INFO, SLOTS, VENUE, dinerMap, heldTable } from "./fixtures";
import { apiError, callsTo, mockApi } from "./mockApi";

const API = `/api/r/${VENUE}`;
const CHECK = `${API}/offers/check`;
const OK = { name: "Spring offer", what: "10% off your bill", note: "" };

function Field({ email = "ana@example.com", start = NO_OFFER }: { email?: string; start?: OfferChoice }) {
  const [value, setValue] = useState<OfferChoice>(start);
  return <OfferCodeField venueId={VENUE} email={email} day="2030-05-02" party={2} value={value} onChange={setValue} />;
}

beforeEach(() => window.history.replaceState({}, "", "/"));
afterEach(() => vi.unstubAllGlobals());

describe("the code from a link", () => {
  it("is read from the address, tidied, and nothing else is trusted", () => {
    expect(codeFromAddress("?offer=k7m3-qx9p")).toBe("K7M3QX9P");
    expect(codeFromAddress("?offer=%3Cscript%3E")).toBe("SCRIPT");
    expect(codeFromAddress("?offer=" + "A".repeat(40))).toHaveLength(16);
    expect(codeFromAddress("?date=2030-05-02")).toBe("");
  });

  it("fills the box when the guest arrives with a link, and the guest can still change it", () => {
    window.history.replaceState({}, "", "/r/casa?offer=K7M3QX9P");
    mockApi({});
    render(<Field />);
    const box = screen.getByLabelText("Offer code (optional)") as HTMLInputElement;
    expect(box.value).toBe("K7M3QX9P");
    fireEvent.change(box, { target: { value: "other" } });
    expect(box.value).toBe("OTHER");
  });
});

describe("applying a code", () => {
  it("shows what it gives and that the restaurant takes it off the bill", async () => {
    const calls = mockApi({ [`GET ${CHECK}`]: () => OK });
    render(<Field />);
    fireEvent.change(screen.getByLabelText("Offer code (optional)"), { target: { value: "k7m3qx9p" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply code" }));
    expect(await screen.findByText(/10% off your bill/)).toBeTruthy();
    expect(screen.getByText(/The restaurant takes it off your bill/)).toBeTruthy();
    const query = callsTo(calls, "GET", CHECK)[0]?.query;
    expect(query?.get("code")).toBe("K7M3QX9P");
    expect(query?.get("email")).toBe("ana@example.com");
    expect(query?.get("day")).toBe("2030-05-02");
    expect(query?.get("party")).toBe("2");
    expect(screen.queryByRole("button", { name: "Apply code" })).toBeNull();
  });

  it("shows the server's reason when the code is not valid, and keeps what was typed", async () => {
    mockApi({ [`GET ${CHECK}`]: () => apiError(422, "offer_invalid", "This offer has ended.") });
    render(<Field />);
    fireEvent.change(screen.getByLabelText("Offer code (optional)"), { target: { value: "OLDCODE1" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply code" }));
    expect(await screen.findByText("This offer has ended.")).toBeTruthy();
    expect((screen.getByLabelText("Offer code (optional)") as HTMLInputElement).value).toBe("OLDCODE1");
    expect(screen.getByRole("button", { name: "Apply code" })).toBeTruthy();
  });

  it("asks for the email first, because some codes are for one guest only", () => {
    const calls = mockApi({});
    render(<Field email="" />);
    fireEvent.change(screen.getByLabelText("Offer code (optional)"), { target: { value: "ABCD2345" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply code" }));
    expect(screen.getByText(/Type your email above first/)).toBeTruthy();
    expect(callsTo(calls, "GET", CHECK)).toHaveLength(0);
  });

  it("changing the code takes the applied offer away", async () => {
    mockApi({ [`GET ${CHECK}`]: () => OK });
    render(<Field />);
    fireEvent.change(screen.getByLabelText("Offer code (optional)"), { target: { value: "ABCD2345" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply code" }));
    await screen.findByText(/10% off your bill/);
    fireEvent.change(screen.getByLabelText("Offer code (optional)"), { target: { value: "ABCD2346" } });
    expect(screen.queryByText(/10% off your bill/)).toBeNull();
    expect(screen.getByRole("button", { name: "Apply code" })).toBeTruthy();
  });
});

const SEATS = { tables: [], seats: [] };
const WITH_OFFER = { ...CONFIRMATION, offer: { name: "Spring offer", what: "10% off your bill" } };

function routes(extra: Record<string, () => unknown> = {}) {
  return {
    [`GET ${API}`]: () => INFO,
    [`GET ${API}/slots`]: () => SLOTS,
    [`GET ${API}/map`]: () => dinerMap(),
    [`POST ${API}/hold`]: () => heldTable(7, "7"),
    [`GET ${API}/seats`]: () => SEATS,
    [`GET ${API}/policy`]: () => ({ mode: "none" }),
    [`GET ${API}/terms`]: () => ({ version: "1", offers_version: "1", title: "Terms", sections: [], terms_label: "", offers_label: "", offers_hint: "", draft: false }),
    [`GET ${CHECK}`]: () => OK,
    [`POST ${API}/bookings`]: () => WITH_OFFER,
    ...extra,
  };
}

async function holdTable7(): Promise<HTMLElement> {
  render(
    <MemoryRouter initialEntries={[`/r/${VENUE}`]}>
      <Routes>
        <Route path="/r/:venueId" element={<BookingPage />} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "See free times" }));
  fireEvent.click(await screen.findByRole("button", { name: /19:30/ }));
  fireEvent.click(screen.getByRole("button", { name: "Choose a table at 19:30" }));
  await screen.findByRole("heading", { name: "Choose your table" });
  fireEvent.click(screen.getByRole("button", { name: "Hold 7 & continue" }));
  await screen.findByRole("timer");
  return screen.getByRole("form", { name: "Your details" });
}

describe("booking with an offer", () => {
  it("sends the code with the booking and shows the offer on the confirmation", async () => {
    const calls = mockApi(routes());
    const panel = await holdTable7();
    fireEvent.change(within(panel).getByLabelText("Name for the booking"), { target: { value: "Ana Pereira" } });
    fireEvent.change(within(panel).getByLabelText("Email"), { target: { value: "ana@example.com" } });
    fireEvent.click(within(panel).getByRole("checkbox", { name: /accept the terms/ }));
    fireEvent.change(within(panel).getByLabelText("Offer code (optional)"), { target: { value: "k7m3qx9p" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Apply code" }));
    await within(panel).findByText(/10% off your bill/);
    fireEvent.click(within(panel).getByRole("button", { name: "Confirm booking" }));
    expect((await screen.findByTestId("offer-line")).textContent).toContain("Offer applied: Spring offer, 10% off your bill");
    expect(callsTo(calls, "POST", `${API}/bookings`)[0]?.body).toMatchObject({ offer_code: "K7M3QX9P" });
  });

  it("a booking without a code sends none and shows no offer line", async () => {
    const calls = mockApi(routes({ [`POST ${API}/bookings`]: () => CONFIRMATION }));
    const panel = await holdTable7();
    fireEvent.change(within(panel).getByLabelText("Name for the booking"), { target: { value: "Ana Pereira" } });
    fireEvent.change(within(panel).getByLabelText("Email"), { target: { value: "ana@example.com" } });
    fireEvent.click(within(panel).getByRole("checkbox", { name: /accept the terms/ }));
    fireEvent.click(within(panel).getByRole("button", { name: "Confirm booking" }));
    await screen.findByRole("heading", { name: "Booking confirmed." });
    expect(callsTo(calls, "POST", `${API}/bookings`)[0]?.body).not.toHaveProperty("offer_code");
    expect(screen.queryByTestId("offer-line")).toBeNull();
  });

  it("when the server refuses the code the diner is told why and keeps the hold and the details", async () => {
    mockApi(routes({ [`POST ${API}/bookings`]: () => apiError(422, "offer_invalid", "You have already used this offer.") }));
    const panel = await holdTable7();
    fireEvent.change(within(panel).getByLabelText("Name for the booking"), { target: { value: "Ana Pereira" } });
    fireEvent.change(within(panel).getByLabelText("Email"), { target: { value: "ana@example.com" } });
    fireEvent.click(within(panel).getByRole("checkbox", { name: /accept the terms/ }));
    fireEvent.change(within(panel).getByLabelText("Offer code (optional)"), { target: { value: "k7m3qx9p" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Confirm booking" }));
    expect(await within(panel).findByText("You have already used this offer.")).toBeTruthy();
    expect((within(panel).getByLabelText("Name for the booking") as HTMLInputElement).value).toBe("Ana Pereira");
    expect(screen.queryByRole("heading", { name: "Booking confirmed." })).toBeNull();
  });
});
