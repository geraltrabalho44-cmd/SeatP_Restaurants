// The day in numbers: covers booked and really seated, utilisation by
// service, no-show rate, and the overbooking suggestion. The suggestion is
// labelled as one: SeatPlan never overbooks by itself; a person decides.
import { getDashboard } from "../../api/restaurant";
import type { Dashboard, ServiceStats } from "../../api/restaurant";
import { Badge, Button, EmptyState, ErrorState, Skeleton } from "../../design/components";
import { useT } from "../../i18n/I18nProvider";
import { errorMessage, formatDate, needsSignIn, percent } from "./format";
import { SignInPrompt } from "./SignInPrompt";
import { useLoad } from "./useLoad";

export function StaffDashboard({ venueId, date, onOpenSchedule }: { venueId: string; date: string; onOpenSchedule?: () => void }) {
  const { t } = useT();
  const { state, reload } = useLoad(() => getDashboard(venueId, date), date);
  if (state.status === "loading") return <Skeleton lines={6} label={t("Loading the numbers")} />;
  if (state.status === "error") {
    if (needsSignIn(state.error)) return <SignInPrompt venueId={venueId} />;
    return <ErrorState title={t("We could not load the numbers")} message={errorMessage(state.error)} onRetry={() => reload()} />;
  }
  return <DashboardView data={state.data} onOpenSchedule={onOpenSchedule} />;
}

function DashboardView({ data, onOpenSchedule }: { data: Dashboard; onOpenSchedule?: () => void }) {
  const { t } = useT();
  return (
    <div className="st-dashboard">
      <h2 className="rb-service-title">{t("On this date")} · {formatDate(data.date)}</h2>
      <ul className="st-stats">
        <Stat label={t("Covers booked")} value={String(data.covers_booked)} />
        {/* Guests who really sat down (seated, finishing or completed), next to the promise above. */}
        <Stat label={t("Covers seated")} value={String(data.covers_seated)} />
        <Stat label={t("Covers cancelled")} value={String(data.covers_cancelled)} />
        <Stat label={t("Historical no-show rate")} value={data.no_show_sample > 0 ? percent(data.no_show_rate) : t("No data")} note={t("From the last {n} bookings", { n: data.no_show_sample })} />
      </ul>
      <section className="rb-card">
        <h3 className="rb-service-title">{t("Utilisation by service")}</h3>
        <p className="rb-muted st-small">{t("Share of seat time in use. Above about 85% the room feels full.")}</p>
        <ul className="st-bars">
          {data.services.map((service) => (
            <UtilisationBar key={service.name} service={service} />
          ))}
        </ul>
        {data.services.length === 0 && <EmptyState title={t("No service data for this date")}><p>{t("Choose another day to see service utilisation.")}</p></EmptyState>}
      </section>
      <OverbookingCard data={data} onOpenSchedule={onOpenSchedule} />
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <li className="st-stat">
      <span className="st-stat-value tabular">{value}</span>
      <span className="st-stat-label">{label}</span>
      {note && <span className="rb-muted st-small">{note}</span>}
    </li>
  );
}

function UtilisationBar({ service }: { service: ServiceStats }) {
  const { t } = useT();
  const value = Math.round(Math.min(Math.max(service.utilisation, 0), 1) * 100);
  return (
    <li className="st-bar">
      <span className="st-bar-name">{service.name}</span>
      {/* A native meter: screen readers read the value; the text next to it says it for everyone. */}
      <meter className="st-bar-meter" min={0} max={100} low={50} high={85} optimum={70} value={value} aria-label={t("{name} utilisation", { name: service.name })} />
      <span className="tabular">
        {t("{value}%, {covers} covers, {seated} seated", { value, covers: service.covers, seated: service.covers_seated })}
      </span>
    </li>
  );
}

function OverbookingCard({ data, onOpenSchedule }: { data: Dashboard; onOpenSchedule?: () => void }) {
  const { t } = useT();
  const suggestion = data.overbooking;
  return (
    <section className="rb-card st-suggestion">
      <h3 className="rb-service-title">
        {t("Overbooking")} <Badge tone="warning">{t("Suggestion only")}</Badge>
      </h3>
      {suggestion && suggestion.extra_covers > 0 ? (
        <>
          <p className="st-answer-best">
            {t("You could accept about")} <strong>{t("{n} extra covers", { n: suggestion.extra_covers })}</strong> {t("for this day.")}
          </p>
        </>
      ) : (
        <p>{suggestion?.explanation ?? t("Not enough history yet to suggest overbooking. Keep every table bookable as normal.")}</p>
      )}
      {suggestion && <details><summary>{t("How this suggestion is calculated")}</summary><p>{suggestion.explanation}</p><p>{t("Historical sample: {n} bookings. This is an estimate, not today's observed occupancy.", { n: data.no_show_sample })}</p></details>}
      <p className="rb-muted st-small">{t("SeatPlan never overbooks by itself. If you follow this, raise the covers per slot in the Schedule tab.")}</p>
      {onOpenSchedule && <Button variant="secondary" onClick={onOpenSchedule}>{t("Review weekly schedule")}</Button>}
    </section>
  );
}
