import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DiscoveryDate } from "./DiscoveryDate";

beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));
afterEach(() => vi.useRealTimers());

function Harness({ min, error }: { min?: string; error?: string | null }) {
  const [value, setValue] = useState("");
  return <DiscoveryDate stacked value={value} onChange={setValue} min={min} error={error} required />;
}

const calendar = () => document.querySelector<HTMLElement>(".discover-calendar");

it("opens the calendar, picks a day, and lets the calendar fold away instead of vanishing", () => {
  render(<Harness min="2030-05-01" />);
  expect(calendar()).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Open calendar" }));
  expect(calendar()).not.toBeNull();
  expect(calendar()?.className).not.toContain("is-leaving");

  fireEvent.click(screen.getByRole("button", { name: /^Wednesday 15 May$/ }));
  expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe("2030-05-15");
  // It is still there a moment, leaving (and hidden from screen readers), then it is gone.
  expect(calendar()?.className).toContain("is-leaving");
  expect(calendar()?.getAttribute("aria-hidden")).toBe("true");
  act(() => {
    vi.advanceTimersByTime(250);
  });
  expect(calendar()).toBeNull();
});

it("starts at the first day it is given: earlier days cannot be chosen", () => {
  render(<Harness min="2030-05-10" />);
  fireEvent.click(screen.getByRole("button", { name: "Open calendar" }));
  expect((screen.getByRole("button", { name: /^Thursday 9 May$/ }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: /^Friday 10 May$/ }) as HTMLButtonElement).disabled).toBe(false);
});

it("closes with Escape and says what is wrong when it has an error", () => {
  render(<Harness min="2030-05-01" error="Choose a date to see the free times." />);
  const input = screen.getByLabelText("Date");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByText("Choose a date to see the free times.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Open calendar" }));
  fireEvent.keyDown(screen.getByRole("group", { name: "Booking calendar" }), { key: "Escape" });
  expect(calendar()?.className).toContain("is-leaving");
});
