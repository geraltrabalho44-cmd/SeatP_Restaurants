// Route /owner/forgot-password: ask for a link to choose a new password. Only used when the site signs
// owners in through the sign-in service. The answer is the same whether or not the address has an account.
import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "../../api/identity";
import { Button, Field, PageShell } from "../../design/components";
import { errorMessage } from "../restaurant/format";
import "./owner.css";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (busy) return;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setProblem("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setProblem("");
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (error) {
      setProblem(errorMessage(error, "We could not send the link. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell title="Forgot your password?">
      <div className="owner-auth">
        <h1>{sent ? "Check your email" : "Forgot your password?"}</h1>
        {sent ? (
          <p role="status">If {email.trim()} has a restaurant account, we sent a link to choose a new password. It can take a few minutes; look in your spam folder too.</p>
        ) : (
          <>
            <p>Enter the email of your restaurant account and we will send you a link to choose a new password.</p>
            <form className="owner-form" onSubmit={(event) => void submit(event)} noValidate>
              <Field label="Email" type="email" autoComplete="email" required maxLength={254} value={email} error={problem || undefined} onChange={(event) => setEmail(event.target.value)} />
              <Button type="submit" busy={busy}>
                Send the link
              </Button>
            </form>
          </>
        )}
        <p>
          <Link to="/owner/sign-in">Back to sign in</Link>
        </p>
      </div>
    </PageShell>
  );
}
