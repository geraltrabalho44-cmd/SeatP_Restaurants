// "Reminders on your phone": an optional block of the details form. Nobody is messaged without
// saying yes, and the number must be proven with a 6-digit code first, so nobody can sign up
// somebody else's phone. It shows nothing at all when the restaurant sends no phone messages.
import { useEffect, useState } from "react";
import { ApiError } from "../../api/client";
import { startPhoneCode, verifyPhoneCode } from "../../api/messages";
import type { MessageChannel, MessageOptions } from "../../api/messages";
import { getRestaurant } from "../../api/restaurant";
import { Button, Checkbox, Field } from "../../design/components";
import { errorMessage } from "./format";

export const CHANNEL_NAME: Record<MessageChannel, string> = { whatsapp: "WhatsApp", sms: "SMS" };

/** What the form needs from this block: a verified number's id, or null while it is not ready. */
export interface PhoneChoice {
  /** The diner ticked the box. */
  wanted: boolean;
  /** Set once the code was typed correctly. */
  verificationId: string | null;
  /** The number as the server shows it, and the channel, so the form can say "Verified" after a remount. */
  masked?: string;
  channel?: MessageChannel;
}

export const NO_PHONE: PhoneChoice = { wanted: false, verificationId: null };

interface PhoneOptInProps {
  venueId: string;
  value: PhoneChoice;
  onChange: (value: PhoneChoice) => void;
  disabled?: boolean;
  error?: string | null;
}

/** The sentence under the box. It names only what this restaurant really sends. */
export function consentText(options: MessageOptions): string {
  const sends: string[] = [];
  if (options.confirmation) sends.push("your confirmation");
  const reminders = [options.reminder_24h && "24 hours", options.reminder_3h && "3 hours"].filter(Boolean);
  if (reminders.length) sends.push(`reminders ${reminders.join(" and ")} before`);
  const what = sends.length ? sends.join(" and ") : "messages about your booking";
  return `We'll send ${what}, each with a link to confirm or cancel. No marketing. Use the link to stop at any time. We delete your number 30 days after your visit.`;
}

export function PhoneOptIn({ venueId, value, onChange, disabled = false, error = null }: PhoneOptInProps) {
  const [options, setOptions] = useState<MessageOptions | null>(null);
  useEffect(() => {
    let current = true;
    getRestaurant(venueId).then(
      (info) => {
        if (current) setOptions(info.messages ?? null);
      },
      () => {
        // No options means no block: booking works exactly as before.
      },
    );
    return () => {
      current = false;
    };
  }, [venueId]);
  if (!options || options.channels.length === 0) return null;
  return <Block venueId={venueId} options={options} value={value} onChange={onChange} disabled={disabled} error={error} />;
}

function Block({ venueId, options, value, onChange, disabled, error }: PhoneOptInProps & { options: MessageOptions }) {
  const [channel, setChannel] = useState<MessageChannel>(value.channel ?? options.channels[0] ?? "sms");
  const [number, setNumber] = useState("");
  const [sent, setSent] = useState<{ id: string; phone: string; demoCode?: string } | null>(null);
  const [code, setCode] = useState("");
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(value.verificationId ? (value.masked ?? null) : null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const reset = (): void => {
    setSent(null);
    setCode("");
    setVerifiedPhone(null);
    setProblem(null);
    onChange({ wanted: true, verificationId: null });
  };
  const send = async (): Promise<void> => {
    setBusy(true);
    setProblem(null);
    try {
      const started = await startPhoneCode(venueId, number, channel);
      setSent({ id: started.verification_id, phone: started.phone, demoCode: started.demo_code });
      setCode("");
    } catch (failure) {
      setProblem(failure instanceof ApiError && failure.code === "rate_limited" ? "Too many codes for this number. Try again in an hour, or book without phone messages." : errorMessage(failure, "We could not send the code. Try again, or book without phone messages."));
    } finally {
      setBusy(false);
    }
  };
  const verify = async (): Promise<void> => {
    if (!sent) return;
    setBusy(true);
    setProblem(null);
    try {
      const checked = await verifyPhoneCode(venueId, sent.id, code.trim());
      setVerifiedPhone(checked.phone);
      onChange({ wanted: true, verificationId: sent.id, masked: checked.phone, channel });
    } catch (failure) {
      setProblem(errorMessage(failure, "We could not check the code. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rb-phone" aria-label="Reminders on your phone">
      <h4 className="rb-phone-title">Reminders on your phone (optional)</h4>
      <Checkbox
        id="rb-phone-want"
        label="Send me booking messages by WhatsApp or SMS"
        checked={value.wanted}
        disabled={disabled}
        onChange={(event) => {
          if (event.target.checked) onChange({ wanted: true, verificationId: null });
          else {
            setSent(null);
            setVerifiedPhone(null);
            setCode("");
            setProblem(null);
            onChange(NO_PHONE);
          }
        }}
      />
      {value.wanted && (
        <div className="rb-phone-body">
          <p className="rb-muted">{consentText(options)}</p>
          {verifiedPhone ? (
            <p className="rb-phone-verified" role="status">
              <span aria-hidden="true">✓</span> Verified: {verifiedPhone} · {CHANNEL_NAME[channel]}{" "}
              <Button variant="ghost" disabled={disabled} onClick={reset}>
                Change
              </Button>
            </p>
          ) : (
            <>
              {options.channels.length > 1 && (
                <div role="radiogroup" aria-label="How should we message you?" className="rb-phone-channels">
                  {options.channels.map((name) => (
                    <label key={name} className="rb-phone-channel">
                      <input type="radio" name="rb-phone-channel" value={name} checked={channel === name} disabled={disabled || sent !== null} onChange={() => setChannel(name)} />
                      {CHANNEL_NAME[name]}
                    </label>
                  ))}
                </div>
              )}
              {!sent ? (
                <>
                  <Field id="rb-phone-number" label="Mobile number" hint="Portuguese mobile numbers only for now, for example 912 345 678." type="tel" inputMode="tel" autoComplete="tel-national" placeholder="912 345 678" value={number} disabled={disabled} onChange={(event) => setNumber(event.target.value)} />
                  <Button variant="secondary" busy={busy} disabled={disabled || number.trim() === ""} onClick={() => void send()}>
                    Send code
                  </Button>
                </>
              ) : (
                <>
                  <p role="status">
                    We sent a 6-digit code to {sent.phone} by {CHANNEL_NAME[channel]}.
                  </p>
                  {sent.demoCode && (
                    <p className="rb-notice" role="note">
                      Demo: no message is sent. Your code is <strong>{sent.demoCode}</strong>.
                    </p>
                  )}
                  <Field id="rb-phone-code" label="Code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" value={code} disabled={disabled} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
                  <div className="rb-actions">
                    <Button variant="secondary" busy={busy} disabled={disabled || code.length !== 6} onClick={() => void verify()}>
                      Verify
                    </Button>
                    <Button variant="ghost" disabled={disabled || busy} onClick={reset}>
                      Change number
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
          {(problem ?? error) && (
            <p className="rb-notice rb-notice-error" role="alert">
              {problem ?? error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
