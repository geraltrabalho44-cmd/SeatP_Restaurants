// On the booking page: the diner's own choice about offers from the restaurant, changeable at any time.
import { useState } from "react";
import { setOffers } from "../../api/legal";
import { Checkbox } from "../../design/components";
import { errorMessage } from "./format";

export function OffersChoice({ token, restaurant, initial }: { token: string; restaurant: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const change = async (next: boolean): Promise<void> => {
    // Shown at once, then confirmed by the server; put back if it could not be saved.
    setOn(next);
    setBusy(true);
    setProblem(null);
    try {
      const saved = await setOffers(token, next);
      setOn(saved.offers);
    } catch (failure) {
      setOn(!next);
      setProblem(errorMessage(failure, "We could not save your choice. Please try again."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rb-card rb5-change" aria-label="Offers">
      <h2 className="rb5-card-title">Offers from {restaurant}</h2>
      <Checkbox label="Send me offers and news" hint="Only from this restaurant. You can change this at any time." checked={on} disabled={busy} onChange={(event) => void change(event.target.checked)} />
      {problem && (
        <p className="rb-notice rb-notice-error" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}
