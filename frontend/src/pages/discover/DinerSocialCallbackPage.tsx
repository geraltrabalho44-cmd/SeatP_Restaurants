// Route /restaurants/account/callback: where Google or Apple send a diner back. The one-time token comes after the "#" of the
// address (so it never reaches a server log); this page checks that the sign-in was started in this tab (the nonce), takes the
// token out of the address bar and hands it to SeatPlan, which finds or makes the diner account and signs them in.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../../api/client";
import { finishDinerSocialSignIn, readSocialReturn } from "../../api/identity";
import { PageShell, Skeleton, useToast } from "../../design/components";
import { useT } from "../../i18n/I18nProvider";
import { tr } from "../../i18n/locale";
import "../login.css";

export default function DinerSocialCallbackPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const toast = useToast();
  const [problem, setProblem] = useState<string | null>(null);
  // Read once: React may run the effect twice in development, and the nonce can be used only once.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const found = readSocialReturn(window.location.hash, window.location.search);
    window.history.replaceState(null, "", window.location.pathname);
    if ("problem" in found) {
      setProblem(found.problem);
      return;
    }
    finishDinerSocialSignIn(found.token).then(
      ({ account }) => {
        toast.show(t("Welcome back, {name}.", { name: account.name }), "success");
        navigate("/restaurants/account", { replace: true });
      },
      (error) => setProblem(error instanceof ApiError ? error.message : tr("Something went wrong. Please try again.")),
    );
  }, [navigate, toast, t]);

  return (
    <PageShell title={t("Signing you in")} restaurantBrand>
      <div className="login">
        {problem ? (
          <>
            <h1>{t("We could not sign you in")}</h1>
            <p role="alert">{problem}</p>
            <p><Link to="/restaurants/account">{t("Back to sign in")}</Link></p>
          </>
        ) : (
          <>
            <h1>{t("Signing you in")}</h1>
            <Skeleton lines={2} label={t("Signing you in")} />
          </>
        )}
      </div>
    </PageShell>
  );
}
