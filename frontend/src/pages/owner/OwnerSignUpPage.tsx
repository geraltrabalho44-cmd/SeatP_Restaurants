import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signUpThroughService, useIdentityProvider } from "../../api/identity";
import { registerOwner, verifyOwner } from "../../api/owner";
import type { OwnerCode } from "../../api/owner";
import { Button, Checkbox, Field, PageShell } from "../../design/components";
import { useT } from "../../i18n/I18nProvider";
import "./owner.css";
import { codeDigits } from "../../design/codeDigits";

export default function OwnerSignUpPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState<OwnerCode | null>(null);
  // With the sign-in service the confirmation is a link in an email, not a code typed here.
  const provider = useIdentityProvider();
  const [linkSent, setLinkSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // What is wrong, by field: shown beside the field and summed up above the form.
  const [problems, setProblems] = useState<Partial<Record<"name" | "email" | "password" | "consent", string>>>({});

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (!pending) {
      const found: typeof problems = {};
      if (!name.trim()) found.name = t("Enter your name.");
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) found.email = t("Enter a valid email address.");
      if (password.length < 10) found.password = t("Use at least 10 characters.");
      if (!consent) found.consent = t("Please agree to create your owner account.");
      setProblems(found);
      const first = (["name", "email", "password", "consent"] as const).find((field) => found[field]);
      if (first) {
        document.getElementById(`owner-${first}`)?.focus();
        return;
      }
    }
    setBusy(true);
    try {
      if (pending) {
        await verifyOwner(email, code, pending.signup_id);
        navigate("/owner", { replace: true });
      } else {
        if (provider === "supabase") {
          await signUpThroughService({ name: name.trim(), email: email.trim(), password, consent: true });
          setLinkSent(true);
        } else {
          setPending(await registerOwner({ name, email, password, consent: true }));
        }
        setPassword("");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("Please try again."));
    } finally { setBusy(false); }
  };

  if (linkSent) {
    return <PageShell title={t("Check your email")}><div className="owner-auth">
      <h1>{t("Check your email")}</h1>
      <p role="status">{t("We sent a confirmation link to {email}. Open it, then", { email })} <Link to="/owner/sign-in">{t("sign in")}</Link>. {t("If nothing arrives in a few minutes, look in your spam folder.")}</p>
    </div></PageShell>;
  }
  return <PageShell title={t("Create an owner account")}><div className="owner-auth">
    <h1>{pending ? t("Check your email") : t("Create an owner account")}</h1>
    {pending ? <p>{t("Enter the six-digit code sent to {email}. It expires in 15 minutes.", { email })}</p> : <p>{t("Set up your restaurant and let guests choose their table.")}</p>}
    <form className="owner-form" onSubmit={submit} noValidate>
      {Object.keys(problems).length > 1 && <div role="alert" className="owner-error owner-summary"><p>{t("Please fix {n} things:", { n: Object.keys(problems).length })}</p><ul>{(["name", "email", "password", "consent"] as const).filter((field) => problems[field]).map((field) => <li key={field}><a href={`#owner-${field}`}>{problems[field]}</a></li>)}</ul></div>}
      {!pending && <>
        <Field id="owner-name" label={t("Name")} autoComplete="name" required maxLength={120} value={name} error={problems.name} onChange={e => setName(e.target.value)} />
        <Field id="owner-email" label={t("Email")} type="email" autoComplete="email" required maxLength={254} value={email} error={problems.email} hint={provider === "supabase" ? t("We email you a link to confirm it is yours.") : t("We email you a six-digit code to confirm it is yours.")} onChange={e => setEmail(e.target.value)} />
        <Field id="owner-password" label={t("Password")} type="password" autoComplete="new-password" hint={t("Use at least 10 characters.")} required minLength={10} maxLength={200} value={password} error={problems.password} onChange={e => setPassword(e.target.value)} />
        <Checkbox id="owner-consent" label={t("I agree to create a restaurant owner account.")} required checked={consent} onChange={e => setConsent(e.target.checked)} />
        {problems.consent && <p role="alert" className="owner-error">{problems.consent}</p>}
      </>}
      {pending && <>
        {pending.code_shown && <p className="owner-demo" role="status">{t("Demo code")} <strong>{pending.code_shown}</strong></p>}
        <Field label={t("Verification code")} autoFocus inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" value={code} onChange={e => setCode(codeDigits(e.target.value))} />
      </>}
      {error && <p role="alert" className="owner-error">{error}</p>}
      <Button type="submit" busy={busy}>{pending ? t("Verify and continue") : t("Send verification code")}</Button>
    </form>
    {pending && <Button variant="ghost" busy={busy} onClick={() => { setPending(null); setCode(""); setError(""); }}>{t("Request a new code")}</Button>}
    <p>{t("Already have an account?")} <Link to="/owner/sign-in">{t("Sign in")}</Link></p>
  </div></PageShell>;
}
