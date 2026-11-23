// The owner's workspace: a short side menu (My restaurants, then the steps of one restaurant)
// beside the page. Every owner page sits in it, so the owner always knows where they are and
// can reach the next step without going back to the list.
// On a phone the menu folds behind one "Menu" button at the top of the page (it used to be two rows of links that slid
// sideways and broke onto two lines); the button names the page you are on, and the list opens under it.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { logout } from "../../api/client";
import { PageShell } from "../../design/components";
import type { Message } from "../../i18n/catalogue";
import { useT } from "../../i18n/I18nProvider";
import "./owner.css";
import "./owner-v5.css";

export type OwnerSection = "restaurants" | "profile" | "photos" | "hours" | "rooms" | "review" | "menu" | "payments" | "messages" | "insights" | "terms" | "offers" | "security";

interface OwnerShellProps {
  /** The browser tab title. */
  title: string;
  /** The restaurant in the menu and in the top line; none on the list of restaurants. */
  venueId?: string;
  venueName?: string;
  current: OwnerSection;
  /** Where "Public restaurant" leads; the booking address forwards to the public page when there is one. */
  publicHref?: string;
  children: React.ReactNode;
  width?: "normal" | "wide";
}

const STEPS: { key: Exclude<OwnerSection, "restaurants">; label: Message; path: string }[] = [
  { key: "profile", label: "Profile", path: "profile" },
  { key: "photos", label: "Photos", path: "photos" },
  { key: "hours", label: "Opening hours", path: "hours" },
  { key: "menu", label: "Menu and prices", path: "menu" },
  { key: "payments", label: "Deposits", path: "payments" },
  { key: "messages", label: "Guest messages", path: "messages" },
  { key: "insights", label: "Insights", path: "insights" },
  { key: "offers", label: "Offers", path: "offers" },
  { key: "terms", label: "Terms and privacy", path: "terms" },
  { key: "security", label: "Security", path: "security" },
  { key: "rooms", label: "Floor plan", path: "rooms" },
  { key: "review", label: "Review and publish", path: "review" },
];

export function OwnerShell({ title, venueId, venueName, current, publicHref, children, width = "wide" }: OwnerShellProps) {
  const { t } = useT();
  const base = venueId ? `/owner/${encodeURIComponent(venueId)}` : null;
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const here = current === "restaurants" ? t("My restaurants") : t(STEPS.find((step) => step.key === current)?.label ?? "My restaurants");
  // A new page closes the phone menu.
  useEffect(() => setOpen(false), [current, venueId]);
  useEffect(() => {
    if (!open) return undefined;
    const escape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open]);
  return (
    <PageShell title={title} width={width}>
      <div className={`ow-shell${open ? " is-menu-open" : ""}`}>
        {/* Phone only (CSS): the page you are on, and the button that opens the menu. The page's name is drawn from
            data-here, so it is not a second copy of the link text in the page. */}
        <button
          ref={toggle}
          type="button"
          className="ow-menu-toggle"
          aria-expanded={open}
          aria-controls="ow-nav"
          data-here={here}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="ow-menu-label">{t("Menu")}</span>
          <span className="ow-menu-icon" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
        <nav className="ow-nav" id="ow-nav" aria-label={t("Restaurant owner")}>
          <p className="rb5-eyebrow">{t("Restaurant owner")}</p>
          <ul>
            <li>
              <Link to="/owner" aria-current={current === "restaurants" ? "page" : undefined}>
                {t("My restaurants")}
              </Link>
            </li>
            {base &&
              STEPS.map((step) => (
                <li key={step.key}>
                  <Link to={`${base}/${step.path}`} aria-current={current === step.key ? "page" : undefined}>
                    {t(step.label)}
                  </Link>
                </li>
              ))}
          </ul>
          <ul className="ow-nav-more">
            {base && <li><Link to={`${base}/dashboard`}>{t("Service floor")}</Link></li>}
            {venueId && (
              <li>
                <Link to={publicHref ?? `/r/${encodeURIComponent(venueId)}`}>{t("Public restaurant")}</Link>
              </li>
            )}
            <li>
              <Link to="/owner/sign-in" onClick={() => logout()}>
                {t("Sign out")}
              </Link>
            </li>
          </ul>
        </nav>
        <div className="ow-main">
          {venueName && <p className="ow-workspace">{venueName}</p>}
          {children}
        </div>
      </div>
    </PageShell>
  );
}
