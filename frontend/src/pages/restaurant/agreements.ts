// What the diner has ticked on the details form: the terms, offers, and the phone for reminders.
// The booking flow keeps it (like the contact details), so going to pick a chair and coming back to
// the form does not make the diner tick everything again.
import type { Consent } from "../../api/legal";
import { NO_CONSENT } from "../../api/legal";
import type { PhoneChoice } from "./PhoneOptIn";
import { NO_PHONE } from "./PhoneOptIn";

export interface Agreements {
  consent: Consent;
  phone: PhoneChoice;
}

export const NO_AGREEMENTS: Agreements = { consent: NO_CONSENT, phone: NO_PHONE };
