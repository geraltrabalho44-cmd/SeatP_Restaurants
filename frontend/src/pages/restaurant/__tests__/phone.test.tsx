// Phone reminders on the booking form: the block only exists when the restaurant sends messages,
// nothing is pre-ticked, the number must be proven with a code, and a booking without a verified
// number cannot be sent while the box is ticked.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { INFO, VENUE } from "./fixtures";
import { apiError, callsTo, mockApi } from "./mockApi";
import { NO_PHONE, PhoneOptIn, consentText } from "../PhoneOptIn";
import type { PhoneChoice } from "../PhoneOptIn";

const API = `/api/r/${VENUE}`;
const OPTIONS = { channels: ["sms"], confirmation: false, reminder_24h: true, reminder_3h: true, demo: true, consent_version: "2026-11-18" };

function Harness({ onValue }: { onValue?: (value: PhoneChoice) => void }) {
  const [value, setValue] = useState<PhoneChoice>(NO_PHONE);
  return (
    <PhoneOptIn
      venueId={VENUE}
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
    />
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("The phone reminders block", () => {
  it("is not there when the restaurant sends no phone messages", async () => {
    const calls = mockApi({ [`GET ${API}`]: () => ({ ...INFO, messages: { ...OPTIONS, channels: [] } }) });
    render(<Harness />);
    await waitFor(() => expect(callsTo(calls, "GET", API)).toHaveLength(1));
    expect(screen.queryByRole("region", { name: "Reminders on your phone" })).toBeNull();
  });

  it("is not pre-ticked, and ticking it explains what will be sent", async () => {
    mockApi({ [`GET ${API}`]: () => ({ ...INFO, messages: OPTIONS }) });
    render(<Harness />);
    const box = await screen.findByRole("checkbox", { name: /Send me booking messages/ });
    expect((box as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByLabelText("Mobile number")).toBeNull();
    fireEvent.click(box);
    expect(screen.getByText(/reminders 24 hours and 3 hours before/)).toBeTruthy();
    expect(screen.getByText(/delete your number 30 days after your visit/)).toBeTruthy();
    expect(screen.getByLabelText("Mobile number")).toBeTruthy();
  });

  it("sends a code, shows the demo code, and verifies the number", async () => {
    const seen: PhoneChoice[] = [];
    const calls = mockApi({
      [`GET ${API}`]: () => ({ ...INFO, messages: OPTIONS }),
      [`POST ${API}/phone/start`]: () => ({ verification_id: "verify-id-123456", phone: "+351 9•• ••• 678", channel: "sms", demo_code: "482913" }),
      [`POST ${API}/phone/verify`]: () => ({ verified: true, phone: "+351 9•• ••• 678", channel: "sms" }),
    });
    render(<Harness onValue={(value) => seen.push(value)} />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /Send me booking messages/ }));
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "912 345 678" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByText(/We sent a 6-digit code to \+351 9•• ••• 678 by SMS/)).toBeTruthy();
    expect(screen.getByText("482913")).toBeTruthy();
    expect(callsTo(calls, "POST", `${API}/phone/start`)[0]?.body).toEqual({ phone: "912 345 678", channel: "sms" });

    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "482913" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByText(/Verified: \+351 9•• ••• 678 · SMS/)).toBeTruthy();
    expect(callsTo(calls, "POST", `${API}/phone/verify`)[0]?.body).toEqual({ verification_id: "verify-id-123456", code: "482913" });
    expect(seen.at(-1)).toEqual({ wanted: true, verificationId: "verify-id-123456", masked: "+351 9•• ••• 678", channel: "sms" });
  });

  it("shows the server's reason for a wrong code and does not mark the number verified", async () => {
    mockApi({
      [`GET ${API}`]: () => ({ ...INFO, messages: OPTIONS }),
      [`POST ${API}/phone/start`]: () => ({ verification_id: "verify-id-123456", phone: "+351 9•• ••• 678", channel: "sms" }),
      [`POST ${API}/phone/verify`]: () => apiError(422, "wrong_code", "That code is not right. You have 3 tries left."),
    });
    render(<Harness />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /Send me booking messages/ }));
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "912345678" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    fireEvent.change(await screen.findByLabelText("Code"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByText("That code is not right. You have 3 tries left.")).toBeTruthy();
    expect(screen.queryByText(/Verified:/)).toBeNull();
  });

  it("offers a choice only when the restaurant has both channels", async () => {
    mockApi({ [`GET ${API}`]: () => ({ ...INFO, messages: { ...OPTIONS, channels: ["whatsapp", "sms"] } }) });
    render(<Harness />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /Send me booking messages/ }));
    expect(screen.getByRole("radio", { name: "WhatsApp" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "SMS" })).toBeTruthy();
  });

  it("unticking forgets the proof", async () => {
    const seen: PhoneChoice[] = [];
    mockApi({ [`GET ${API}`]: () => ({ ...INFO, messages: OPTIONS }) });
    render(<Harness onValue={(value) => seen.push(value)} />);
    const box = await screen.findByRole("checkbox", { name: /Send me booking messages/ });
    fireEvent.click(box);
    fireEvent.click(box);
    expect(seen.at(-1)).toEqual(NO_PHONE);
  });
});

describe("consentText", () => {
  it("names only what this restaurant sends", () => {
    const base = { ...OPTIONS } as Parameters<typeof consentText>[0];
    expect(consentText({ ...base, confirmation: true })).toContain("your confirmation and reminders 24 hours and 3 hours before");
    expect(consentText({ ...base, reminder_3h: false })).toContain("reminders 24 hours before");
    expect(consentText({ ...base, reminder_24h: false, reminder_3h: false })).toContain("messages about your booking");
  });
});
