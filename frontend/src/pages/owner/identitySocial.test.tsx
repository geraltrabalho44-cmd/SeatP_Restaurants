// "Continue with Google / Apple", the second step (authenticator app), and the Security page.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSessionToken } from "../../api/client";
import { readSocialReturn, resetIdentityConfig } from "../../api/identity";
import { ToastProvider } from "../../design/components";
import Login from "../Login";
import { apiError, callsTo, mockApi } from "../restaurant/__tests__/mockApi";
import SecurityPage, { groupSecret } from "./SecurityPage";
import SocialCallbackPage from "./SocialCallbackPage";

const CONFIG = { provider: "supabase", password_reset: true, oauth: ["google", "apple"], two_step: true };
const USER = { token: "seatplan-token", user: { email: "olga@example.com", name: "Olga Owner", role: "organiser" } };
const SECOND = { mfa_required: true, factor_id: "factor-abc-123456", ticket: "ticket-abcdef-123456" };
const NONCE_KEY = "seatplan.oauthNonce";

const REAL_LOCATION = window.location;

beforeEach(() => {
  resetIdentityConfig();
  window.sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  // A test that replaced window.location (to watch where the browser is sent) puts it back.
  Object.defineProperty(window, "location", { value: REAL_LOCATION, writable: true, configurable: true });
});

