// The buttons for one booking: seat, finishing, complete, no-show, move,
// cancel. Only the steps that make sense for its current status are shown,
// so staff in a hurry cannot press a wrong one. Cancel asks first.
import { useState } from "react";
import { setBookingStatus } from "../../api/restaurant";
import type { BookingStatus, StaffBooking } from "../../api/restaurant";
import { Button, Dialog } from "../../design/components";
import type { Message } from "../../i18n/catalogue";
import { useT } from "../../i18n/I18nProvider";
import { errorMessage } from "./format";
import { nextActions } from "./staffStatus";

interface BookingActionsProps {
  venueId: string;
  booking: StaffBooking;
  onChanged: (message: string) => void;
  onProblem: (message: string) => void;
  onMove: (booking: StaffBooking) => void;
}

const DONE_TEXT: Partial<Record<BookingStatus, Message>> = {
  seated: "{name} is seated.",
  finishing: "{name} is finishing.",
  completed: "{name} is complete; the table is free.",
  no_show: "{name} is marked as a no-show.",
  cancelled: "{name} is cancelled.",
};

export function BookingActions({ venueId, booking, onChanged, onProblem, onMove }: BookingActionsProps) {
  const { t } = useT();
  const [busy, setBusy] = useState<BookingStatus | null>(null);
  const [more, setMore] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const change = async (status: BookingStatus): Promise<void> => {
    if (busy) return;
    setBusy(status);
    try {
      await setBookingStatus(venueId, booking.id, status);
      onChanged(t(DONE_TEXT[status] ?? "{name} is updated.", { name: booking.name }));
    } catch (error) {
      onProblem(errorMessage(error, t("Could not update {name}. Nothing was changed.", { name: booking.name })));
    } finally {
      setBusy(null);
      setConfirmCancel(false);
    }
  };
  const open = booking.status === "confirmed" || booking.status === "seated";
  return (
    <div className="st-actions" role="group" aria-label={t("Actions for {name}", { name: booking.name })}>
      <p className="st-action-context">{booking.name} · {booking.time} · {booking.table_labels.join(" + ")}. {t("Status updates take effect now.")}</p>
      {nextActions(booking.status).filter(action=>action.status!=="no_show").map(action=><Button key={action.status} disabled={busy!==null && busy!==action.status} busy={busy===action.status} onClick={()=>void change(action.status)}>{t(action.label)}</Button>)}
      {(open || booking.status==="confirmed") && <Button variant="secondary" aria-expanded={more} onClick={()=>setMore(!more)}>{t("More actions")}</Button>}
      {more && <div className="st-more-actions" onKeyDown={event=>{if(event.key==="Escape"){setMore(false);event.currentTarget.previousElementSibling instanceof HTMLElement && event.currentTarget.previousElementSibling.focus();}}}>
        {nextActions(booking.status).filter(action=>action.status==="no_show").map(action=><Button key={action.status} variant="secondary" disabled={busy!==null} onClick={()=>void change(action.status)}>{t(action.label)}</Button>)}
        {open && <Button variant="secondary" disabled={busy!==null} onClick={()=>onMove(booking)}>{t("Move or combine")}</Button>}
        {booking.status==="confirmed" && <Button variant="ghost" disabled={busy!==null} className="st-cancel-booking" onClick={()=>setConfirmCancel(true)}>{t("Cancel booking")}</Button>}
      </div>}
      <Dialog
        open={confirmCancel}
        title={t("Cancel {name}'s booking?", { name: booking.name })}
        onClose={() => setConfirmCancel(false)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirmCancel(false)}>
              {t("Keep it")}
            </Button>
            <Button variant="danger" busy={busy === "cancelled"} onClick={() => void change("cancelled")}>
              {t("Yes, cancel")}
            </Button>
          </>
        }
      >
        <p>{t("The table becomes free for walk-ins and the waitlist. This cannot be undone.")}</p>
      </Dialog>
    </div>
  );
}
