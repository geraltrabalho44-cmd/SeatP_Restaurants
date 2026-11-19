// Contact details. Each field checks itself when the diner leaves it (not on every key press),
// and the submit button checks everything and moves focus to the first field that needs attention.
// It is a step of its own (after the optional chair), and also the form in the side panel next to
// the map once a table is held (variant "panel"), so a diner can confirm without leaving the plan.
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { FormEvent } from "react";
import { ApiError } from "../../api/client";
import { createBooking, getDepositTerms } from "../../api/restaurant";
import type { BookingConfirmation, ContactDetails, DepositTerms, PartyNeeds } from "../../api/restaurant";
import { Button, Field, Select } from "../../design/components";
import { ConsentBoxes } from "./ConsentBoxes";
import { DepositNotice } from "./DepositNotice";
import { errorMessage } from "./format";
import type { Agreements } from "./agreements";
import { HoldCountdown } from "./HoldCountdown";
import { formatEuros } from "./money";
import { OfferCodeField } from "./OfferCodeField";
import { PhoneOptIn } from "./PhoneOptIn";
import type { Hold } from "./StepTable";
import { StepHeading } from "./StepHeading";
import { validateContact } from "./validation";
import type { ContactErrors } from "./validation";

interface StepDetailsProps {
  venueId: string;
  needs: PartyNeeds;
  /** The time of the booking ("19:00"), to ask whether a deposit applies to it. */
  time?: string | null;
  hold: Hold;
  /** The chair the diner would like, if they chose one. */
  seatId: number | null;
  /** The chair's code ("R3-1"), for the request summary in the panel. */
  seatLabel?: string | null;
  /** One line about the booking (table, room, day, time, party), shown in the panel next to the timer. */
  summary?: ReactNode;
  /** Panel only: open the optional chair request, and take the request back. */
  onChooseSeat?: () => void;
  onClearSeat?: () => void;
  secondsLeft: number;
  /** Kept by the page, so going back to the map does not wipe what was typed. */
  contact: ContactDetails;
  onContactChange: (contact: ContactDetails) => void;
  /** The boxes the diner ticked, kept by the page like the contact details. */
  agreements: Agreements;
  onAgreementsChange: (agreements: Agreements) => void;
  onBooked: (confirmation: BookingConfirmation) => void;
  /** The hold ended before we could book: go back to the map with this message. */
  onHoldLost: (message: string) => void;
  onSubmittingChange?: (submitting: boolean) => void;
  onBack: () => void;
  /** "panel" is the compact form beside the map: no heading, no countdown (the table step shows it), no Back. */
  variant?: "step" | "panel";
}

const FIELD_ORDER: (keyof ContactDetails)[] = ["name", "email", "phone", "notes"];

