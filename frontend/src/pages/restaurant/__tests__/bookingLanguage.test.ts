// The booking carries the page's language, so its emails are written in it.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBooking } from "../../../api/restaurant";
import { setActiveLocale } from "../../../i18n/locale";
import { callsTo, mockApi } from "./mockApi";

afterEach(() => {
  vi.unstubAllGlobals();
  setActiveLocale("en");
});

const CONTACT = { name: "Lia", email: "lia@example.com", phone: "", notes: "" } as never;
const NEEDS = { date: "2030-05-02", party: 2, needs_accessible: false, high_chairs: 0 } as never;
const ANSWER = { booking: { id: "b1", status: "confirmed" }, manage_path: "/b/tok" };

describe("createBooking", () => {
  it("sends the language of the page when it is not English", async () => {
    const calls = mockApi({ "POST /api/r/casa/bookings": () => ANSWER });
    setActiveLocale("pt");
    await createBooking("casa", "hold-token-0001", CONTACT, NEEDS).catch(() => undefined);
    expect((callsTo(calls, "POST", "/api/r/casa/bookings")[0]?.body as { lang?: string }).lang).toBe("pt");
  });

  it("sends nothing extra in English, which is the server's default", async () => {
    const calls = mockApi({ "POST /api/r/casa/bookings": () => ANSWER });
    setActiveLocale("en");
    await createBooking("casa", "hold-token-0001", CONTACT, NEEDS).catch(() => undefined);
    expect("lang" in (callsTo(calls, "POST", "/api/r/casa/bookings")[0]?.body as object)).toBe(false);
  });
});
