// "Add to Google Calendar": opens Google Calendar with the booking already filled in (day, time, restaurant, address and the
// link to manage it); the diner only has to press Save, in whichever of their calendars they choose there. For other
// calendars (Apple, Outlook) there is also the booking as a .ics file from the server, with the manage token as its only key.
import type { BookingView } from "../../api/restaurant";
import { useT } from "../../i18n/I18nProvider";

const compact = (iso: string, clock: string): string => `${iso.replaceAll("-", "")}T${clock.replace(":", "")}00`;

/** The Google Calendar address for a booking. Times are the restaurant's own, so the event lands at the right hour anywhere. */
export function googleCalendarUrl(booking: Pick<BookingView, "venue_name" | "date" | "time" | "end_time" | "party_size" | "table_labels">, manageLink: string, address = "", timezone = "Europe/Lisbon"): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: booking.venue_name,
    dates: `${compact(booking.date, booking.time)}/${compact(booking.date, booking.end_time)}`,
    ctz: timezone,
    details: `${booking.table_labels.length ? `Table ${booking.table_labels.join(", ")} · ` : ""}${booking.party_size} ${booking.party_size === 1 ? "guest" : "guests"}\n${manageLink}`,
  });
  if (address) params.set("location", address);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function AddToCalendar({ booking, address = "", timezone, manageLink }: { booking: BookingView; address?: string; timezone?: string; manageLink: string }) {
  const { t } = useT();
  return (
    <a className="btn btn-secondary" href={googleCalendarUrl(booking, manageLink, address, timezone)} target="_blank" rel="noopener noreferrer">
      {t("Add to Google Calendar")}
      <span className="visually-hidden"> {t("(opens in a new tab)")}</span>
    </a>
  );
}