export function StepDetails(props: StepDetailsProps) {
  const { venueId, needs, time = null, hold, seatId, seatLabel, summary, secondsLeft, contact, onContactChange, agreements, onAgreementsChange, onBooked, onHoldLost, onSubmittingChange, onBack, onChooseSeat, onClearSeat, variant = "step" } = props;
  const panel = variant === "panel";
  const [touched, setTouched] = useState<Partial<Record<keyof ContactDetails, boolean>>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  // The restaurant's deposit rule for this time and party, if it has one. The diner must accept it.
  const [terms, setTerms] = useState<DepositTerms | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);
  const [termsRound, setTermsRound] = useState(0);
  // Reminders on the phone: only used when the restaurant offers them and the diner ticks the box.
  // The last step: terms (required) and, separately, offers (optional, never pre-ticked).
  const { consent, phone, offer } = agreements;
  const setOffer = (value: typeof offer): void => onAgreementsChange({ ...agreements, offer: value });
  const setPhone = (value: typeof phone): void => onAgreementsChange({ ...agreements, phone: value });
  const setConsent = (value: typeof consent): void => onAgreementsChange({ ...agreements, consent: value });
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    setTerms(null);
    setAccepted(false);
    if (!time) return undefined;
    getDepositTerms(venueId, needs.date, time, needs.party).then(
      (found) => {
        if (current) setTerms(found);
      },
      () => {
        // Without the terms on screen the server still refuses a booking that needs a deposit
        // (policy_not_accepted), and that answer brings them back here, so nothing is lost.
      },
    );
    return () => {
      current = false;
    };
  }, [venueId, needs.date, needs.party, time, termsRound]);
  const errors = validateContact(contact);
  const shown = (field: keyof ContactDetails): string | null => (touched[field] ? (errors[field] ?? null) : null);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (busy || secondsLeft === 0) return;
    setTouched({ name: true, email: true, phone: true, notes: true });
    if (errors.phone || errors.notes) setMoreOpen(true);
    if (focusFirstError(errors)) return;
    if (terms && !accepted) {
      setTermsError("Please accept the deposit terms to book this table.");
      document.getElementById("rb-accept-deposit")?.focus();
      return;
    }
    if (!consent.terms) {
      setConsentError("Please accept the terms and conditions to book this table.");
      document.getElementById("rb-accept-terms")?.focus();
      return;
    }
    if (phone.wanted && !phone.verificationId) {
      setPhoneError("Verify your number, or untick the box to book without phone messages.");
      document.getElementById("rb-phone-code")?.focus();
      return;
    }
    setPhoneError(null);
    setBusy(true);
    onSubmittingChange?.(true);
    setProblem(null);
    try {
      // The acceptance is only sent when a deposit applies, so a booking without one is exactly as before.
      onBooked(await createBooking(venueId, hold.holdId, trimmed(contact), needs, seatId, terms !== null, phone.verificationId, consent, offer.code.trim() || null));
    } catch (error) {
      if (error instanceof ApiError && error.code === "offer_invalid") {
        // The code stopped being valid (or never was): show why, keep the hold and everything typed.
        setOffer({ code: offer.code, applied: null, problem: error.message });
        return;
      }
      if (error instanceof ApiError && (error.code === "phone_not_verified" || error.code === "code_expired")) {
        // The proof ran out (it lasts 30 minutes): ask for a new code, and keep the hold.
        setPhone({ wanted: true, verificationId: null });
        setPhoneError(error.message);
        return;
      }
      if (error instanceof ApiError && error.code === "policy_not_accepted") {
        // The terms did not load or changed: show them again, and keep the hold.
        setTermsRound((round) => round + 1);
        setProblem(error.message);
        return;
      }
      if (error instanceof ApiError && (error.code === "hold_expired" || error.code === "seat_taken")) {
        onHoldLost(`Your hold on table ${hold.tableLabel} ended before we could book it. Your details are not lost: pick a table again.`);
        return;
      }
      setProblem(errorMessage(error, "We could not finish the booking. Please try again."));
    } finally {
      setBusy(false);
      onSubmittingChange?.(false);
    }
  };

  const bind = (field: "name" | "email" | "phone" | "notes") => ({
    id: `rb-${field}`,
    value: contact[field],
    error: shown(field),
    onChange: (e: { target: { value: string } }) => onContactChange({ ...contact, [field]: e.target.value }),
    onBlur: () => setTouched({ ...touched, [field]: true }),
  });

  return (
    <form className={panel ? "rb-card rb-form rb-details-panel" : "rb-step rb-form"} onSubmit={submit} noValidate aria-label={panel ? "Your details" : undefined}>
      {panel ? (
        <div className="rb5-details-head">
          <StepHeading>Your details</StepHeading>
          <HoldCountdown variant="chip" tableLabel={hold.tableLabel} secondsLeft={secondsLeft} />
        </div>
      ) : (
        <>
          <StepHeading>Your details</StepHeading>
          <HoldCountdown tableLabel={hold.tableLabel} secondsLeft={secondsLeft} />
        </>
      )}
      {panel && summary && <p className="rb5-summary-band">{summary}</p>}
      <Field label="Name for the booking" autoComplete="name" required placeholder="e.g. Maria Costa" {...bind("name")} />
      <Field label="Email" hint="We send the confirmation and a calendar invite here." type="email" autoComplete="email" inputMode="email" required placeholder="e.g. maria@example.com" {...bind("email")} />
      {/* Name and email are all a booking needs: the rest opens on request, or when it holds something. */}
      <details
        className="rb5-more-fields"
        open={moreOpen || contact.phone !== "" || contact.notes !== "" || Boolean(shown("phone") || shown("notes"))}
        onToggle={(event) => setMoreOpen(event.currentTarget.open)}
      >
        <summary>Add a phone number or a note for the restaurant</summary>
        <Field label="Phone (optional)" hint="Only used if we need to reach you on the day." type="tel" autoComplete="tel" placeholder="Phone number" {...bind("phone")} />
        <Field label="Notes for the restaurant (optional)" hint="Anything else we should know about your visit." placeholder="Add a note" {...bind("notes")} />
      </details>
      <Select label="Occasion (optional)" value={contact.occasion ?? ""} onChange={event => onContactChange({ ...contact, occasion: event.target.value || null })}
        options={[{ value: "", label: "Just a meal" }, { value: "birthday", label: "Birthday" }, { value: "anniversary", label: "Anniversary" }, { value: "proposal", label: "Marriage proposal" }, { value: "business", label: "Business meal" }, { value: "date", label: "Date night" }, { value: "celebration", label: "Celebration" }]} />
      <Field label="Dietary preferences (optional)" maxLength={500} placeholder="Vegetarian, vegan…" value={contact.dietary_requirements ?? ""} onChange={event => onContactChange({ ...contact, dietary_requirements: event.target.value })} />
      <Field label="Food allergies (optional)" maxLength={500} hint="The staff will see this. Please confirm safe preparation directly with the restaurant." placeholder="Tell us about any food allergies" value={contact.allergies ?? ""} onChange={event => onContactChange({ ...contact, allergies: event.target.value })} />
      {panel && onChooseSeat && <ChairRequest seatId={seatId} seatLabel={seatLabel ?? null} onChoose={onChooseSeat} onClear={onClearSeat} disabled={busy} />}
      <PhoneOptIn venueId={venueId} value={phone} onChange={(value) => { setPhone(value); setPhoneError(null); }} disabled={busy} error={phoneError} />
      {terms && <DepositNotice terms={terms} accepted={accepted} disabled={busy} error={termsError} onChange={(value) => { setAccepted(value); if (value) setTermsError(null); }} />}
      <OfferCodeField venueId={venueId} email={contact.email} day={needs.date} party={needs.party} value={offer} onChange={setOffer} disabled={busy} />
      <ConsentBoxes venueId={venueId} value={consent} onChange={(value) => { setConsent(value); if (value.terms) setConsentError(null); }} error={consentError} disabled={busy} />
      {problem && (
        <p className="rb-notice rb-notice-error" role="alert">
          {problem}
        </p>
      )}
      <div className={panel ? "rb-actions" : "rb-actions rb-actions-sticky"}>
        {!panel && (
          <Button variant="secondary" disabled={busy} onClick={onBack}>
            Back to the map
          </Button>
        )}
        <Button type="submit" busy={busy} disabled={secondsLeft === 0 && !busy}>
          {terms ? `Pay ${formatEuros(terms.total_cents)} deposit` : "Confirm booking"} {panel && <span aria-hidden="true">→</span>}
        </Button>
      </div>
    </form>
  );
}

