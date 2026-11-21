// Sign-in for restaurant owners and staff. By default it is the built-in email and password. When the
// site is set up with Supabase Auth, the page asks SeatPlan (never Supabase) to check the person, and
// SeatPlan answers with its own session token, so every other page works exactly as before.
// "Continue with Google / Apple" sends the browser to the sign-in service by an ordinary link, and the
// one-time token that comes back is checked by SeatPlan, not trusted by the page.
import { useEffect, useState } from "react";
import { ApiError, api, login, setGuestToken, setSessionToken } from "./client";
import type { GuestSession } from "./guest";
import { tr } from "../i18n/locale";
import type { LoginResponse } from "./types";

export type IdentityProvider = "local" | "supabase";
export type SocialProvider = "google" | "apple";

export interface IdentityConfig {
  provider: IdentityProvider;
  password_reset: boolean;
  /** The "Continue with ..." buttons the project has switched on. */
  oauth: SocialProvider[];
  two_step: boolean;
}

const LOCAL: IdentityConfig = { provider: "local", password_reset: false, oauth: [], two_step: false };
let cached: Promise<IdentityConfig> | null = null;

/** Which sign-in the site uses. Asked once; any failure means the built-in one. */
export function getIdentityConfig(): Promise<IdentityConfig> {
  cached ??= api.get<IdentityConfig>("/identity/config", "none").catch(() => LOCAL);
  return cached;
}

/** For tests: forget what was learned about the site's sign-in. */
export function resetIdentityConfig(): void {
  cached = null;
}

/** What the site's sign-in offers ("built-in, nothing extra" until known, so nothing flickers by default). */
export function useIdentityConfig(): IdentityConfig {
  const [config, setConfig] = useState<IdentityConfig>(LOCAL);
  useEffect(() => {
    let live = true;
    void getIdentityConfig().then((found) => {
      if (live) setConfig({ ...LOCAL, ...found });
    });
    return () => {
      live = false;
    };
  }, []);
  return config;
}

export function useIdentityProvider(): IdentityProvider {
  return useIdentityConfig().provider;
}

/** A person with two-step verification must now type a code from their authenticator app. */
export interface SecondStep {
  mfa_required: true;
  factor_id: string;
  ticket: string;
}

export type SignInResult = { signed: LoginResponse } | { second: SecondStep };

function outcome(answer: LoginResponse | SecondStep): SignInResult {
  if ("mfa_required" in answer) return { second: answer };
  setSessionToken(answer.token);
  return { signed: answer };
}

/**
 * Signs in a restaurant owner or staff member through the service. An account made before the service
 * was switched on (it has only a password here) can still sign in: when the service says the
 * email or password is not right, the built-in sign-in is tried before giving up.
 */
export async function signInThroughService(email: string, password: string): Promise<SignInResult> {
  try {
    return outcome(await api.post<LoginResponse | SecondStep>("/identity/owner/login", { email, password }, "none"));
  } catch (error) {
    if (error instanceof ApiError && error.code === "unauthorised") return { signed: await login(email, password) };
    throw error;
  }
}

/** The second step: the six-digit code from the authenticator app. */
export async function submitSecondStep(step: SecondStep, code: string): Promise<LoginResponse> {
  const result = await api.post<LoginResponse>("/identity/owner/mfa", { ticket: step.ticket, factor_id: step.factor_id, code }, "none");
  setSessionToken(result.token);
  return result;
}

// ---------- Google and Apple ----------

const NONCE_KEY = "seatplan.oauthNonce";

function newNonce(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Sends the browser to Google or Apple. A nonce kept in this tab must come back in the address. A diner comes back to the diner page. */
export async function startSocialSignIn(provider: SocialProvider, who: "owner" | "diner" = "owner"): Promise<void> {
  const nonce = newNonce();
  try {
    window.sessionStorage.setItem(NONCE_KEY, nonce);
  } catch {
    throw new ApiError(0, "unknown", tr("Your browser blocks what this sign-in needs. Use your email and password instead."));
  }
  const { url } = await api.post<{ url: string }>(`/identity/${who}/oauth/start`, { provider, nonce }, "none");
  window.location.assign(url);
}

/** What came back after Google or Apple: the one-time token, if the address is the one this tab asked for. */
export function readSocialReturn(hash: string, search: string): { token: string } | { problem: string } {
  const sent = new URLSearchParams(search).get("n") ?? "";
  let kept = "";
  try {
    kept = window.sessionStorage.getItem(NONCE_KEY) ?? "";
    window.sessionStorage.removeItem(NONCE_KEY);
  } catch {
    // Storage blocked: the nonce cannot be checked, so the sign-in cannot be trusted.
  }
  if (!kept || sent !== kept) return { problem: tr("This sign-in was not started from this browser. Please try again.") };
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const token = params.get("access_token");
  if (!token) return { problem: params.get("error_description") ?? tr("The sign-in was cancelled. Please try again.") };
  return { token };
}

/** A diner back from Google or Apple: SeatPlan checks the token, finds or makes their account and gives a diner session. */
export async function finishDinerSocialSignIn(token: string): Promise<GuestSession> {
  const result = await api.post<GuestSession>("/identity/diner/oauth", { access_token: token }, "none");
  setGuestToken(result.token);
  return result;
}

export async function finishSocialSignIn(token: string): Promise<SignInResult> {
  return outcome(await api.post<LoginResponse | SecondStep>("/identity/owner/oauth", { access_token: token }, "none"));
}

// ---------- accounts and passwords ----------

export interface OwnerSignUp {
  name: string;
  email: string;
  password: string;
  consent: boolean;
}

export const signUpThroughService = (body: OwnerSignUp) => api.post<{ status: "check_email" }>("/identity/owner/signup", body, "none");
export const requestPasswordReset = (email: string) => api.post<{ status: "check_email" }>("/identity/owner/reset", { email }, "none");
export const chooseNewPassword = (token: string, password: string) => api.post<void>("/identity/owner/set-password", { token, password }, "none");

// ---------- two-step verification settings (signed in) ----------

export interface SecurityState {
  provider: IdentityProvider;
  linked: boolean;
  two_step: boolean;
}

export interface TwoStepStart {
  factor_id: string;
  secret: string;
  /** The otpauth:// address an authenticator app reads; drawn here as a QR code. */
  uri: string;
  ticket: string;
}

export const getSecurity = () => api.get<SecurityState>("/identity/owner/security");
export const startTwoStep = (password: string) => api.post<TwoStepStart>("/identity/owner/security/start", { password });
export const confirmTwoStep = (start: TwoStepStart, code: string) => api.post<void>("/identity/owner/security/confirm", { ticket: start.ticket, factor_id: start.factor_id, code });
export const disableTwoStep = (password: string, code: string) => api.post<void>("/identity/owner/security/disable", { password, code });
