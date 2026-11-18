// Route /u/:token: where the link in every offer lands. One tap stops offers from that restaurant,
// and one tap brings them back if it was a mistake. Nothing is asked and nothing is hidden.
import { useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { getSubscription, resumeOffers, stopOffers } from "../../api/legal";
import type { Subscription } from "../../api/legal";
import { Button, EmptyState, ErrorState, PageShell, Skeleton } from "../../design/components";
import { errorMessage } from "../restaurant/format";
import { useLoad } from "../restaurant/useLoad";
import "../restaurant/restaurant.css";
import "../restaurant/booking-v5.css";

export default function UnsubscribePage() {
  const { token = "" } = useParams();
  const { state, reload, setData } = useLoad(() => getSubscription(token), token);
  return (
    <PageShell title="Offers">
      <div className="rb-page">
        {state.status === "loading" && <Skeleton lines={3} label="Loading" />}
        {state.status === "error" &&
          (state.error instanceof ApiError && state.error.code === "not_found" ? (
            <EmptyState title="This link no longer works">
              <p>It may be old or mistyped. To change what a restaurant sends you, use the link on your booking page.</p>
            </EmptyState>
          ) : (
            <ErrorState title="We could not load this page" message={errorMessage(state.error)} onRetry={() => reload()} />
          ))}
        {state.status === "ready" && <Choice token={token} subscription={state.data} onChange={setData} />}
      </div>
    </PageShell>
  );
}

function Choice({ token, subscription, onChange }: { token: string; subscription: Subscription; onChange: (value: Subscription) => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const run = async (): Promise<void> => {
    setBusy(true);
    setProblem(null);
    try {
      onChange(await (subscription.subscribed ? stopOffers(token) : resumeOffers(token)));
    } catch (failure) {
      setProblem(errorMessage(failure, "We could not save your choice. Please try again."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rb-card rb5-confirm" aria-label="Offers">
      <h1 className="rb-title">{subscription.subscribed ? `Offers from ${subscription.venue_name}` : "You will not get offers"}</h1>
      <p role="status">
        {subscription.subscribed
          ? `${subscription.email} gets offers and news from ${subscription.venue_name}.`
          : `${subscription.venue_name} will not send offers to ${subscription.email}. Your bookings and their reminders are not affected.`}
      </p>
      {problem && (
        <p className="rb-notice rb-notice-error" role="alert">
          {problem}
        </p>
      )}
      <div className="rb-actions">
        <Button busy={busy} variant={subscription.subscribed ? "primary" : "secondary"} onClick={() => void run()}>
          {subscription.subscribed ? "Stop offers from this restaurant" : "I stopped by mistake: send me offers again"}
        </Button>
      </div>
    </section>
  );
}
