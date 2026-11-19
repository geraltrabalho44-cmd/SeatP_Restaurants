// Checks for the schedule editor, as pure functions. The server checks again;
// these let staff see every problem before they press Save.
import type { Schedule } from "../../api/restaurant";
import { tr } from "../../i18n/locale";
import { toMinutes } from "./format";

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** Slot lengths must be whole 15-minute blocks, because tables are booked in 15-minute slots. */
export const SLOT_LENGTHS = [15, 30, 45, 60];

/**
 * Returns one plain sentence per problem; an empty list means the schedule can be saved.
 * `firstNumber` is the number of the first service in the list, for a check of one row of a longer list.
 */
export function scheduleProblems(schedule: Schedule, firstNumber = 1): string[] {
  const problems: string[] = [];
  schedule.services.forEach((service, i) => {
    const number = i + firstNumber;
    const name = service.name.trim() || tr("Service {n}", { n: number });
    if (service.name.trim() === "") problems.push(tr("Service {n} needs a name, for example Lunch.", { n: number }));
    if (toMinutes(service.end_time) <= toMinutes(service.start_time)) problems.push(tr("{name} on {day} ends before it starts.", { name, day: tr(WEEKDAYS[service.weekday]) }));
    if (service.max_covers_per_slot < 1) problems.push(tr("{name} needs at least 1 cover per slot.", { name }));
  });
  schedule.turn_times.forEach((turn) => {
    if (turn.max_party < 1 || turn.minutes < 15) problems.push(tr("Turn time for up to {n} people must be at least 15 minutes.", { n: turn.max_party }));
  });
  schedule.blackout_dates.forEach((blackout, i) => {
    if (blackout.date === "") problems.push(tr("Closed day {n} needs a date.", { n: i + 1 }));
    if (blackout.reason.trim() === "") problems.push(tr("Closed day {day} needs a reason; diners will see it.", { day: blackout.date || i + 1 }));
  });
  return problems;
}

/** A copy of `list` with item `index` changed, for immutable React state. */
export function updateAt<T>(list: T[], index: number, patch: Partial<T>): T[] {
  return list.map((item, i) => (i === index ? { ...item, ...patch } : item));
}

export function removeAt<T>(list: T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}