function signIn(): void {
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/owner/sign-in"]}>
        <Routes>
          <Route path="/owner/sign-in" element={<Login defaultNext="/owner" />} />
          <Route path="/owner" element={<p>The owner area</p>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe("Continue with Google or Apple", () => {
  it("offers only the buttons the project has switched on, and only to owners and staff", async () => {
    mockApi({ "GET /api/identity/config": () => ({ ...CONFIG, oauth: ["google"] }) });
    signIn();
    expect(await screen.findByRole("button", { name: "Continue with Google" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue with Apple" })).toBeNull();
  });

  it("shows no buttons when the site uses the built-in sign-in", async () => {
    mockApi({ "GET /api/identity/config": () => ({ provider: "local", password_reset: false, oauth: [], two_step: false }) });
    signIn();
    await screen.findByRole("button", { name: "Sign in" });
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
  });

  it("keeps a nonce in this tab and sends the browser where SeatPlan says", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, assign }, writable: true, configurable: true });
    const calls = mockApi({
      "GET /api/identity/config": () => CONFIG,
      "POST /api/identity/owner/oauth/start": () => ({ url: "https://project.supabase.co/auth/v1/authorize?provider=google" }),
    });
    signIn();
    fireEvent.click(await screen.findByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://project.supabase.co/auth/v1/authorize?provider=google"));
    const sent = callsTo(calls, "POST", "/api/identity/owner/oauth/start")[0]?.body as { provider: string; nonce: string };
    expect(sent.provider).toBe("google");
    expect(sent.nonce).toMatch(/^[0-9a-f]{48}$/);
    expect(window.sessionStorage.getItem(NONCE_KEY)).toBe(sent.nonce);
  });
});

describe("what comes back from Google or Apple", () => {
  it("accepts the token only with the nonce this tab kept, and uses the nonce once", () => {
    window.sessionStorage.setItem(NONCE_KEY, "abc123");
    expect(readSocialReturn("#access_token=tok-123456&type=bearer", "?n=abc123")).toEqual({ token: "tok-123456" });
    expect(window.sessionStorage.getItem(NONCE_KEY)).toBeNull();
    expect("problem" in readSocialReturn("#access_token=tok-123456", "?n=abc123")).toBe(true); // already used
  });

  it("refuses a link someone else made: a missing, wrong or unkept nonce", () => {
    window.sessionStorage.setItem(NONCE_KEY, "abc123");
    expect("problem" in readSocialReturn("#access_token=tok-123456", "?n=other")).toBe(true);
    window.sessionStorage.setItem(NONCE_KEY, "abc123");
    expect("problem" in readSocialReturn("#access_token=tok-123456", "")).toBe(true);
    expect("problem" in readSocialReturn("#access_token=tok-123456", "?n=")).toBe(true);
  });

  it("says plainly when the person cancelled at Google or Apple", () => {
    window.sessionStorage.setItem(NONCE_KEY, "abc123");
    const found = readSocialReturn("#error=access_denied&error_description=The+user+cancelled", "?n=abc123");
    expect("problem" in found && found.problem).toBe("The user cancelled");
  });
});

function openCallback(hash: string): void {
  window.history.replaceState(null, "", `/owner/sign-in/callback?n=abc123${hash}`);
  render(
    <MemoryRouter initialEntries={["/owner/sign-in/callback"]}>
      <Routes>
        <Route path="/owner/sign-in/callback" element={<SocialCallbackPage />} />
        <Route path="/owner" element={<p>The owner area</p>} />
        <Route path="/owner/sign-in" element={<p>Sign in page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("the page Google or Apple send people back to", () => {
  it("checks the token with SeatPlan, signs in, and takes the token out of the address", async () => {
    window.sessionStorage.setItem(NONCE_KEY, "abc123");
    const calls = mockApi({ "POST /api/identity/owner/oauth": () => USER });
    openCallback("#access_token=google-token-123");
    expect(await screen.findByText("The owner area")).toBeTruthy();
    expect(callsTo(calls, "POST", "/api/identity/owner/oauth")[0]?.body).toEqual({ access_token: "google-token-123" });
    expect(getSessionToken()).toBe("seatplan-token");
    expect(window.location.hash).toBe("");
  });

  it("asks for the second step when the account has one, and signs in only after the code", async () => {
    window.sessionStorage.setItem(NONCE_KEY, "abc123");
    const calls = mockApi({ "POST /api/identity/owner/oauth": () => SECOND, "POST /api/identity/owner/mfa": () => USER });
    openCallback("#access_token=google-token-123");
    expect(await screen.findByText("One more step")).toBeTruthy();
    expect(getSessionToken()).toBeNull(); // nothing yet
    fireEvent.change(screen.getByLabelText("Code from your authenticator app"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Check code" }));
    expect(await screen.findByText("The owner area")).toBeTruthy();
    expect(callsTo(calls, "POST", "/api/identity/owner/mfa")[0]?.body).toEqual({ ticket: SECOND.ticket, factor_id: SECOND.factor_id, code: "123456" });
    expect(getSessionToken()).toBe("seatplan-token");
  });

  it("a sign-in not started in this tab is refused and nothing is sent", async () => {
    const calls = mockApi({ "POST /api/identity/owner/oauth": () => USER });
    openCallback("#access_token=google-token-123");
    expect(await screen.findByText("We could not sign you in")).toBeTruthy();
    expect(screen.getByText(/not started from this browser/)).toBeTruthy();
    expect(callsTo(calls, "POST", "/api/identity/owner/oauth")).toHaveLength(0);
    expect(screen.getByRole("link", { name: "Back to sign in" }).getAttribute("href")).toBe("/owner/sign-in");
  });

  it("shows the server's words when the token is not accepted", async () => {
    window.sessionStorage.setItem(NONCE_KEY, "abc123");
    mockApi({ "POST /api/identity/owner/oauth": () => apiError(401, "unauthorised", "This sign-in has expired. Please try again.") });
    openCallback("#access_token=google-token-123");
    expect(await screen.findByText("This sign-in has expired. Please try again.")).toBeTruthy();
  });
});

describe("the second step after the password", () => {
  const PASSWORD_ROUTES = { "GET /api/identity/config": () => CONFIG, "POST /api/identity/owner/login": () => SECOND };

  function typePassword(): void {
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "olga@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a-long-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  }

  it("a right password is not a session yet: the code is asked for, and the password field is gone", async () => {
    mockApi({ ...PASSWORD_ROUTES, "POST /api/identity/owner/mfa": () => USER });
    signIn();
    await screen.findByRole("button", { name: "Continue with Google" });
    typePassword();
    expect(await screen.findByLabelText("Code from your authenticator app")).toBeTruthy();
    expect(getSessionToken()).toBeNull();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
    fireEvent.change(screen.getByLabelText("Code from your authenticator app"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Check code" }));
    expect(await screen.findByText("The owner area")).toBeTruthy();
  });

  it("checks the six digits before sending, and shows the server's words for a wrong code", async () => {
    const calls = mockApi({ ...PASSWORD_ROUTES, "POST /api/identity/owner/mfa": () => apiError(401, "unauthorised", "That code is not right.") });
    signIn();
    await screen.findByRole("button", { name: "Continue with Google" });
    typePassword();
    const box = await screen.findByLabelText("Code from your authenticator app");
    fireEvent.change(box, { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "Check code" }));
    expect(await screen.findByText("Enter the six digits from your authenticator app.")).toBeTruthy();
    expect(callsTo(calls, "POST", "/api/identity/owner/mfa")).toHaveLength(0);
    fireEvent.change(box, { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Check code" }));
    expect(await screen.findByText("That code is not right.")).toBeTruthy();
    expect(getSessionToken()).toBeNull();
  });

  it("only digits can be typed, and \"Start again\" goes back to the password", async () => {
    mockApi(PASSWORD_ROUTES);
    signIn();
    await screen.findByRole("button", { name: "Continue with Google" });
    typePassword();
    const box = (await screen.findByLabelText("Code from your authenticator app")) as HTMLInputElement;
    fireEvent.change(box, { target: { value: "12ab34" } });
    expect(box.value).toBe("1234");
    fireEvent.click(screen.getByRole("button", { name: "Start again" }));
    expect(await screen.findByLabelText("Password")).toBeTruthy();
  });
});

function openSecurity(state: Record<string, unknown>, extra: Record<string, () => unknown> = {}) {
  const calls = mockApi({ "GET /api/identity/owner/security": () => state, ...extra });
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/owner/casa/security"]}>
        <Routes>
          <Route path="/owner/:venueId/security" element={<SecurityPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
  return calls;
}

describe("the Security page", () => {
  it("groups the secret in fours so it can be typed", () => {
    expect(groupSecret("JBSWY3DPEHPK3PXP")).toBe("JBSW Y3DP EHPK 3PXP");
  });

  it("says plainly that it is not available with the built-in sign-in", async () => {
    openSecurity({ provider: "local", linked: false, two_step: false });
    expect(await screen.findByText(/Not available yet/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Set up/ })).toBeNull();
  });

  it("tells an owner who never used the new sign-in to do that first", async () => {
    openSecurity({ provider: "supabase", linked: false, two_step: false });
    expect(await screen.findByText(/Sign out and sign in once more with the new sign-in/)).toBeTruthy();
  });

  it("turns it on: password, then the QR code and key, then a first code; it is on only after that", async () => {
    const calls = openSecurity(
      { provider: "supabase", linked: true, two_step: false },
      {
        "POST /api/identity/owner/security/start": () => ({ factor_id: "factor-abc-123456", secret: "JBSWY3DPEHPK3PXP", uri: "otpauth://totp/SeatPlan:olga@example.com?secret=JBSWY3DPEHPK3PXP&issuer=SeatPlan", ticket: "ticket-abcdef-123456" }),
        "POST /api/identity/owner/security/confirm": () => null,
      },
    );
    fireEvent.click(await screen.findByRole("button", { name: "Set up two-step verification" }));
    expect(await screen.findByText("Enter your password.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Your password, to confirm it is you"), { target: { value: "a-long-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Set up two-step verification" }));
    expect(await screen.findByTestId("secret")).toBeTruthy();
    expect(screen.getByTestId("secret").textContent).toBe("JBSW Y3DP EHPK 3PXP");
    expect(screen.getByRole("img", { name: "QR code to add SeatPlan to your authenticator app" })).toBeTruthy();
    expect(screen.getByText(/there are no recovery codes/)).toBeTruthy();
    expect(callsTo(calls, "POST", "/api/identity/owner/security/start")[0]?.body).toEqual({ password: "a-long-password" });
    // Still off until a code has been checked.
    expect(screen.getByText("Off")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Code from the app"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    expect(await screen.findByText("On")).toBeTruthy();
    expect(callsTo(calls, "POST", "/api/identity/owner/security/confirm")[0]?.body).toEqual({ ticket: "ticket-abcdef-123456", factor_id: "factor-abc-123456", code: "123456" });
  });

  it("a wrong password or code is explained and nothing turns on", async () => {
    openSecurity(
      { provider: "supabase", linked: true, two_step: false },
      { "POST /api/identity/owner/security/start": () => apiError(401, "unauthorised", "Email or password is not correct.") },
    );
    fireEvent.change(await screen.findByLabelText("Your password, to confirm it is you"), { target: { value: "wrong-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Set up two-step verification" }));
    expect(await screen.findByText("Email or password is not correct.")).toBeTruthy();
    expect(screen.getByText("Off")).toBeTruthy();
  });

  it("turning it off needs the password and a current code", async () => {
    const calls = openSecurity({ provider: "supabase", linked: true, two_step: true }, { "POST /api/identity/owner/security/disable": () => null });
    const card = await screen.findByRole("region", { name: "Two-step verification" });
    expect(within(card).getByText("On")).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Turn off two-step verification" }));
    expect(await screen.findByText(/Enter your password and the six digits/)).toBeTruthy();
    expect(callsTo(calls, "POST", "/api/identity/owner/security/disable")).toHaveLength(0);
    fireEvent.change(within(card).getByLabelText("Your password"), { target: { value: "a-long-password" } });
    fireEvent.change(within(card).getByLabelText("Code from the app"), { target: { value: "123456" } });
    fireEvent.click(within(card).getByRole("button", { name: "Turn off two-step verification" }));
    expect(await screen.findByText("Off")).toBeTruthy();
    expect(callsTo(calls, "POST", "/api/identity/owner/security/disable")[0]?.body).toEqual({ password: "a-long-password", code: "123456" });
  });
});
