// The weather and sunset panel on the booking page, and the rain-plan card a diner opens from an email.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguagePicker } from "../../../i18n/LanguagePicker";
import { WeatherPanel } from "../WeatherPanel";
import { RainCard } from "../WeatherRainOffer";
import WeatherRainOffer from "../WeatherRainOffer";
import { apiError, callsTo, mockApi } from "./mockApi";

afterEach(() => vi.unstubAllGlobals());

const NEEDS = { date: "2030-05-02", party: 2, needs_accessible: false, high_chairs: 0 } as const;
const API = "/api/r/casa/weather";
const hour = (time: string, condition: string, probability = 5) => ({ time, condition, temperature: 18, probability, wind: 10 });
const FORECAST = {
  located: true,
  source: "demo",
  status: "fresh",
  hours: [hour("13:00", "Sunny"), hour("19:00", "Sunny"), hour("21:00", "Sunny")],
  sunset: "20:12",
  indoor: [],
  sunset_choices: [{ time: "19:30", tables: [{ id: 7, label: "T7", room: "Terrace" }] }],
};

describe("The weather panel", () => {
  it("shows the evening weather once, with the sunset on the same line, and offers the sunset table", async () => {
    const calls = mockApi({ [`GET ${API}`]: () => FORECAST });
    const picked: number[] = [];
    const times: string[] = [];
    render(<WeatherPanel venueId="casa" needs={NEEDS} onTable={(id) => picked.push(id)} onTime={(time) => times.push(time)} />);
    const panel = await screen.findByRole("region", { name: "Weather and sunset" });
    // One reading (the evening), then the sunset, in one paragraph; no source line and no other hours.
    expect(panel.textContent).toContain("19:00 · Sunny · 18°C / Sunset at 20:12");
    expect(panel.textContent).not.toContain("13:00");
    expect(panel.textContent).not.toContain("21:00");
    expect(panel.textContent).not.toContain("Simulated forecast");
    expect(panel.textContent).not.toContain("Open-Meteo");
    expect(panel.textContent).not.toContain("Indoor tables recommended");
    expect(panel.textContent).not.toContain("No available seating");
    fireEvent.click(screen.getByRole("button", { name: "Choose 19:30" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose T7" }));
    expect(times).toEqual(["19:30"]);
    expect(picked).toEqual([7]);
    const query = callsTo(calls, "GET", API)[0]?.query;
    expect(query?.get("day")).toBe("2030-05-02");
    expect(query?.get("party")).toBe("2");
  });

  it("says the rain once and does not list indoor tables in the card", async () => {
    mockApi({ [`GET ${API}`]: () => ({ ...FORECAST, hours: [hour("13:00", "Rain expected", 80), hour("19:00", "Rain expected", 80), hour("21:00", "Rain expected", 80)], indoor: [{ id: 3, label: "T3", room: "Main room" }] }) });
    render(<WeatherPanel venueId="casa" needs={NEEDS} />);
    const text = (await screen.findByRole("region", { name: "Weather and sunset" })).textContent ?? "";
    expect(text.match(/Rain expected/g)).toHaveLength(1);
    expect(text).not.toContain("Indoor tables recommended");
    expect(screen.queryByRole("button", { name: "Main room · T3" })).toBeNull();
  });

  it("says when the forecast is the last one known, and never names its source in the card", async () => {
    mockApi({ [`GET ${API}`]: () => ({ ...FORECAST, source: "open-meteo", status: "stale" }) });
    render(<WeatherPanel venueId="casa" needs={NEEDS} />);
    expect(await screen.findByText(/Last available forecast/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Weather data by Open-Meteo.com" })).toBeNull();
  });

  it("puts the town in the heading", async () => {
    mockApi({ [`GET ${API}`]: () => ({ ...FORECAST, city: "Lisboa" }) });
    render(<WeatherPanel venueId="casa" needs={NEEDS} />);
    expect(await screen.findByText("Weather for Thu 2 May in Lisbon")).toBeTruthy();
  });

  it("does not call the weather sunny once the sun has set", async () => {
    mockApi({
      [`GET ${API}`]: () => ({ ...FORECAST, hours: [hour("13:00", "Sunny"), hour("19:00", "Sun and clouds"), hour("21:00", "Sunny")] }),
    });
    const { unmount } = render(<WeatherPanel venueId="casa" needs={NEEDS} />);
    const panel = await screen.findByRole("region", { name: "Weather and sunset" });
    // The sun sets at 20:12: 19:00 is day, 21:00 is night.
    expect(panel.textContent).toContain("19:00 · Sun and clouds · 18°C");
    unmount();
    mockApi({ [`GET ${API}`]: () => ({ ...FORECAST, hours: [hour("21:00", "Sunny")] }) });
    const night = render(<WeatherPanel venueId="casa" needs={NEEDS} time="21:00" />);
    expect((await screen.findByRole("region", { name: "Weather and sunset" })).textContent).toContain("21:00 · Clear sky · 18°C");
    expect(night.container.textContent).not.toContain("21:00 · Sunny");
    night.unmount();
    mockApi({ [`GET ${API}`]: () => ({ ...FORECAST, hours: [hour("22:00", "Sun and clouds"), hour("23:00", "Cloudy")] }) });
    render(<WeatherPanel venueId="casa" needs={NEEDS} time="22:00" />);
    expect(await screen.findByText(/22:00 · Partly cloudy · 18°C/)).toBeTruthy();
  });

  it("says plainly when the forecast comes later or is not available, and still shows the sunset", async () => {
    mockApi({ [`GET ${API}`]: () => ({ ...FORECAST, hours: [], status: "later", sunset_choices: [] }) });
    const { unmount } = render(<WeatherPanel venueId="casa" needs={NEEDS} />);
    expect(await screen.findByText("The forecast for this date comes later.")).toBeTruthy();
    expect(screen.getByText(/Sunset at 20:12/)).toBeTruthy();
    expect(screen.queryByText(/No available seating catches the sunset/)).toBeNull();
    unmount();
    mockApi({ [`GET ${API}`]: () => ({ ...FORECAST, hours: [], status: "unavailable" }) });
    render(<WeatherPanel venueId="casa" needs={NEEDS} />);
    expect(await screen.findByText("Weather forecast unavailable right now.")).toBeTruthy();
  });

  it("shows nothing at all for a restaurant without a location, or when the request fails", async () => {
    const calls = mockApi({ [`GET ${API}`]: () => ({ located: false }) });
    const { container, unmount } = render(<WeatherPanel venueId="casa" needs={NEEDS} />);
    await waitFor(() => expect(callsTo(calls, "GET", API)).toHaveLength(1));
    expect(container.textContent).toBe("");
    unmount();
    mockApi({ [`GET ${API}`]: () => apiError(502, "internal", "Down.") });
    const failed = render(<WeatherPanel venueId="casa" needs={NEEDS} />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(failed.container.textContent).toBe("");
  });
});

const OFFER = { status: "offered", restaurant: "Casa Linho", table: "T3", rain_at: "19:00", expires: "2030-05-02T15:30:00+00:00", probability: 82 };

describe("The rain plan card", () => {
  it("explains the offer, and accepting moves the diner and says so", async () => {
    const calls = mockApi({
      "GET /api/b/tok/rain": () => OFFER,
      "POST /api/b/tok/rain/accept": () => ({ ...OFFER, status: "accepted" }),
    });
    render(<RainCard path="/b/tok/rain" />);
    expect(await screen.findByText(/Rain expected at 19:00 \(82%\)\. Indoor table T3 is held until 15:30/)).toBeTruthy();
    expect(screen.getByText(/Your time and party stay the same/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Move me inside" }));
    expect(await screen.findByText("You are booked at indoor table T3.")).toBeTruthy();
    expect(callsTo(calls, "POST", "/api/b/tok/rain/accept")).toHaveLength(1);
  });

  it("declining keeps the terrace table", async () => {
    mockApi({ "GET /api/b/tok/rain": () => OFFER, "POST /api/b/tok/rain/decline": () => ({ ...OFFER, status: "declined" }) });
    render(<RainCard path="/b/tok/rain" />);
    fireEvent.click(await screen.findByRole("button", { name: "Keep my terrace table" }));
    expect(await screen.findByText("You are keeping the terrace table.")).toBeTruthy();
  });

  it("shows the server's words when the choice cannot be made, and keeps the offer", async () => {
    mockApi({ "GET /api/b/tok/rain": () => OFFER, "POST /api/b/tok/rain/accept": () => apiError(409, "conflict", "That table is no longer held.") });
    render(<RainCard path="/b/tok/rain" />);
    fireEvent.click(await screen.findByRole("button", { name: "Move me inside" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Move me inside" })).toBeTruthy();
  });

  it("shows nothing on the booking page when there is no offer", async () => {
    const calls = mockApi({ "GET /api/b/tok/rain": () => null });
    const { container } = render(<RainCard path="/b/tok/rain" />);
    await waitFor(() => expect(callsTo(calls, "GET", "/api/b/tok/rain")).toHaveLength(1));
    expect(container.textContent).toBe("");
  });

  it("an old email link says the offer is unavailable", async () => {
    mockApi({ "GET /api/rain/old": () => apiError(404, "not_found", "No.") });
    render(
      <MemoryRouter initialEntries={["/rain/old"]}>
        <Routes>
          <Route path="/rain/:token" element={<WeatherRainOffer />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("This rain offer is unavailable.")).toBeTruthy();
  });

  it("an offer that has lapsed is not offered again", async () => {
    mockApi({ "GET /api/b/tok/rain": () => ({ ...OFFER, status: "expired" }) });
    render(<RainCard path="/b/tok/rain" />);
    expect(await screen.findByText("This indoor table is no longer held.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Move me inside" })).toBeNull();
  });
});

describe("The language picker", () => {
  it("is hidden while only English is released, so nothing changes for anyone until a language is turned on", () => {
    const { container } = render(
      <MemoryRouter>
        <LanguagePicker />
      </MemoryRouter>,
    );
    expect(container.textContent).toBe("");
  });
});
