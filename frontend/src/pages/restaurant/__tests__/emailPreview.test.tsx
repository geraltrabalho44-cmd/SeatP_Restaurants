// While the site sends no email, a booking's pages show the message instead of "check your spam folder".
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmailPreview, useBookingEmails } from "../EmailPreview";
import { mockApi } from "./mockApi";

afterEach(() => vi.unstubAllGlobals());

const EMAIL = {
  kind: "booking_confirmed",
  subject: "Booked: Casa Lumen, Fri 21 Nov at 20:00",
  to: "lia@example.com",
  text: "You're booked at Casa Lumen.\nTable 4 · 2 guests\nManage my booking: https://example.com/b/token\n",
  status: "queued",
};

function Probe({ token }: { token: string }) {
  const emails = useBookingEmails(token);
  return emails ? <EmailPreview emails={emails} address="lia@example.com" /> : <p>nothing to show</p>;
}

describe("The email of a booking", () => {
  it("says that no email is sent and shows the message with its subject and address", async () => {
    mockApi({ "GET /api/b/tok/emails": () => ({ available: true, emails: [EMAIL] }) });
    render(<Probe token="tok" />);
    expect(await screen.findByText("This site does not send emails yet. This is the confirmation we would send to lia@example.com.")).toBeTruthy();
    expect(screen.getAllByText("Booked: Casa Lumen, Fri 21 Nov at 20:00").length).toBeGreaterThan(0);
    expect(screen.getByText("Sent to")).toBeTruthy();
    expect(screen.getByText(/Table 4 · 2 guests/)).toBeTruthy();
  });

  it("shows nothing when a real email service is on", async () => {
    mockApi({ "GET /api/b/tok/emails": () => ({ available: false, emails: [] }) });
    render(<Probe token="tok" />);
    await waitFor(() => expect(screen.getByText("nothing to show")).toBeTruthy());
  });

  it("shows nothing when the request fails", async () => {
    mockApi({});
    render(<Probe token="tok" />);
    await waitFor(() => expect(screen.getByText("nothing to show")).toBeTruthy());
  });
});
