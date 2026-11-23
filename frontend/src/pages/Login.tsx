// Organiser and staff sign-in. On success the session token is stored by
// api/client.ts and we go back to where the person came from (?next=...).
import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, login } from "../api/client";
import { signInThroughService, startSocialSignIn, useIdentityConfig } from "../api/identity";
import type { SecondStep, SocialProvider } from "../api/identity";
import type { LoginResponse } from "../api/types";
import { SecondStepForm } from "./owner/SecondStepForm";
import { Button, Field, PageShell, useToast } from "../design/components";
import { useT } from "../i18n/I18nProvider";
import { tr } from "../i18n/locale";
import "./login.css";

/** Only allow in-app paths after login, so a link cannot send people to another site. */
export function safeNextPath(next: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/";
}

function messageFor(error: unknown): string {
  if (!(error instanceof ApiError)) return tr("Something went wrong. Please try again.");
  if (error.code === "unauthorised" || error.code === "not_found") return tr("That email and password do not match an account.");
  if (error.code === "rate_limited") return tr("Too many attempts. Please wait a minute and try again.");
  return error.message;
}

export default function Login({ defaultNext = "/" }: { defaultNext?: string } = {}) {
  const { t } = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Owners and staff sign in through the sign-in service when the site uses one; organisers never do.
  const identityConfig = useIdentityConfig();
  const provider = identityConfig.provider;
  // Set when the password was right but the account also has two-step verification.
  const [second, setSecond] = useState<SecondStep | null>(null);
  // Coming from the restaurant owner's area, the page speaks to owners; every other entry keeps its own words.
  const next = params.get("next") ?? defaultNext;
  const owner = next.startsWith("/owner");
  // Coming to open a restaurant's service floor, the page says so; the staff keep the plain form.
  const staff = !owner && (next === "/staff" || next.startsWith("/staff/"));
  const throughService = provider === "supabase" && (owner || staff);
  const title = owner ? t("Sign in to manage your restaurant") : staff ? t("Sign in to open the service floor") : t("Sign in");

  const welcome = (result: LoginResponse): void => {
    toast.show(t("Welcome back, {name}.", { name: result.user.name }), "success");
    navigate(safeNextPath(params.get("next") ?? defaultNext));
  };

  const social = async (which: SocialProvider): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await startSocialSignIn(which);
    } catch (caught) {
      setError(messageFor(caught));
      setBusy(false);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (email.trim() === "" || password === "") {
      setError(t("Enter your email and your password."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (throughService) {
        const result = await signInThroughService(email.trim(), password);
        if ("second" in result) {
          setSecond(result.second);
          setPassword("");
        } else {
          welcome(result.signed);
        }
      } else {
        welcome(await login(email.trim(), password));
      }
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell title={title}>
      <div className="login">
        <h1>{title}</h1>
        {owner ? (
          <p className="login-lede">{t("Use the email and password of your restaurant owner account.")}</p>
        ) : staff ? (
          <p className="login-lede">{t("Use the email and password of your restaurant staff account.")}</p>
        ) : (
          <p className="login-lede">
            {t("For organisers and restaurant staff. Invited guests only need their personal link. Guests who made an account on a shared link")}{" "}
            <Link to="/my/sign-in">{t("sign in on the guest page")}</Link>.
          </p>
        )}
        {second ? (
          <SecondStepForm step={second} onDone={welcome} onCancel={() => setSecond(null)} />
        ) : (
        <form onSubmit={onSubmit} noValidate>
          <Field label={t("Email")} type="email" name="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Field
            label={t("Password")}
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error}
          />
          <Button type="submit" busy={busy} className="login-submit">
            {t("Sign in")}
          </Button>
        </form>
        )}
        {throughService && !second && identityConfig.oauth.length > 0 && (
          <div className="login-social" role="group" aria-label={t("Or continue with")}>
            {identityConfig.oauth.map((which) => (
              <Button key={which} variant="secondary" disabled={busy} onClick={() => void social(which)}>
                {t("Continue with {provider}", { provider: which === "google" ? "Google" : "Apple" })}
              </Button>
            ))}
          </div>
        )}
        {owner && (
          <p>
            <Link to="/owner/sign-up">{t("Create a restaurant owner account")}</Link>
          </p>
        )}
        {throughService && (
          <p>
            <Link to="/owner/forgot-password">{t("Forgot your password?")}</Link>
          </p>
        )}
      </div>
    </PageShell>
  );
}
