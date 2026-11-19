// The visible 5-minute countdown while a table is held.
//
// The clock ticks every second for sighted people, but a screen reader
// would go mad hearing every second, so the live region only speaks at
// "1 minute left" and "time is up".
import { useEffect, useState } from "react";
import { useT } from "../../i18n/I18nProvider";
import { tr } from "../../i18n/locale";
import { formatCountdown } from "./format";

/** Seconds left until `expiresAt` (ISO date-time), updated every second. Null when nothing is held. */
export function useSecondsLeft(expiresAt: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
}

function spokenMessage(seconds: number): string {
  if (seconds === 0) return tr("Your hold has ended. The table may be taken by someone else.");
  if (seconds <= 60) return tr("One minute left to finish your booking.");
  return "";
}

interface HoldCountdownProps {
  tableLabel: string;
  secondsLeft: number;
  /** "chip" is the small "Held for 4:38" beside a heading; "banner" is the full sentence. */
  variant?: "banner" | "chip";
}

export function HoldCountdown({ tableLabel, secondsLeft, variant = "banner" }: HoldCountdownProps) {
  const { t } = useT();
  const urgent = secondsLeft <= 60;
  if (variant === "chip") {
    return (
      <div className={`rb-hold-chip${urgent ? " rb-hold-chip-urgent" : ""}`}>
        <svg className="rb-hold-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 2.5M9.5 3h5" />
        </svg>
        {secondsLeft > 0 ? (
          <span>
            {t("Held for")}{" "}
            <strong className="tabular" role="timer" aria-label={t("{time} minutes", { time: formatCountdown(secondsLeft) })}>
              {formatCountdown(secondsLeft)}
            </strong>
            <span className="visually-hidden"> ({t("table {label}", { label: tableLabel })})</span>
            {urgent && <span className="rb-hold-flag"> ({t("almost up")})</span>}
          </span>
        ) : (
          <span>{t("Hold ended")}</span>
        )}
        <span className="visually-hidden" role="status" aria-live="polite">
          {spokenMessage(secondsLeft)}
        </span>
      </div>
    );
  }
  return (
    <div className={`rb-hold ${urgent ? "rb-hold-urgent" : ""}`.trim()}>
      <svg className="rb-hold-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 2.5M9.5 3h5" />
      </svg>
      <p className="rb-hold-text">
        {secondsLeft > 0 ? (
          <>
            {t("Table {label} is held for you for", { label: tableLabel })}{" "}
            <strong className="tabular" role="timer" aria-label={t("{time} minutes", { time: formatCountdown(secondsLeft) })}>
              {formatCountdown(secondsLeft)}
            </strong>
            {urgent && <span className="rb-hold-flag"> ({t("almost up")})</span>}
          </>
        ) : (
          <>{t("Your hold on table {label} has ended. Pick a table again to continue.", { label: tableLabel })}</>
        )}
      </p>
      <span className="visually-hidden" role="status" aria-live="polite">
        {spokenMessage(secondsLeft)}
      </span>
    </div>
  );
}
