// The last step of a booking: two separate boxes. The terms and privacy notice are required to book
// (its words open in a window, so nobody leaves the form). Offers from the restaurant are optional,
// never pre-ticked, and ticking them changes nothing about the booking.
import { useState } from "react";
import { getTerms } from "../../api/legal";
import type { Consent, TermsDocument } from "../../api/legal";
import { Button, Checkbox, Dialog } from "../../design/components";
import { errorMessage } from "./format";

interface ConsentBoxesProps {
  venueId: string;
  value: Consent;
  onChange: (value: Consent) => void;
  /** Shown under the terms box when the diner tried to book without ticking it. */
  error?: string | null;
  disabled?: boolean;
}

export function ConsentBoxes({ venueId, value, onChange, error = null, disabled = false }: ConsentBoxesProps) {
  const [open, setOpen] = useState(false);
  const [document, setDocument] = useState<TermsDocument | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const show = async (): Promise<void> => {
    setOpen(true);
    if (document) return;
    try {
      setDocument(await getTerms(venueId));
      setProblem(null);
    } catch (failure) {
      setProblem(errorMessage(failure, "We could not load the terms. Please try again."));
    }
  };
  return (
    <section className="rb-consent" aria-label="Terms and offers">
      <Checkbox
        id="rb-accept-terms"
        label="I accept the terms and conditions and the privacy notice."
        checked={value.terms}
        disabled={disabled}
        onChange={(event) => onChange({ ...value, terms: event.target.checked })}
      />
      <p className="rb-consent-read">
        <Button variant="ghost" onClick={() => void show()}>
          Read the terms and privacy notice
        </Button>
      </p>
      {error && (
        <p className="rb-notice rb-notice-error" role="alert">
          {error}
        </p>
      )}
      <Checkbox
        id="rb-accept-offers"
        label="I'd like to receive offers and news from this restaurant (optional)."
        hint="Only from this restaurant, by email or phone. You can stop at any time with the link in every message. Not ticking this changes nothing about your booking."
        checked={value.offers}
        disabled={disabled}
        onChange={(event) => onChange({ ...value, offers: event.target.checked })}
      />
      <Dialog
        open={open}
        title={document?.title ?? "Terms and privacy"}
        onClose={() => setOpen(false)}
        actions={
          <Button
            onClick={() => {
              onChange({ ...value, terms: true });
              setOpen(false);
            }}
          >
            Accept and close
          </Button>
        }
      >
        {problem && (
          <p className="rb-notice rb-notice-error" role="alert">
            {problem}
          </p>
        )}
        {!document && !problem && <p>Loading the terms…</p>}
        {document && <TermsText document={document} />}
      </Dialog>
    </section>
  );
}

/** The document, as plain paragraphs: nothing here is ever rendered as markup. */
export function TermsText({ document }: { document: TermsDocument }) {
  return (
    <div className="rb-terms">
      {document.draft && (
        <p className="rb-notice rb-notice-warning" role="note">
          Demo text: a draft that has not been reviewed by a lawyer.
        </p>
      )}
      {document.sections.map((section) => (
        <section key={section.title}>
          <h3>{section.title}</h3>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}
    </div>
  );
}
