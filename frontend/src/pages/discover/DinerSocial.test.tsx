// A diner continues with Google: the buttons show only when the site's sign-in service offers them, the browser is sent
// to the diner page's own return address, and the token that comes back makes a diner session.
import { render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearGuestToken, getGuestToken } from "../../api/client";
import { resetIdentityConfig } from "../../api/identity";
import { ToastProvider } from "../../design/components";
import { apiError, callsTo, mockApi } from "../restaurant/__tests__/mockApi";
import DinerAccountPage from "./DinerAccountPage";
import DinerSignUpPage from "./DinerSignUpPage";
import DinerSocialCallbackPage from "./DinerSocialCallbackPage";

const SERVICE = (oauth: string[]) => ({ "GET /api/identity/config": () => ({ provider: "supabase", password_reset: true, oauth, two_step: true }) });
const SESSION = { token: "guest-token", account: { name: "Dana", email: "dana@example.com", created_at: "2026-11-19T10:00:00Z" } };

beforeEach(() => { clearGuestToken(); resetIdentityConfig(); window.sessionStorage.clear(); });
afterEach(() => vi.unstubAllGlobals());

function open(path: string) {
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/restaurants/account" element={<DinerAccountPage />} />
          <Route path="/restaurants/account/sign-up" element={<DinerSignUpPage />} />
          <Route path="/restaurants/account/callback" element={<DinerSocialCallbackPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe("Continue with Google for a diner", () => {
  it("is not there while the site uses the built-in sign-in", async () => {
    mockApi({ "GET /api/identity/config": () => ({ provider: "local", password_reset: false, oauth: [], two_step: false }) });
    open("/restaurants/account");
    await screen.findByRole("button", { name: "Sign in" });
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
  });

  it("is under the log-in form and the sign-up form, and sends the browser to the diner start route", async () => {
    const calls = mockApi({ ...SERVICE(["google"]), "POST /api/identity/diner/oauth/start": () => ({ url: "https://accounts.example.test/start" }) });
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    open("/restaurants/account");
    const button = await screen.findByRole("button", { name: "Continue with Google" });
    expect(screen.queryByRole("button", { name: "Continue with Apple" })).toBeNull();
    expect(screen.getByText(/stores your name, email and bookings for your account/)).toBeTruthy();
    fireEvent.click(button);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://accounts.example.test/start"));
    const sent = callsTo(calls, "POST", "/api/identity/diner/oauth/start")[0]?.body as { provider: string; nonce: string };
    expect(sent.provider).toBe("google");
    expect(window.sessionStorage.getItem("seatplan.oauthNonce")).toBe(sent.nonce);
  });

  it("is on the sign-up page too, until the code step", async () => {
    mockApi(SERVICE(["google", "apple"]));
    open("/restaurants/account/sign-up");
    expect(await screen.findByRole("button", { name: "Continue with Google" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue with Apple" })).toBeTruthy();
  });

  it("makes the diner session from the token that comes back, then opens the account page", async () => {
    window.sessionStorage.setItem("seatplan.oauthNonce", "n".repeat(20));
    const calls = mockApi({ ...SERVICE(["google"]), "POST /api/identity/diner/oauth": () => SESSION, "GET /api/guest/me": () => ({ account: SESSION.account, events: [] }) });
    window.history.replaceState(null, "", `/restaurants/account/callback?n=${"n".repeat(20)}#access_token=one-time-token`);
    open(`/restaurants/account/callback?n=${"n".repeat(20)}`);
    await waitFor(() => expect(getGuestToken()).toBe("guest-token"));
    expect(callsTo(calls, "POST", "/api/identity/diner/oauth")[0]?.body).toEqual({ access_token: "one-time-token" });
  });

  it("refuses a return that this tab did not ask for, and says what went wrong when the service refuses", async () => {
    mockApi({ ...SERVICE(["google"]), "POST /api/identity/diner/oauth": () => apiError(401, "unauthorised", "Email or password is not correct.") });
    window.history.replaceState(null, "", "/restaurants/account/callback?n=" + "x".repeat(20) + "#access_token=token-123456");
    open("/restaurants/account/callback?n=" + "x".repeat(20));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(getGuestToken()).toBeFalsy();
  });
});
