// A diner makes an account from the restaurant side: the form asks for an emailed code, the code makes the
// account and signs in, and nothing is sent until the form is right.
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearGuestToken, getGuestToken } from "../../api/client";
import { ToastProvider } from "../../design/components";
import { apiError, callsTo, mockApi } from "../restaurant/__tests__/mockApi";
import DinerAccountPage from "./DinerAccountPage";
import DinerSignUpPage from "./DinerSignUpPage";

const SENT = { status: "code_sent", sent_to: "an***@example.com", expires_in_seconds: 900, signup_id: "id-1", demo_code: "123456" };
const SESSION = { token: "guest-token", account: { name: "Ana", email: "ana@example.com", created_at: "2026-11-19T10:00:00Z" }, join: { status: "link_closed", event_id: null } };

beforeEach(() => clearGuestToken());
afterEach(() => vi.unstubAllGlobals());

function open(path = "/restaurants/account/sign-up"): void {
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/restaurants/account" element={<DinerAccountPage />} />
          <Route path="/restaurants/account/sign-up" element={<DinerSignUpPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

function fillForm(overrides: Partial<Record<"name" | "email" | "password", string>> = {}): void {
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: overrides.name ?? "Ana Diner" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: overrides.email ?? "ana@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: overrides.password ?? "a long password" } });
}

describe("creating a diner account", () => {
  it("is offered on the log-in page", () => {
    mockApi({});
    open("/restaurants/account");
    expect(screen.getByRole("link", { name: "Create an account" }).getAttribute("href")).toBe("/restaurants/account/sign-up");
  });

  it("sends nothing until the form is right and the box is ticked", () => {
    const calls = mockApi({ "POST /api/diner/sign-up": () => SENT });
    open();
    fillForm({ password: "short" });
    fireEvent.click(screen.getByRole("button", { name: "Send my code" }));
    expect(screen.getAllByText("Use at least 10 characters.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Tick the box to agree, so we can create your account.").length).toBeGreaterThan(0);
    expect(callsTo(calls, "POST", "/api/diner/sign-up")).toHaveLength(0);
  });

  it("asks for a code, then the code makes the account and signs in", async () => {
    const calls = mockApi({ "POST /api/diner/sign-up": () => SENT, "POST /api/guest/verify": () => SESSION, "GET /api/diner/bookings": () => ({ items: [], total: 0 }), "GET /api/diner/favorites": () => ({ items: [] }) });
    open();
    fillForm();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Send my code" }));
    expect(await screen.findByText(/We sent a 6-digit code to an\*\*\*@example.com/)).toBeTruthy();
    expect(callsTo(calls, "POST", "/api/diner/sign-up")[0]?.body).toEqual({ name: "Ana Diner", email: "ana@example.com", password: "a long password", consent: true });
    fireEvent.change(screen.getByLabelText("Code from the email"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Create my account" }));
    expect(await screen.findByRole("heading", { name: "My account" })).toBeTruthy();
    expect(callsTo(calls, "POST", "/api/guest/verify")[0]?.body).toEqual({ email: "ana@example.com", code: "123456", signup_id: "id-1" });
    expect(getGuestToken()).toBe("guest-token");
  });

  it("says so when the code is wrong and stays on the code step", async () => {
    mockApi({ "POST /api/diner/sign-up": () => SENT, "POST /api/guest/verify": () => apiError(422, "validation", "That code is not right. You have 4 tries left.") });
    open();
    fillForm();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Send my code" }));
    await screen.findByText(/We sent a 6-digit code/);
    fireEvent.change(screen.getByLabelText("Code from the email"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Create my account" }));
    expect(await screen.findByText("That code is not right. You have 4 tries left.")).toBeTruthy();
    expect(getGuestToken()).toBeFalsy();
  });
});
