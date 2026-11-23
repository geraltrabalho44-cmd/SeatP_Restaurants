// Step 5: done. The summary and the "Manage booking" button are shown here, so this page alone is enough to manage the booking.
// The first thing on it is the result, and the next action is "Manage booking". Nothing sits under the buttons.
import type { BookingConfirmation } from "../../api/restaurant";
import { AddToCalendar } from "./AddToCalendar";
import { BookingRows } from "./BookingSummary";
import { absoluteUrl } from "./CopyLink";
import { useT } from "../../i18n/I18nProvider";
import { cancelNote, depositStatus } from "./money";
import { CHANNEL_NAME } from "./PhoneOptIn";
import { StepHeading } from "./StepHeading";
import { DirectionsLink, VenueCard, usePublicVenue } from "./VenueCard";

export function Confirmation({ confirmation }: { confirmation: BookingConfirmation }) {
  const { t } = useT();
  const { booking, manage_url: manageUrl } = confirmation;
  const venue = usePublicVenue(booking.venue_public_id);
  return (
    <div className="rb5-two">
      <section className="rb-card rb5-confirm">
        <div className="rb-done-mark" aria-hidden="true">
          <svg viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="21" />
            <path d="M14 25l7 7 13-15" />
          </svg>
        </div>
        <StepHeading>{t("Booking confirmed.")}</StepHeading>
        <p className="rb-muted rb5-lede">{t("Your table at {name} is reserved.", { name: booking.venue_name })}</p>
        <BookingRows booking={booking} />
        {booking.payment && booking.payment.status === "paid" && (
          <p className="rb-muted" role="note">
            {depositStatus(booking.payment)}, {t("taken off your bill")}. {cancelNote(booking.payment)}
          </p>
        )}
        {confirmation.offer && (
          <p className="rb-muted" role="note" data-testid="offer-line">
            {t("Offer applied: {name}, {what}. The restaurant takes it off your bill.", { name: confirmation.offer.name, what: confirmation.offer.what })}
          </p>
        )}
        {confirmation.messages && (
          <p className="rb-muted" role="note" data-testid="phone-line">
            {t("Reminders by {channel} to {phone}: {planned}.", { channel: CHANNEL_NAME[confirmation.messages.channel], phone: confirmation.messages.phone, planned: confirmation.messages.planned.join(", ") })}
          </p>
        )}
        <div className="rb5-actions">
          <a className="btn btn-primary" href={absoluteUrl(manageUrl)}>
            {t("Manage booking")} <span aria-hidden="true">{"\u2192"}</span>
          </a>
          <AddToCalendar booking={booking} address={venue?.address ?? ""} manageLink={absoluteUrl(manageUrl)} />
          <DirectionsLink venue={venue} />
        </div>
      </section>
      <VenueCard booking={booking} venue={venue} />
    </div>
  );
}
