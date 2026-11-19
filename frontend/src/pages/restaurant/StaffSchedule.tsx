// The schedule tab: services (opening hours and slot length), turn times
// (how long a party of each size stays) and closed days. Staff edit a draft;
// nothing changes for diners until Save.
import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { getSchedule, saveSchedule } from "../../api/restaurant";
import type { Schedule, ServicePeriod } from "../../api/restaurant";
import { Button, ErrorState, Skeleton, useToast } from "../../design/components";
import type { Message } from "../../i18n/catalogue";
import { useT } from "../../i18n/I18nProvider";
import { errorMessage, needsSignIn } from "./format";
import { SLOT_LENGTHS, WEEKDAYS, removeAt, scheduleProblems, updateAt } from "./scheduleRules";
import { SignInPrompt } from "./SignInPrompt";
import { useLoad } from "./useLoad";

export function StaffSchedule({ venueId }: { venueId: string }) {
  const { t } = useT();
  const { state, reload, setData } = useLoad(() => getSchedule(venueId), venueId);
  if (state.status === "loading") return <Skeleton lines={6} label={t("Loading the schedule")} />;
  if (state.status === "error") {
    if (needsSignIn(state.error)) return <SignInPrompt venueId={venueId} />;
    return <ErrorState title={t("We could not load the schedule")} message={errorMessage(state.error)} onRetry={() => reload()} />;
  }
  return <ScheduleEditor venueId={venueId} saved={state.data} onSaved={setData} />;
}

export const NEW_SERVICE: ServicePeriod = { name: "", weekday: 0, start_time: "12:00", end_time: "15:00", slot_minutes: 15, max_covers_per_slot: 20 };

interface ServicesProps {
  services: ServicePeriod[];
  onChange: (services: ServicePeriod[]) => void;
}

