// Route /m/:token: the page a reminder (SMS or WhatsApp) links to. It shows the least that is needed
// to recognise the booking (restaurant, day, time, party, table) and three things to do: say "I'm
// coming", cancel, or stop the messages. No name, email or notes are ever shown here, because a
// phone can be shared and a link can be forwarded.
import { useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { cancelByLink, confirmComing, getLinkView, stopMessages } from "../../api/messages";
import type { LinkView } from "../../api/messages";
import { Badge, Button, EmptyState, ErrorState, PageShell, Skeleton } from "../../design/components";
import { useT } from "../../i18n/I18nProvider";
import { errorMessage, formatDate, guests, tableName } from "../restaurant/format";
import { useLoad } from "../restaurant/useLoad";
import "../restaurant/restaurant.css";
import "../restaurant/booking-v5.css";

export default function MessageActionPage() {
  const { t } = useT();
  const { token = "" } = useParams();
  const { state, reload, setData } = useLoad(() => getLinkView(token), token);
  return (
    <PageShell title={t("Your booking")}>
      <div className="rb-page">
        {state.status === "loading" && <Skeleton lines={4} label={t("Loading your booking")} />}
        {state.status === "error" &&
          (state.error instanceof ApiError && state.error.code === "not_found" ? (
            <EmptyState headingLevel={1} title={t("This link no longer works")}>
              <p>{t("The booking may have finished, or the link was mistyped. To change a booking, use the link in your confirmation email or call the restaurant.")}</p>
            </EmptyState>
          ) : (
            <ErrorState title={t("We could not load your booking")} message={errorMessage(state.error)} onRetry={() => reload()} />
          ))}
        {state.status === "ready" && <LinkCard token={token} view={state.data} onChange={setData} />}
      </div>
    </PageShell>
  );
}

function LinkCard({ token, view, onChange }: { token: string; view: LinkView; onChange: (view: LinkView) => void }) {
  const { t } = useT();
  const [busy, setBusy] = useState<"confirm" | "cancel" | "stop" | null>(null);
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const run = async (what: "confirm" | "cancel" | "stop"): Promise<void> => {
    setBusy(what);
    setProblem(null);
    try {
      const call = { confirm: confirmComing, cancel: cancelByLink, stop: stopMessages }[what];
      onChange(await call(token));
      setAsking(false);
    } catch (error) {
      setProblem(errorMessage(error, t("We could not do that. Please try again.")));
    } finally {
      setBusy(null);
    }
  };
  const when = `${formatDate(view.date)} · ${view.time} · ${guests(view.party)}${view.table ? ` · ${tableName(view.table)}` : ""}`;
  const cancelled = view.status === "cancelled";
  const open = view.status === "confirmed" && !view.started;
  return (
    <section className="rb-card rb5-confirm" aria-label={t("Your booking")}>
      <h1 className="rb-title">{cancelled ? t("Booking cancelled") : t("Are you still coming?")}</h1>
      <p>
        <strong>{view.venue_name}</strong>
      </p>
      <p className="rb-muted">{when}</p>
      {view.address && <p className="rb-muted">{view.address}</p>}
      {view.confirmed_at && open && (
        <p role="status">
          <Badge tone="success">{t("Confirmed")}</Badge> {t("Thanks. {venue} is expecting you at {time}.", { venue: view.venue_name, time: view.time })}
        </p>
      )}
      {cancelled && (
        <p role="status">
          {t("Your booking is cancelled. Thanks for letting {venue} know.", { venue: view.venue_name })}{" "}
          <a href={`/r/${encodeURIComponent(view.venue_public_id)}`}>{t("Book another time")}</a>
        </p>
      )}
      {view.status === "stopped" && <p role="status">{t("We won't send more messages about this booking, and we've deleted your number from it.")}</p>}
      {!cancelled && !open && view.status !== "stopped" && (
        <p role="status">
          {view.venue_phone
            ? t("Your booking has started or is over. To make a change, please call {venue} on {phone}.", { venue: view.venue_name, phone: view.venue_phone })
            : t("Your booking has started or is over. To make a change, please call {venue}.", { venue: view.venue_name })}
        </p>
      )}
      {open && !asking && (
        <div className="rb-actions">
          {!view.confirmed_at && (
            <Button busy={busy === "confirm"} disabled={busy !== null} onClick={() => void run("confirm")}>
              {t("Yes, I'm coming")}
            </Button>
          )}
          <Button variant="secondary" disabled={busy !== null} onClick={() => setAsking(true)}>
            {t("I can't come, cancel")}
          </Button>
        </div>
      )}
      {open && asking && (
        <div className="rb-notice rb-notice-warning" role="alertdialog" aria-label={t("Cancel this booking?")}>
          <p>
            <strong>{t("Cancel this booking?")}</strong>{" "}
            {view.table
              ? t("{table} is released straight away and offered to the next person waiting. You would need to book again.", { table: tableName(view.table) })
              : t("Your table is released straight away and offered to the next person waiting. You would need to book again.")}
          </p>
          <div className="rb-actions">
            <Button autoFocus disabled={busy !== null} onClick={() => setAsking(false)}>
              {t("Keep booking")}
            </Button>
            <Button variant="secondary" busy={busy === "cancel"} disabled={busy !== null} onClick={() => void run("cancel")}>
              {t("Cancel booking")}
            </Button>
          </div>
        </div>
      )}
      {open && <p className="rb-muted">{t("Want to change the time or party size? Use the link in your confirmation email.")}</p>}
      {problem && (
        <p className="rb-notice rb-notice-error" role="alert">
          {problem}
        </p>
      )}
      {view.status !== "stopped" && view.phone !== "•••" && (
        <p>
          <Button variant="ghost" busy={busy === "stop"} disabled={busy !== null} onClick={() => void run("stop")}>
            {t("Stop messages for this booking")}
          </Button>
        </p>
      )}
    </section>
  );
}
