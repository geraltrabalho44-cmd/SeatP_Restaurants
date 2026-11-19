// The second step of signing in: a six-digit code from the authenticator app. Shown after the password
// (or Google or Apple) was accepted, for people who turned two-step verification on.
import { useState } from "react";
import type { FormEvent } from "react";
import { submitSecondStep } from "../../api/identity";
import type { SecondStep } from "../../api/identity";
import type { LoginResponse } from "../../api/types";
import { Button, Field } from "../../design/components";
import { ApiError } from "../../api/client";

interface Props {
  step: SecondStep;
  onDone: (result: LoginResponse) => void;
  onCancel: () => void;
}

export function SecondStepForm({ step, onDone, onCancel }: Props) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(code)) {
      setProblem("Enter the six digits from your authenticator app.");
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      onDone(await submitSecondStep(step, code));
    } catch (error) {
      if (error instanceof ApiError && error.code === "rate_limited") setProblem("Too many tries. Wait a few minutes and sign in again.");
      else setProblem(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate aria-label="Second step">
      <p className="login-lede">Open your authenticator app and type the six-digit code for SeatPlan.</p>
      <Field label="Code from your authenticator app" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} value={code} error={problem} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
      <Button type="submit" busy={busy} className="login-submit">
        Check code
      </Button>
      <Button variant="ghost" disabled={busy} onClick={onCancel}>
        Start again
      </Button>
    </form>
  );
}
