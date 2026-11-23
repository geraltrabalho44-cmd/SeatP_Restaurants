// The owner's numbers about their own restaurant, in three tabs: an overview (how many bookings, how
// many no-shows, when the restaurant fills), the busiest tables on the floor plan, and the guest book
// (who comes, how often, who stopped coming). It only shows what the restaurant already has.
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PERIODS, getGuests, getInsights } from "../../api/insights";
import type { GuestQuery, GuestRow, GuestSort, GuestsView, InsightsView, Overview, Period, Segment, TableDemand, TablesView } from "../../api/insights";
import { Badge, ErrorState, Field, Select, Skeleton } from "../../design/components";
import type { Message } from "../../i18n/catalogue";
import { useT } from "../../i18n/I18nProvider";
import { formatDate } from "../restaurant/format";
import { useLoad } from "../restaurant/useLoad";
import { HEAT_FILLS, heatFill, heatText, percent } from "./heat";
import { OwnerShell } from "./OwnerShell";
import "./owner.css";

type Tab = "overview" | "tables" | "guests";
const TABS: { key: Tab; label: Message }[] = [
  { key: "overview", label: "Overview" },
  { key: "tables", label: "Busiest tables" },
  { key: "guests", label: "Guests" },
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export default function InsightsPage() {
  const { t } = useT();
  const { venueId = "" } = useParams();
  const [tab, setTab] = useState<Tab>("overview");
  const [days, setDays] = useState<Period>(90);
  const { state, reload } = useLoad(() => getInsights(venueId, days), `${venueId}-${days}`);
  return (
    <OwnerShell title={t("Insights")} venueId={venueId} current="insights">
      <div className="ow-page-head">
        <div>
          <h1 className="ow-title">{t("Insights")}</h1>
          <p className="rb-muted">{t("What your own bookings say about your restaurant: who comes, when, and which tables people choose.")}</p>
        </div>
        {tab !== "guests" && (
          <Select label={t("Period")} value={String(days)} options={PERIODS.map((value) => ({ value: String(value), label: t("Last {n} days", { n: value }) }))} onChange={(event) => setDays(Number(event.target.value) as Period)} />
        )}
      </div>
      <div role="tablist" aria-label={t("Insights")} className="ow-tabs">
        {TABS.map((item) => (
          <button key={item.key} role="tab" type="button" aria-selected={tab === item.key} className="ow-tab" onClick={() => setTab(item.key)}>
            {t(item.label)}
          </button>
        ))}
      </div>
      {tab !== "guests" && state.status === "loading" && <Skeleton label={t("Loading your numbers")} lines={5} />}
      {tab !== "guests" && state.status === "error" && <ErrorState message={t("Could not open your numbers. Check your sign-in or retry.")} onRetry={() => reload()} />}
      {tab === "overview" && state.status === "ready" && <OverviewTab data={(state.data as InsightsView).overview} />}
      {tab === "tables" && state.status === "ready" && <TablesTab data={(state.data as InsightsView).tables} />}
      {tab === "guests" && <GuestsTab venueId={venueId} />}
    </OwnerShell>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="ow-stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
      {note && <dd className="rb-muted ow-stat-note">{note}</dd>}
    </div>
  );
}

/** Bars drawn with the table below them: the numbers are always readable as text. */
function Bars({ rows, label }: { rows: { name: string; value: number }[]; label: string }) {
  const top = Math.max(1, ...rows.map((row) => row.value));
  return (
    <ul className="ow-bars" aria-label={label}>
      {rows.map((row) => (
        <li key={row.name}>
          <span className="ow-bar-name">{row.name}</span>
          <span className="ow-bar-track">
            <span className="ow-bar-fill" style={{ width: `${(row.value / top) * 100}%` }} />
          </span>
          <span className="ow-bar-value">{row.value}</span>
        </li>
      ))}
    </ul>
  );
}

function OverviewTab({ data }: { data: Overview }) {
  const { t } = useT();
  if (data.bookings === 0) {
    return (
      <section className="owner-card">
        <div className="owner-card-body">
          <p>{t("No bookings in the last {n} days yet. Your numbers appear here as soon as guests book.", { n: data.days })}</p>
        </div>
      </section>
    );
  }
  const hours = data.hours.map((row) => ({ name: `${String(row.hour).padStart(2, "0")}:00`, value: row.bookings }));
  return (
    <>
      <section className="owner-card" aria-label={t("Totals")}>
        <div className="owner-card-body">
          <dl className="ow-stats">
            <Stat label={t("Bookings")} value={String(data.bookings)} note={t("{n} guests in total", { n: data.covers })} />
            <Stat label={t("No-shows")} value={percent(data.no_show_rate)} note={t("{n} of the bookings that are over", { n: data.no_shows })} />
            <Stat label={t("Cancelled")} value={percent(data.cancel_rate)} note={t("{n} bookings", { n: data.cancelled })} />
            <Stat label={t("Average party")} value={data.average_party === null ? "–" : String(data.average_party)} note={t("guests per booking")} />
            <Stat label={t("Book ahead")} value={data.average_lead_days === null ? "–" : t("{n} days", { n: data.average_lead_days })} note={t("average, online bookings")} />
            <Stat label={t("Returning guests")} value={percent(data.returning_share)} note={t("booked here before, or more than once")} />
          </dl>
        </div>
      </section>
      <section className="owner-card" aria-label={t("Bookings by weekday")}>
        <div className="owner-card-body">
          <h2 className="ow-subtitle">{t("Bookings by weekday")}</h2>
          <Bars label={t("Bookings by weekday")} rows={data.weekdays.map((row) => ({ name: WEEKDAYS[row.weekday] ? t(WEEKDAYS[row.weekday]) : "", value: row.bookings }))} />
        </div>
      </section>
      <section className="owner-card" aria-label={t("Bookings by start time")}>
        <div className="owner-card-body">
          <h2 className="ow-subtitle">{t("When guests arrive")}</h2>
          <Bars label={t("Bookings by start hour")} rows={hours} />
        </div>
      </section>
    </>
  );
}

function PlanHeat({ tables }: { tables: TableDemand[] }) {
  const { t } = useT();
  if (tables.length === 0) return null;
  const pad = 30;
  const left = Math.min(...tables.map((table) => table.x)) - pad;
  const top = Math.min(...tables.map((table) => table.y)) - pad;
  const width = Math.max(...tables.map((table) => table.x + table.w)) + pad - left;
  const height = Math.max(...tables.map((table) => table.y + table.h)) + pad - top;
  return (
    <svg className="ow-plan" viewBox={`${left} ${top} ${width} ${height}`} role="img" aria-label={t("Floor plan coloured by how often each table was booked")}>
      {tables.map((table) => {
        const cx = table.x + table.w / 2;
        const cy = table.y + table.h / 2;
        const size = Math.max(14, Math.min(table.w, table.h) * 0.45);
        return (
          <g key={table.id} transform={`rotate(${table.rotation} ${cx} ${cy})`}>
            {table.shape === "round" ? (
              <ellipse cx={cx} cy={cy} rx={table.w / 2} ry={table.h / 2} fill={heatFill(table.heat)} stroke="#4f3f8f" strokeWidth={1.5} />
            ) : (
              <rect x={table.x} y={table.y} width={table.w} height={table.h} rx={6} fill={heatFill(table.heat)} stroke="#4f3f8f" strokeWidth={1.5} />
            )}
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={size} fontWeight={700} fill={heatText(table.heat)} transform={`rotate(${-table.rotation} ${cx} ${cy})`}>
              {table.bookings}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function TablesTab({ data }: { data: TablesView }) {
  const { t } = useT();
  const [room, setRoom] = useState<number | null>(data.rooms[0]?.id ?? null);
  if (data.total === 0) {
    return (
      <section className="owner-card">
        <div className="owner-card-body">
          <p>{t("No table has been booked in the last {n} days yet.", { n: data.days })}</p>
        </div>
      </section>
    );
  }
  const shown = data.rooms.length > 1 ? data.tables.filter((table) => table.room_id === room) : data.tables;
  const busiest = data.tables.filter((table) => data.top.includes(table.id));
  return (
    <>
      <section className="owner-card" aria-label={t("Most booked tables")}>
        <div className="owner-card-body">
          <h2 className="ow-subtitle">{t("The tables guests book most")}</h2>
          <ol className="ow-ranking">
            {busiest.map((table) => (
              <li key={table.id}>
                <strong>{table.label}</strong>{" "}
                <span className="rb-muted">
                  {table.bookings === 1 ? t("1 booking") : t("{n} bookings", { n: table.bookings })} · {t("{share} of all", { share: percent(table.share) })} · {t("seats {n}", { n: table.seats })}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className="owner-card" aria-label={t("Floor plan")}>
        <div className="owner-card-body">
          {data.rooms.length > 1 && (
            <div role="tablist" aria-label={t("Rooms")} className="ow-tabs">
              {data.rooms.map((item) => (
                <button key={item.id} role="tab" type="button" aria-selected={room === item.id} className="ow-tab" onClick={() => setRoom(item.id)}>
                  {item.name}
                </button>
              ))}
            </div>
          )}
          <PlanHeat tables={shown} />
          <p className="ow-legend" aria-label={t("Colour scale")}>
            <span className="rb-muted">{t("Booked less")}</span>
            {HEAT_FILLS.map((fill) => (
              <span key={fill} className="ow-swatch" style={{ background: fill }} aria-hidden="true" />
            ))}
            <span className="rb-muted">{t("Booked most. The number on each table is how many times it was booked.")}</span>
          </p>
        </div>
      </section>
    </>
  );
}

const SEGMENT_NAME: Record<Segment, Message> = { new: "New", regular: "Regulars", lapsed: "Haven't been in 60 days", no_shows: "Repeat no-shows", offers: "Accept offers" };

function GuestsTab({ venueId }: { venueId: string }) {
  const { t } = useT();
  const [query, setQuery] = useState<GuestQuery>({ q: "", sort: "recent", segment: null, offset: 0 });
  const key = `${venueId}-${query.q}-${query.sort}-${query.segment}-${query.offset}`;
  const { state, reload } = useLoad(() => getGuests(venueId, query), key);
  const change = (patch: Partial<GuestQuery>): void => setQuery({ ...query, offset: 0, ...patch });
  const data: GuestsView | null = state.status === "ready" ? state.data : null;
  return (
    <section className="owner-card" aria-label={t("Guests")}>
      <div className="owner-card-body">
        <div className="ow-guest-tools">
          <Field label={t("Search by name or email")} value={query.q} onChange={(event) => change({ q: event.target.value })} />
          <Select
            label={t("Sort by")}
            value={query.sort}
            options={[
              { value: "recent", label: t("Most recent") },
              { value: "visits", label: t("Most visits") },
              { value: "name", label: t("Name") },
            ]}
            onChange={(event) => change({ sort: event.target.value as GuestSort })}
          />
        </div>
        {data && (
          <div className="ow-chips" role="group" aria-label={t("Show")}>
            <button type="button" className="ow-chip" aria-pressed={query.segment === null} onClick={() => change({ segment: null })}>
              {t("Everyone")}
            </button>
            {(Object.keys(SEGMENT_NAME) as Segment[]).map((name) => (
              <button key={name} type="button" className="ow-chip" aria-pressed={query.segment === name} onClick={() => change({ segment: name })}>
                {t(SEGMENT_NAME[name])} ({data.segments[name]})
              </button>
            ))}
          </div>
        )}
        {data && data.guests.length > 0 && (
          <p>
            <Link to={`/owner/${encodeURIComponent(venueId)}/offers?send=${query.segment === null || query.segment === "offers" ? "all" : query.segment}`}>{t("Send an offer to this group")}</Link>
            <span className="rb-muted"> {t("Only guests who accept offers are emailed.")}</span>
          </p>
        )}
        {state.status === "loading" && <Skeleton label={t("Loading your guests")} lines={4} />}
        {state.status === "error" && <ErrorState message={t("Could not open your guests. Retry.")} onRetry={() => reload()} />}
        {data && data.guests.length === 0 && <p>{t("No guests match. Guests appear here once they have booked.")}</p>}
        {data && data.guests.length > 0 && <GuestTable rows={data.guests} />}
        {data && data.total > data.offset + data.limit && (
          <button type="button" className="btn btn-secondary" onClick={() => setQuery({ ...query, offset: query.offset + data.limit })}>
            {t("Show more")}
          </button>
        )}
      </div>
    </section>
  );
}

function GuestTable({ rows }: { rows: GuestRow[] }) {
  const { t } = useT();
  return (
    <table className="ow-table">
      <thead>
        <tr>
          <th scope="col">{t("Guest")}</th>
          <th scope="col">{t("Visits")}</th>
          <th scope="col">{t("Last visit")}</th>
          <th scope="col">{t("No-shows")}</th>
          <th scope="col">{t("Usual party")}</th>
          <th scope="col">{t("Notes")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.email}>
            <th scope="row">
              {row.name}
              <br />
              <span className="rb-muted">{row.email}</span>
            </th>
            <td>{row.visits}</td>
            <td>{row.last_visit ? formatDate(row.last_visit) : row.next_booking ? t("Booked {date}", { date: formatDate(row.next_booking) }) : "–"}</td>
            <td>{row.no_shows}</td>
            <td>{row.usual_party ?? "–"}</td>
            <td>
              {row.segments.map((name) => (
                <Badge key={name} tone={name === "no_shows" ? "warning" : name === "regular" || name === "offers" ? "success" : "neutral"}>
                  {name === "no_shows" ? t("No-shows") : name === "lapsed" ? t("Lapsed") : name === "regular" ? t("Regular") : name === "offers" ? t("Offers") : t("New")}
                </Badge>
              ))}
              {row.allergies && <span className="rb-muted"> {t("Allergies:")} {row.allergies}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
