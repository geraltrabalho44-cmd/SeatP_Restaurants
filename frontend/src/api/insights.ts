// The owner's numbers about their own restaurant: totals, the busiest tables and the guest book.
import { api } from "./client";

export type Period = 30 | 90 | 365;
export const PERIODS: readonly Period[] = [30, 90, 365];

export interface Overview {
  days: Period;
  bookings: number;
  covers: number;
  completed: number;
  no_shows: number;
  cancelled: number;
  /** Out of bookings that are over; null when there are none yet. */
  no_show_rate: number | null;
  cancel_rate: number | null;
  average_party: number | null;
  average_lead_days: number | null;
  sources: Record<string, number>;
  /** 0 is Monday. */
  weekdays: { weekday: number; bookings: number; covers: number }[];
  hours: { hour: number; bookings: number }[];
  returning_share: number | null;
}

export interface TableDemand {
  id: number;
  label: string;
  room_id: number | null;
  shape: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  seats: number;
  bookings: number;
  covers: number;
  /** Share of all table bookings, 0 to 1. */
  share: number;
  /** Against the busiest table, 0 to 1: what colours the plan. */
  heat: number;
}

export interface TablesView {
  days: Period;
  total: number;
  rooms: { id: number; name: string }[];
  /** Most booked first. */
  tables: TableDemand[];
  /** The ids of the busiest few that were booked at all. */
  top: number[];
}

export interface InsightsView {
  overview: Overview;
  tables: TablesView;
}

export type Segment = "new" | "regular" | "lapsed" | "no_shows";
export type GuestSort = "recent" | "visits" | "name";

export interface GuestRow {
  email: string;
  name: string;
  phone: string | null;
  bookings: number;
  visits: number;
  no_shows: number;
  cancellations: number;
  covers: number;
  first_booking: string;
  last_visit: string | null;
  next_booking: string | null;
  usual_party: number | null;
  allergies: string;
  dietary: string;
  segments: Segment[];
}

export interface GuestsView {
  total: number;
  segments: Record<Segment, number>;
  guests: GuestRow[];
  offset: number;
  limit: number;
}

const owner = (vid: string): string => `/owner/restaurants/${encodeURIComponent(vid)}`;

export const getInsights = (vid: string, days: Period) => api.get<InsightsView>(`${owner(vid)}/insights?days=${days}`);

export interface GuestQuery {
  q: string;
  sort: GuestSort;
  segment: Segment | null;
  offset: number;
}

export function getGuests(vid: string, query: GuestQuery): Promise<GuestsView> {
  const params = new URLSearchParams({ sort: query.sort, offset: String(query.offset) });
  if (query.q.trim()) params.set("q", query.q.trim());
  if (query.segment) params.set("segment", query.segment);
  return api.get<GuestsView>(`${owner(vid)}/guests?${params.toString()}`);
}
