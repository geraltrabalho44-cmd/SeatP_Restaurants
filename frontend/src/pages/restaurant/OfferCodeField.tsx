// "Have an offer code?" on the details form. A guest arrives with a code from an email or a link
// (?offer=CODE, which fills the box in), types it, and sees what it gives before confirming. The
// restaurant bears the cost: nothing is charged here, the staff take it off the bill.
import { useEffect, useState } from "react";
import { checkOffer } from "../../api/offers";
import type { OfferCheck } from "../../api/offers";
import { Button, Field } from "../../design/components";
import { useT } from "../../i18n/I18nProvider";
import { errorMessage } from "./format";

/** What the form keeps about the offer: the code typed, and what the server said it gives. */
export interface OfferChoice {
  code: string;
  applied: OfferCheck | null;
  /** Why the code was refused (by the check, or when booking), shown under the box. */
  problem?: string;
}

export const NO_OFFER: OfferChoice = { code: "", applied: null };

/** The code a link brought, if any: `?offer=ABCD2345`. Read once, when the box first appears. */
export function codeFromAddress(search: string): string {
  const raw = new URLSearchParams(search).get("offer") ?? "";
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 16);
}

interface Props {
  venueId: string;
  email: string;
  day: string;
  party: number;
  value: OfferChoice;
  onChange: (value: OfferChoice) => void;
  disabled?: boolean;
}

export function OfferCodeField({ venueId, email, day, party, value, onChange, disabled = false }: Props) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // A link that carried a code fills the box once; the diner can change or clear it.
  useEffect(() => {
    if (value.code === "" && typeof window !== "undefined") {
      const fromLink = codeFromAddress(window.location.search);
      if (fromLink) onChange({ code: fromLink, applied: null });
    }
    // Only on the first appearance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const apply = async (): Promise<void> => {
    if (!email.trim()) {
      setProblem(t("Type your email above first: some codes are for one guest only."));
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      onChange({ code: value.code, applied: await checkOffer(venueId, value.code, email.trim(), day, party) });
    } catch (error) {
      onChange({ code: value.code, applied: null, problem: errorMessage(error, t("We could not check the code. Please try again.")) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rb-offer" aria-label={t("Offer code")}>
      <Field
        label={t("Offer code (optional)")}
        autoComplete="off"
        maxLength={16}
        placeholder={t("e.g. K7M3QX9P")}
        value={value.code}
        disabled={disabled}
        onChange={(event) => {
          onChange({ code: event.target.value.toUpperCase(), applied: null });
          setProblem(null);
        }}
      />
      {value.code.trim() !== "" && !value.applied && (
        <Button variant="secondary" busy={busy} disabled={disabled} onClick={() => void apply()}>
          {t("Apply code")}
        </Button>
      )}
      {value.applied && (
        <p className="rb-offer-applied" role="status">
          <span aria-hidden="true">✓</span> <strong>{value.applied.name}</strong>: {value.applied.what}. {t("The restaurant takes it off your bill.")}
          {value.applied.note && <span className="rb-muted"> {value.applied.note}</span>}
        </p>
      )}
      {(value.problem ?? problem) && (
        <p className="rb-notice rb-notice-error" role="alert">
          {value.problem ?? problem}
        </p>
      )}
    </section>
  );
}
