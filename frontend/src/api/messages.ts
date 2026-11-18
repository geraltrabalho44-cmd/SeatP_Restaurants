// Phone messages (SMS and WhatsApp): the diner verifies a number while booking, the reminder's link
// page (/m/...), and the owner's settings. The server never returns a full phone number: only a
// masked one ("+351 9•• ••• 678").
import { api } from "./client";

export type MessageChannel = "sms" | "whatsapp";

/** What a restaurant offers, from GET /r/{vid} (`messages`). `channels` is empty when it sends none. */
export interface MessageOptions {
  channels: MessageChannel[];
  confirmation: boolean;
  reminder_24h: boolean;
  reminder_3h: boolean;
  /** True while no real provider is connected: the code is shown on screen instead of sent. */
  demo: boolean;
  consent_version: string;
}

export interface CodeStarted {
  verification_id: string;
  phone: string;
  channel: MessageChannel;
  /** Only while the provider is the demo one. */
  demo_code?: string;
}

export interface CodeChecked {
  verified: true;
  phone: string;
  channel: MessageChannel;
}

const diner = (vid: string): string => `/r/${encodeURIComponent(vid)}`;

export const startPhoneCode = (vid: string, phone: string, channel: MessageChannel) => api.post<CodeStarted>(`${diner(vid)}/phone/start`, { phone, channel }, "none");
export const verifyPhoneCode = (vid: string, verificationId: string, code: string) => api.post<CodeChecked>(`${diner(vid)}/phone/verify`, { verification_id: verificationId, code }, "none");

/** What the reminder's link page shows. No name, email or notes. */
export interface LinkView {
  venue_name: string;
  venue_public_id: string;
  phone: string;
  address: string;
  venue_phone: string;
  date: string;
  time: string;
  weekday: string;
  party: number;
  table: string;
  /** "confirmed", "cancelled", "stopped", or any other booking status. */
  status: string;
  started: boolean;
  confirmed_at: string | null;
}

const link = (token: string): string => `/m/${encodeURIComponent(token)}`;
export const getLinkView = (token: string) => api.get<LinkView>(link(token), "none");
export const confirmComing = (token: string) => api.post<LinkView>(`${link(token)}/confirm`, {}, "none");
export const cancelByLink = (token: string) => api.post<LinkView>(`${link(token)}/cancel`, {}, "none");
export const stopMessages = (token: string) => api.post<LinkView>(`${link(token)}/stop`, {}, "none");

/** The owner's settings (GET /owner/restaurants/{vid}/messages). */
export interface MessageSettings {
  sms_enabled: boolean;
  whatsapp_enabled: boolean;
  send_confirmation: boolean;
  reminder_24h: boolean;
  reminder_3h: boolean;
  monthly_cap: number;
}

export interface SentMessage {
  id: number;
  at: string;
  /** Masked, or "deleted" once the number was forgotten. */
  to: string;
  kind: string;
  channel: MessageChannel;
  status: "queued" | "sending" | "sent" | "skipped" | "failed";
  note: string | null;
}

export interface MessagesView {
  /** "demo" while messages are only written to the log. */
  sms_provider: string;
  whatsapp_provider: string;
  settings: MessageSettings;
  usage: { used: number; estimated_cents: number };
  recent: SentMessage[];
}

const owner = (vid: string): string => `/owner/restaurants/${encodeURIComponent(vid)}/messages`;
export const getMessagesView = (vid: string) => api.get<MessagesView>(owner(vid));
export const saveMessageSettings = (vid: string, settings: MessageSettings) => api.put<MessagesView>(owner(vid), settings);
