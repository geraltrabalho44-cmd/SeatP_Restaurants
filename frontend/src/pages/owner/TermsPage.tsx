// The owner's "Terms and privacy" page: SeatPlan writes the terms every diner accepts on the last step of a
// booking; the restaurant can add its own words under them (a contact for data requests, house rules).
import { useState } from "react";
import { useParams } from "react-router-dom";
import { getOwnerTerms, saveOwnerTerms } from "../../api/legal";
import type { OwnerTerms } from "../../api/legal";
import { Button, ErrorState, Skeleton, useToast } from "../../design/components";
import { TermsText } from "../restaurant/ConsentBoxes";
import { errorMessage } from "../restaurant/format";
import { useLoad } from "../restaurant/useLoad";
import { OwnerShell } from "./OwnerShell";
import "./owner.css";

export default function TermsPage() {
  const { venueId = "" } = useParams();
  const { state, reload, setData } = useLoad(() => getOwnerTerms(venueId), venueId);
  return (
    <OwnerShell title="Terms and privacy" venueId={venueId} current="terms">
      <div className="ow-page-head">
        <div>
          <h1 className="ow-title">Terms and privacy</h1>
          <p className="rb-muted">Guests accept these terms on the last step of every booking. You can add your own words under them.</p>
        </div>
      </div>
      {state.status === "loading" && <Skeleton label="Loading your terms" lines={4} />}
      {state.status === "error" && <ErrorState message="Could not open your terms. Check your sign-in or retry." onRetry={() => reload()} />}
      {state.status === "ready" && <TermsForm key={venueId} venueId={venueId} terms={state.data} onSaved={setData} />}
    </OwnerShell>
  );
}

function TermsForm({ venueId, terms, onSaved }: { venueId: string; terms: OwnerTerms; onSaved: (terms: OwnerTerms) => void }) {
  const toast = useToast();
  const [text, setText] = useState(terms.extra_text);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const save = async (): Promise<void> => {
    setBusy(true);
    setProblem(null);
    try {
      onSaved(await saveOwnerTerms(venueId, text));
      toast.show("Saved. New bookings see your words.", "success");
    } catch (failure) {
      setProblem(errorMessage(failure, "We could not save your words. Please try again."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <p className="rb-notice rb-notice-warning" role="note">
        <strong>Draft wording.</strong> SeatPlan wrote these terms as a starting point. Have a lawyer review them before you rely on them. You are responsible for your guests&apos; data; SeatPlan stores and sends it on your behalf.
      </p>
      <section className="owner-card" aria-label="Your words">
        <div className="owner-card-body">
          <label htmlFor="ow-terms-extra" className="ow-subtitle">
            Your own words (optional)
          </label>
          <textarea id="ow-terms-extra" className="ow-textarea" rows={6} maxLength={terms.max_length} value={text} onChange={(event) => setText(event.target.value)} />
          <p className="rb-muted">
            For example, who guests contact to see or delete their data, and your house rules. {text.length} of {terms.max_length} characters. Separate paragraphs with a blank line.
          </p>
          {problem && (
            <p className="rb-notice rb-notice-error" role="alert">
              {problem}
            </p>
          )}
          <div className="rb-actions">
            <Button busy={busy} onClick={() => void save()}>
              Save your words
            </Button>
          </div>
        </div>
      </section>
      <section className="owner-card" aria-label="What guests read">
        <div className="owner-card-body">
          <h2 className="ow-subtitle">What guests read</h2>
          <TermsText document={terms.document} />
        </div>
      </section>
    </>
  );
}
