// Route /pay/demo/:paymentId: the pretend payment page. It only exists while no real payment
// provider is connected, and it says so in plain words: nothing here moves money.
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { abandonPayment, getPayment, payDemo } from "../../api/payments";
import { Button, EmptyState, ErrorState, PageShell, Skeleton } from "../../design/components";
import { useT } from "../../i18n/I18nProvider";
import { errorMessage, formatCountdown } from "../restaurant/format";
import { useSecondsLeft } from "../restaurant/HoldCountdown";
import { formatEuros } from "../restaurant/money";
import { useLoad } from "../restaurant/useLoad";
import "../restaurant/restaurant.css";
import "../restaurant/booking-v5.css";

export default function DemoCheckoutPage() {
  const { t } = useT();
  const { paymentId = "" } = useParams();
  const { state, reload } = useLoad(() => getPayment(paymentId), paymentId);
  return (
    <PageShell title={t("Payment")}>
      <div className="rb-page">
        <h1 className="rb-title">{t("Pay your deposit")}</h1>
        {state.status === "loading" && <Skeleton lines={4} label={t("Loading your payment")} />}
        {state.status === "error" && <PaymentError error={state.error} onRetry={() => reload()} />}
        {state.status === "ready" && state.data.mode !== "demo" && (
          <EmptyState title={t("This is not a demo payment")}>
            <p>{t("Please use the payment page the restaurant sent you to.")}</p>
          </EmptyState>
        )}
        {state.status === "ready" && state.data.mode === "demo" && <DemoCard paymentId={paymentId} restaurant={state.data.restaurant} amountCents={state.data.amount_cents} expiresAt={state.data.expires_at} status={state.data.status} />}
      </div>
    </PageShell>
  );
}

function PaymentError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useT();
  if (error instanceof ApiError && error.code === "not_found") {
    return (
      <EmptyState title={t("We cannot find this payment")}>
        <p>{t("The link may be old or mistyped.")}</p>
      </EmptyState>
    );
  }
  return <ErrorState title={t("We could not load your payment")} message={errorMessage(error)} onRetry={onRetry} />;
}

interface DemoCardProps {
  paymentId: string;
  restaurant: string;
  amountCents: number;
  expiresAt: string;
  status: string;
}

function DemoCard({ paymentId, restaurant, amountCents, expiresAt, status }: DemoCardProps) {
  const { t } = useT();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"ok" | "decline" | "abandon" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);
  const secondsLeft = useSecondsLeft(expiresAt);
  const back = (): void => {
    void navigate(`/pay/return/${encodeURIComponent(paymentId)}`, { replace: true });
  };
  // Already settled (paid, expired or given up): show the outcome, not the card.
  useEffect(() => {
    if (status !== "pending") void navigate(`/pay/return/${encodeURIComponent(paymentId)}`, { replace: true });
  }, [status, paymentId, navigate]);
  if (status !== "pending") return <Skeleton lines={2} label={t("Checking your payment")} />;
  const act = async (what: "ok" | "decline" | "abandon"): Promise<void> => {
    setBusy(what);
    setProblem(null);
    try {
      if (what === "abandon") {
        await abandonPayment(paymentId);
        back();
        return;
      }
      const result = await payDemo(paymentId, what);
      if (result.declined) {
        setDeclined(true);
      } else {
        back();
      }
    } catch (error) {
      setProblem(errorMessage(error, t("We could not process the payment. Please try again.")));
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="rb-card rb-pay-card" aria-label={t("Payment")}>
      <p>
        {t("Deposit for")} <strong>{restaurant}</strong>
      </p>
      <p className="rb-big-number">{formatEuros(amountCents)}</p>
      {secondsLeft !== null && secondsLeft > 0 && (
        <p className="rb-muted">
          {t("Your table is kept for")} <strong className="tabular" role="timer">{formatCountdown(secondsLeft)}</strong> {t("while you pay.")}
        </p>
      )}
      {secondsLeft === 0 && (
        <p className="rb-notice rb-notice-warning" role="status">
          {t("The time to pay is over. Your table may already have been released.")}
        </p>
      )}
      {declined && (
        <p className="rb-notice rb-notice-error" role="alert">
          {t("The card was declined. Your table is still held; try again, or give it up below.")}
        </p>
      )}
      {problem && (
        <p className="rb-notice rb-notice-error" role="alert">
          {problem}
        </p>
      )}
      <div className="rb-actions">
        <Button busy={busy === "ok"} disabled={busy !== null && busy !== "ok"} onClick={() => void act("ok")}>
          {t("Pay {amount}", { amount: formatEuros(amountCents) })}
        </Button>
        <Button variant="secondary" busy={busy === "decline"} disabled={busy !== null && busy !== "decline"} onClick={() => void act("decline")}>
          {t("Simulate a declined card")}
        </Button>
        <Button variant="ghost" busy={busy === "abandon"} disabled={busy !== null && busy !== "abandon"} onClick={() => void act("abandon")}>
          {t("Give up and release the table")}
        </Button>
      </div>
    </section>
  );
}
