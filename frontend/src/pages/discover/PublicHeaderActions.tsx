import { useT } from "../../i18n/I18nProvider";
// The public header: the link for restaurant owners and the diner's log-in, side by side on every screen. There used to be
// a "Menu" button on phones, but it only ever held the owners link, so the link is now shown directly.
// The language control is in the page frame (PageShell), so every page has it in the same place.
import { Link } from "react-router-dom";
import { getGuestToken, getSessionToken } from "../../api/client";
import "./discover.css";

export function PublicHeaderActions() {
  const { t } = useT();
  const owners = getSessionToken() ? "/owner" : "/owner/sign-in";
  return (
    <nav className="site-nav" aria-label={t("Main")}>
      {/* The narrowest phones show the short word; the link's name is always the full one. */}
      <Link to={owners} className="btn btn-ghost site-nav-owners" aria-label={t("For restaurant owners")}>
        <span className="site-nav-owners-long" aria-hidden="true">{t("For restaurant owners")}</span>
        <span className="site-nav-owners-short" aria-hidden="true">{t("Owners")}</span>
      </Link>
      <Link to="/restaurants/account" className="btn btn-primary site-nav-login">
        {getGuestToken() ? t("My account") : t("Log in")}
      </Link>
    </nav>
  );
}
