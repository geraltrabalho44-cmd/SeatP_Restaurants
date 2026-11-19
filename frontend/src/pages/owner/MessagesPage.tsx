// The owner's "Guest messages" page: which phone channels to use, what to send, and a monthly limit.
// Diners choose phone messages themselves while booking; nobody gets one without saying yes. While no
// real provider is connected, messages are only written to the log and the page says so.
import { useState } from "react";
import { useParams } from "react-router-dom";
import { getMessagesView, saveMessageSettings } from "../../api/messages";
import type { MessageSettings, MessagesView, SentMessage } from "../../api/messages";
import { Button, Checkbox, ErrorState, Field, Skeleton, useToast } from "../../design/components";
import type { Message } from "../../i18n/catalogue";
import { useT } from "../../i18n/I18nProvider";
import { activeTag } from "../../i18n/locale";
import { errorMessage } from "../restaurant/format";
import { formatEuros } from "../restaurant/money";
import { useLoad } from "../restaurant/useLoad";
import { OwnerShell } from "./OwnerShell";
import "./owner.css";

const KIND_NAME: Record<string, Message> = {
  booking_confirmed: "Booking confirmation",
  reminder_24h: "Reminder, 24 hours",
  reminder_3h: "Reminder, 3 hours",
  booking_cancelled: "Cancellation",
};

const STATUS_NAME: Record<SentMessage["status"], Message> = { queued: "Waiting", sending: "Sending", sent: "Sent", skipped: "Skipped", failed: "Failed" };

/** The monthly limit as typed, or null when it is not a whole number from 0 to 5000. */
export function parseCap(text: string): number | null {
  if (!/^\d{1,4}$/.test(text.trim())) return null;
  const value = Number(text.trim());
  return value >= 0 && value <= 5000 ? value : null;
}

export default function MessagesPage() {
  const { t } = useT();
  const { venueId = "" } = useParams();
  const { state, reload, setData } = useLoad(() => getMessagesView(venueId), venueId);
  return (
    <OwnerShell title={t("Guest messages")} venueId={venueId} current="messages">
      <div className="ow-page-head">
        <div>
          <h1 className="ow-title">{t("Guest messages")}</h1>
          <p className="rb-muted">{t("Send confirmations and reminders by WhatsApp or SMS. Diners choose it when they book; nobody gets a message without saying yes.")}</p>
        </div>
      </div>
      {state.status === "loading" && <Skeleton label={t("Loading your message settings")} lines={4} />}
      {state.status === "error" && <ErrorState message={t("Could not open your message settings. Check your sign-in or retry.")} onRetry={() => reload()} />}
      {state.status === "ready" && <MessagesForm key={venueId} venueId={venueId} view={state.data} onSaved={setData} />}
    </OwnerShell>
  );
}

function MessagesForm({ venueId, view, onSaved }: { venueId: string; view: MessagesView; onSaved: (view: MessagesView) => void }) {
  const { t } = useT();
  const toast = useToast();
  const [draft, setDraft] = useState<MessageSettings>(view.settings);
  const [cap, setCap] = useState(String(view.settings.monthly_cap));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const capValue = parseCap(cap);
  const set = (patch: Partial<MessageSettings>): void => setDraft({ ...draft, ...patch });
  const demo = view.sms_provider === "demo" && view.whatsapp_provider === "demo";
  const save = async (): Promise<void> => {
    if (capValue === null) {
      setProblem(t("The monthly limit is a whole number from 0 to 5000."));
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const saved = await saveMessageSettings(venueId, { ...draft, monthly_cap: capValue });
      onSaved(saved);
      toast.show(t("Saved. Changes apply to messages not sent yet."), "success");
    } catch (error) {
      setProblem(errorMessage(error, t("We could not save the settings. Please try again.")));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {demo && (
        <p className="rb-notice" role="status">
          <strong>{t("Demo mode.")}</strong> {t("Messages are written to the log, never sent. When a provider is connected, this page stays the same.")}
        </p>
      )}
      <section className="owner-card" aria-label={t("Channels")}>
        <div className="owner-card-body">
          <h2 className="ow-subtitle">{t("Channels")}</h2>
          <Checkbox label="WhatsApp" hint={t("About €0.02 per message. Diners tap a link to confirm or cancel.")} checked={draft.whatsapp_enabled} onChange={(event) => set({ whatsapp_enabled: event.target.checked })} />
          <Checkbox label="SMS" hint={t("About €0.05 per message, sent from “SeatPlan”. Diners confirm or cancel with a link.")} checked={draft.sms_enabled} onChange={(event) => set({ sms_enabled: event.target.checked })} />
          <h2 className="ow-subtitle">{t("What to send")}</h2>
          <Checkbox label={t("Booking confirmation")} hint={t("Email already confirms every booking, so this is off unless you want it.")} checked={draft.send_confirmation} onChange={(event) => set({ send_confirmation: event.target.checked })} />
          <Checkbox label={t("Reminder 24 hours before")} checked={draft.reminder_24h} onChange={(event) => set({ reminder_24h: event.target.checked })} />
          <Checkbox label={t("Reminder 3 hours before")} hint={t("Not sent to diners who already said they are coming.")} checked={draft.reminder_3h} onChange={(event) => set({ reminder_3h: event.target.checked })} />
          <h2 className="ow-subtitle">{t("Monthly limit")}</h2>
          <Field label={t("Stop sending after this many messages a month")} hint={t("When the limit is reached, diners still get every email.")} inputMode="numeric" value={cap} error={capValue === null ? t("Enter a whole number from 0 to 5000.") : null} onChange={(event) => setCap(event.target.value)} />
          <p className="rb-muted" data-testid="usage">
            {t("This month: {used} messages · about {cost} · limit {limit}. This is an estimate from list prices; your provider's invoice is the real cost.", { used: view.usage.used, cost: formatEuros(view.usage.estimated_cents), limit: capValue ?? view.settings.monthly_cap })}
          </p>
          {problem && (
            <p className="rb-notice rb-notice-error" role="alert">
              {problem}
            </p>
          )}
          <div className="rb-actions">
            <Button busy={busy} onClick={() => void save()}>
              {t("Save changes")}
            </Button>
          </div>
        </div>
      </section>
      <section className="owner-card" aria-label={t("Recent messages")}>
        <div className="owner-card-body">
          <h2 className="ow-subtitle">{t("Recent messages")}</h2>
          {view.recent.length === 0 ? (
            <p>{t("No messages yet. They appear here once a diner who chose phone reminders has a booking.")}</p>
          ) : (
            <table className="ow-table">
              <thead>
                <tr>
                  <th scope="col">{t("Time")}</th>
                  <th scope="col">{t("To")}</th>
                  <th scope="col">{t("Message")}</th>
                  <th scope="col">{t("Channel")}</th>
                  <th scope="col">{t("Status")}</th>
                </tr>
              </thead>
              <tbody>
                {view.recent.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.at).toLocaleString(activeTag(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                    <td>{row.to}</td>
                    <td>{KIND_NAME[row.kind] ? t(KIND_NAME[row.kind]) : row.kind}</td>
                    <td>{row.channel === "sms" ? "SMS" : "WhatsApp"}</td>
                    <td>
                      {t(STATUS_NAME[row.status])}
                      {row.note ? ` (${row.note.replace(/^Skipped: /, "")})` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
