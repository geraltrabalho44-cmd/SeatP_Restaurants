// "Add to Google Calendar" opens Google Calendar with the booking filled in.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BookingView } from "../../../api/restaurant";
import { AddToCalendar, googleCalendarUrl } from "../AddToCalendar";

const BOOKING = { venue_name: "Casa Lumen", date: "2026-11-25", time: "20:00", end_time: "21:30", party_size: 2, table_labels: ["W2"] } as BookingView;

describe("Add to Google Calendar", () => {
  it("opens Google Calendar with the day, the hours, the place and the manage link already filled in", () => {
    render(<AddToCalendar booking={BOOKING} address="Rua Garrett 12, Lisboa" manageLink="https://seatplan.test/b/tok123" />);
    const link = screen.getByRole("link", { name: /Add to Google Calendar/ });
    const url = new URL(link.getAttribute("href") ?? "");
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("Casa Lumen");
    expect(url.searchParams.get("dates")).toBe("20261125T200000/20261125T213000");
    expect(url.searchParams.get("ctz")).toBe("Europe/Lisbon"); // the restaurant's own hours
    expect(url.searchParams.get("location")).toBe("Rua Garrett 12, Lisboa");
    expect(url.searchParams.get("details")).toContain("https://seatplan.test/b/tok123");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("is one button: no second link for a calendar file", () => {
    render(<AddToCalendar booking={BOOKING} manageLink="https://seatplan.test/b/tok123" />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByText(/\.ics/)).toBeNull();
  });

  it("leaves the place out when it is not known, and uses another time zone when given one", () => {
    const url = new URL(googleCalendarUrl(BOOKING, "https://x/b/t", "", "Atlantic/Madeira"));
    expect(url.searchParams.has("location")).toBe(false);
    expect(url.searchParams.get("ctz")).toBe("Atlantic/Madeira");
  });
});
