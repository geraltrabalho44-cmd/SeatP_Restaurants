// What staff see after tapping a table or an arrival: who is there, their
// needs, and the buttons that make sense right now.
import type { StaffBooking, StaffFloor, StaffTable } from "../../api/restaurant";
import { Badge, Button } from "../../design/components";
import { useT } from "../../i18n/I18nProvider";
import { BookingActions } from "./BookingActions";
import { people, tablesText } from "./format";
import { depositStatus } from "./money";
import { BOOKING_LOOK, FLOOR_LOOK } from "./staffStatus";
import { prefWords } from "./prefs";
import { CustomerHistory } from "./CustomerHistory";

interface SelectionPanelProps {
  venueId: string;
  floor: StaffFloor;
  table: StaffTable | null;
  booking: StaffBooking | null;
  onChanged: (message: string) => void;
  onProblem: (message: string) => void;
  onMove: (booking: StaffBooking) => void;
  /** Move the booking picked in the arrivals list to the tapped free table. */
  onMoveHere: (booking: StaffBooking, table: StaffTable) => void;
  onWalkin: () => void;
}

export function SelectionPanel(props: SelectionPanelProps) {
  const { t } = useT();
  const { table, booking } = props;
  if (!table && !booking) {
    return <p className="rb-muted">{t("Tap a table on the map or a booking in the list to see its details and actions.")}</p>;
  }
  const bookingHere = table ? (props.floor.bookings.find((b) => b.id === table.booking_id) ?? null) : null;
  const shown = bookingHere ?? booking;
  return (
    <div className="st-selection">
      {table && !shown && <TableHeader table={table} />}
      {shown && <BookingDetails booking={shown} />}
      {shown && <CustomerHistory key={shown.id} venueId={props.venueId} bookingId={shown.id} />}
      {shown && <BookingActions key={shown.id} venueId={props.venueId} booking={shown} onChanged={props.onChanged} onProblem={props.onProblem} onMove={props.onMove} />}
      {table && table.status === "free" && <FreeTableActions {...props} table={table} />}
    </div>
  );
}

function TableHeader({ table }: { table: StaffTable }) {
  const { t } = useT();
  return (
    <h3 className="rb-service-title">
      {t("Table {label}", { label: table.label })} <Badge>{t(FLOOR_LOOK[table.status].label)}</Badge>
      <span className="rb-muted st-small"> {t("Seats {min} to {max}", { min: table.min_party, max: table.max_party })}</span>
    </h3>
  );
}

function FreeTableActions({ table, booking, onMoveHere, onWalkin }: SelectionPanelProps & { table: StaffTable }) {
  const { t } = useT();
  return (
    <div className="st-actions">
      {booking?.status === "confirmed" && !booking.table_ids.includes(table.id) && (
        <Button variant="secondary" onClick={() => onMoveHere(booking, table)}>
          {t("Move to table {label}", { label: table.label })}
        </Button>
      )}
      {!booking && <Button variant="secondary" onClick={onWalkin}>{t("Find a table for a walk-in")}</Button>}
    </div>
  );
}

function BookingDetails({ booking }: { booking: StaffBooking }) {
  const { t } = useT();
  return (
    <div className="st-booking">
      <p className="st-booking-name">
        <strong>{booking.name}</strong>
      </p>
      <p className="rb-muted tabular">
        {t("{from} to {to}", { from: booking.time, to: booking.end_time })} · {people(booking.party_size)} · {tablesText(booking.table_labels)}
        {booking.source === "walk_in" && `, ${t("walk-in")}`}
      </p>
      <div className="rb-badges"><Badge tone={BOOKING_LOOK[booking.status].tone}>{t(BOOKING_LOOK[booking.status].label)}</Badge>
        {booking.needs_accessible && <Badge tone="info">{t("Accessible table")}</Badge>}
        {booking.high_chairs > 0 && <Badge>{t("High chairs: {n}", { n: booking.high_chairs })}</Badge>}
      </div>
      {booking.offer && (
        <p data-testid="staff-offer">
          <strong>{t("Offer: {name}", { name: booking.offer.name })}</strong>, {booking.offer.what}. {t("Take it off the bill.")}
        </p>
      )}
      {booking.payment && (
        <p className="st-note" data-testid="staff-deposit">
          <strong>{depositStatus(booking.payment)}</strong>
          {booking.payment.status === "pending" && `. ${t("The table is held until it is paid.")}`}
          {booking.payment.status === "paid" && `, ${t("taken off the bill.")}`}
        </p>
      )}
      {booking.seat && <p className="st-note">{t("Chair requested: {code}", { code: booking.seat.label })}</p>}
      {prefWords(booking.prefs) && <p className="st-note">{t("Guest wished for:")} {prefWords(booking.prefs)}</p>}
      {booking.notes && <p className="st-note">{t("Note:")} {booking.notes}</p>}
      {booking.occasion && <p className="st-note">{t("Occasion:")} {booking.occasion}</p>}
      {booking.dietary_requirements && <p className="st-note">{t("Dietary preferences:")} {booking.dietary_requirements}</p>}
      {booking.allergies && <p className="rb-notice rb-notice-error"><strong>{t("Food allergies:")}</strong> {booking.allergies}</p>}
      {booking.arrival_time && <p className="st-note"><strong>{t("Expected arrival: {time}", { time: booking.arrival_time })}</strong></p>}
    </div>
  );
}
