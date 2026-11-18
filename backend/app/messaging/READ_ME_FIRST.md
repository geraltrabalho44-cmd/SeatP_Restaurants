# messaging: read me first

## Purpose

Phone messages (SMS and WhatsApp) for restaurant bookings: a confirmation, reminders 24 h and
3 h before with a link to confirm or cancel, and a cancellation notice. Nobody is messaged without
saying yes, and every number is proven with a 6-digit code first. The code that decides who gets
what and when is in `restaurant_service/phone_messages.py`; this folder holds the parts that
know nothing about bookings.

| File | One job |
|---|---|
| `phone.py` | Clean a Portuguese mobile number to `+351912345678` (landlines, special and foreign numbers are refused) and mask it for display |
| `templates.py` | The words of every message: one SMS text (plain ASCII, one 160-character segment) and one WhatsApp template with its blanks |
| `providers.py` | The senders: `DemoProvider` (default, writes a masked line to the log), `TwilioSmsProvider`, `WhatsAppCloudProvider` (Meta). Plain httpx, no vendor library |

## Connecting the real providers (environment variables only, no code)

| Variable | Meaning |
|---|---|
| `SMS_PROVIDER` | `demo` (default) or `twilio` |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | From the Twilio console. Needed for `twilio` |
| `TWILIO_SMS_FROM` | A sender name such as `SeatPlan` (one-way) or a Twilio number (two-way) |
| `WHATSAPP_PROVIDER` | `demo` (default) or `meta` |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | From Meta's WhatsApp Business Platform. Needed for `meta` |
| `MESSAGE_ALLOWLIST` | Comma-separated E.164 numbers. With a real provider, **demo restaurants** only message these numbers, so a public demo can never text a stranger |

The app refuses to start with a provider set and its keys missing. The two channels are
independent: SMS can be real while WhatsApp is still the demo.

WhatsApp only lets a business *start* a chat with a template Meta has approved. The templates
this app sends (names and blanks are in `templates.py`) must be created and approved in Meta's
console before `WHATSAPP_PROVIDER=meta` works: `seatplan_code_v1`, `seatplan_booking_confirmed_v1`,
`seatplan_reminder_v1`, `seatplan_booking_cancelled_v1`, language `en`. Approval takes days.

## What is not built yet

Replies by message (YES / CANCEL / STOP) and delivery receipts need a webhook from each provider;
today a diner confirms, cancels or stops with the link in the message (`/m/...`). The waitlist
"a table is free" message is not sent either. Both are in the design
(`docs/superpowers/specs/2026-11-17-messaging-whatsapp-sms-design.md`).

## Likely walkthrough questions

**Why a code before the first message?**
Without it anyone could type a stranger's number and have us message them, and anyone could make
us pay for thousands of codes sent to numbers they own (SMS pumping). So: Portuguese mobiles only,
limits per browser, per number and for the whole app, and 5 tries per code.

**Why does the link in a message carry no stored secret?**
The token is `<id>.<signature>`; the signature is made with the server's secret key from the id
and the booking, and recomputed when checked. Nothing about it is stored, a changed character is a
plain 404, and a link cannot be forged for another booking.

**Why is the message text built when it is sent, not when it is queued?**
The booking may have changed or been cancelled in between. The outbox keeps only what is needed to
send once (a unique key per message) and a copy of the words with the link replaced by `[link]`,
which is erased with the number 30 days after the visit.
