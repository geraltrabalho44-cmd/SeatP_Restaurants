import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import ManageBookingPage from "../ManageBookingPage";
import { BOOKING, SLOTS, VENUE } from "./fixtures";
import { apiError, callsTo, mockApi } from "./mockApi";

function SearchProbe() {
  return <p data-testid="search">{useLocation().search}</p>;
}

function renderManage(token = "tok123", search = ""): void {
  render(
    <MemoryRouter initialEntries={[`/b/${token}${search}`]}>
      <SearchProbe />
      <Routes>
        <Route path="/b/:token" element={<ManageBookingPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Manage booking page opened from an email button", () => {
  const routes = (booking = BOOKING) => ({
    "GET /api/b/tok123": () => booking,
    [`GET /api/r/${VENUE}/slots`]: () => SLOTS,
    "DELETE /api/b/tok123": () => ({ ...BOOKING, status: "cancelled" }),
  });

  it("?action=cancel opens the confirmation and cancels nothing by itself", async () => {
    const calls = mockApi(routes());
    renderManage("tok123", "?action=cancel");
    expect(await screen.findByRole("dialog", { name: "Cancel this booking?" })).toBeTruthy();
    expect(callsTo(calls, "DELETE", "/api/b/tok123")).toHaveLength(0);
  });

  it("?action=change opens the time form", async () => {
    mockApi(routes());
    renderManage("tok123", "?action=change");
    expect(await screen.findByLabelText("Time")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens nothing for a booking that is already cancelled", async () => {
    mockApi(routes({ ...BOOKING, status: "cancelled" }));
    renderManage("tok123", "?action=cancel");
    expect(await screen.findByText(/This booking is cancelled/)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens nothing for a booking that can no longer be changed (it already started)", async () => {
    mockApi(routes({ ...BOOKING, can_change: false }));
    renderManage("tok123", "?action=cancel");
    expect(await screen.findByText(/can no longer be changed online/)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel booking" })).toBeNull();
  });

  it("?action=change brings the form into view (on a phone it opens below the fold)", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", { value: scrollIntoView, configurable: true });
    mockApi(routes());
    renderManage("tok123", "?action=change");
    await screen.findByLabelText("Time");
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it("forgets the action once it has opened, so a reload does not open it again", async () => {
    mockApi(routes());
    renderManage("tok123", "?action=cancel");
    await screen.findByRole("dialog", { name: "Cancel this booking?" });
    await waitFor(() => expect(screen.getByTestId("search").textContent).toBe(""));
  });

  it("ignores an action it does not know", async () => {
    mockApi(routes());
    renderManage("tok123", "?action=bogus");
    await screen.findByRole("heading", { name: "Reservation details" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByLabelText("Time")).toBeNull();
  });
});

describe("Manage booking page", () => {
  it("cancels only after the confirmation dialog", async () => {
    const calls = mockApi({
      "GET /api/b/tok123": () => BOOKING,
      [`GET /api/r/${VENUE}/slots`]: () => SLOTS,
      "DELETE /api/b/tok123": () => ({ ...BOOKING, status: "cancelled" }),
    });
    renderManage();
    expect(await screen.findByRole("heading", { name: "Reservation details" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel booking" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancel this booking?" });
    // Keeping the booking closes the dialog without a request.
    // The safe way out is where focus starts, and it closes the dialog without a request.
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Keep booking" }));
    expect(within(dialog).getByText("Casa Linho")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep booking" }));
    expect(callsTo(calls, "DELETE", "/api/b/tok123")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Cancel booking" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel booking" }));
    expect(await screen.findByText(/This booking is cancelled/)).toBeTruthy();
    expect(callsTo(calls, "DELETE", "/api/b/tok123")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Cancel booking" })).toBeNull();
  });

  it("changes the time through PATCH", async () => {
    const calls = mockApi({
      "GET /api/b/tok123": () => BOOKING,
      [`GET /api/r/${VENUE}/slots`]: () => SLOTS,
      "PATCH /api/b/tok123": () => ({ ...BOOKING, time: "12:30", end_time: "14:30" }),
    });
    renderManage();
    await screen.findByRole("heading", { name: "Reservation details" });
    fireEvent.click(screen.getByRole("button", { name: "Change time or guests" }));
    // 20:00 is full, so it is not offered; 12:30 is.
    await screen.findByRole("option", { name: /12:30/ });
    expect(screen.queryByRole("option", { name: /20:00/ })).toBeNull();
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "12:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText(/^12:30 · 4 guests$/)).toBeTruthy();
    expect(callsTo(calls, "PATCH", "/api/b/tok123")[0]?.body).toEqual({ time: "12:30", party_size: 4 });
  });

  it("offers party sizes up to the restaurant's real limit from the booking link", async () => {
    mockApi({ "GET /api/b/tok123": () => BOOKING, [`GET /api/r/${VENUE}/slots`]: () => SLOTS });
    renderManage();
    fireEvent.click(await screen.findByRole("button", { name: "Change time or guests" }));
    const select = (await screen.findByLabelText("Party size")) as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("keeps the real limit after a change, although the change answer does not repeat it", async () => {
    mockApi({
      "GET /api/b/tok123": () => BOOKING,
      [`GET /api/r/${VENUE}/slots`]: () => SLOTS,
      "PATCH /api/b/tok123": () => ({ ...BOOKING, max_party: undefined, time: "12:30", end_time: "14:30" }),
    });
    renderManage();
    fireEvent.click(await screen.findByRole("button", { name: "Change time or guests" }));
    await screen.findByRole("option", { name: /12:30/ });
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "12:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText(/^12:30 · 4 guests$/);
    // The form closes after saving; opening it again still offers the real limit.
    fireEvent.click(screen.getByRole("button", { name: "Change time or guests" }));
    expect((screen.getByLabelText("Party size") as HTMLSelectElement).options).toHaveLength(6);
  });

  it("starts with the summary and three things to do, and opens one at a time", async () => {
    mockApi({ "GET /api/b/tok123": () => BOOKING, [`GET /api/r/${VENUE}/slots`]: () => SLOTS, [`GET /api/r/${VENUE}/seats`]: () => ({ tables: [], seats: [] }) });
    renderManage();
    await screen.findByRole("heading", { name: "Reservation details" });
    const actions = screen.getByRole("group", { name: "Manage this booking" });
    expect(within(actions).getAllByRole("button").map((b) => b.textContent)).toEqual(["Change time or guests", "Request a chair", "Cancel booking"]);
    expect(screen.queryByLabelText("Party size")).toBeNull(); // nothing is open until the diner says what they want
    const time = within(actions).getByRole("button", { name: "Change time or guests" });
    fireEvent.click(time);
    expect(time.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(within(actions).getByRole("button", { name: "Request a chair" }));
    expect(screen.queryByLabelText("Party size")).toBeNull();
    expect(screen.getByRole("heading", { name: "Chair request" })).toBeTruthy();
  });

  it("says a cancelled booking has no table, instead of 'No table yet'", async () => {
    mockApi({ "GET /api/b/tok123": () => ({ ...BOOKING, status: "cancelled", tables: [], table_ids: [] }) });
    renderManage();
    expect(await screen.findByText("None, the booking is cancelled")).toBeTruthy();
    expect(screen.queryByText("No table yet")).toBeNull();
  });

  it("shows the table as gone straight after cancelling", async () => {
    mockApi({
      "GET /api/b/tok123": () => BOOKING,
      [`GET /api/r/${VENUE}/slots`]: () => SLOTS,
      "DELETE /api/b/tok123": () => ({ ...BOOKING, max_party: undefined, status: "cancelled", tables: [], table_ids: [] }),
    });
    renderManage();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel booking" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel booking" }));
    expect(await screen.findByText("None, the booking is cancelled")).toBeTruthy();
    expect(screen.queryByText("Table 7")).toBeNull();
  });

  it("explains an invalid link instead of showing an error code", async () => {
    mockApi({ "GET /api/b/wrong": () => apiError(404, "not_found", "Not found") });
    renderManage("wrong");
    expect(await screen.findByText("This link does not work")).toBeTruthy();
  });
});
