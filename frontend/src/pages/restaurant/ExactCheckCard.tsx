// "Exact check": how good is the quick planner? On the first few bookings of
// a service (the exact search grows very fast with every extra party) the
// server runs both the quick planner and an exact search that proves the
// best possible plan, and reports the gap. Nothing is changed.
import { useState } from "react";
import { runExactCheck } from "../../api/restaurant";
import type { ExactCheck, PlanScore } from "../../api/restaurant";
import { Button } from "../../design/components";
import { useT } from "../../i18n/I18nProvider";
import { tr } from "../../i18n/locale";
import { errorMessage } from "./format";

interface ExactCheckCardProps {
  venueId: string;
  date: string;
  service: string;
}

/** "18 guests seated, 4 empty chairs". */
function scoreText(score: PlanScore): string {
  return tr("{seated} guests seated, {empty} empty chairs", { seated: score.covers_seated, empty: score.wasted_seats });
}

/**
 * The gap in one plain sentence. The optimiser first seats more guests and
 * only then wastes fewer chairs, so the guests decide when they differ.
 */
export function gapSentence(check: ExactCheck): string {
  const { covers, wasted_seats: chairs, percent } = check.gap;
  if (check.matches_optimum) return tr("The quick planner found the best possible plan.");
  if (covers < 0 || (covers === 0 && chairs < 0)) {
    // Only possible when the exact search stopped at its time limit before finding the best plan.
    return tr("The quick planner did better than the exact search managed in its time limit.");
  }
  if (covers > 0) return tr("The best possible plan seats {n} more guests: the quick planner is {percent}% short.", { n: covers, percent });
  return tr("Both seat the same guests; the best possible plan leaves {n} fewer chairs empty.", { n: chairs });
}

export function ExactCheckCard({ venueId, date, service }: ExactCheckCardProps) {
  const { t } = useT();
  const [check, setCheck] = useState<ExactCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const run = async (): Promise<void> => {
    setBusy(true);
    setProblem(null);
    try {
      setCheck(await runExactCheck(venueId, date, service));
    } catch (error) {
      setProblem(errorMessage(error, t("The exact check did not finish. Please try again.")));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rb-card" aria-labelledby="st-exact-title">
      <h2 id="st-exact-title" className="rb-service-title">
        {t("Exact check")}
      </h2>
      <p className="rb-muted st-small">{t("Compares the quick planner with the proven best plan for the first bookings of {service}. Nothing changes.", { service })}</p>
      <Button variant="secondary" busy={busy} onClick={() => void run()}>
        {t("Run the exact check")}
      </Button>
      <div aria-live="polite">{check && <ExactResult check={check} />}</div>
      {problem && (
        <p className="rb-notice rb-notice-error" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}

function ExactResult({ check }: { check: ExactCheck }) {
  const { t } = useT();
  if (check.parties_considered === 0) return <p className="st-answer-best">{t("No bookings in this service yet, so there is nothing to check.")}</p>;
  const best = check.optimal.proven_optimal ? t("Proven best") : t("Best found by the exact search");
  return (
    <div className="st-answer">
      <p className="st-answer-best">{gapSentence(check)}</p>
      <ul className="st-score">
        <li>
          {t("Quick planner:")} {scoreText(check.heuristic)} ({check.heuristic.seconds} s)
        </li>
        <li>
          {best}: {scoreText(check.optimal)} ({check.optimal.seconds} s)
        </li>
      </ul>
      {!check.optimal.proven_optimal && <p className="rb-muted st-small">{t("The exact search hit its time limit, so this is the best it found, not a proof.")}</p>}
      {check.capped && (
        <p className="rb-muted st-small">
          {t("Checked the first {n} of {total} bookings: the exact search gets too slow beyond that.", { n: check.parties_considered, total: check.parties_total })}
        </p>
      )}
    </div>
  );
}
