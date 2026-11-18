// The owner's numbers about their own restaurant, in three tabs: an overview (how many bookings, how
// many no-shows, when the restaurant fills), the busiest tables on the floor plan, and the guest book
// (who comes, how often, who stopped coming). It only shows what the restaurant already has.
import { useState } from "react";
import { useParams } from "react-router-dom";
import { PERIODS, getGuests, getInsights } from "../../api/insights";
import type { GuestQuery, GuestRow, GuestSort, GuestsView, InsightsView, Overview, Period, Segment, TableDemand, TablesView } from "../../api/insights";
import { Badge, ErrorState, Field, Select, Skeleton } from "../../design/components";
import { formatDate } from "../restaurant/format";
import { useLoad } from "../restaurant/useLoad";
import { HEAT_FILLS, heatFill, heatText, percent } from "./heat";
import { OwnerShell } from "./OwnerShell";
import "./owner.css";

type Tab = "overview" | "tables" | "guests";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "tables", label: "Busiest tables" },
  { key: "guests", label: "Guests" },
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function InsightsPage() {
  const { venueId = "" } = useParams();
  const [tab, setTab] = useState<Tab>("overview");
  const [days, setDays] = useState<Period>(90);
  const { state, reload } = useLoad(() => getInsights(venueId, days), `${venueId}-${days}`);
  return (
    <OwnerShell title="Insights" venueId={venueId} current="insights">
      <div className="ow-page-head">
        <div>
          <h1 className="ow-title">Insights</h1>
          <p className="rb-muted">What your own bookings say about your restaurant: who comes, when, and which tables people choose.</p>
        </div>
        {tab !== "guests" && (
          <Select label="Period" value={String(days)} options={PERIODS.map((value) => ({ value: String(value), label: `Last ${value} days` }))} onChange={(event) => setDays(Number(event.target.value) as Period)} />
        )}
      </div>
      <div role="tablist" aria-label="Insights" className="ow-tabs">
        {TABS.map((item) => (
          <button key={item.key} role="tab" type="button" aria-selected={tab === item.key} className="ow-tab" onClick={() => setTab(item.key)}>
            {item.label}
          </button>
        ))}
      </div>
      {tab !== "guests" && state.status === "loading" && <Skeleton label="Loading your numbers" lines={5} />}
      {tab !== "guests" && state.status === "error" && <ErrorState message="Could not open your numbers. Check your sign-in or retry." onRetry={() => reload()} />}
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
      {note && <p className="rb-muted">{note}</p>}
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
  if (data.bookings === 0) {
    return (
      <section className="owner-card">
        <div className="owner-card-body">
          <p>No bookings in the last {data.days} days yet. Your numbers appear here as soon as guests book.</p>
        </div>
      </section>
    );
  }
  const hours = data.hours.map((row) => ({ name: `${String(row.hour).padStart(2, "0")}:00`, value: row.bookings }));
  return (
    <>
      <section className="owner-card" aria-label="Totals">
        <div className="owner-card-body">
          <dl className="ow-stats">
            <Stat label="Bookings" value={String(data.bookings)} note={`${data.covers} guests in total`} />
            <Stat label="No-shows" value={percent(data.no_show_rate)} note={`${data.no_shows} of the bookings that are over`} />
            <Stat label="Cancelled" value={percent(data.cancel_rate)} note={`${data.cancelled} bookings`} />
            <Stat label="Average party" value={data.average_party === null ? "–" : String(data.average_party)} note="guests per booking" />
            <Stat label="Book ahead" value={data.average_lead_days === null ? "–" : `${data.average_lead_days} days`} note="average, online bookings" />
            <Stat label="Returning guests" value={percent(data.returning_share)} note="booked here before, or more than once" />
          </dl>
        </div>
      </section>
      <section className="owner-card" aria-label="Bookings by weekday">
        <div className="owner-card-body">
          <h2 className="ow-subtitle">Bookings by weekday</h2>
          <Bars label="Bookings by weekday" rows={data.weekdays.map((row) => ({ name: WEEKDAYS[row.weekday] ?? "", value: row.bookings }))} />
        </div>
      </section>
      <section className="owner-card" aria-label="Bookings by start time">
        <div className="owner-card-body">
          <h2 className="ow-subtitle">When guests arrive</h2>
          <Bars label="Bookings by start hour" rows={hours} />
        </div>
      </section>
    </>
  );
}

function PlanHeat({ tables }: { tables: TableDemand[] }) {
  if (tables.length === 0) return null;
  const pad = 30;
  const left = Math.min(...tables.map((table) => table.x)) - pad;
  const top = Math.min(...tables.map((table) => table.y)) - pad;
  const width = Math.max(...tables.map((table) => table.x + table.w)) + pad - left;
  const height = Math.max(...tables.map((table) => table.y + table.h)) + pad - top;
  return (
    <svg className="ow-plan" viewBox={`${left} ${top} ${width} ${height}`} role="img" aria-label="Floor plan coloured by how often each table was booked">
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
  const [room, setRoom] = useState<number | null>(data.rooms[0]?.id ?? null);
  if (data.total === 0) {
    return (
      <section className="owner-card">
        <div className="owner-card-body">
          <p>No table has been booked in the last {data.days} days yet.</p>
        </div>
      </section>
    );
  }
  const shown = data.rooms.length > 1 ? data.tables.filter((table) => table.room_id === room) : data.tables;
  const busiest = data.tables.filter((table) => data.top.includes(table.id));
  return (
    <>
      <section className="owner-card" aria-label="Most booked tables">
        <div className="owner-card-body">
          <h2 className="ow-subtitle">The tables guests book most</h2>
          <ol className="ow-ranking">
            {busiest.map((table) => (
              <li key={table.id}>
                <strong>{table.label}</strong>{" "}
                <span className="rb-muted">
                  {table.bookings} {table.bookings === 1 ? "booking" : "bookings"} · {percent(table.share)} of all · seats {table.seats}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className="owner-card" aria-label="Floor plan">
        <div className="owner-card-body">
          {data.rooms.length > 1 && (
            <div role="tablist" aria-label="Rooms" className="ow-tabs">
              {data.rooms.map((item) => (
                <button key={item.id} role="tab" type="button" aria-selected={room === item.id} className="ow-tab" onClick={() => setRoom(item.id)}>
                  {item.name}
                </button>
              ))}
            </div>
          )}
          <PlanHeat tables={shown} />
          <p className="ow-legend" aria-label="Colour scale">
            <span className="rb-muted">Booked less</span>
            {HEAT_FILLS.map((fill) => (
              <span key={fill} className="ow-swatch" style={{ background: fill }} aria-hidden="true" />
            ))}
            <span className="rb-muted">Booked most. The number on each table is how many times it was booked.</span>
          </p>
        </div>
      </section>
    </>
  );
}

const SEGMENT_NAME: Record<Segment, string> = { new: "New", regular: "Regulars", lapsed: "Haven't been in 60 days", no_shows: "Repeat no-shows" };

function GuestsTab({ venueId }: { venueId: string }) {
  const [query, setQuery] = useState<GuestQuery>({ q: "", sort: "recent", segment: null, offset: 0 });
  const key = `${venueId}-${query.q}-${query.sort}-${query.segment}-${query.offset}`;
  const { state, reload } = useLoad(() => getGuests(venueId, query), key);
  const change = (patch: Partial<GuestQuery>): void => setQuery({ ...query, offset: 0, ...patch });
  const data: GuestsView | null = state.status === "ready" ? state.data : null;
  return (
    <section className="owner-card" aria-label="Guests">
      <div className="owner-card-body">
        <div className="ow-guest-tools">
          <Field label="Search by name or email" value={query.q} onChange={(event) => change({ q: event.target.value })} />
          <Select
            label="Sort by"
            value={query.sort}
            options={[
              { value: "recent", label: "Most recent" },
              { value: "visits", label: "Most visits" },
              { value: "name", label: "Name" },
            ]}
            onChange={(event) => change({ sort: event.target.value as GuestSort })}
          />
        </div>
        {data && (
          <div className="ow-chips" role="group" aria-label="Show">
            <button type="button" className="ow-chip" aria-pressed={query.segment === null} onClick={() => change({ segment: null })}>
              Everyone
            </button>
            {(Object.keys(SEGMENT_NAME) as Segment[]).map((name) => (
              <button key={name} type="button" className="ow-chip" aria-pressed={query.segment === name} onClick={() => change({ segment: name })}>
                {SEGMENT_NAME[name]} ({data.segments[name]})
              </button>
            ))}
          </div>
        )}
        {state.status === "loading" && <Skeleton label="Loading your guests" lines={4} />}
        {state.status === "error" && <ErrorState message="Could not open your guests. Retry." onRetry={() => reload()} />}
        {data && data.guests.length === 0 && <p>No guests match. Guests appear here once they have booked.</p>}
        {data && data.guests.length > 0 && <GuestTable rows={data.guests} />}
        {data && data.total > data.offset + data.limit && (
          <button type="button" className="btn btn-secondary" onClick={() => setQuery({ ...query, offset: query.offset + data.limit })}>
            Show more
          </button>
        )}
      </div>
    </section>
  );
}

function GuestTable({ rows }: { rows: GuestRow[] }) {
  return (
    <table className="ow-table">
      <thead>
        <tr>
          <th scope="col">Guest</th>
          <th scope="col">Visits</th>
          <th scope="col">Last visit</th>
          <th scope="col">No-shows</th>
          <th scope="col">Usual party</th>
          <th scope="col">Notes</th>
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
            <td>{row.last_visit ? formatDate(row.last_visit) : row.next_booking ? `Booked ${formatDate(row.next_booking)}` : "–"}</td>
            <td>{row.no_shows}</td>
            <td>{row.usual_party ?? "–"}</td>
            <td>
              {row.segments.map((name) => (
                <Badge key={name} tone={name === "no_shows" ? "warning" : name === "regular" ? "success" : "neutral"}>
                  {name === "no_shows" ? "No-shows" : name === "lapsed" ? "Lapsed" : name === "regular" ? "Regular" : "New"}
                </Badge>
              ))}
              {row.allergies && <span className="rb-muted"> Allergies: {row.allergies}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
