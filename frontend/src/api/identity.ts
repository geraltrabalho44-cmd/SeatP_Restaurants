// Sign-in for restaurant owners and staff. By default it is the built-in email and password. When the
// site is set up with Supabase Auth, the page asks SeatPlan (never Supabase) to check the person, and
// SeatPlan answers with its own session token, so every other page works exactly as before.
import { useEffect, useState } from "react";
import { ApiError, api, login, setSessionToken } from "./client";
import type { LoginResponse } from "./types";

export type IdentityProvider = "local" | "supabase";

interface IdentityConfig {
  provider: IdentityProvider;
  password_reset: boolean;
}

let cached: Promise<IdentityConfig> | null = null;

/** Which sign-in the site uses. Asked once; any failure means the built-in one. */
export function getIdentityConfig(): Promise<IdentityConfig> {
  cached ??= api.get<IdentityConfig>("/identity/config", "none").catch(() => ({ provider: "local" as const, password_reset: false }));
  return cached;
}

/** For tests: forget what was learned about the site's sign-in. */
export function resetIdentityConfig(): void {
  cached = null;
}

/** The sign-in the site uses, once known ("local" until then, so nothing flickers for the default). */
export function useIdentityProvider(): IdentityProvider {
  const [provider, setProvider] = useState<IdentityProvider>("local");
  useEffect(() => {
    let live = true;
    void getIdentityConfig().then((config) => {
      if (live) setProvider(config.provider);
    });
    return () => {
      live = false;
    };
  }, []);
  return provider;
}

/**
 * Signs in a restaurant owner or staff member through the service. An account made before the service
 * was switched on (it has only a password here) can still sign in: when the service says the
 * email or password is not right, the built-in sign-in is tried before giving up.
 */
export async function signInThroughService(email: string, password: string): Promise<LoginResponse> {
  try {
    const result = await api.post<LoginResponse>("/identity/owner/login", { email, password }, "none");
    setSessionToken(result.token);
    return result;
  } catch (error) {
    if (error instanceof ApiError && error.code === "unauthorised") return login(email, password);
    throw error;
  }
}

export interface OwnerSignUp {
  name: string;
  email: string;
  password: string;
  consent: boolean;
}

export const signUpThroughService = (body: OwnerSignUp) => api.post<{ status: "check_email" }>("/identity/owner/signup", body, "none");
export const requestPasswordReset = (email: string) => api.post<{ status: "check_email" }>("/identity/owner/reset", { email }, "none");
export const chooseNewPassword = (token: string, password: string) => api.post<void>("/identity/owner/set-password", { token, password }, "none");
