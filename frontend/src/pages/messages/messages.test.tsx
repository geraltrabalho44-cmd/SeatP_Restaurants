// The reminder's link page, and the owner's message settings.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiError, callsTo, mockApi } from "../restaurant/__tests__/mockApi";
import MessagesPage, { parseCap } from "../owner/MessagesPage";
import MessageActionPage from "./MessageActionPage";

afterEach(() => vi.unstubAllGlobals());

function view(over: Record<string, unknown> = {}) {
  return {
    venue_name: "Casa Linho",
    venue_public_id: "casa123",
    phone: "+351 9•• ••• 678",
    address: "Rua do Sol 4, Lisboa",
    venue_phone: "+351 210 000 100",
    date: "2030-05-02",
    time: "19:30",
    weekday: "Thursday",
    party: 2,
    table: "4",
    status: "confirmed",
    started: false,
    confirmed_at: null,
    ...over,
  };
}

function openLink(): void {
  render(
    <MemoryRouter initialEntries={["/m/7.abc"]}>
      <Routes>
        <Route path="/m/:token" element={<MessageActionPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("The reminder's link page", () => {
  it("shows where and when, and never a name, email or note", async () => {
    mockApi({ "GET /api/m/7.abc": () => view() });
    openLink();
    expect(await screen.findByRole("heading", { name: "Are you still coming?" })).toBeTruthy();
    expect(screen.getByText("Casa Linho")).toBeTruthy();
    expect(screen.getByText(/19:30 · 2 guests · Table 4/)).toBeTruthy();
    expect(screen.queryByText(/@/)).toBeNull();
  });

  it("\"Yes, I'm coming\" confirms and then only offers to cancel", async () => {
    const calls = mockApi({
      "GET /api/m/7.abc": () => view(),
      "POST /api/m/7.abc/confirm": () => view({ confirmed_at: "2030-05-01T10:00:00+00:00" }),
    });
    openLink();
    fireEvent.click(await screen.findByRole("button", { name: "Yes, I'm coming" }));
    expect(await screen.findByText(/Casa Linho is expecting you at 19:30/)).toBeTruthy();
    expect(callsTo(calls, "POST", "/api/m/7.abc/confirm")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Yes, I'm coming" })).toBeNull();
    expect(screen.getByRole("button", { name: "I can't come, cancel" })).toBeTruthy();
  });

  it("cancelling asks first, and \"Keep booking\" changes nothing", async () => {
    const calls = mockApi({ "GET /api/m/7.abc": () => view(), "POST /api/m/7.abc/cancel": () => view({ status: "cancelled" }) });
    openLink();
    fireEvent.click(await screen.findByRole("button", { name: "I can't come, cancel" }));
    expect(screen.getByText(/Table 4 is released straight away/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep booking" }));
    expect(callsTo(calls, "POST", "/api/m/7.abc/cancel")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "I can't come, cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel booking" }));
    expect(await screen.findByText(/Your booking is cancelled/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Book another time" })).toBeTruthy();
  });

  it("stopping the messages says the number was deleted", async () => {
    mockApi({ "GET /api/m/7.abc": () => view(), "POST /api/m/7.abc/stop": () => view({ status: "stopped", phone: "•••" }) });
    openLink();
    fireEvent.click(await screen.findByRole("button", { name: "Stop messages for this booking" }));
    expect(await screen.findByText(/deleted your number from it/)).toBeTruthy();
  });

  it("a booking that has started points to the restaurant's phone", async () => {
    mockApi({ "GET /api/m/7.abc": () => view({ started: true }) });
    openLink();
    expect(await screen.findByText(/please call Casa Linho on \+351 210 000 100/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Yes, I'm coming" })).toBeNull();
  });

  it("an old or made-up link is a plain \"no longer works\"", async () => {
    mockApi({ "GET /api/m/7.abc": () => apiError(404, "not_found", "This link no longer works.") });
    openLink();
    expect(await screen.findByText("This link no longer works")).toBeTruthy();
  });
});

const SETTINGS = { sms_enabled: false, whatsapp_enabled: false, send_confirmation: false, reminder_24h: true, reminder_3h: true, monthly_cap: 300 };
const OWNER = { sms_provider: "demo", whatsapp_provider: "demo", settings: SETTINGS, usage: { used: 12, estimated_cents: 60 }, recent: [] };

function openOwner(): void {
  render(
    <MemoryRouter initialEntries={["/owner/casa123/messages"]}>
      <Routes>
        <Route path="/owner/:venueId/messages" element={<MessagesPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("parseCap", () => {
  it("accepts whole numbers from 0 to 5000 only", () => {
    expect(parseCap("0")).toBe(0);
    expect(parseCap(" 300 ")).toBe(300);
    expect(parseCap("5000")).toBe(5000);
    for (const bad of ["", "5001", "-1", "1.5", "abc", "12345"]) expect(parseCap(bad)).toBeNull();
  });
});

describe("The owner's guest messages page", () => {
  it("says it is demo mode, and shows this month's usage", async () => {
    mockApi({ "GET /api/owner/restaurants/casa123/messages": () => OWNER });
    openOwner();
    expect(await screen.findByText(/Messages are written to the log, never sent/)).toBeTruthy();
    expect(screen.getByTestId("usage").textContent).toContain("12 messages · about €0.60 · limit 300");
    expect(screen.getByText(/No messages yet/)).toBeTruthy();
  });

  it("saves the chosen channels and what to send", async () => {
    const calls = mockApi({
      "GET /api/owner/restaurants/casa123/messages": () => OWNER,
      "PUT /api/owner/restaurants/casa123/messages": () => OWNER,
    });
    openOwner();
    fireEvent.click(await screen.findByRole("checkbox", { name: /SMS/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Reminder 3 hours before/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(callsTo(calls, "PUT", "/api/owner/restaurants/casa123/messages")).toHaveLength(1));
    expect(callsTo(calls, "PUT", "/api/owner/restaurants/casa123/messages")[0]?.body).toEqual({ ...SETTINGS, sms_enabled: true, reminder_3h: false });
  });

  it("does not save a monthly limit that is not a whole number from 0 to 5000", async () => {
    const calls = mockApi({ "GET /api/owner/restaurants/casa123/messages": () => OWNER });
    openOwner();
    fireEvent.change(await screen.findByLabelText(/Stop sending after this many messages/), { target: { value: "99999" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("The monthly limit is a whole number from 0 to 5000.")).toBeTruthy();
    expect(callsTo(calls, "PUT", "/api/owner/restaurants/casa123/messages")).toHaveLength(0);
  });

  it("lists recent messages with the number masked", async () => {
    mockApi({
      "GET /api/owner/restaurants/casa123/messages": () => ({
        ...OWNER,
        recent: [{ id: 1, at: "2030-05-01T10:00:00+00:00", to: "+351 9•• ••• 678", kind: "reminder_24h", channel: "sms", status: "skipped", note: "Skipped: monthly limit" }],
      }),
    });
    openOwner();
    expect(await screen.findByText("+351 9•• ••• 678")).toBeTruthy();
    expect(screen.getByText("Reminder, 24 hours")).toBeTruthy();
    expect(screen.getByText("Skipped (monthly limit)")).toBeTruthy();
  });
});
