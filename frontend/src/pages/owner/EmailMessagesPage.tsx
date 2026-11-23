// The owner's "Guest messages" page: a guest gets one email when they book. Nothing to set up; the page says
// what the email holds, so the owner knows what their guests will read.
import { useParams } from "react-router-dom";
import { useT } from "../../i18n/I18nProvider";
import { OwnerShell } from "./OwnerShell";
import "./owner.css";

export default function EmailMessagesPage() {
  const { t } = useT();
  const { venueId = "" } = useParams();
  const holds = [
    t("The date, time, number of guests and the table"),
    t("The restaurant's name, address and a map link"),
    t("A button to change or cancel the booking"),
    t("A calendar invite, so the booking lands in the guest's calendar"),
  ];
  return (
    <OwnerShell title={t("Guest messages")} venueId={venueId} current="messages">
      <div className="ow-page-head">
        <div>
          <h1 className="ow-title">{t("Guest messages")}</h1>
          <p className="rb-muted">{t("Every guest gets a confirmation email as soon as they book. There is nothing to set up.")}</p>
        </div>
      </div>
      <section className="owner-card" aria-label={t("Confirmation email")}>
        <div className="owner-card-body">
          <h2 className="ow-subtitle">{t("Confirmation email")}</h2>
          <p className="rb-muted">{t("Sent to the email address the guest gave when booking. It holds:")}</p>
          <ul className="ow-list">
            {holds.map((line) => <li key={line}>{line}</li>)}
          </ul>
          <p className="rb-muted">{t("If the guest changes or cancels, they get an email about that too.")}</p>
        </div>
      </section>
    </OwnerShell>
  );
}
