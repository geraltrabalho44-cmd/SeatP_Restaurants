// Finding restaurants and the public restaurant page (docs/CONTRACT.md, "Discovery").
// Field names are snake_case, exactly as the Python backend sends them.
import { api } from "./client";
import type { ClockTime, IsoDate, ServerSchedule } from "./restaurant";

export type FeatureKey = "sun" | "view" | "accessible" | "terrace";
export type Features = Record<FeatureKey, boolean>;
export interface ReviewSummary { average: number | null; count: number }

/** One restaurant on a search card or a map pin. */
export interface RestaurantCard {
  slug: string;
  public_id: string;
  name: string;
  cuisines: string[];
  price_level: number | null;
  cover_url: string | null;
  cover_alt: string | null;
  demo_booking?: boolean;
  reviews?: ReviewSummary;
  address: string;
  lat: number | null;
  lng: number | null;
  /** Metres from the place searched from; null without a place or a pin. */
  distance_m: number | null;
  features: Features;
  /** The free seatings nearest the time asked, only when a date, time and party were asked. */
  next_times: ClockTime[];
}

export interface SearchAnswer {
  understood?: {chips:string[]; when:SearchWhen|null};
  items: RestaurantCard[];
  total: number;
}

export interface SearchWhen {
  date: IsoDate;
  time: ClockTime;
  party: number;
}

export interface SearchQuery {
  q: string;
  cuisines: string[];
  prices: number[];
  features: FeatureKey[];
  place: { lat: number; lng: number } | null;
  when: SearchWhen | null;
  /** Only restaurants with a free table near the time asked; ignored without `when`. */
  availableOnly: boolean;
  limit: number;
  offset: number;
}

/** The query string of GET /restaurants. Empty things are left out. */
export function searchQueryString(query: SearchQuery): string {
  const params = new URLSearchParams();
  const text = query.q.trim();
  if (text) params.set("q", text);
  query.cuisines.forEach((c) => params.append("cuisine", c));
  query.prices.forEach((p) => params.append("price", String(p)));
  query.features.forEach((f) => params.append("features", f));
  if (query.place) {
    params.set("lat", String(query.place.lat));
    params.set("lng", String(query.place.lng));
    params.set("within", String(PLACE_RADIUS_M));
  } else {
    params.set("anchor", `${HOME_ANCHOR.lat},${HOME_ANCHOR.lng}`); // no place chosen: Lisbon first, like the map
  }
  if (query.when) {
    params.set("date", query.when.date);
    params.set("time", query.when.time);
    params.set("party", String(query.when.party));
    if (query.availableOnly) params.set("available", "true");
  }
  params.set("limit", String(query.limit));
  if (query.offset > 0) params.set("offset", String(query.offset));
  return params.toString();
}

/** Where the home page starts when no place was chosen: only the order of the results and the map follow it. */
export const HOME_ANCHOR = { lat: 38.7223, lng: -9.1393 };

/** A city or "near me" shows the restaurants up to this far (metres): the city and its neighbours, not the whole country. */
export const PLACE_RADIUS_M = 25_000;

export function searchRestaurants(query: SearchQuery): Promise<SearchAnswer> {
  if (query.q.trim() && query.q.trim().length <= 80) {
    return api.get<SearchAnswer>(`/restaurants?${searchQueryString(query)}&understand=true`, "none");
  }
  if(query.q.trim()) return api.post<SearchAnswer>("/restaurants/search",{
    q:query.q.trim(),cuisine:query.cuisines,price:query.prices,features:query.features,
    ...query.place,...(query.place?{within:PLACE_RADIUS_M}:{anchor:`${HOME_ANCHOR.lat},${HOME_ANCHOR.lng}`}),...query.when,available:query.availableOnly,limit:query.limit,offset:query.offset
  },"none");
  return api.get<SearchAnswer>(`/restaurants?${searchQueryString(query)}`);
}

export interface PhotoCredit {
  author: string;
  file: string;
  license: string;
  license_url: string;
}

export interface PublicPhoto {
  url: string;
  alt: string;
  is_cover: boolean;
  credit?: PhotoCredit | null;
}

/** GET /restaurants/{slug}: everything the public page shows. */
export interface PublicRestaurant {
  slug: string | null;
  public_id: string;
  name: string;
  /** True when the owner is looking at a restaurant that is not published yet. */
  preview: boolean;
  demo_booking?: boolean;
  reviews?: ReviewSummary;
  description: string;
  cuisines: string[];
  price_level: number | null;
  address: string;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  timezone: string;
  features: Features;
  rooms_summary: string[];
  photos: PublicPhoto[];
  max_party: number;
  schedule: ServerSchedule;
  book_url: string;
  maps_url: string;
}

export function getPublicRestaurant(slug: string): Promise<PublicRestaurant> {
  return api.get<PublicRestaurant>(`/restaurants/${encodeURIComponent(slug)}`);
}
