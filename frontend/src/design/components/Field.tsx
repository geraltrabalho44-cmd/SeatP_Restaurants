// A labelled text input with an optional hint and error. The label, hint and
// error are wired to the input with ids, so a screen reader reads all three.
import { useEffect, useId, useRef, useState } from "react";
import type { InputHTMLAttributes } from "react";
import { useT } from "../../i18n/I18nProvider";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | null;
}

/** The eye that shows or hides what is typed in a password field, drawn inside the field at its right end. */
function EyeButton({ shown, controls, onToggle }: { shown: boolean; controls: string; onToggle: () => void }) {
  const { t } = useT();
  return (
    <button type="button" className="field-eye" aria-pressed={shown} aria-controls={controls} aria-label={shown ? t("Hide password") : t("Show password")} onClick={onToggle}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
        {shown && <path d="M4 4l16 16" />}
      </svg>
    </button>
  );
}

export function Field({ label, hint, error, id, className = "", ...rest }: FieldProps) {
  const autoId = useId();
  const [shown, setShown] = useState(false);
  const isPassword = rest.type === "password";
  // A few Events pages (not ours to change) draw their own "Show password" button in an `.acc-password` box around the
  // field; there the eye would be a second button for the same thing, so it is left out.
  const box = useRef<HTMLDivElement>(null);
  const [ownToggle, setOwnToggle] = useState(false);
  useEffect(() => {
    setOwnToggle(Boolean(box.current?.closest(".acc-password")));
  }, []);
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`field ${error ? "field-invalid" : ""} ${className}`.trim()}>
      <label className="field-label" htmlFor={inputId}>
        {label}
      </label>
      {hint && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      {isPassword ? (
        <div className="field-control" ref={box}>
          <input {...rest} type={shown ? "text" : "password"} id={inputId} className="field-input field-input-password" aria-invalid={error ? true : undefined} aria-describedby={describedBy} />
          {!ownToggle && <EyeButton shown={shown} controls={inputId} onToggle={() => setShown(!shown)} />}
        </div>
      ) : (
        <input {...rest} id={inputId} className="field-input" aria-invalid={error ? true : undefined} aria-describedby={describedBy} />
      )}
      {error && <FieldError id={errorId} message={error} />}
    </div>
  );
}

/** Error text with an icon, so the problem is not shown by red colour alone. */
export function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p id={id} className="field-error">
      <svg viewBox="0 0 16 16" aria-hidden="true" className="field-error-icon">
        <circle cx="8" cy="8" r="7" />
        <path d="M8 4.5v4.2M8 11.2v.3" />
      </svg>
      {message}
    </p>
  );
}
