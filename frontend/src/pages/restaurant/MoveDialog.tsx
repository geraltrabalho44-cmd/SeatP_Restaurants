// Move a booking to other tables, or combine tables for a big party.
// This is the keyboard (and screen-reader) way to do what dragging does:
// tick one table to move, tick several in the same group to combine.
import { useState } from "react";
import { moveBooking } from "../../api/restaurant";
import type { StaffBooking, StaffTable } from "../../api/restaurant";
import { Button, Checkbox, Dialog } from "../../design/components";
import { useT } from "../../i18n/I18nProvider";
import { tr } from "../../i18n/locale";
import { errorMessage, people, tablesText } from "./format";
import { FLOOR_LOOK, moveProblem } from "./staffStatus";

interface MoveDialogProps {
  venueId: string;
  booking: StaffBooking | null;
  tables: StaffTable[];
  onClose: () => void;
  onMoved: (booking: StaffBooking) => void;
}

function tableHint(table: StaffTable): string {
  const group = table.combine_group ? `, ${tr("combines with group {group}", { group: table.combine_group })}` : "";
  return `${tr("Seats {min} to {max}", { min: table.min_party, max: table.max_party })}, ${tr(FLOOR_LOOK[table.status].label).toLowerCase()}${group}`;
}

export function MoveDialog({ venueId, booking, tables, onClose, onMoved }: MoveDialogProps) {
  const { t } = useT();
  const [chosen, setChosen] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (!booking) return null;

  const picked = tables.filter((t) => chosen.includes(t.id));
  const check = moveProblem(picked, booking.party_size);
  // Tables already used by this booking are offered too, so staff can add a second table to it.
  const offered = tables.filter((t) => t.status === "free" || booking.table_ids.includes(t.id));
  const toggle = (id: number): void => setChosen(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
  const close = (): void => {
    setChosen([]);
    setProblem(null);
    onClose();
  };
  const save = async (): Promise<void> => {
    setBusy(true);
    setProblem(null);
    try {
      onMoved(await moveBooking(venueId, booking.id, chosen));
      setChosen([]);
    } catch (error) {
      setProblem(errorMessage(error, t("We could not move the booking. Nothing was changed.")));
    } finally {
      setBusy(false);
    }
  };
  const actions = (
    <>
      <Button variant="secondary" disabled={busy} onClick={close}>
        {t("Cancel")}
      </Button>
      <Button busy={busy} disabled={check !== null} onClick={() => void save()}>
        {picked.length > 1 ? t("Combine {tables}", { tables: tablesText(picked.map((table) => table.label)) }) : t("Move here")}
      </Button>
    </>
  );
  return (
    <Dialog open title={t("Move {name}, {people}", { name: booking.name, people: people(booking.party_size) })} onClose={close} actions={actions}>
      <p className="st-effective-time">{t("{name} · booked at {from} until {to}. Moving tables keeps this time.", { name: booking.name, from: booking.time, to: booking.end_time })}</p>
      <p>{t("Now at {tables}. Tick one table to move, or several from the same group to combine them.", { tables: tablesText(booking.table_labels) })}</p>
      <MoveChoices booking={booking} offered={offered} chosen={chosen} check={check} onToggle={toggle} />
      {problem && (
        <p className="rb-notice rb-notice-error" role="alert">
          {problem}
        </p>
      )}
    </Dialog>
  );
}

interface MoveChoicesProps {
  booking: StaffBooking;
  offered: StaffTable[];
  chosen: number[];
  check: string | null;
  onToggle: (tableId: number) => void;
}

/** The tick list of tables, plus one live sentence saying whether the choice works. */
function MoveChoices({ booking, offered, chosen, check, onToggle }: MoveChoicesProps) {
  const { t } = useT();
  const labels = offered.filter((t) => chosen.includes(t.id)).map((t) => t.label);
  return (
    <>
      <fieldset className="st-move-list">
        <legend className="visually-hidden">{t("Tables")}</legend>
        {offered.map((table) => (
          <Checkbox key={table.id} label={t("Table {label}", { label: table.label })} hint={tableHint(table)} checked={chosen.includes(table.id)} onChange={() => onToggle(table.id)} />
        ))}
      </fieldset>
      <p className="rb-muted" role="status">
        {chosen.length === 0 ? t("No table ticked yet.") : (check ?? t("{tables} will seat {people}.", { tables: tablesText(labels), people: people(booking.party_size) }))}
      </p>
    </>
  );
}
