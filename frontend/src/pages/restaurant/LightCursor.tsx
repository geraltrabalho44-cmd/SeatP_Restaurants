// "Preview light (does not change your booking)": a slider over the stay in 15-minute
// steps. A native range input, so arrows, Page Up/Down, Home and End work, and aria-valuetext
// says the time in words. The track is the booked stay itself, drawn in brass so it reads as
// "your meal", with the sunset marked on it when it falls inside the stay. Moving the thumb only
// repaints the light: the booking time, the table and the hold are not touched.
import { useId, useState } from "react";
import { useT } from "../../i18n/I18nProvider";
import { toMinutes } from "./format";

interface LightCursorProps {
  steps: string[];
  index: number;
  onChange: (index: number) => void;
  failed: boolean;
  /** The time the diner is booking, which the preview never changes. */
  bookingTime: string;
  /** Sunset at the restaurant that day ("20:47"), or null when unknown. */
  sunset: string | null;
  /** The light of the table in front of the diner, in words ("After dark"), for the one-line form on a phone. */
  summary?: string | null;
  /** The table in front of the diner ("R1"), so the line under the slider says what the light does to it. */
  tableLabel?: string | null;
}

/** True when the sun has already set when the visit starts: the light cannot change, so there is nothing to slide. */
export function sunSetBeforeStay(steps: string[], sunset: string | null): boolean {
  return Boolean(sunset) && steps.length > 0 && toMinutes(sunset as string) <= toMinutes(steps[0]);
}

/** Where the sunset falls along the stay, 0 to 100, or null when it is outside the stay. */
export function sunsetPercent(steps: string[], sunset: string | null): number | null {
  if (!sunset || steps.length < 2) return null;
  const from = toMinutes(steps[0]);
  const to = toMinutes(steps[steps.length - 1]);
  const at = toMinutes(sunset);
  if (to <= from || at < from || at > to) return null;
  return ((at - from) / (to - from)) * 100;
}

/** Wide screens open the light control; on a phone it starts as one line with an Explore button. */
function startsOpen(): boolean {
  try {
    return typeof window.matchMedia !== "function" || window.matchMedia("(min-width: 48rem)").matches;
  } catch {
    return true;
  }
}

export function LightCursorControl({ steps, index, onChange, failed, bookingTime, sunset, summary, tableLabel }: LightCursorProps) {
  const { t } = useT();
  const id = useId();
  const regionId = useId();
  const [open, setOpen] = useState(startsOpen);
  const first = steps[0];
  const last = steps[steps.length - 1];
  const sun = sunsetPercent(steps, sunset);
  // After dark for the whole visit there is nothing to move: say so, instead of a slider that seems broken.
  if (sunSetBeforeStay(steps, sunset)) {
    return (
      <section className="rb-light-cursor rb-light-still" aria-label={t("Light during your visit")}>
        <h3 className="rb-light-title">{t("Light during your visit")}</h3>
        <p className="rb-muted">
          {t("The sun sets at {sunset}, before your table time of {booking}. It is dark for the whole visit, so the light does not change.", { sunset: sunset ?? "", booking: bookingTime })}
        </p>
      </section>
    );
  }
  return (
    <section className="rb-light-cursor" aria-label={t("Light during your visit")}>
      <div className="rb-light-head">
        <div>
          <h3 className="rb-light-title">
            <span className="rb-light-title-wide">{t("Light during your visit")}</span>
            <span className="rb-light-title-narrow">{t("Light preview")}{summary ? ` · ${summary}` : ""}</span>
          </h3>
          <p className="rb-muted rb-light-booking tabular">{t("Booking stays at {time}", { time: bookingTime })}</p>
        </div>
        <span className="rb-light-chip tabular" aria-hidden="true">
          {t("Preview {time}", { time: steps[index] })}
        </span>
        <button type="button" className="rb-light-explore" aria-expanded={open} aria-controls={regionId} onClick={() => setOpen(!open)}>
          {open ? t("Hide") : t("Explore")}
        </button>
      </div>
      <div id={regionId} className="rb-light-body" hidden={!open}>
        <label htmlFor={id} className="visually-hidden">
          {t("Preview light (does not change your booking)")}
        </label>
        <div className="rb-light-track">
          <div className="st-scrubber-row">
            <span className="rb-muted tabular" aria-hidden="true">
              {first}
            </span>
            <div className="rb-light-range">
              <input
                id={id}
                type="range"
                min={0}
                max={steps.length - 1}
                step={1}
                value={index}
                aria-valuetext={t("{time}, during your stay from {first} to {last}", { time: steps[index], first, last })}
                onChange={(event) => onChange(Number(event.target.value))}
              />
              {sun !== null && (
                <span className="rb-light-sunset" style={{ left: `${sun}%` }} aria-hidden="true">
                  <span className="rb-light-sunset-mark" />
                  <span className="rb-light-sunset-label tabular">{t("Sunset {time}", { time: sunset ?? "" })}</span>
                </span>
              )}
            </div>
            <span className="rb-muted tabular" aria-hidden="true">
              {last}
            </span>
          </div>
        </div>
        <p className="rb-muted rb-light-live" aria-live="polite">
          <strong>{t("Light preview at {time}.", { time: steps[index] })}</strong> {t("Booking at {time}.", { time: bookingTime })}
          {tableLabel && summary ? ` ${t("Table {label}: {light}.", { label: tableLabel, light: summary.toLowerCase() })}` : ""}
          {sun !== null && sunset ? ` ${t("The sun sets at {time}.", { time: sunset })}` : ""}
        </p>
        <p className="rb-muted rb-light-legend">{t("Yellow is where the sun reaches the floor. After sunset the floor turns dark and the free tables get a candle.")}</p>
        {failed && (
          <p className="rb-notice" role="status">
            {t("We could not update the light just now. The picture shows an earlier time.")}
          </p>
        )}
      </div>
    </section>
  );
}
