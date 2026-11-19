import { useState } from "react";
import type { ServicePeriod } from "../../api/restaurant";
import { Button, Checkbox, Dialog, Field, Select } from "../../design/components";
import type { Message } from "../../i18n/catalogue";
import { useT } from "../../i18n/I18nProvider";
import { SLOT_LENGTHS, WEEKDAYS, scheduleProblems } from "../restaurant/scheduleRules";
import { NEW_SERVICE } from "../restaurant/StaffSchedule";

interface ServiceGroup {
  service: ServicePeriod;
  days: number[];
  indexes: number[];
}

function groupServices(services: ServicePeriod[]): ServiceGroup[] {
  const groups = new Map<string, ServiceGroup>();
  services.forEach((service, index) => {
    const { weekday, name, start_time, end_time, slot_minutes, max_covers_per_slot } = service;
    const key = JSON.stringify([name, start_time, end_time, slot_minutes, max_covers_per_slot]);
    const group = groups.get(key) ?? { service, days: [], indexes: [] };
    group.days.push(weekday);
    group.indexes.push(index);
    groups.set(key, group);
  });
  return [...groups.values()];
}

export function WeeklyServices({ services, onChange }: { services: ServicePeriod[]; onChange: (services: ServicePeriod[]) => void }) {
  const { t } = useT();
  const [editing, setEditing] = useState<ServiceGroup | null>(null);
  const replace = (rows: ServicePeriod[]): void => {
    const indexes = editing?.indexes ?? [];
    onChange(indexes.length ? services.flatMap((service, index) =>
      index === indexes[0] ? rows : indexes.includes(index) ? [] : [service]) : [...services, ...rows]);
    setEditing(null);
  };
  return (
    <section id="st-services" className="rb-card ow-checks" aria-labelledby="weekly-services">
      <h2 id="weekly-services" className="ow-card-title">{t("Weekly services")}</h2>
      {services.length === 0 && <p className="rb-muted">{t("Add the first service guests can book.")}</p>}
      <ul className="ow-services">
        {groupServices(services).map((group) => (
          <li key={group.indexes[0]}>
            <div>
              <strong>{group.service.name || t("Unnamed service")}</strong>
              <p className="rb-muted">{[...new Set(group.days)].sort().map((day) => t(WEEKDAYS[day] as Message).slice(0, 3)).join(", ")} · {group.service.start_time}–{group.service.end_time}</p>
            </div>
            <Button variant="secondary" aria-label={t("Edit {name}", { name: group.service.name || t("unnamed service") })} onClick={() => setEditing(group)}>{t("Edit")}</Button>
          </li>
        ))}
      </ul>
      <div><Button variant="secondary" onClick={() => setEditing({ service: NEW_SERVICE, days: [], indexes: [] })}>{t("Add a service")}</Button></div>
      {editing && <ServiceDialog group={editing} onSave={replace} onClose={() => setEditing(null)} />}
    </section>
  );
}

function ServiceDialog({ group, onSave, onClose }: {
  group: ServiceGroup;
  onSave: (services: ServicePeriod[]) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [service, setService] = useState(group.service);
  const [days, setDays] = useState([...new Set(group.days)]);
  const [problem, setProblem] = useState("");
  const change = (patch: Partial<ServicePeriod>): void => { setService((previous) => ({ ...previous, ...patch })); setProblem(""); };
  return (
    <Dialog open title={group.indexes.length ? t("Edit {name}", { name: group.service.name || t("service") }) : t("Add a service")} onClose={onClose} actions={<>
      <Button variant="secondary" onClick={onClose}>{t("Cancel")}</Button>
      {group.indexes.length > 0 && <Button variant="danger" onClick={() => onSave([])}>{t("Remove service")}</Button>}
      <Button type="submit" form="ow-service-form">{t("Save service")}</Button>
    </>}>
      <form id="ow-service-form" className="ow-service-form" onSubmit={(event) => {
        event.preventDefault();
        if (days.length === 0) { setProblem(t("Choose at least one day.")); return; }
        const rows = days.slice().sort().map((weekday) => ({ ...service, name: service.name.trim(), weekday }));
        const [first] = scheduleProblems({ services: rows, turn_times: [], blackout_dates: [] });
        if (first) { setProblem(first); return; }
        onSave(rows);
      }}>
        <Field label={t("Service name")} value={service.name} required onChange={(event) => change({ name: event.target.value })} />
        <div className="ow-service-times">
          <Field type="time" label={t("Opens")} value={service.start_time} step={900} required onChange={(event) => change({ start_time: event.target.value })} />
          <Field type="time" label={t("Last slot ends")} value={service.end_time} step={900} required onChange={(event) => change({ end_time: event.target.value })} />
        </div>
        <fieldset className="ow-service-days"><legend>{t("Days")}</legend>
          {WEEKDAYS.map((day, index) => <Checkbox key={day} label={t(day as Message)} checked={days.includes(index)} onChange={(event) => {
            setDays(event.currentTarget.checked ? [...days, index] : days.filter((value) => value !== index));
            setProblem("");
          }} />)}
        </fieldset>
        <details className="ow-booking-rules">
          <summary>{t("Booking rules")}</summary>
          <Select label={t("Slot length")} value={String(service.slot_minutes)} options={SLOT_LENGTHS.map((minutes) => ({ value: String(minutes), label: t("{n} min", { n: minutes }) }))} onChange={(event) => change({ slot_minutes: Number(event.target.value) })} />
          <Field type="number" label={t("Covers per slot")} value={service.max_covers_per_slot} min={1} required onChange={(event) => change({ max_covers_per_slot: Number(event.target.value) })} />
        </details>
        {problem && <p role="alert" className="rb-notice rb-notice-warning">{problem}</p>}
      </form>
    </Dialog>
  );
}
