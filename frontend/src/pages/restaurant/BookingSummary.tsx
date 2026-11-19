// The facts of one booking as a definition list. Used on the confirmation
// page and on the manage page, so both always say the same thing.
import type { BookingStatus, BookingView } from "../../api/restaurant";
import { Badge } from "../../design/components";
import type { BadgeTone } from "../../design/components";
import { useT } from "../../i18n/I18nProvider";
import { tr } from "../../i18n/locale";
import { formatDate, guests, people, tablesText } from "./format";
import { prefWords } from "./prefs";

const STATUS_TEXT: Record<BookingStatus, { label: string; tone: BadgeTone }> = {
  pending: { get label() { return tr("Waiting for deposit"); }, tone: "warning" },
  confirmed: { get label() { return tr("Confirmed"); }, tone: "success" },
  seated: { get label() { return tr("Seated"); }, tone: "info" },
  finishing: { get label() { return tr("Finishing"); }, tone: "info" },
  completed: { get label() { return tr("Completed"); }, tone: "neutral" },
  cancelled: { get label() { return tr("Cancelled"); }, tone: "danger" },
  no_show: { get label() { return tr("Marked as no-show"); }, tone: "danger" },
};

/** A cancelled booking has no table; "No table yet" would suggest one is still coming. */
function tableText(booking: BookingView): string {
  if (booking.status === "cancelled") return tr("None, the booking is cancelled");
  return tablesText(booking.table_labels);
}

/** "Seat 2, facing the window": the sentence is only there on the diner's own pages. */
function seatText(seat: { label: string; phrase?: string | null }): string {
  return seat.phrase ? tr("Seat {label}, {phrase}", { label: seat.label, phrase: `${seat.phrase.charAt(0).toLowerCase()}${seat.phrase.slice(1)}` }) : tr("Seat {label}", { label: seat.label });
}

function needsText(booking: BookingView): string {
  const needs: string[] = [];
  if (booking.needs_accessible) needs.push(tr("Accessible table"));
  if (booking.high_chairs > 0) needs.push(booking.high_chairs === 1 ? tr("1 high chair") : tr("{count} high chairs", { count: booking.high_chairs }));
  return needs.length > 0 ? needs.join(", ") : "";
}

/** What matters at the door, one fact per row: used beside the restaurant card on the confirmation and the manage page. */
export function BookingRows({ booking }: { booking: BookingView }) {
  const { t } = useT();
  const wishes = prefWords(booking.prefs);
  const needs = needsText(booking);
  return (
    <dl className="rb5-rows">
      <div>
        <dt>{t("Date")}</dt>
        <dd>{formatDate(booking.date)}</dd>
      </div>
      <div>
        <dt>{t("Arrival")}</dt>
        <dd className="tabular">
          {booking.time} · {guests(booking.party_size)}
        </dd>
      </div>
      <div>
        <dt>{t("Table")}</dt>
        <dd>{tableText(booking)}</dd>
      </div>
      {booking.occasion && <div><dt>{t("Occasion")}</dt><dd>{booking.occasion}</dd></div>}
      {booking.dietary_requirements && <div><dt>{t("Dietary preferences")}</dt><dd>{booking.dietary_requirements}</dd></div>}
      {booking.allergies && <div><dt>{t("Food allergies")}</dt><dd>{booking.allergies}</dd></div>}
      {booking.arrival_time && <div><dt>{t("Expected arrival")}</dt><dd>{booking.arrival_time}</dd></div>}
      {booking.seat && (
        <div>
          <dt>{t("Chair request")}</dt>
          <dd>{seatText(booking.seat)}</dd>
        </div>
      )}
      {needs !== "" && (
        <div>
          <dt>{t("Needs")}</dt>
          <dd>{needs}</dd>
        </div>
      )}
      {wishes && (
        <div>
          <dt>{t("Your wishes")}</dt>
          <dd>{wishes}</dd>
        </div>
      )}
      {booking.notes && (
        <div>
          <dt>{t("Notes")}</dt>
          <dd>{booking.notes}</dd>
        </div>
      )}
    </dl>
  );
}

/** `hideStatus` leaves the status row out where the page already says it in a heading ("Booking confirmed"). */
export function BookingSummary({ booking, hideStatus = false }: { booking: BookingView; hideStatus?: boolean }) {
  const { t } = useT();
  const status = STATUS_TEXT[booking.status];
  return (
    <dl className="rb-summary">
      {!hideStatus && (
        <div>
          <dt>{t("Status")}</dt>
          <dd>
            <Badge tone={status.tone}>{status.label}</Badge>
          </dd>
        </div>
      )}
      <div>
        <dt>{t("Restaurant")}</dt>
        <dd>{booking.venue_name}</dd>
      </div>
      <div>
        <dt>{t("When")}</dt>
        <dd>
          {formatDate(booking.date)}, {t("{from} to {to}", { from: booking.time, to: booking.end_time })}
        </dd>
      </div>
      <div>
        <dt>{t("Party")}</dt>
        <dd>{people(booking.party_size)}</dd>
      </div>
      <div>
        <dt>{t("Table")}</dt>
        <dd>{tableText(booking)}</dd>
      </div>
      {booking.seat && (
        <div>
          <dt>{t("Chair requested")}</dt>
          <dd>{seatText(booking.seat)}</dd>
        </div>
      )}
      <div>
        <dt>{t("Name")}</dt>
        <dd>{booking.name}</dd>
      </div>
      <div>
        <dt>{t("Needs")}</dt>
        <dd>{needsText(booking) || t("None")}</dd>
      </div>
      {prefWords(booking.prefs) && (
        <div>
          <dt>{t("Your wishes")}</dt>
          <dd>{prefWords(booking.prefs)}</dd>
        </div>
      )}
      {booking.notes && (
        <div>
          <dt>{t("Notes")}</dt>
          <dd>{booking.notes}</dd>
        </div>
      )}
    </dl>
  );
}
