// The owner's Security page: two-step verification with an authenticator app. Turning it on needs the
// password again and a first code (so it is on only when it really works); turning it off needs the
// password and a current code (so a stolen session cannot switch it off).
import { useState } from "react";
import { useParams } from "react-router-dom";
import { confirmTwoStep, disableTwoStep, getSecurity, startTwoStep } from "../../api/identity";
import type { SecurityState, TwoStepStart } from "../../api/identity";
import { Badge, Button, ErrorState, Field, Skeleton, useToast } from "../../design/components";
import { useT } from "../../i18n/I18nProvider";
import { QrImage } from "../../qr/QrImage";
import { errorMessage } from "../restaurant/format";
import { useLoad } from "../restaurant/useLoad";
import { OwnerShell } from "./OwnerShell";
import "./owner.css";

/** The secret in groups of four, easier to type by hand: "JBSW Y3DP EHPK 3PXP". */
export function groupSecret(secret: string): string {
  return secret.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

export default function SecurityPage() {
  const { t } = useT();
  const { venueId } = useParams();
  const { state, reload, setData } = useLoad(() => getSecurity(), "security");
  return (
    <OwnerShell title={t("Security")} venueId={venueId} current="security">
      <div className="ow-page-head">
        <div>
          <h1 className="ow-title">{t("Security")}</h1>
          <p className="rb-muted">{t("Protect your restaurant account with a second step when you sign in.")}</p>
        </div>
      </div>
      {state.status === "loading" && <Skeleton label={t("Loading your security settings")} lines={3} />}
      {state.status === "error" && <ErrorState message={t("Could not open your security settings. Check your sign-in or retry.")} onRetry={() => reload()} />}
      {state.status === "ready" && <Body state={state.data} onChange={(next) => setData(next)} />}
    </OwnerShell>
  );
}

function Body({ state, onChange }: { state: SecurityState; onChange: (next: SecurityState) => void }) {
  const { t } = useT();
  if (state.provider === "local") {
    return (
      <section className="owner-card" aria-label={t("Two-step verification")}>
        <div className="owner-card-body">
          <h2 className="ow-subtitle">{t("Two-step verification")}</h2>
          <p>{t("Not available yet: this site signs owners in with the built-in email and password. Two-step verification, and signing in with Google or Apple, arrive when the new sign-in service is switched on.")}</p>
        </div>
      </section>
    );
  }
  if (!state.linked) {
    return (
      <section className="owner-card" aria-label={t("Two-step verification")}>
        <div className="owner-card-body">
          <h2 className="ow-subtitle">{t("Two-step verification")}</h2>
          <p>{t("Sign out and sign in once more with the new sign-in (the same email), then come back here to turn on two-step verification.")}</p>
        </div>
      </section>
    );
  }
  return state.two_step ? <TurnOff onOff={() => onChange({ ...state, two_step: false })} /> : <TurnOn onOn={() => onChange({ ...state, two_step: true })} />;
}

function TurnOn({ onOn }: { onOn: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [started, setStarted] = useState<TwoStepStart | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const start = async (): Promise<void> => {
    if (!password) {
      setProblem(t("Enter your password."));
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      setStarted(await startTwoStep(password));
      setPassword("");
    } catch (error) {
      setProblem(errorMessage(error, t("We could not start. Please try again.")));
    } finally {
      setBusy(false);
    }
  };
  const confirm = async (): Promise<void> => {
    if (!started) return;
    if (!/^\d{6}$/.test(code)) {
      setProblem(t("Enter the six digits from your authenticator app."));
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await confirmTwoStep(started, code);
      toast.show(t("Two-step verification is on."), "success");
      onOn();
    } catch (error) {
      setProblem(errorMessage(error, t("We could not check the code. Please try again.")));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="owner-card" aria-label={t("Two-step verification")}>
      <div className="owner-card-body">
        <h2 className="ow-subtitle">
          {t("Two-step verification")} <Badge>{t("Off")}</Badge>
        </h2>
        {!started ? (
          <>
            <p>{t("When you sign in, you will also type a six-digit code from an authenticator app on your phone (for example Google Authenticator, Microsoft Authenticator or 1Password).")}</p>
            <Field label={t("Your password, to confirm it is you")} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            <div className="rb-actions">
              <Button busy={busy} onClick={() => void start()}>
                {t("Set up two-step verification")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <ol className="ow-steps">
              <li>{t("Open your authenticator app and add an account by scanning this code.")}</li>
              <li>{t("If you cannot scan it, type this key instead:")} <strong data-testid="secret">{groupSecret(started.secret)}</strong></li>
              <li>{t("Type the six-digit code the app shows now.")}</li>
            </ol>
            <QrImage text={started.uri} label={t("QR code to add SeatPlan to your authenticator app")} size={180} />
            <Field label={t("Code from the app")} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
            <p className="rb-notice rb-notice-warning" role="note">
              {t("Keep your phone safe: there are no recovery codes. If you lose the app, you will not be able to sign in with this account until the person who runs SeatPlan resets it.")}
            </p>
            <div className="rb-actions">
              <Button busy={busy} onClick={() => void confirm()}>
                {t("Turn on")}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => { setStarted(null); setCode(""); setProblem(null); }}>
                {t("Cancel")}
              </Button>
            </div>
          </>
        )}
        {problem && (
          <p className="rb-notice rb-notice-error" role="alert">
            {problem}
          </p>
        )}
      </div>
    </section>
  );
}

function TurnOff({ onOff }: { onOff: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const off = async (): Promise<void> => {
    if (!password || !/^\d{6}$/.test(code)) {
      setProblem(t("Enter your password and the six digits from your authenticator app."));
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await disableTwoStep(password, code);
      toast.show(t("Two-step verification is off."), "success");
      onOff();
    } catch (error) {
      setProblem(errorMessage(error, t("We could not turn it off. Please try again.")));
      setCode("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="owner-card" aria-label={t("Two-step verification")}>
      <div className="owner-card-body">
        <h2 className="ow-subtitle">
          {t("Two-step verification")} <Badge tone="success">{t("On")}</Badge>
        </h2>
        <p>{t("Signing in asks for a code from your authenticator app. To turn it off, enter your password and a current code.")}</p>
        <Field label={t("Your password")} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        <Field label={t("Code from the app")} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
        {problem && (
          <p className="rb-notice rb-notice-error" role="alert">
            {problem}
          </p>
        )}
        <div className="rb-actions">
          <Button variant="secondary" busy={busy} onClick={() => void off()}>
            {t("Turn off two-step verification")}
          </Button>
        </div>
      </div>
    </section>
  );
}
