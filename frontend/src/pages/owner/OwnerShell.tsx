// The owner's workspace: a short side menu (My restaurants, then the steps of one restaurant)
// beside the page. Every owner page sits in it, so the owner always knows where they are and
// can reach the next step without going back to the list.
import { useEffect, useRef } from "react";
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
  { key: "rooms", label: "Floor plan", path: "rooms" },
  { key: "review", label: "Review and publish", path: "review" },
];

export function OwnerShell({ title, venueId, venueName, current, children, width = "wide" }: OwnerShellProps) {
  const { t } = useT();
  const base = venueId ? `/owner/${encodeURIComponent(venueId)}` : null;
  const nav = useRef<HTMLElement>(null);
  // On a phone the steps slide sideways: bring the current one to the middle of its list.
  useEffect(() => {
    const here = nav.current?.querySelector<HTMLElement>('a[aria-current="page"]');
    const list = here?.closest("ul");
    if (here && list && list.scrollWidth > list.clientWidth) list.scrollLeft = here.offsetLeft - (list.clientWidth - here.offsetWidth) / 2;
  }, [current, venueId]);
  return (
    <PageShell title={title} width={width}>
      <div className="ow-shell">
        <nav className="ow-nav" ref={nav} aria-label={t("Restaurant owner")}>
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
