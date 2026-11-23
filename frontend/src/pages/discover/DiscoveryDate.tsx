import { useT } from "../../i18n/I18nProvider";
import { useEffect, useId, useRef, useState } from "react";
import { FieldError } from "../../design/components/Field";
import { formatDate, todayIso } from "../restaurant/format";

function monthStart(date: string) {
  const [year, month] = date.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

/** How long the calendar takes to fold away, in ms; it stays on the page that long so it can leave gently. */
const LEAVE_MS = 180;

export function DiscoveryDate({ value, onChange, stacked, min, error = null, required = false }: {
  value: string;
  onChange: (value: string) => void;
  stacked: boolean;
  /** The first day that can be chosen (today when left out). */
  min?: string;
  error?: string | null;
  required?: boolean;
}) {
  const {t,tag} = useT();
  const id = useId();
  const field = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const calendar = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // The calendar stays in the page a moment after it is closed, so it can fold away instead of vanishing.
  const [present, setPresent] = useState(false);
  const minimum = min ?? todayIso();
  const [month, setMonth] = useState(() => monthStart(value || minimum));
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const offset = (month.getDay() + 6) % 7;
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const preview = value
    ? new Date(`${value}T12:00:00`).toLocaleDateString(tag, { weekday: "short", day: "numeric", month: "short" })
    : t("Choose a date");

  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    const timer = window.setTimeout(() => setPresent(false), LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    calendar.current?.querySelector<HTMLButtonElement>("[data-calendar-start]")?.focus({ preventScroll: true });
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !field.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  const show = () => {
    setMonth(monthStart(value && value >= minimum ? value : minimum));
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };

  return (
    <div ref={field} className={stacked ? `field discover-date${error ? " field-invalid" : ""}` : "discover-date"}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={event => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          close();
        }
      }}>
      <label htmlFor={id} className={stacked ? "field-label" : undefined}>{t("Date")}</label>
      <div className="discover-date-control">
        <input className={stacked ? "field-input" : undefined} id={id} type="date" aria-label={t("Date")} min={minimum}
          value={value} required={required} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined}
          onChange={event => onChange(event.target.value)}
          onKeyDown={event => {
            if (event.altKey && event.key === "ArrowDown") {
              event.preventDefault();
              show();
            }
          }} />
        <span className="discover-date-preview" aria-hidden="true">{preview}</span>
        <button ref={trigger} type="button" className="discover-calendar-toggle" aria-label={t("Open calendar")}
          aria-expanded={open} aria-controls={open ? `${id}-calendar` : undefined}
          onClick={() => { if (open) close(); else show(); }}>
          <span aria-hidden="true" />
        </button>
      </div>
      {error && <FieldError id={`${id}-error`} message={error} />}
      {(open || present) && <div ref={calendar} id={`${id}-calendar`} className={open ? "discover-calendar" : "discover-calendar is-leaving"} role="group" aria-label={t("Booking calendar")} aria-hidden={open ? undefined : true}>
        <div className="discover-calendar-header">
          <button type="button" aria-label={t("Previous month")} disabled={month <= monthStart(minimum)}
            onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}>‹</button>
          <strong aria-live="polite">{month.toLocaleDateString(tag, { month: "long", year: "numeric" })}</strong>
          <button type="button" aria-label={t("Next month")} onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}>›</button>
        </div>
        <div className="discover-calendar-grid">
          {Array.from({length:7},(_,i)=>tag==="en-GB"?["Mo","Tu","We","Th","Fr","Sa","Su"][i]:new Intl.DateTimeFormat(tag,{weekday:"short"}).format(new Date(2024,0,1+i))).map(day => <span key={day} aria-hidden="true">{day}</span>)}
          {Array.from({ length: offset }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
          {Array.from({ length: days }, (_, index) => {
            const day = index + 1;
            const date = todayIso(new Date(year, monthIndex, day));
            return <button key={day} type="button" aria-label={formatDate(date)} disabled={date < minimum}
              aria-pressed={value === date} aria-current={date === minimum ? "date" : undefined}
              data-calendar-start={date === (value && value >= minimum ? value : minimum) ? "" : undefined}
              onClick={() => { onChange(date); close(); }}>{day}</button>;
          })}
        </div>
        {value && <button type="button" className="discover-calendar-clear" onClick={() => { onChange(""); close(); }}>{t("Clear date")}</button>}
      </div>}
    </div>
  );
}