export function ScheduleEditor({ venueId, saved, onSaved, servicesEditor: Services = ServicesEditor, heading = true }: {
  venueId: string;
  saved: Schedule;
  onSaved: (schedule: Schedule) => void;
  servicesEditor?: ComponentType<ServicesProps>;
  /** The "Weekly schedule" heading and section links of the staff tab; the owner Hours page has its own heading. */
  heading?: boolean;
}) {
  const { t } = useT();
  const toast = useToast();
  const [draft, setDraft] = useState<Schedule>(saved);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const problems = scheduleProblems(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent): void => {event.preventDefault();event.returnValue = "";};
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const save = async (): Promise<void> => {
    setBusy(true);
    setProblem(null);
    try {
      const result = await saveSchedule(venueId, draft);
      onSaved(result);
      setDraft(result);
      toast.show(t("Schedule saved."), "success");
    } catch (error) {
      setProblem(errorMessage(error, t("We could not save the schedule. Your draft is still here.")));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="st-schedule">
      {heading && <header className="st-schedule-heading"><h2>{t("Weekly schedule")}</h2><p className="rb-muted">{t("Recurring opening hours for every week. The Day selector above only changes the floor and daily reports.")}</p><nav aria-label={t("Schedule sections")}><a href="#st-services">{t("Services")}</a><a href="#st-turn-times">{t("Turn times")}</a><a href="#st-closed-days">{t("Closed days")}</a></nav></header>}
      <div className="rb-actions st-schedule-save">
        <span role="status">{dirty ? t("Unsaved changes") : t("All changes saved")}</span>
        <Button variant="secondary" disabled={busy || !dirty} onClick={() => setDraft(saved)}>{t("Undo my changes")}</Button>
        <Button busy={busy} disabled={!dirty || problems.length > 0} onClick={() => void save()}>{t("Save schedule")}</Button>
      </div>
      <fieldset className="st-schedule-fields" disabled={busy}><legend className="visually-hidden">{t("Weekly schedule draft")}</legend>
      <Services services={draft.services} onChange={(services) => setDraft({ ...draft, services })} />
      <TurnTimesEditor draft={draft} onChange={setDraft} />
      <BlackoutEditor draft={draft} onChange={setDraft} />
      </fieldset>
      {problems.length > 0 && (
        <div className="rb-notice rb-notice-warning" role="status">
          <p>{t("Fix these before saving:")}</p>
          <ul>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {problem && (
        <p className="rb-notice rb-notice-error" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}

function ServicesEditor({ services, onChange }: ServicesProps) {
  const { t } = useT();
  return (
    <section id="st-services" className="rb-card">
      <h2 className="rb-service-title">{t("Services")}</h2>
      <p className="rb-muted st-small">{t("Capacity is guests arriving per slot. For example, 20 covers per 15 minutes; it is not the number of tables.")}</p>
      <div className="st-table-wrap">
        <table className="st-table">
          <thead>
            <tr>
              <th scope="col">{t("Name")}</th>
              <th scope="col">{t("Day")}</th>
              <th scope="col">{t("Opens")}</th>
              <th scope="col">{t("Last slot ends")}</th>
              <th scope="col">{t("Slot length")}</th>
              <th scope="col">{t("Covers per slot")}</th>
              <th scope="col">
                <span className="visually-hidden">{t("Remove")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {services.map((service, i) => (
              <ServiceRow key={i} index={i} service={service} onChange={(patch) => onChange(updateAt(services, i, patch))} onRemove={() => onChange(removeAt(services, i))} />
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="secondary" onClick={() => onChange([...services, NEW_SERVICE])}>
        {t("Add a service")}
      </Button>
    </section>
  );
}

interface ServiceRowProps {
  index: number;
  service: ServicePeriod;
  onChange: (patch: Partial<ServicePeriod>) => void;
  onRemove: () => void;
}

function ServiceRow({ index, service, onChange, onRemove }: ServiceRowProps) {
  const { t } = useT();
  const label = (what: Message): string => `${t(what)}, ${service.name || t("service {n}", { n: index + 1 })}`;
  const problems = scheduleProblems({services:[service],turn_times:[],blackout_dates:[]}, index + 1);
  return (
    <><tr aria-describedby={problems.length ? `st-service-error-${index}` : undefined}>
      <td>
        <input className="field-input" aria-label={label("Name")} value={service.name} onChange={(e) => onChange({ name: e.target.value })} />
      </td>
      <td>
        <select className="field-input" aria-label={label("Day")} value={service.weekday} onChange={(e) => onChange({ weekday: Number(e.target.value) })}>
          {WEEKDAYS.map((day, d) => (
            <option key={day} value={d}>
              {t(day as Message)}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input className="field-input" type="time" step={900} aria-label={label("Opens")} value={service.start_time} onChange={(e) => onChange({ start_time: e.target.value })} />
      </td>
      <td>
        <input className="field-input" type="time" step={900} aria-label={label("Last slot ends")} value={service.end_time} onChange={(e) => onChange({ end_time: e.target.value })} />
      </td>
      <td>
        <select className="field-input" aria-label={label("Slot length")} value={service.slot_minutes} onChange={(e) => onChange({ slot_minutes: Number(e.target.value) })}>
          {SLOT_LENGTHS.map((m) => (
            <option key={m} value={m}>
              {t("{n} min", { n: m })}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input className="field-input" type="number" min={1} aria-label={label("Covers per slot")} value={service.max_covers_per_slot} onChange={(e) => onChange({ max_covers_per_slot: Number(e.target.value) })} />
      </td>
      <td>
        <Button variant="ghost" onClick={onRemove}>
          {t("Remove")}<span className="visually-hidden"> {service.name || t("service {n}", { n: index + 1 })}</span>
        </Button>
      </td>
    </tr>{problems.length > 0 && <tr className="st-service-errors"><td colSpan={7} id={`st-service-error-${index}`}><ul>{problems.map(problem => <li key={problem}>{problem}</li>)}</ul></td></tr>}</>
  );
}

function TurnTimesEditor({ draft, onChange }: { draft: Schedule; onChange: (s: Schedule) => void }) {
  const { t } = useT();
  const turns = draft.turn_times;
  const set = (next: Schedule["turn_times"]): void => onChange({ ...draft, turn_times: next });
  return (
    <section id="st-turn-times" className="rb-card">
      <h2 className="rb-service-title">{t("Turn times")}</h2>
      <p className="rb-muted st-small">{t("How long a party stays at the table. Each row covers parties up to that size.")}</p>
      <ul className="st-rows">
        {turns.map((turn, i) => (
          <li key={i} className="st-inline">
            <label className="st-inline-label">
              {t("Up to")} <input className="field-input st-num" type="number" min={1} value={turn.max_party} onChange={(e) => set(updateAt(turns, i, { max_party: Number(e.target.value) }))} /> {t("people")}
            </label>
            <label className="st-inline-label">
              {t("stay")} <input className="field-input st-num" type="number" min={15} step={15} value={turn.minutes} onChange={(e) => set(updateAt(turns, i, { minutes: Number(e.target.value) }))} /> {t("minutes")}
            </label>
            <Button variant="ghost" onClick={() => set(removeAt(turns, i))}>
              {t("Remove")}<span className="visually-hidden"> {t("turn time for up to {n}", { n: turn.max_party })}</span>
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="secondary" onClick={() => set([...turns, { max_party: 8, minutes: 90 }])}>
        {t("Add a turn time")}
      </Button>
    </section>
  );
}

function BlackoutEditor({ draft, onChange }: { draft: Schedule; onChange: (s: Schedule) => void }) {
  const { t } = useT();
  const days = draft.blackout_dates;
  const set = (next: Schedule["blackout_dates"]): void => onChange({ ...draft, blackout_dates: next });
  return (
    <section id="st-closed-days" className="rb-card">
      <h2 className="rb-service-title">{t("Closed days")}</h2>
      <p className="rb-muted st-small">{t("Diners see the reason when they pick that date.")}</p>
      <ul className="st-rows">
        {days.map((day, i) => (
          <li key={i} className="st-inline">
            <input className="field-input" type="date" aria-label={t("Closed day {n}, date", { n: i + 1 })} value={day.date} onChange={(e) => set(updateAt(days, i, { date: e.target.value }))} />
            <input className="field-input" aria-label={t("Closed day {n}, reason", { n: i + 1 })} placeholder={t("Reason, e.g. Private event")} value={day.reason} onChange={(e) => set(updateAt(days, i, { reason: e.target.value }))} />
            <Button variant="ghost" onClick={() => set(removeAt(days, i))}>
              {t("Remove")}<span className="visually-hidden"> {t("closed day {date}", { date: day.date })}</span>
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="secondary" onClick={() => set([...days, { date: "", reason: "" }])}>
        {t("Add a closed day")}
      </Button>
    </section>
  );
}
