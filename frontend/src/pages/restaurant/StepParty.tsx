// Step 1: date, party size and needs. Nothing is sent yet; we only check
// what we already know (closed weekdays and blackout dates) so the diner
// hears "closed" before choosing a time, not after.
import type { FormEvent } from "react";
import type { PartyNeeds, RestaurantInfo } from "../../api/restaurant";
import { Button, Checkbox, Field, Select } from "../../design/components";
import type { SelectOption } from "../../design/components";
import { useT } from "../../i18n/I18nProvider";
import { tr } from "../../i18n/locale";
import { formatDate, people, todayIso, weekdayName } from "./format";
import { PREF_OPTIONS, togglePref } from "./prefs";
import "./when.css";
import { StepHeading } from "./StepHeading";
interface StepPartyProps {
  info: RestaurantInfo;
  needs: PartyNeeds;
  onChange: (needs: PartyNeeds) => void;
  onNext: () => void;
  focusOnMount: boolean;
}
/** Python's weekday(): Monday is 0. JavaScript's getDay(): Sunday is 0. */
export function pythonWeekday(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  const jsDay = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1).getDay();
  return (jsDay + 6) % 7;
}
/** Why the restaurant is closed on this date, or null when it is open. */
export function closedReason(info: RestaurantInfo, date: string): string | null {
  const blackout = info.blackout_dates.find((b) => b.date === date);
  if (blackout) return tr("Closed on {date}: {reason}.", { date: formatDate(date), reason: blackout.reason });
  const open = info.services.some((s) => s.weekday === pythonWeekday(date));
  if (!open && info.services.length > 0) return tr("{name} is closed on {weekday}s.", { name: info.name, weekday: weekdayName(date) });
  return null;
}
/** The party sizes on offer: always 1 to 10, whatever the restaurant's tables are. A party its tables cannot seat is told so by the server. */
export const PARTY_CHOICES = 10;
function partyOptions(): SelectOption[] {
  return Array.from({ length: PARTY_CHOICES }, (_, i) => ({ value: String(i + 1), label: people(i + 1) }));
}
const highChairOptions = (): SelectOption[] => [
  { value: "0", label: tr("No high chair") },
  { value: "1", label: tr("1 high chair") },
  { value: "2", label: tr("2 high chairs") },
  { value: "3", label: tr("3 high chairs") },
];
export function StepParty({ info, needs, onChange, onNext, focusOnMount }: StepPartyProps) {
  const { t } = useT();
  const closed = needs.date === "" ? null : closedReason(info, needs.date);
  const dateMissing = needs.date === "";
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!closed && !dateMissing) onNext();
  };
  return (
    <form className="rb-step when-party" onSubmit={submit} noValidate>
      <StepHeading focusOnMount={focusOnMount}>{t("When would you like to visit?")}</StepHeading>
      <WhenFields info={info} needs={needs} onChange={onChange} />
      <div className="rb-actions">
        <Button type="submit" disabled={closed !== null || dateMissing}>
          {t("See free times")}
        </Button>
      </div>
    </form>
  );
}
export function WhenFields({info, needs, onChange}: Pick<StepPartyProps,"info"|"needs"|"onChange">) {
 const { t } = useT();
 const closed=needs.date ? closedReason(info,needs.date):null;
 const dateMissing=needs.date === "";
 return <div className="when-fields">
      <Field
        label={t("Date")}
        type="date"
        min={todayIso()}
        value={needs.date}
        onChange={(e) => onChange({ ...needs, date: e.target.value })}
        error={dateMissing ? t("Choose a date to see the free times.") : null}
        required
      />
      {closed && (
        <p className="rb-notice rb-notice-closed" role="status">
          <strong>{t("Closed that day.")}</strong> {closed} {t("Please pick another date.")}
        </p>
      )}
      <Select
        label={t("Party size")}
        options={partyOptions()}
        value={String(needs.party)}
        onChange={(e) => onChange({ ...needs, party: Number(e.target.value) })}
      />
      <details className="when-requirements" open={needs.needs_accessible || needs.high_chairs>0 || (needs.prefs?.length ?? 0)>0 ? true : undefined}><summary>{t("Access needs and table preferences")}</summary>
      <fieldset className="rb-needs">
        <legend className="field-label">{t("Anything we should know?")}</legend>
        <Checkbox
          label={t("Someone needs an accessible table")}
          hint={t("Step-free access and room for a wheelchair")}
          checked={needs.needs_accessible}
          onChange={(e) => onChange({ ...needs, needs_accessible: e.target.checked })}
        />
        <Select
          label={t("High chairs for small children")}
          options={highChairOptions()}
          value={String(needs.high_chairs)}
          onChange={(e) => onChange({ ...needs, high_chairs: Number(e.target.value) })}
        />
      </fieldset>
      <fieldset className="rb-needs">
        <legend className="field-label">{t("What would you like your table to be like? (optional)")}</legend>
        <p className="rb-muted">{t("We will suggest a table that fits when we can. Wishes never take a table away from a bigger party.")}</p>
        {PREF_OPTIONS.map((option) => (
          <Checkbox
            key={option.key}
            label={option.label}
            checked={(needs.prefs ?? []).includes(option.key)}
            onChange={(e) => onChange({ ...needs, prefs: togglePref(needs.prefs, option.key, e.target.checked) })}
          />
        ))}
      </fieldset>
      </details>
 </div>;
}
