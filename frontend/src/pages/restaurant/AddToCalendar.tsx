// "Add to calendar": the booking as a .ics file, from the server. The manage token is the only key, like the booking page itself.
import { API_BASE } from "../../api/client";
import { useT } from "../../i18n/I18nProvider";

export function AddToCalendar({ token }: { token: string }) {
  const { t } = useT();
  return (
    <a className="btn btn-secondary" href={`${API_BASE}/b/${encodeURIComponent(token)}/calendar.ics`} download="booking.ics">
      {t("Add to calendar")}
    </a>
  );
}
