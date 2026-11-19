// Owner and staff sign-in through the sign-in service (Supabase Auth), when the site uses one: the built-in
// sign-in stays the default, the page talks only to SeatPlan, an old account still gets in, and a
// forgotten password can be reset from the link in an email.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSessionToken, setSessionToken } from "../../api/client";
import { resetIdentityConfig } from "../../api/identity";
import { ToastProvider } from "../../design/components";
import Login from "../Login";
import { apiError, callsTo, mockApi } from "../restaurant/__tests__/mockApi";
import ForgotPasswordPage from "./ForgotPasswordPage";
import OwnerSignUpPage from "./OwnerSignUpPage";
import ResetPasswordPage, { recoveryToken } from "./ResetPasswordPage";

const SERVICE = { "GET /api/identity/config": () => ({ provider: "supabase", password_reset: true }) };
const LOCAL = { "GET /api/identity/config": () => ({ provider: "local", password_reset: false }) };
const USER = { token: "seatplan-token", user: { email: "olga@example.com", name: "Olga Owner", role: "organiser" } };

beforeEach(() => {
  resetIdentityConfig();
  window.sessionStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

function signIn(path: string): void {
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/owner/sign-in" element={<Login defaultNext="/owner" />} />
          <Route path="/owner" element={<p>The owner area</p>} />
          <Route path="/staff/:venueId" element={<p>The service floor</p>} />
          <Route path="/organiser/:id" element={<p>The organiser area</p>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

function fill(email: string, password: string): void {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("signing in as an owner", () => {
  it("uses the built-in sign-in by default, and never asks the sign-in service", async () => {
    const calls = mockApi({ ...LOCAL, "POST /api/auth/login": () => USER });
    signIn("/owner/sign-in");
    fill("olga@example.com", "a-long-password");
    expect(await screen.findByText("The owner area")).toBeTruthy();
    expect(callsTo(calls, "POST", "/api/auth/login")).toHaveLength(1);
    expect(callsTo(calls, "POST", "/api/identity/owner/login")).toHaveLength(0);
    expect(screen.queryByRole("link", { name: "Forgot your password?" })).toBeNull();
  });

  it("goes through the service when the site uses one, keeps SeatPlan's own session, and asks only SeatPlan", async () => {
    const calls = mockApi({ ...SERVICE, "POST /api/identity/owner/login": () => USER });
    signIn("/owner/sign-in");
    await screen.findByRole("link", { name: "Forgot your password?" });
    fill("olga@example.com", "a-long-password");
    expect(await screen.findByText("The owner area")).toBeTruthy();
    expect(callsTo(calls, "POST", "/api/identity/owner/login")[0]?.body).toEqual({ email: "olga@example.com", password: "a-long-password" });
    expect(getSessionToken()).toBe("seatplan-token");
    // Every request went to SeatPlan's own address: no other site was contacted.
    const fetchMock = globalThis.fetch as unknown as { mock: { calls: [RequestInfo | URL][] } };
    expect(fetchMock.mock.calls.every(([url]) => String(url).startsWith("/api/"))).toBe(true);
  });

  it("an account made before the service was switched on still gets in with its old password", async () => {
    const calls = mockApi({
      ...SERVICE,
      "POST /api/identity/owner/login": () => apiError(401, "unauthorised", "Email or password is not correct."),
      "POST /api/auth/login": () => USER,
    });
    signIn("/owner/sign-in");
    await screen.findByRole("link", { name: "Forgot your password?" });
    fill("olga@example.com", "the-old-password");
    expect(await screen.findByText("The owner area")).toBeTruthy();
    expect(callsTo(calls, "POST", "/api/identity/owner/login")).toHaveLength(1);
    expect(callsTo(calls, "POST", "/api/auth/login")).toHaveLength(1);
  });

  it("a wrong password is refused after both were tried, in the same words as ever", async () => {
    mockApi({
      ...SERVICE,
      "POST /api/identity/owner/login": () => apiError(401, "unauthorised", "Email or password is not correct."),
      "POST /api/auth/login": () => apiError(401, "unauthorised", "Email or password is not correct."),
    });
    signIn("/owner/sign-in");
    await screen.findByRole("link", { name: "Forgot your password?" });
    fill("olga@example.com", "wrong-password");
    expect(await screen.findByText("That email and password do not match an account.")).toBeTruthy();
    expect(getSessionToken()).toBeNull();
  });

  it("says so when the sign-in service cannot be reached, without trying to hide it", async () => {
    mockApi({ ...SERVICE, "POST /api/identity/owner/login": () => apiError(502, "identity_unavailable", "The sign-in service could not be reached.") });
    signIn("/owner/sign-in");
    await screen.findByRole("link", { name: "Forgot your password?" });
    fill("olga@example.com", "a-long-password");
    expect(await screen.findByText("The sign-in service could not be reached.")).toBeTruthy();
  });

  it("staff go through the service too", async () => {
    const calls = mockApi({ ...SERVICE, "POST /api/identity/owner/login": () => ({ ...USER, user: { ...USER.user, role: "staff" } }) });
    signIn("/login?next=/staff/abc");
    await screen.findByRole("link", { name: "Forgot your password?" });
    fill("waiter@example.com", "a-long-password");
    expect(await screen.findByText("The service floor")).toBeTruthy();
    expect(callsTo(calls, "POST", "/api/identity/owner/login")).toHaveLength(1);
  });

  it("an event organiser never goes through the service: their sign-in is untouched", async () => {
    const calls = mockApi({ ...SERVICE, "POST /api/auth/login": () => USER });
    signIn("/login?next=/organiser/abc");
    fill("organiser@example.com", "a-long-password");
    expect(await screen.findByText("The organiser area")).toBeTruthy();
    expect(callsTo(calls, "POST", "/api/identity/owner/login")).toHaveLength(0);
    expect(screen.queryByRole("link", { name: "Forgot your password?" })).toBeNull();
  });
});

describe("creating an owner account through the service", () => {
  function signUp(): void {
    render(
      <MemoryRouter initialEntries={["/owner/sign-up"]}>
        <Routes>
          <Route path="/owner/sign-up" element={<OwnerSignUpPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }
  function fillForm(): void {
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Olga Owner" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "olga@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a-long-password" } });
    fireEvent.click(screen.getByRole("checkbox"));
  }

  it("sends a link instead of a code, and says where to go next", async () => {
    const calls = mockApi({ ...SERVICE, "POST /api/identity/owner/signup": () => ({ status: "check_email" }) });
    signUp();
    expect(await screen.findByText("We email you a link to confirm it is yours.")).toBeTruthy();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Send verification code" }));
    expect(await screen.findByText(/We sent a confirmation link to olga@example.com/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "sign in" }).getAttribute("href")).toBe("/owner/sign-in");
    expect(callsTo(calls, "POST", "/api/identity/owner/signup")[0]?.body).toEqual({ name: "Olga Owner", email: "olga@example.com", password: "a-long-password", consent: true });
    expect(screen.queryByLabelText("Verification code")).toBeNull();
  });

  it("keeps the six-digit code when the site does not use the service", async () => {
    mockApi({ ...LOCAL, "POST /api/owner/register": () => ({ signup_id: "s1", code_shown: "123456" }) });
    signUp();
    expect(await screen.findByText("We email you a six-digit code to confirm it is yours.")).toBeTruthy();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Send verification code" }));
    expect(await screen.findByLabelText("Verification code")).toBeTruthy();
  });
});

describe("a forgotten password", () => {
  it("asks for a link, and says the same whoever asks", async () => {
    const calls = mockApi({ "POST /api/identity/owner/reset": () => ({ status: "check_email" }) });
    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Send the link" }));
    expect(await screen.findByText("Enter a valid email address.")).toBeTruthy();
    expect(callsTo(calls, "POST", "/api/identity/owner/reset")).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "nobody@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send the link" }));
    expect(await screen.findByText(/If nobody@example.com has a restaurant account, we sent a link/)).toBeTruthy();
  });

  it("reads the one-time token only from a recovery link", () => {
    expect(recoveryToken("#access_token=abc.def&expires_in=3600&type=recovery")).toBe("abc.def");
    expect(recoveryToken("#access_token=abc.def&type=signup")).toBe("");
    expect(recoveryToken("#type=recovery")).toBe("");
    expect(recoveryToken("")).toBe("");
  });

  function openReset(hash: string): void {
    window.history.replaceState(null, "", `/owner/reset-password${hash}`);
    render(
      <MemoryRouter initialEntries={["/owner/reset-password"]}>
        <Routes>
          <Route path="/owner/reset-password" element={<ResetPasswordPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("sets the new password with the token from the link, takes the token out of the address, and signs nobody in", async () => {
    const calls = mockApi({ "POST /api/identity/owner/set-password": () => null });
    openReset("#access_token=tok123456789&type=recovery");
    expect(window.location.hash).toBe("");
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "a-new-long-password" } });
    fireEvent.change(screen.getByLabelText("New password again"), { target: { value: "a-new-long-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the new password" }));
    expect(await screen.findByText("Password changed")).toBeTruthy();
    expect(callsTo(calls, "POST", "/api/identity/owner/set-password")[0]?.body).toEqual({ token: "tok123456789", password: "a-new-long-password" });
    expect(getSessionToken()).toBeNull();
  });

  it("checks the two passwords before sending anything", async () => {
    const calls = mockApi({ "POST /api/identity/owner/set-password": () => null });
    openReset("#access_token=tok123456789&type=recovery");
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the new password" }));
    await waitFor(() => expect(document.querySelector(".field-error")?.textContent).toContain("Use at least 10 characters."));
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "a-new-long-password" } });
    fireEvent.change(screen.getByLabelText("New password again"), { target: { value: "different-long-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the new password" }));
    expect(await screen.findByText("The two passwords are not the same.")).toBeTruthy();
    expect(callsTo(calls, "POST", "/api/identity/owner/set-password")).toHaveLength(0);
  });

  it("an expired link says so and points to a new one", async () => {
    mockApi({ "POST /api/identity/owner/set-password": () => apiError(401, "unauthorised", "This reset link has expired. Ask for a new one.") });
    openReset("#access_token=tok123456789&type=recovery");
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "a-new-long-password" } });
    fireEvent.change(screen.getByLabelText("New password again"), { target: { value: "a-new-long-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the new password" }));
    expect(await screen.findByText("This reset link has expired. Ask for a new one.")).toBeTruthy();
  });

  it("a page opened without a token does not offer a form", () => {
    openReset("");
    expect(screen.getByText("This link does not work")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ask for a new link" }).getAttribute("href")).toBe("/owner/forgot-password");
    expect(screen.queryByLabelText("New password")).toBeNull();
  });
});

describe("the session", () => {
  it("is SeatPlan's own token whichever way the owner came in", async () => {
    setSessionToken("old");
    mockApi({ ...SERVICE, "POST /api/identity/owner/login": () => USER });
    signIn("/owner/sign-in");
    await screen.findByRole("link", { name: "Forgot your password?" });
    fill("olga@example.com", "a-long-password");
    await waitFor(() => expect(getSessionToken()).toBe("seatplan-token"));
  });
});
