// Offers (discount coupons) a restaurant gives its guests. The restaurant bears the cost: nothing is
// paid through SeatPlan. The owner makes and sends them; a guest types or arrives with a code.
import { api } from "./client";

export type OfferKind = "percent" | "amount" | "gift";
export type Audience = "link" | "send" | "auto";
export type RuleType = "winback" | "welcome" | "nth_visit";
export type Segment = "all" | "lapsed" | "regular" | "new" | "no_shows" | "list";

export interface OfferRule {
  type: RuleType;
  days?: number;
  visits?: number;
}

/** What the owner types. Dates are yyyy-mm-dd; `value` is a percentage or cents. */
export interface OfferInput {
  name: string;
  kind: OfferKind;
  value: number;
  gift_text: string;
  audience: Audience;
  rule: OfferRule | null;
  note: string;
  starts_on: string | null;
  ends_on: string | null;
  max_uses: number | null;
  min_party: number;
  weekdays: number[];
}

export interface OfferView extends Omit<OfferInput, "rule"> {
  id: number;
  /** "10% off your bill". */
  what: string;
  rule: Partial<OfferRule>;
  active: boolean;
  /** The shared code and link of a "link" offer. */
  code: string | null;
  link: string | null;
  uses: number;
  codes_issued: number;
}

export interface OffersList {
  offers: OfferView[];
  daily_cap: number;
  guest_cooldown_days: number;
}

export interface Reach {
  segment: Segment;
  in_segment: number;
  reachable: number;
  skipped_no_consent: number;
}

export interface SendResult {
  sent: number;
  skipped_no_consent: number;
  skipped_recent_or_already: number;
  left_for_today: number;
}

const owner = (vid: string): string => `/owner/restaurants/${encodeURIComponent(vid)}/offers`;

export const listOffers = (vid: string) => api.get<OffersList>(owner(vid));
export const createOffer = (vid: string, offer: OfferInput) => api.post<OfferView>(owner(vid), offer);
export const changeOffer = (vid: string, id: number, offer: OfferInput) => api.put<OfferView>(`${owner(vid)}/${id}`, offer);
export const toggleOffer = (vid: string, id: number) => api.post<OfferView>(`${owner(vid)}/${id}/archive`, {});
export const previewReach = (vid: string, segment: Segment, emails: string[] = []) => api.post<Reach>(`${owner(vid)}/audience`, { segment, emails });
export const sendOffer = (vid: string, id: number, segment: Segment, emails: string[] = []) => api.post<SendResult>(`${owner(vid)}/${id}/send`, { segment, emails });

/** What a diner's code gives, checked before they confirm. */
export interface OfferCheck {
  name: string;
  what: string;
  note: string;
}

export function checkOffer(vid: string, code: string, email: string, day: string, party: number): Promise<OfferCheck> {
  const query = new URLSearchParams({ code, email, day, party: String(party) });
  return api.get<OfferCheck>(`/r/${encodeURIComponent(vid)}/offers/check?${query.toString()}`, "none");
}

/** The offer a booking used, as the diner and the staff see it. */
export interface UsedOffer {
  name: string;
  what: string;
}
