// A full slot is not a dead end: the diner can join the waitlist and sees
// their position and an estimated wait straight away.
import { useState } from "react";
import type { FormEvent } from "react";
import { joinWaitlist } from "../../api/restaurant";
import type { PartyNeeds, WaitlistAnswer } from "../../api/restaurant";
import { Button, Dialog, Field } from "../../design/components";
import { useT } from "../../i18n/I18nProvider";
import { errorMessage, formatDate, people } from "./format";
import { emailError, nameError } from "./validation";

interface WaitlistDialogProps {
  venueId: string;
  needs: PartyNeeds;
  /** The full time the diner wanted, or null when the dialog is closed. */
  time: string | null;
  onClose: () => void;
}

export function WaitlistDialog({ venueId, needs, time, onClose }: WaitlistDialogProps) {
  const { t } = useT();
  const [joined, setJoined] = useState<{ answer: WaitlistAnswer; email: string } | null>(null);
  const close = (): void => {
    setJoined(null);
    onClose();
  };
  const title = joined ? t("You are on the waitlist") : t("{time} is full", { time: time ?? "" });
  return (
    <Dialog open={time !== null} title={title} onClose={close} actions={joined ? <Button onClick={close}>{t("Done")}</Button> : undefined}>
      {joined ? (
        <WaitlistResult answer={joined.answer} email={joined.email} />
      ) : (
        <WaitlistForm venueId={venueId} needs={needs} time={time ?? ""} onCancel={close} onJoined={(answer, email) => setJoined({ answer, email })} />
      )}
    </Dialog>
  );
}

interface WaitlistFormProps {
  venueId: string;
  needs: PartyNeeds;
  time: string;
  onCancel: () => void;
  onJoined: (answer: WaitlistAnswer, email: string) => void;
}

function WaitlistForm({ venueId, needs, time, onCancel, onJoined }: WaitlistFormProps) {
  const { t } = useT();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  // Errors appear after the first submit, not while the diner is still typing.
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setShowErrors(true);
    if (nameError(name) || emailError(email)) return;
    setBusy(true);
    setProblem(null);
    try {
      const entry = { date: needs.date, time, party: needs.party, name: name.trim(), email: email.trim() };
      onJoined(await joinWaitlist(venueId, entry), email.trim());
    } catch (error) {
      setProblem(errorMessage(error, t("We could not add you to the waitlist. Please try again.")));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="rb-form">
      <p>
        {t("Every table for {people} at {time} on {date} is booked. Join the waitlist and we will email you if one frees up.", { people: people(needs.party), time, date: formatDate(needs.date) })}
      </p>
      <Field label={t("Name")} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={showErrors ? nameError(name) : null} />
      <Field label={t("Email")} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={showErrors ? emailError(email) : null} />
      {problem && (
        <p className="rb-notice rb-notice-error" role="alert">
          {problem}
        </p>
      )}
      <div className="rb-actions">
        <Button variant="ghost" onClick={onCancel}>
          {t("Not now")}
        </Button>
        <Button type="submit" busy={busy}>
          {t("Join the waitlist")}
        </Button>
      </div>
    </form>
  );
}

function WaitlistResult({ answer, email }: { answer: WaitlistAnswer; email: string }) {
  const { t } = useT();
  return (
    <div role="status">
      <p className="rb-big-number">
        {t("You are number")} <strong className="tabular">{answer.position}</strong> {t("in the queue.")}
      </p>
      <p>
        {t("Estimated wait: about")} <strong>{t("{n} minutes", { n: answer.estimated_wait_minutes })}</strong>. {t("We will write to {email} if a table frees up. You do not need to keep this page open.", { email })}
      </p>
    </div>
  );
}
