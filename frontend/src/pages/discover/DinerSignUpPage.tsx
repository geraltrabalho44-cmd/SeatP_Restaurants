// Route /restaurants/account/sign-up: a diner creates an account from the restaurant side, with no event link.
//
// Two steps on one page: the form (name, email, password, consent) asks for an emailed code; the code makes the
// account and signs in. The account is the same one events use, so one sign-in works on both sides. Nothing is
// stored until the code is typed. The answer to the first step is the same whether or not the address has an
// account, so nobody can find out who has one.
import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { dinerSignUp } from "../../api/diner";
import { verifyCode } from "../../api/guest";
import type { CodeSent } from "../../api/guest";
import { Button, Checkbox, Field, PageShell, useToast } from "../../design/components";
import { SocialSignIn } from "./SocialSignIn";
import { useT } from "../../i18n/I18nProvider";
import { ProblemBox, asApiError, listErrors, looksLikeEmail } from "../account/FormProblem";
import type { FieldErrors } from "../account/FormProblem";
import "../account/account.css";
import { codeDigits } from "../../design/codeDigits";

const MIN_PASSWORD = 10;

export default function DinerSignUpPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const toast = useToast();
  const [values, setValues] = useState({ name: "", email: "", password: "", consent: false });
  const [sent, setSent] = useState<CodeSent | null>(null);
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const email = values.email.trim();

  const check = (): FieldErrors => ({
    name: values.name.trim() === "" ? t("Enter your name.") : null,
    email: email === "" ? t("Enter your email address.") : looksLikeEmail(email) ? null : t("Enter an email address like name@example.com."),
    password:
      values.password.length < MIN_PASSWORD
        ? t("Use at least 10 characters.")
        : values.password.trim().toLowerCase() === email.toLowerCase()
          ? t("Choose a password that is not your email address.")
          : null,
    consent: values.consent ? null : t("Tick the box to agree, so we can create your account."),
  });

  const askForCode = async (): Promise<void> => {
    setBusy(true);
    setGeneral(null);
    try {
      setSent(await dinerSignUp({ name: values.name.trim(), email, password: values.password, consent: true }));
    } catch (error) {
      setGeneral(asApiError(error).message);
    } finally {
      setBusy(false);
    }
  };

  const onForm = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setAttempt((n) => n + 1);
    const found = check();
    setErrors(found);
    if (listErrors(found).length === 0) await askForCode();
  };

  const onCode = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setAttempt((n) => n + 1);
    if (!/^[0-9]{6}$/.test(code)) {
      setGeneral(t("Enter the 6 digits from the email."));
      return;
    }
    setBusy(true);
    setGeneral(null);
    try {
      await verifyCode(email, code, sent?.signup_id ?? "");
      toast.show(t("Your account is ready."), "success");
      navigate("/restaurants/account", { replace: true });
    } catch (error) {
      setGeneral(asApiError(error).message);
      setBusy(false);
    }
  };

  const problems = [...listErrors(errors), ...(general ? [general] : [])];
  return (
    <PageShell title={t("Create your account")} restaurantBrand>
      <div className="acc-page">
        <Link to="/restaurants/account">{t("Back to log in")}</Link>
        <h1 className="acc-title">{sent ? t("Check your email") : t("Create your account")}</h1>
        {sent ? (
          <form className="acc-form" onSubmit={(event) => void onCode(event)} noValidate>
            <p className="acc-lede">{t("We sent a 6-digit code to {email}. It works for 15 minutes.", { email: sent.sent_to })}</p>
            {sent.demo_code && (
              <p className="rb-notice" role="status">
                {t("Demo: no email is sent. Your code is")} <strong>{sent.demo_code}</strong>.
              </p>
            )}
            <ProblemBox messages={general ? [general] : []} attempt={attempt} />
            <Field label={t("Code from the email")} inputMode="numeric" autoComplete="one-time-code" autoFocus value={code} onChange={(event) => setCode(codeDigits(event.target.value))} />
            <Button type="submit" busy={busy} className="acc-submit">
              {t("Create my account")}
            </Button>
            <div className="acc-links">
              <Button variant="ghost" disabled={busy} onClick={() => void askForCode()}>
                {t("Send a new code")}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => { setSent(null); setCode(""); setGeneral(null); }}>
                {t("Use a different email")}
              </Button>
            </div>
          </form>
        ) : (
          <form className="acc-form" onSubmit={(event) => void onForm(event)} noValidate>
            <p className="acc-lede">{t("With an account you can see your bookings, book again in one tap and save your favourite restaurants.")}</p>
            <ProblemBox messages={problems} attempt={attempt} />
            <Field label={t("Your name")} name="name" autoComplete="name" required maxLength={120} value={values.name} error={errors.name} onChange={(event) => setValues({ ...values, name: event.target.value })} />
            <Field label={t("Email")} hint={t("We email you a code to check it is yours.")} type="email" name="email" autoComplete="email" required maxLength={254} value={values.email} error={errors.email} onChange={(event) => setValues({ ...values, email: event.target.value })} />
            <Field label={t("Password")} hint={t("At least 10 characters.")} type="password" name="password" autoComplete="new-password" required maxLength={200} value={values.password} error={errors.password} onChange={(event) => setValues({ ...values, password: event.target.value })} />
            <Checkbox label={t("I agree that SeatPlan stores my name, email and bookings to show my booking history and saved restaurants, and emails me about my bookings. (required)")} checked={values.consent} onChange={(event) => setValues({ ...values, consent: event.target.checked })} />
            <Button type="submit" busy={busy} className="acc-submit">
              {t("Send my code")}
            </Button>
            <div className="acc-links">
              <Link to="/restaurants/account">{t("I already have an account")}</Link>
            </div>
          </form>
        )}
        {!sent && <SocialSignIn />}
      </div>
    </PageShell>
  );
}
