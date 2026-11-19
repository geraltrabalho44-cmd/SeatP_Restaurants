// The Optimise tab: put the restaurant optimiser to work on one whole service.
// Two cards: re-plan the tables (preview who would move, then apply) and the
// exact check (how close the quick planner is to the proven best plan).
// Staff first pick the service; the list comes from the saved schedule.
import { useState } from "react";
import { applyServicePlan, getSchedule, previewServicePlan } from "../../api/restaurant";
import type { Schedule, ServicePlan } from "../../api/restaurant";
import { Button, Dialog, EmptyState, ErrorState, Select, Skeleton } from "../../design/components";
import { useT } from "../../i18n/I18nProvider";
import { ExactCheckCard } from "./ExactCheckCard";
import { errorMessage, formatDate, needsSignIn, people, tablesText } from "./format";
import { gainText } from "./ServicePlanCard";
import { SignInPrompt } from "./SignInPrompt";
import { pythonWeekday } from "./StepParty";
import { useLoad } from "./useLoad";

/** The names of the services open on this date, in schedule order, without repeats. */
export function servicesOn(schedule: Schedule, date: string): string[] {
  const weekday = pythonWeekday(date);
  const names = schedule.services.filter((s) => s.weekday === weekday).map((s) => s.name);
  return [...new Set(names)];
}

export function StaffOptimise({ venueId, date }: { venueId: string; date: string }) {
  const { t } = useT();
  const { state, reload } = useLoad(() => getSchedule(venueId), venueId);
  if (state.status === "loading") return <Skeleton lines={4} label={t("Loading the services")} />;
  if (state.status === "error") {
    if (needsSignIn(state.error)) return <SignInPrompt venueId={venueId} />;
    return <ErrorState title={t("We could not load the services")} message={errorMessage(state.error)} onRetry={() => reload()} />;
  }
  const services = servicesOn(state.data, date);
  if (services.length === 0) {
    return (
      <EmptyState title={t("No service on this day")}>
        <p>{t("The restaurant is closed on {date}, so there is nothing to optimise. Pick another day above.", { date: formatDate(date) })}</p>
      </EmptyState>
    );
  }
  return <OptimiseView venueId={venueId} date={date} services={services} />;
}

function OptimiseView({ venueId, date, services }: { venueId: string; date: string; services: string[] }) {
  const { t } = useT();
  const [chosen, setChosen] = useState(services[0] ?? "");
  // The day above may change to one without the chosen service; fall back to the first.
  const service = services.includes(chosen) ? chosen : (services[0] ?? "");
  // The key resets both cards when the day or service changes, so an old answer is never shown for another service.
  const key = `${date}|${service}`;
  return (
    <div className="st-dashboard">
      <Select label={t("Service")} options={services.map((name) => ({ value: name, label: name }))} value={service} onChange={(e) => setChosen(e.target.value)} />
      <div className="st-optimise">
        <ServiceOperations key={`plan-${key}`} venueId={venueId} date={date} service={service} />
        <details key={`exact-${key}`} className="rb-card st-exact-detail"><summary>{t("Exact check · optional analysis")}</summary><p className="rb-muted">{t("Compare the quick planner with the proven best plan. This analysis does not move bookings.")}</p><ExactCheckCard venueId={venueId} date={date} service={service} /></details>
      </div>
    </div>
  );
}

function ServiceOperations({venueId,date,service}: {venueId:string;date:string;service:string}) {
  const { t } = useT();
  const [plan,setPlan] = useState<ServicePlan | null>(null);
  const [busy,setBusy] = useState<"preview" | "apply" | null>(null);
  const [confirm,setConfirm] = useState(false);
  const [problem,setProblem] = useState("");
  const [done,setDone] = useState("");
  const preview = async (): Promise<void> => {
    if (busy) return;
    setBusy("preview");setPlan(null);setProblem("");setDone("");setConfirm(false);
    try { setPlan(await previewServicePlan(venueId,date,service)); }
    catch(error) { setProblem(errorMessage(error,t("The optimiser did not answer. Nothing was changed."))); }
    finally { setBusy(null); }
  };
  const apply = async (): Promise<void> => {
    if (!plan || busy) return;
    setBusy("apply");setProblem("");
    try {
      const result = await applyServicePlan(venueId,date,service,plan.plan_id);
      setDone(t("Done: {bookings} moved.", { bookings: result.moves.length === 1 ? t("1 booking") : t("{n} bookings", { n: result.moves.length }) }));
      setPlan(null);
    } catch(error) {
      setPlan(null);
      setProblem(errorMessage(error,t("The moves were not applied. Preview again before applying.")));
    } finally {setBusy(null);setConfirm(false);}
  };
  const count = plan?.moves.length ?? 0;
  const action = count === 1 ? t("Apply 1 move") : t("Apply {n} moves", { n: count });
  return <section className="rb-card st-operation-plan" aria-labelledby="st-operation-title">
    <h2 id="st-operation-title">{t("Optimise {service}", { service })}</h2>
    <p className="st-effective-time">{formatDate(date)} · {service}</p>
    <p className="rb-muted">{t("Preview first. Diners' own table choices, ambience wishes and seated parties are protected by the planner.")}</p>
    <Button variant={plan ? "secondary" : "primary"} disabled={busy === "apply"} busy={busy === "preview"} onClick={() => void preview()}>{t("Preview moves")}</Button>
    <div role="status" aria-live="polite">
      {busy === "preview" && <p>{t("Simulating {service} · no bookings are being changed.", { service })}</p>}
      {done && <p className="rb-notice">{done}</p>}
      {plan && <div className="st-plan-preview">
        <h3>{t("Preview · nothing changed")}</h3>
        {count === 0 ? <p>{t("Nothing to improve: every booking that may move already has the best table.")}</p> : <>
          <p>{t("With this plan:")} {gainText(plan.before,plan.after)}.</p>
          <ol className="st-plan-moves">{plan.moves.map(move => <li key={move.booking_id}>{t("{name}, {people} at {time}: from {from} to {to}", { name: move.name, people: people(move.party_size), time: move.time, from: tablesText(move.from_tables), to: tablesText(move.to_tables) })}</li>)}</ol>
          <Button disabled={busy !== null} onClick={() => setConfirm(true)}>{action}</Button>
        </>}
        <p className="rb-muted">{t("{fixed} bookings stay where they are (protected); {movable} may be considered for a move.", { fixed: plan.fixed, movable: plan.movable })}</p>
      </div>}
    </div>
    {problem && <p role="alert" className="rb-notice rb-notice-error">{problem}</p>}
    <Dialog open={confirm && plan !== null} title={t("{action} for {service}?", { action, service })} onClose={() => {if (!busy) setConfirm(false);}} actions={<>
      <Button variant="secondary" disabled={busy !== null} onClick={() => setConfirm(false)}>{t("Keep current tables")}</Button>
      <Button busy={busy === "apply"} onClick={() => void apply()}>{count === 1 ? t("Confirm 1 move") : t("Confirm {n} moves", { n: count })}</Button>
    </>}><p>{formatDate(date)} · {service}. {t("Apply exactly the preview shown. If the floor changed, the server will refuse it and you must preview again.")}</p></Dialog>
  </section>;
}
