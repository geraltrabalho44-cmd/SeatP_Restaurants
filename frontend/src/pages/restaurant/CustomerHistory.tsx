import { useState } from "react";
import { getCustomerHistory } from "../../api/restaurant";
import { Button, ErrorState, Skeleton } from "../../design/components";
import { useT } from "../../i18n/I18nProvider";
import { errorMessage, formatDate, people } from "./format";
import { useLoad } from "./useLoad";

export function CustomerHistory({ venueId, bookingId }: { venueId: string; bookingId: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  return <section>
    <Button variant="secondary" aria-expanded={open} onClick={() => setOpen(!open)}>{t("Customer history")}</Button>
    {open && <History key={`${venueId}:${bookingId}`} venueId={venueId} bookingId={bookingId} />}
  </section>;
}

function History({ venueId, bookingId }: { venueId: string; bookingId: string }) {
  const { t } = useT();
  const { state, reload } = useLoad(() => getCustomerHistory(venueId, bookingId), `${venueId}:${bookingId}`);
  if (state.status === "loading") return <Skeleton lines={3} label={t("Loading customer history")} />;
  if (state.status === "error") return <ErrorState title={t("Could not load customer history")} message={errorMessage(state.error)} onRetry={reload} />;
  return <div>
    <h4>{state.data.returning_customer ? t("Returning customer") : t("First recorded visit")}</h4>
    <p>{t("{n} completed visits before this booking", { n: state.data.completed_visits })}</p>
    <p className="rb-muted">{t("Previous bookings using the same email at this restaurant. Showing the latest ten completed visits.")}</p>
    <ul>{state.data.visits.map((visit, index) => <li key={`${visit.date}:${visit.time}:${index}`}>
      <strong>{formatDate(visit.date)}</strong> · {visit.time} · {people(visit.party_size)}
      {visit.occasion && <p>{t("Occasion:")} {visit.occasion}</p>}
      {visit.notes && <p>{t("Previous note:")} {visit.notes}</p>}
    </li>)}</ul>
  </div>;
}
