// "Continue with Google" for a diner, under the log-in form and the sign-up form. It shows only the buttons the site's
// sign-in service has switched on (none while the site uses the built-in sign-in), so nothing changes until it is on.
import { useState } from "react";
import { ApiError } from "../../api/client";
import { startSocialSignIn, useIdentityConfig } from "../../api/identity";
import type { SocialProvider } from "../../api/identity";
import { Button } from "../../design/components";
import { useT } from "../../i18n/I18nProvider";
import { tr } from "../../i18n/locale";
import "./dinerAccount.css";

const NAMES: Record<SocialProvider, string> = { google: "Google", apple: "Apple" };

export function SocialSignIn() {
  const { t } = useT();
  const { oauth, provider } = useIdentityConfig();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (provider !== "supabase" || oauth.length === 0) return null;
  const go = async (which: SocialProvider): Promise<void> => {
    setBusy(true);
    setProblem(null);
    try {
      await startSocialSignIn(which, "diner");
    } catch (caught) {
      setProblem(caught instanceof ApiError ? caught.message : tr("Something went wrong. Please try again."));
      setBusy(false);
    }
  };
  return (
    <div className="acc-social" role="group" aria-label={t("Or continue with")}>
      {oauth.map((which) => (
        <Button key={which} variant="secondary" disabled={busy} onClick={() => void go(which)}>
          {t("Continue with {provider}", { provider: NAMES[which] })}
        </Button>
      ))}
      {problem && <p role="alert" className="acc-error">{problem}</p>}
      <p className="acc-social-note">{t("By continuing you agree that SeatPlan stores your name, email and bookings for your account.")}</p>
    </div>
  );
}
