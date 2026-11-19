// The owner's insights: heat colours, the three tabs, and what an empty restaurant sees.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiError, callsTo, mockApi } from "../restaurant/__tests__/mockApi";
import { HEAT_FILLS, heatFill, heatStep, heatText, percent } from "./heat";
import InsightsPage from "./InsightsPage";

afterEach(() => vi.unstubAllGlobals());

const OVERVIEW = {
  days: 90, bookings: 40, covers: 112, completed: 30, no_shows: 3, cancelled: 5, no_show_rate: 0.091, cancel_rate: 0.111, average_party: 2.8, average_lead_days: 4.2,
  sources: { diner: 30, staff: 10 }, returning_share: 0.45,
  weekdays: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, bookings: weekday === 5 ? 12 : 3, covers: 6 })),
  hours: [{ hour: 19, bookings: 10 }, { hour: 20, bookings: 22 }],
};
const table = (id: number, label: string, bookings: number, heat: number, room = 1) => ({ id, label, room_id: room, shape: "rect", x: id * 60, y: 20, w: 50, h: 50, rotation: 0, seats: 4, bookings, covers: bookings * 2, share: bookings / 30, heat });
const TABLES = { days: 90, total: 30, rooms: [{ id: 1, name: "Main room" }], tables: [table(1, "T1", 20, 1), table(2, "T2", 10, 0.5), table(3, "T3", 0, 0)], top: [1, 2] };
const GUESTS = {
  total: 2, segments: { new: 1, regular: 1, lapsed: 0, no_shows: 0, offers: 1 }, offset: 0, limit: 50,
  guests: [
    { email: "rita@example.com", name: "Rita Regular", phone: null, bookings: 5, visits: 4, no_shows: 0, cancellations: 1, covers: 12, first_booking: "2030-01-01", last_visit: "2030-04-01", next_booking: null, usual_party: 3, allergies: "peanuts", dietary: "", offers: true, segments: ["regular", "offers"] },
    { email: "olga@example.com", name: "Olga Once", phone: null, bookings: 1, visits: 1, no_shows: 0, cancellations: 0, covers: 2, first_booking: "2030-04-10", last_visit: "2030-04-10", next_booking: null, usual_party: 2, allergies: "", dietary: "", offers: false, segments: ["new"] },
  ],
};

function open(extra: Record<string, () => unknown> = {}) {
  const calls = mockApi({ "GET /api/owner/restaurants/casa/insights": () => ({ overview: OVERVIEW, tables: TABLES }), "GET /api/owner/restaurants/casa/guests": () => GUESTS, ...extra });
  render(
    <MemoryRouter initialEntries={["/owner/casa/insights"]}>
      <Routes>
        <Route path="/owner/:venueId/insights" element={<InsightsPage />} />
      </Routes>
    </MemoryRouter>,
  );
  return calls;
}

describe("heat colours", () => {
  it("a table nobody booked is the lightest, the busiest the darkest, and the steps only go up", () => {
    expect(heatStep(0)).toBe(0);
    expect(heatStep(1)).toBe(4);
    const steps = [0, 0.1, 0.4, 0.7, 0.95, 1].map(heatStep);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
    expect(heatFill(0)).toBe(HEAT_FILLS[0]);
    expect(heatFill(1)).toBe(HEAT_FILLS[4]);
  });
  it("uses light text only on the dark fills", () => {
    expect(heatText(1)).toBe("#ffffff");
    expect(heatText(0.2)).not.toBe("#ffffff");
  });
  it("formats shares, and a dash for no data", () => {
    expect(percent(0.091)).toBe("9%");
    expect(percent(null)).toBe("–");
  });
});

describe("the insights page", () => {
  it("shows the totals", async () => {
    open();
    const totals = await screen.findByRole("region", { name: "Totals" });
    expect(within(totals).getByText("40")).toBeTruthy();
    expect(within(totals).getByText("9%")).toBeTruthy();
    expect(within(totals).getByText("45%")).toBeTruthy();
  });

  it("asks again when the period changes", async () => {
    const calls = open();
    await screen.findByRole("region", { name: "Totals" });
    fireEvent.change(screen.getByLabelText("Period"), { target: { value: "30" } });
    await screen.findByRole("region", { name: "Totals" });
    expect(callsTo(calls, "GET", "/api/owner/restaurants/casa/insights").map((call) => call.query.get("days"))).toEqual(["90", "30"]);
  });

  it("the tables tab lists the busiest first and writes the count on the plan", async () => {
    open();
    fireEvent.click(await screen.findByRole("tab", { name: "Busiest tables" }));
    const ranking = await screen.findByRole("region", { name: "Most booked tables" });
    const items = within(ranking).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain("T1");
    expect(items[0]?.textContent).toContain("20 bookings");
    expect(screen.getByRole("img", { name: /Floor plan coloured/ })).toBeTruthy();
    // A table nobody booked is never listed as one of the busiest.
    expect(within(ranking).queryByText(/T3/)).toBeNull();
  });

  it("the guests tab searches and filters on the server", async () => {
    const calls = open();
    fireEvent.click(await screen.findByRole("tab", { name: "Guests" }));
    expect(await screen.findByText("Rita Regular")).toBeTruthy();
    expect(screen.getByText(/Allergies: peanuts/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search by name or email"), { target: { value: "olga" } });
    fireEvent.click(await screen.findByRole("button", { name: /Regulars \(1\)/ }));
    const last = callsTo(calls, "GET", "/api/owner/restaurants/casa/guests").at(-1);
    expect(last?.query.get("segment")).toBe("regular");
    expect(last?.query.get("q")).toBe("olga");
  });

  it("the guest list links to sending an offer to the group being looked at", async () => {
    open();
    fireEvent.click(await screen.findByRole("tab", { name: "Guests" }));
    const link = await screen.findByRole("link", { name: "Send an offer to this group" });
    expect(link.getAttribute("href")).toBe("/owner/casa/offers?send=all");
    fireEvent.click(await screen.findByRole("button", { name: /Regulars \(1\)/ }));
    await waitFor(() => expect(screen.getByRole("link", { name: "Send an offer to this group" }).getAttribute("href")).toBe("/owner/casa/offers?send=regular"));
  });

  it("an empty restaurant is told what will appear, not shown zeros", async () => {
    open({ "GET /api/owner/restaurants/casa/insights": () => ({ overview: { ...OVERVIEW, bookings: 0 }, tables: { ...TABLES, total: 0, tables: [], top: [] } }) });
    expect(await screen.findByText(/No bookings in the last 90 days yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Busiest tables" }));
    expect(await screen.findByText(/No table has been booked/)).toBeTruthy();
  });

  it("says so when the numbers cannot be opened", async () => {
    open({ "GET /api/owner/restaurants/casa/insights": () => apiError(401, "unauthorised", "Sign in.") });
    expect(await screen.findByText(/Could not open your numbers/)).toBeTruthy();
  });
});