/** The optional chair, folded into the form: nothing to open unless the diner wants a chair. */
function ChairRequest({ seatId, seatLabel, onChoose, onClear, disabled }: { seatId: number | null; seatLabel: string | null; onChoose: () => void; onClear?: () => void; disabled: boolean }) {
  return (
    <section className="rb-chair-request" aria-label="Chair request">
      <div className="rb5-chair-row">
        <div>
          <h4 className="rb-chair-request-title">Request a chair</h4>
          <p className="rb-muted">Optional · The restaurant will see your request. It does not change your booking.</p>
        </div>
        {seatId === null && (
          <Button variant="secondary" disabled={disabled} onClick={onChoose}>
            Choose a chair
          </Button>
        )}
      </div>
      {seatId !== null && (
        <div className="rb-chair-request-chosen">
          <p>
            <strong>Chair requested{seatLabel ? `: ${seatLabel}` : ""}</strong>
          </p>
          <Button variant="ghost" disabled={disabled} onClick={onChoose}>
            Change chair
          </Button>
          {onClear && (
            <Button variant="ghost" disabled={disabled} onClick={onClear}>
              Remove request
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

function trimmed(contact: ContactDetails): ContactDetails {
  return { ...contact, name: contact.name.trim(), email: contact.email.trim(), phone: contact.phone.trim(), notes: contact.notes.trim(),
    ...(contact.dietary_requirements !== undefined ? { dietary_requirements: contact.dietary_requirements.trim() } : {}),
    ...(contact.allergies !== undefined ? { allergies: contact.allergies.trim() } : {}),
  };
}

/** Moves focus to the first field with a problem; returns true if there was one. */
function focusFirstError(errors: ContactErrors): boolean {
  const first = FIELD_ORDER.find((field) => errors[field]);
  if (!first) return false;
  document.getElementById(`rb-${first}`)?.focus();
  return true;
}
