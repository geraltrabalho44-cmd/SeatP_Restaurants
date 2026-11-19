// "Optimise tonight's tables": the optimiser re-plans the tables of one
// service. Step 1 only previews who would move; nothing changes. Step 2
// applies exactly that preview: the plan_id proves it is the same plan, and
// the server answers 409 if the floor changed in between.
// Only bookings the optimiser placed itself and that have not sat down yet
// may move; a diner's own choice, a diner's wishes (sun, view...) and a seated party always stay put.
import { useState } from "react";
import { applyServicePlan, previewServicePlan } from "../../api/restaurant";
import type { PlanScore, ServicePlan } from "../../api/restaurant";
import { Button } from "../../design/components";
import { useT } from "../../i18n/I18nProvider";
import { tr } from "../../i18n/locale";
import { errorMessage, people, tablesText, todayIso } from "./format";

interface ServicePlanCardProps {
  venueId: string;
  date: string;
  service: string;
}

/** "1 booking", "2 bookings". */
function bookings(n: number): string {
  return n === 1 ? tr("1 booking") : tr("{n} bookings", { n });
}

/** What the plan gains, e.g. "2 more guests seated and 2 empty chairs fewer". */
export function gainText(before: PlanScore, after: PlanScore): string {
  const parts: string[] = [];
  const guests = after.covers_seated - before.covers_seated;
  const chairs = before.wasted_seats - after.wasted_seats;
  if (guests > 0) parts.push(guests === 1 ? tr("1 more guest seated") : tr("{n} more guests seated", { n: guests }));
  if (chairs > 0) parts.push(chairs === 1 ? tr("1 empty chair fewer") : tr("{n} empty chairs fewer", { n: chairs }));
  return parts.length > 0 ? parts.join(` ${tr("and")} `) : tr("no change in guests seated or empty chairs");
}

export function ServicePlanCard({ venueId, date, service }: ServicePlanCardProps) {
  const { t } = useT();
  const [plan, setPlan] = useState<ServicePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const run = async (action: () => Promise<void>, fallback: string): Promise<void> => {
    setBusy(true);
    setProblem(null);
    setDone(null);
    try {
      await action();
    } catch (error) {
      // A failed apply leaves an old preview behind; staff must look again before applying.
      setPlan(null);
      setProblem(errorMessage(error, fallback));
    } finally {
      setBusy(false);
    }
  };
  const preview = (): Promise<void> =>
    run(async () => setPlan(await previewServicePlan(venueId, date, service)), t("The optimiser did not answer. Nothing was changed."));
  const apply = (planId: string): Promise<void> =>
    run(async () => {
      const applied = await applyServicePlan(venueId, date, service, planId);
      setPlan(null);
      setDone(t("Done: {bookings} moved.", { bookings: bookings(applied.moves.length) }));
    }, t("The moves were not applied. Nothing was changed."));

  const title = date === todayIso() ? t("Optimise tonight's tables") : t("Optimise the {service} tables", { service });
  return (
    <section className="rb-card" aria-labelledby="st-plan-title">
      <h2 id="st-plan-title" className="rb-service-title">
        {title}
      </h2>
      <p className="rb-muted st-small">
        {t("Finds a better table for {service} bookings that the system placed. Diners who chose their own table or asked for sun, a view or the like, and parties already seated, never move.", { service })}
      </p>
      <Button variant={plan ? "secondary" : "primary"} busy={busy && !plan} onClick={() => void preview()}>
        {t("Preview moves")}
      </Button>
      <div aria-live="polite">
        {plan && <PlanPreview plan={plan} busy={busy} onApply={() => void apply(plan.plan_id)} />}
        {done && <p className="rb-notice">{done}</p>}
      </div>
      {problem && (
        <p className="rb-notice rb-notice-error" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}

function PlanPreview({ plan, busy, onApply }: { plan: ServicePlan; busy: boolean; onApply: () => void }) {
  const { t } = useT();
  const stays = t("{bookings} stay where they are (the diner chose the table or asked for something, or the party is already seated).", { bookings: bookings(plan.fixed) });
  if (plan.moves.length === 0) {
    return (
      <div className="st-answer">
        <p className="st-answer-best">{t("Nothing to improve: every booking that may move already has the best table.")}</p>
        <p className="rb-muted st-small">{stays}</p>
      </div>
    );
  }
  return (
    <div className="st-answer">
      <p className="st-answer-best">{t("With this plan:")} {gainText(plan.before, plan.after)}.</p>
      <p>{t("These bookings would move:")}</p>
      <ul className="st-displaced">
        {plan.moves.map((move) => (
          <li key={move.booking_id}>
            {t("{name}, {people} at {time}: from {from} to {to}", { name: move.name, people: people(move.party_size), time: move.time, from: tablesText(move.from_tables), to: tablesText(move.to_tables) })}
          </li>
        ))}
      </ul>
      <p className="rb-muted st-small">{stays}</p>
      <Button busy={busy} onClick={onApply}>
        {t("Apply these moves")}
      </Button>
    </div>
  );
}
