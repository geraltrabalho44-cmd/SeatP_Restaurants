import type { OfferInput } from "../../api/offers";

/** Offers an owner can take as they are (and change afterwards): a name, a line about it, and what is created. */
export interface OfferTemplate {
  id: string;
  name: string;
  about: string;
  input: OfferInput;
}

const BASE: OfferInput = { name: "", kind: "percent", value: 10, gift_text: "", audience: "link", rule: null, note: "", starts_on: null, ends_on: null, max_uses: null, min_party: 1, weekdays: [] };

export const OFFER_TEMPLATES: OfferTemplate[] = [
  { id: "winback", name: "We miss you", about: "10% off for guests who have not been in for 60 days, given automatically.", input: { ...BASE, name: "We miss you", audience: "auto", rule: { type: "winback", days: 60 }, note: "It has been a while. Come and see what is new." } },
  { id: "first-visit", name: "Thank you for coming", about: "A free dessert after a guest's first visit, given automatically.", input: { ...BASE, name: "Thank you for coming", kind: "gift", value: 0, gift_text: "dessert", audience: "auto", rule: { type: "welcome" } } },
  { id: "fifth-visit", name: "Fifth visit reward", about: "20% off on a guest's fifth visit, given automatically.", input: { ...BASE, name: "Fifth visit reward", value: 20, audience: "auto", rule: { type: "nth_visit", visits: 5 } } },
  { id: "midweek", name: "Midweek table", about: "15% off from Monday to Thursday, with a shared code and link.", input: { ...BASE, name: "Midweek table", value: 15, weekdays: [0, 1, 2, 3] } },
  { id: "group", name: "Table for the group", about: "10% off for parties of four or more, with a shared code and link.", input: { ...BASE, name: "Table for the group", min_party: 4 } },
  { id: "dessert", name: "Dessert on us", about: "A free dessert, with a shared code and link.", input: { ...BASE, name: "Dessert on us", kind: "gift", value: 0, gift_text: "dessert" } },
  { id: "toast", name: "A glass to start", about: "A free glass of Port for parties of two or more, with a shared code and link.", input: { ...BASE, name: "A glass to start", kind: "gift", value: 0, gift_text: "a glass of Port", min_party: 2 } },
  { id: "ten-off", name: "€10 off", about: "€10 off the bill for parties of two or more, sent by you to guests you choose.", input: { ...BASE, name: "€10 off", kind: "amount", value: 1000, audience: "send", min_party: 2 } },
];
