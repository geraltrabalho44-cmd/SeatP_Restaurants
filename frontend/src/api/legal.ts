// Terms, privacy and offers: the words a diner accepts on the last step of a booking, the link that
// stops offers, and the words the owner adds. Offers are a separate, optional choice.
import { api } from "./client";

export interface TermsDocument {
  version: string;
  offers_version: string;
  title: string;
  sections: { title: string; paragraphs: string[] }[];
  terms_label: string;
  offers_label: string;
  offers_hint: string;
  /** True only on demo restaurants: the text is a draft and has not been reviewed by a lawyer. */
  draft: boolean;
}

/** What the diner ticked on the last step. Terms are required; offers are optional and never pre-ticked. */
export interface Consent {
  terms: boolean;
  offers: boolean;
}

export const NO_CONSENT: Consent = { terms: false, offers: false };

const diner = (vid: string): string => `/r/${encodeURIComponent(vid)}`;
export const getTerms = (vid: string) => api.get<TermsDocument>(`${diner(vid)}/terms`, "none");

export interface Subscription {
  venue_name: string;
  /** Masked: "l•••@example.com". */
  email: string;
  subscribed: boolean;
}

const link = (token: string): string => `/u/${encodeURIComponent(token)}`;
export const getSubscription = (token: string) => api.get<Subscription>(link(token), "none");
export const stopOffers = (token: string) => api.post<Subscription>(`${link(token)}/stop`, {}, "none");
export const resumeOffers = (token: string) => api.post<Subscription>(`${link(token)}/resume`, {}, "none");
export const setOffers = (manageToken: string, optIn: boolean) => api.post<{ offers: boolean }>(`/b/${encodeURIComponent(manageToken)}/offers`, { opt_in: optIn }, "none");

export interface OwnerTerms {
  extra_text: string;
  max_length: number;
  document: TermsDocument;
}

const owner = (vid: string): string => `/owner/restaurants/${encodeURIComponent(vid)}/terms`;
export const getOwnerTerms = (vid: string) => api.get<OwnerTerms>(owner(vid));
export const saveOwnerTerms = (vid: string, extraText: string) => api.put<OwnerTerms>(owner(vid), { extra_text: extraText });
