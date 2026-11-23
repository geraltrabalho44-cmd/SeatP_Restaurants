import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getGuestToken } from "../../api/client";
import { guestLogout } from "../../api/guest";
import { Button, PageShell, useToast } from "../../design/components";
import { useT } from "../../i18n/I18nProvider";
import { SignInForm } from "../account/SignInForm";
import "../account/account.css";
import { DinerDashboard } from "./DinerDashboard";
import { SocialSignIn } from "./SocialSignIn";

export default function DinerAccountPage() {
  const { t } = useT();
  const [signedIn, setSignedIn] = useState(() => Boolean(getGuestToken()));
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { state } = useLocation();
  const reviewSlug = typeof state?.reviewSlug === "string" ? state.reviewSlug : "";
  const toast = useToast();

  async function signOut() {
    setBusy(true);
    try {
      await guestLogout();
    } catch {
      // guestLogout clears the local session even when the request fails.
    } finally {
      setSignedIn(false);
      setBusy(false);
    }
  }

  return (
    <PageShell title={signedIn ? t("My account") : t("Log in")} restaurantBrand>
      <div className={`acc-page${signedIn ? " acc-wide" : ""}`}>
        <Link to="/">{t("Back to restaurants")}</Link>
        <h1 className="acc-title">{signedIn ? t("My account") : t("Log in to SeatPlan")}</h1>
        {signedIn ? (
          <>
          <DinerDashboard />
          <Button variant="secondary" busy={busy} onClick={() => void signOut()}>{t("Sign out")}</Button>
          </>
        ) : (
          <>
          <SignInForm
            onSignedIn={({ account }) => {
              toast.show(t("Welcome back, {name}.", { name: account.name }), "success");
              setSignedIn(true);
              if (reviewSlug) navigate(`/restaurants/${encodeURIComponent(reviewSlug)}#reviews`, { replace: true });
              else if (typeof state?.returnTo === "string" && /^\/restaurants\/[^/?#]+$/.test(state.returnTo)) navigate(state.returnTo, { replace: true });
            }}
            links={<><Link to="/my/forgot">{t("Forgot your password?")}</Link><Link to="/restaurants/account/sign-up">{t("Create an account")}</Link></>}
          />
          <SocialSignIn />
          </>
        )}
      </div>
    </PageShell>
  );
}
