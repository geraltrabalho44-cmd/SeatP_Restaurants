// Route /owner/reset-password: where the link in the reset email lands. The sign-in service puts a
// one-time token after the "#" of the address, so it never reaches any server's logs; this page takes it
// from there, removes it from the address bar, and sends it with the new password. It never signs anyone in.
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { chooseNewPassword } from "../../api/identity";
import { Button, Field, PageShell } from "../../design/components";
import { useT } from "../../i18n/I18nProvider";
import { errorMessage } from "../restaurant/format";
import "./owner.css";

/** The one-time token in `#access_token=...&type=recovery`, or "" when the address has none. */
export function recoveryToken(hash: string): string {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return params.get("type") === "recovery" ? (params.get("access_token") ?? "") : "";
}

export default function ResetPasswordPage() {
  const { t } = useT();
  // Read once, then taken out of the address so it is not left in the history.
  const [token] = useState(() => recoveryToken(typeof window === "undefined" ? "" : window.location.hash));
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    if (token) window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, [token]);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (busy) return;
    if (password.length < 10) {
      setProblem(t("Use at least 10 characters."));
      return;
    }
    if (password !== again) {
      setProblem(t("The two passwords are not the same."));
      return;
    }
    setBusy(true);
    setProblem("");
    try {
      await chooseNewPassword(token, password);
      setDone(true);
    } catch (error) {
      setProblem(errorMessage(error, t("We could not save the new password. Please ask for a new link.")));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <PageShell title={t("Password changed")}>
        <div className="owner-auth">
          <h1>{t("Password changed")}</h1>
          <p role="status">
            {t("You can now")} <Link to="/owner/sign-in">{t("sign in")}</Link> {t("with your new password.")}
          </p>
        </div>
      </PageShell>
    );
  }
  if (!token) {
    return (
      <PageShell title={t("Choose a new password")}>
        <div className="owner-auth">
          <h1>{t("This link does not work")}</h1>
          <p>{t("It may be old or incomplete.")} <Link to="/owner/forgot-password">{t("Ask for a new link")}</Link>.</p>
        </div>
      </PageShell>
    );
  }
  return (
    <PageShell title={t("Choose a new password")}>
      <div className="owner-auth">
        <h1>{t("Choose a new password")}</h1>
        <form className="owner-form" onSubmit={(event) => void submit(event)} noValidate>
          <Field label={t("New password")} type="password" autoComplete="new-password" hint={t("Use at least 10 characters.")} required maxLength={200} value={password} onChange={(event) => setPassword(event.target.value)} />
          <Field label={t("New password again")} type="password" autoComplete="new-password" required maxLength={200} value={again} error={problem || undefined} onChange={(event) => setAgain(event.target.value)} />
          <Button type="submit" busy={busy}>
            {t("Save the new password")}
          </Button>
        </form>
      </div>
    </PageShell>
  );
}
