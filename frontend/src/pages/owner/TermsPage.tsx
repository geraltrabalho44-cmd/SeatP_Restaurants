// The owner's "Terms and privacy" page: SeatPlan writes the terms every diner accepts on the last step of a
// booking; the restaurant can add its own words under them (a contact for data requests, house rules).
import { useState } from "react";
import { useParams } from "react-router-dom";
import { getOwnerTerms, saveOwnerTerms } from "../../api/legal";
import type { OwnerTerms } from "../../api/legal";
import { Button, ErrorState, Skeleton, useToast } from "../../design/components";
import { useT } from "../../i18n/I18nProvider";
import { TermsText } from "../restaurant/ConsentBoxes";
import { errorMessage } from "../restaurant/format";
import { useLoad } from "../restaurant/useLoad";
import { OwnerShell } from "./OwnerShell";
import "./owner.css";

export default function TermsPage() {
  const { t } = useT();
  const { venueId = "" } = useParams();
  const { state, reload, setData } = useLoad(() => getOwnerTerms(venueId), venueId);
  return (
    <OwnerShell title={t("Terms and privacy")} venueId={venueId} current="terms">
      <div className="ow-page-head">
        <div>
          <h1 className="ow-title">{t("Terms and privacy")}</h1>
          <p className="rb-muted">{t("Guests accept these terms on the last step of every booking. You can add your own words under them.")}</p>
        </div>
      </div>
      {state.status === "loading" && <Skeleton label={t("Loading your terms")} lines={4} />}
      {state.status === "error" && <ErrorState message={t("Could not open your terms. Check your sign-in or retry.")} onRetry={() => reload()} />}
      {state.status === "ready" && <TermsForm key={venueId} venueId={venueId} terms={state.data} onSaved={setData} />}
    </OwnerShell>
  );
}

function TermsForm({ venueId, terms, onSaved }: { venueId: string; terms: OwnerTerms; onSaved: (terms: OwnerTerms) => void }) {
  const { t } = useT();
  const toast = useToast();
  const [text, setText] = useState(terms.extra_text);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const save = async (): Promise<void> => {
    setBusy(true);
    setProblem(null);
    try {
      onSaved(await saveOwnerTerms(venueId, text));
      toast.show(t("Saved. New bookings see your words."), "success");
    } catch (failure) {
      setProblem(errorMessage(failure, t("We could not save your words. Please try again.")));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ow-stack">
      <p className="rb-notice rb-notice-warning" role="note">
        <strong>{t("Draft wording.")}</strong> {t("SeatPlan wrote these terms as a starting point. Have a lawyer review them before you rely on them. You are responsible for your guests' data; SeatPlan stores and sends it on your behalf.")}
      </p>
      <section className="owner-card" aria-label={t("Your words")}>
        <div className="owner-card-body">
          <label htmlFor="ow-terms-extra" className="ow-subtitle">
            {t("Your own words (optional)")}
          </label>
          <textarea id="ow-terms-extra" className="ow-textarea" rows={6} maxLength={terms.max_length} value={text} onChange={(event) => setText(event.target.value)} />
          <p className="rb-muted">
            {t("For example, who guests contact to see or delete their data, and your house rules. {n} of {max} characters. Separate paragraphs with a blank line.", { n: text.length, max: terms.max_length })}
          </p>
          {problem && (
            <p className="rb-notice rb-notice-error" role="alert">
              {problem}
            </p>
          )}
          <div className="rb-actions">
            <Button busy={busy} onClick={() => void save()}>
              {t("Save your words")}
            </Button>
          </div>
        </div>
      </section>
      <section className="owner-card ow-terms-read" aria-label={t("What guests read")}>
        <div className="owner-card-body">
          <h2 className="ow-subtitle">{t("What guests read")}</h2>
          <TermsText document={terms.document} />
        </div>
      </section>
    </div>
  );
}
