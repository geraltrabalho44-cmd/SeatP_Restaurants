// The emails of a booking, shown on its own pages while the site sends no email. The confirmation page used to say
// "check your spam folder" even though nothing was sent; now it says so and shows the message instead.
import { useEffect, useState } from "react";
import { getBookingEmails } from "../../api/restaurant";
import type { BookingEmail } from "../../api/restaurant";
import { useT } from "../../i18n/I18nProvider";

/** The emails of this booking when the site is not sending any, else null (nothing to show, or not loaded yet). */
export function useBookingEmails(token: string): BookingEmail[] | null {
  const [emails, setEmails] = useState<BookingEmail[] | null>(null);
  useEffect(() => {
    let live = true;
    getBookingEmails(token)
      .then((answer) => {
        if (live) setEmails(answer.available && answer.emails.length > 0 ? answer.emails : null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [token]);
  return emails;
}

export function EmailPreview({ emails, address }: { emails: BookingEmail[]; address: string }) {
  const { t } = useT();
  return (
    <div className="rb5-email-preview">
      <p className="rb-muted">{t("This site does not send emails yet. This is the confirmation we would send to {email}.", { email: address })}</p>
      {emails.map((email) => (
        <details key={`${email.kind}:${email.subject}`} className="rb5-email" open={email.kind === "booking_confirmed"}>
          <summary>{email.subject}</summary>
          <dl className="rb5-email-head">
            <div>
              <dt>{t("Sent to")}</dt>
              <dd>{email.to}</dd>
            </div>
            <div>
              <dt>{t("Subject")}</dt>
              <dd>{email.subject}</dd>
            </div>
          </dl>
          <pre className="rb5-email-body">{email.text}</pre>
        </details>
      ))}
    </div>
  );
}
