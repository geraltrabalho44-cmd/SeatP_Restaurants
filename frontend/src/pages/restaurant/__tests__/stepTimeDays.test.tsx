import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StepTime } from "../StepTime";
import { todayIso } from "../format";
import { callsTo, mockApi } from "./mockApi";

afterEach(() => vi.unstubAllGlobals());

const needs = (date: string) => ({ date, party: 2, needs_accessible: false, high_chairs: 0 });

it("asks the server nothing without a date, and shows no error text from it", async () => {
  const calls = mockApi({});
  render(<StepTime venueId="casa" needs={needs("")} onPick={() => {}} onBack={() => {}} />);
  await Promise.resolve();
  expect(callsTo(calls, "GET", "/api/r/casa/slots")).toHaveLength(0);
  expect(screen.queryByText("We could not load the times")).toBeNull();
  expect(screen.queryByText(/query\.date|Input should be/)).toBeNull();
});

it("says a past day has passed, instead of 'no times left today', and asks the server nothing", async () => {
  const calls = mockApi({});
  render(<StepTime venueId="casa" needs={needs("2020-01-01")} onPick={() => {}} onBack={() => {}} />);
  expect(await screen.findByText("This date has passed")).toBeTruthy();
  expect(screen.getByText("Choose today or a later day to see the free times.")).toBeTruthy();
  expect(screen.queryByText("No times left today")).toBeNull();
  expect(callsTo(calls, "GET", "/api/r/casa/slots")).toHaveLength(0);
  // No weather for a day that is over.
  expect(callsTo(calls, "GET", "/api/r/casa/weather")).toHaveLength(0);
});

it("still asks for today and later days", async () => {
  const calls = mockApi({ "GET /api/r/casa/slots": () => ({ date: todayIso(), slots: [], closed_reason: null }) });
  render(<StepTime venueId="casa" needs={needs(todayIso())} onPick={() => {}} onBack={() => {}} />);
  await screen.findByText(/No times/);
  expect(callsTo(calls, "GET", "/api/r/casa/slots")).toHaveLength(1);
});
