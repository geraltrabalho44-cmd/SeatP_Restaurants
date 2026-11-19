// Turns the services of a restaurant into the short weekly table of the public
// page: "Tue-Sun: 12:00-15:00, 19:00-23:00" and "Mon: Closed". Pure, so it is
// easy to test. Weekdays count from Monday = 0, like the server.
import type { ServicePeriod } from "../../api/restaurant";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface ScheduleRow {
  days: string;
  hours: string;
}

function dayRange(first: number, last: number, days:readonly string[]): string {
  if (first === last) return days[first];
  if (last - first === 1) return `${days[first]}, ${days[last]}`;
  return `${days[first]}-${days[last]}`;
}

/** One row per run of consecutive days with the same hours; closed days are rows too. */
export function weeklyRows(periods: Pick<ServicePeriod, "weekday" | "start_time" | "end_time">[], locale="en-GB"): ScheduleRow[] {
  const days=locale==="en-GB"?DAYS:DAYS.map((_,i)=>new Intl.DateTimeFormat(locale,{weekday:"short"}).format(new Date(2024,0,1+i)));
  const hoursOf = DAYS.map((_, weekday) =>
    periods
      .filter((p) => p.weekday === weekday)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .map((p) => `${p.start_time}-${p.end_time}`)
      .join(", "),
  );
  if (hoursOf.every((h) => h === "")) return [];
  const rows: ScheduleRow[] = [];
  let first = 0;
  for (let day = 1; day <= DAYS.length; day += 1) {
    if (day === DAYS.length || hoursOf[day] !== hoursOf[first]) {
      rows.push({ days: dayRange(first, day - 1,days), hours: hoursOf[first] || "Closed" });
      first = day;
    }
  }
  return rows;
}
