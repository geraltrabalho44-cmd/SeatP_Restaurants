# Email: SeatPlan look, logo, and change/cancel buttons

> **Revision 2026-11-23 evening.** The first build used the old linen and bottle-green look
> (branch `claude/table-step`) and the owner rejected it after seeing the real email in Gmail.
> The email now follows the site's restaurants look and logo, on `restaurants/main`:
> palette from `frontend/src/design/restaurant-theme.css` (lavender, white, purple, pink main
> action, red cancel), the site's real logo (a 300 px copy in `backend/app/mail/assets/`),
> restaurant words in four languages through `restaurant_text.py`, and no separate payments
> note (the existing `payment_line` is kept). Where this file names the old colours or the drawn
> logo, the revision wins.

Date: 2026-11-23. Branch: `claude/email-branding` (from `claude/table-step`). Status: approved by the project owner on 2026-11-23 (with: no staff part, no printed links).
Size: small change (one shared email shell, two buttons, one deep link).

## Intent and why

Every SeatPlan email must look like the rest of the product (linen and bottle
green, serif headings, the table-and-chairs logo) and let a diner change or
cancel a booking in one tap, with no account and no login. The person who owns
the project wants real confirmations to go out to the diner's inbox, with the
reminder the day before and the waitlist offer kept as they are.

## Goals

- All emails share one new look taken from `frontend/src/design/tokens.css`.
- The logo (the green table with four chairs, one brass) sits at the top of each email.
- The confirmation, change and reminder emails carry two buttons: **Change time** and **Cancel booking**.
- No account needed: the buttons use the existing secret link `/b/<token>`.
- A first real send reaches a real inbox (the Resend test address) and is checked by eye.

## Non-goals

- No deposits, Stripe or the 24 h cancellation rule in this phase. That code already exists on `seatp-restaurants-main`; bringing it over is its own job. The emails leave a slot for it (see "Payments, later").
- No domain, no DNS, no sending to other people yet (needs a verified domain at Resend).
- No SMS or WhatsApp. No dark-mode email styling. No tracking pixels.
- No marketing content. No "log in" button (restaurant diners have no account).

## Anti-goals (would make it a failure even if it "works")

- A button that cancels on open. Email scanners and previews open links on their own, so a cancel link must only **open the page with a confirm step**, never cancel by itself.
- A logo that is missing or broken in Gmail, or an email that is unreadable with images off.
- Changing what events emails say or when they send. Only their look changes.

## Constraints

- `backend/app/mail/` is not a protected path. We do **not** touch `events_service/`, `routers/events.py` or the other protected paths in `AGENTS.md`. Event emails restyle only because they share `_PAGE` in `templates.py`; their words and tests stay.
- Email clients ignore CSS variables and web fonts: use inline styles with the token values and the same font stacks as `tokens.css`.
- Gmail and Outlook do not show SVG: the logo is a PNG.
- Every colour pair must pass the contrast rule already used in `scripts/contrast.mjs` (WCAG AA 4.5:1 for text).
- Until a domain exists, only the Resend account address can receive; the allowlist stays on.

## Approaches considered

1. **Logo as an inline attachment (cid), added by the sender.** Works on localhost, in Gmail and with no public URL; the picture travels with each email (about 3 KB). *Chosen.*
2. Logo as a hosted image on the site. Smaller emails, but a local or not-yet-deployed site cannot be reached by Gmail, so it would look broken in tests; images off in Outlook hides it.
3. No image: a styled text wordmark only. Safest, but not "our logo".

Choice 1, with a text "SeatPlan" in the serif display font next to the mark, so the email still reads with images off.

## Design

**Shell (`templates.py` `_PAGE`, `_BUTTON`; `restaurant_templates.py` `_button`, details, photo, picture borders):**
page `#f4efe6`, card `#fbf8f2` with a `#c9bfae` hairline and 10 px radius, text `#1e2724`, muted `#545d58`, links and primary button `#1f5a48` with text `#fbf8f2`, brass `#7f5310` for the small "reminder" and "on hold" touches, danger `#9c3226` available for small touches. Headings use the display serif stack, body the body stack, as in `tokens.css`. One column, 560 px max, as today.

```
 [logo]  SeatPlan
 +--------------------------------------+
 |  Your table at Casa Demo is booked.  |   serif heading
 |  Sat 14 Mar, 19:30 · 4 people        |
 |  Table 4 · Seat 2                    |
 |  [ mini-map ]                        |
 |  [ Change time ]  [ Cancel booking ] |   green filled / outlined
 |  Cannot tap a button? Call <phone>.  |
 +--------------------------------------+
  Why you got this. Do not reply: nobody reads this address.
```

**Logo:** a 2x PNG (96 x 96, shown at 40 px) drawn once from the same shapes as `frontend/public/favicon.svg` with the repo's own PNG writer (`mail/png.py`), kept as a small committed file. `ResendProvider` adds it as an inline attachment with `content_id: "logo"` whenever the HTML contains `cid:logo`. No database change. `ConsoleProvider` ignores it.

**Buttons:** both go to `/b/<token>`; **Change time** adds `?action=change`, **Cancel booking** adds `?action=cancel`. `ManageBookingPage.tsx` reads the query, opens the change form or the existing cancel confirmation, and never acts without a click. Event emails keep their single "Manage my seat" button.

**No-reply:** the footer says not to reply and gives the restaurant's phone (already in the email facts). No `Reply-To` header (correction to an earlier idea: without a real inbox there is nothing to point it at).

**Staff changes:** out of scope. The staff feature is being removed, so the earlier idea of a fresh manage token on a staff change is dropped.

**No printed links (decided by the project owner):** the HTML email shows no long web address. The buttons are the links. Under them one short line says "Cannot tap a button? Call the restaurant on <phone>." The plain-text version (for apps that show no buttons) still has to carry the addresses, so it keeps them.

**Payments, later:** the deposit system (Stripe, free-cancellation deadline, refunds, pending bookings) already exists on the branch `seatp-restaurants-main` (`backend/app/payments/`), with a demo provider that moves no money. It is not in this branch. This email work leaves one clear slot in the cancellation and confirmation emails for a line such as "Your deposit of X is refunded" or "Cancelling now keeps the deposit", so it can be filled when that code is brought over.

**Lead emails kept:** confirmation, change, cancellation, reminder (a day before, else two hours before), waitlist offer. Same keys and timing as now.

## Left to the builder

Exact pixel sizes, the deep-link parameter handling, and the real-send check (see below).

## How we will know it works

1. Backend tests stay green and new ones cover: both buttons present, link text fallback, `cid:logo` only when the logo is attached, no cancel by GET, no web address printed in the HTML (the text version keeps them).
2. `ruff`, `pytest`, `npm run typecheck`, `npm test`, `npm run build`, `npm run contrast`.
3. One real send through Resend to `the Resend test address`, opened in Gmail on desktop and phone, with a screenshot kept in `docs/`.
