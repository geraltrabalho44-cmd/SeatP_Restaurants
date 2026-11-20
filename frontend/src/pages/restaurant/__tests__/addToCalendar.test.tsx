// The "Add to calendar" link points at the booking's .ics file, with the manage token as its only key.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AddToCalendar } from "../AddToCalendar";

describe("Add to calendar", () => {
  it("downloads the calendar file of this booking", () => {
    render(<AddToCalendar token="tok123" />);
    const link = screen.getByRole("link", { name: "Add to calendar" });
    expect(link.getAttribute("href")).toBe("/api/b/tok123/calendar.ics");
    expect(link.hasAttribute("download")).toBe(true);
  });
});
