import { Link } from "react-router-dom";
import { ApiError } from "../../api/client";
import { listOwnerRestaurants } from "../../api/owner";
import type { OwnerCard } from "../../api/owner";
import { Badge, EmptyState, ErrorState, Skeleton } from "../../design/components";
import { useT } from "../../i18n/I18nProvider";
import { tr } from "../../i18n/locale";
import { useLoad } from "../restaurant/useLoad";
import { OwnerShell } from "./OwnerShell";
import { PhotoPreview } from "./PhotoPreview";

/** The first thing left to do for a restaurant that is not live yet, in the owner's words, and where it is done. */
export function nextStep(card: OwnerCard): { label: string; path: string } | null {
  const steps: Record<string, { label: string; path: string }> = {
    identity: { label: tr("Complete the profile"), path: "profile" },
    location: { label: tr("Pin your location"), path: "profile?section=location" },
    photos: { label: tr("Add a cover photo"), path: "photos" },
    hours: { label: tr("Add opening hours"), path: "hours" },
    rooms: { label: tr("Add your first room"), path: "rooms" },
    review: { label: tr("Review and publish"), path: "review" },
  };
  const key = card.setup.missing.find((missing) => steps[missing]);
  return key ? steps[key] : null;
}

export default function OwnerHomePage() {
  const { t } = useT();
  const { state, reload } = useLoad(listOwnerRestaurants, "owner-restaurants");
  const signIn = state.status === "error" && state.error instanceof ApiError && [401, 403].includes(state.error.status);
  return <OwnerShell title={t("My restaurants")} current="restaurants">
    <div className="owner-heading"><div><h1>{t("My restaurants")}</h1><p className="rb-muted">{t("Manage listings, rooms and day-to-day service.")}</p></div><Link className="btn btn-primary" to="/owner/new">{t("Add a restaurant")}</Link></div>
    {state.status === "loading" && <Skeleton lines={4} label={t("Loading your restaurants")} />}
    {signIn && <EmptyState title={t("Sign in to manage your restaurants")}><p><Link to="/owner/sign-in">{t("Sign in")}</Link> {t("or")} <Link to="/owner/sign-up">{t("create an owner account")}</Link>.</p></EmptyState>}
    {state.status === "error" && !signIn && <ErrorState title={t("We could not load your restaurants")} message={state.error instanceof Error ? state.error.message : t("Please try again.")} onRetry={() => reload()} />}
    {state.status === "ready" && state.data.length === 0 && <EmptyState title={t("You have no restaurants yet")}><p>{t("Add your first one: it takes about 10 minutes.")}</p></EmptyState>}
    {state.status === "ready" && <div className="owner-cards">{state.data.map(card => <RestaurantCard key={card.public_id} card={card} />)}</div>}
  </OwnerShell>;
}

function RestaurantCard({ card }: { card: OwnerCard }) {
  const { t } = useT();
  const base = `/owner/${encodeURIComponent(card.public_id)}`;
  const published = card.status === "published";
  const publicPage = card.slug ? `/restaurants/${encodeURIComponent(card.slug)}` : `/r/${encodeURIComponent(card.public_id)}`;
  const complete = card.setup.done >= card.setup.total;
  const next = nextStep(card);
  return <article className="owner-card ow-venue-card">
    {card.cover_url ? <PhotoPreview className="owner-cover" url={card.cover_url} alt="" /> : <div className="owner-cover owner-cover-empty" aria-hidden="true" />}
    <div className="owner-card-body">
      <div className="ow-card-top"><Badge tone={published ? "success" : "warning"}>{published ? t("Published") : t("Draft")}</Badge></div>
      <h2>{card.name}</h2>
      {/* What is next for a draft, or that the restaurant is live: one line, not a progress bar. */}
      <p className="rb-muted">{published ? t("Live on SeatPlan") : next ? t("Next: {step}", { step: next.label }) : t("Ready to publish")}</p>
      {!complete && !published && <progress value={card.setup.done} max={card.setup.total} aria-label={t("{name} setup progress", { name: card.name })} />}
      {/* One main action for the state the restaurant is in; everything else is a labelled second step. */}
      <div className="owner-card-main">
        {published
          ? <Link className="btn btn-primary" to={`${base}/dashboard`}>{t("Open service floor")} <span aria-hidden="true">→</span><span className="visually-hidden"> {t("for {name}", { name: card.name })}</span></Link>
          : <Link className="btn btn-primary" to={next ? `${base}/${next.path}` : `${base}/review`}>{t("Continue setup")} <span aria-hidden="true">→</span><span className="visually-hidden"> {t("for {name}", { name: card.name })}</span></Link>}
      </div>
      <nav className="owner-card-links ow-card-links" aria-label={t("Manage {name}", { name: card.name })}>
        <Link to={`${base}/profile`}>{t("Edit restaurant")}<span className="visually-hidden"> {card.name}</span></Link>
        {published && <Link to={publicPage}>{t("View public page")}<span className="visually-hidden"> {t("of {name}", { name: card.name })}</span></Link>}
        <Link to={`${base}/review`}>{published ? t("Publishing") : t("Review and publish")}<span className="visually-hidden"> {t("for {name}", { name: card.name })}</span></Link>
        {!published && <Link to={`${base}/dashboard`}>{t("Dashboard")}<span className="visually-hidden"> {t("of {name}", { name: card.name })}</span></Link>}
      </nav>
    </div>
  </article>;
}
