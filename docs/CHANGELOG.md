# Changelog

## Fixes from the audit of 2026-11-23 (unreleased)

See `docs/auditoria-2026-11-23.md` for the finding ids.

- BE-3: `GET /api/restaurants?q=…&understand=true` with a control character (NUL, BEL, ESC, DEL) answers 422 with a message, not 500.
- OPS-1: a deposit booking nobody pays for gives its table back by itself. Every look at a restaurant (diner pages, staff pages) settles that restaurant's overdue waits first, so it no longer depends on the cron job being switched on (`venue_access.release_unpaid_deposits`). The cron still does it for all restaurants.
- IOS-1: on touch screens every typed field is 16px, so iPhone Safari no longer zooms the page when a field is tapped.
- DEMO-1: when no code appears on the sign-up screen (owner and diner), it says the demo sends no real emails and to use an address ending in @example.com.
- A11Y-1 and A11Y-2: the note under each figure on Insights is a `dd` (a `dl` may only hold `dt` and `dd`); the "page not found" and "this link does not work" pages (restaurant, booking, message, unsubscribe) have a main heading.
- UI-8: the staff page has the same light header as the owner area. On a phone the logo and language share a row and the four tabs share the next one, so "Schedule" is no longer cut off.
- FE-1: only the discovery, restaurant, booking and diner-account pages are in the first download; owner, staff, event and payment pages load when opened. The first script is 369 KB (115 KB gzip) instead of 715 KB (209 KB gzip).
- DEP-2: the files under `/assets/` have a hash in their name and now carry `Cache-Control: public, max-age=31536000, immutable` (`vercel.json`). The e2e server only copies the security headers of the `/(.*)` rule.
- PERF-4: the list keeps the height of a screen while the first cards load, so the footer does not jump down.
- TEST-1: the staff e2e accepts "Live now · 02:45" as well as "Viewing 02:45" (it failed every day between 02:45 and 02:59). TEST-2: Playwright retries once on CI (not on a laptop); a test that needed the retry is shown as "flaky" in the report.
- CI-1: a `backend-postgres` job runs the whole backend suite on Postgres 16, the database the live site uses.
- DOC-1: `docs/openapi.json` exported again (159 paths, 182 operations, 88 schemas).

## Phone polish and the owner pages (unreleased, 2026-11-23)

- The public header shows "For restaurant owners" next to "Log in" instead of a "Menu" button that only held that link (on the narrowest phones it reads "Owners").
- The filters panel, also opened by "Anywhere · Any date · 2 people" on a phone, slides in: from the bottom on a phone, as a sheet with a handle, a one-line header, one scrolling area and the buttons resting on the bottom edge; from the right on a wide screen. The page behind does not scroll while it is open. The "Apply · Show N restaurants" button is translated.
- On a phone the map and the list arrive with a short movement when "Map" or "List" is chosen, each restaurant card rises a little as it comes into view and gives way when pressed, and a picked pin's card slides up. Movement only, never transparency, and nothing moves when the system asks for reduced motion.
- Reviews read at a comfortable size: a large score with large chairs, and each review with the author's initial, its score in a pill and the text at body size.
- A free time on the "Choose a time" step shows just the time ("Available" is still read out); nearly full and full times keep their words. On a phone the buttons of the confirmation and of the booking page fill the card's width.
- The owner pages look like the rest of the site: a light menu with the page you are on in purple, and on a phone one "Menu" button that names the page and opens the list in two columns (it used to be two rows of links sliding sideways). My restaurants is a grid of upright cards.
- Restaurant profile: cuisines are pills that wrap instead of 26 rows of boxes, the price range is four buttons (€ to €€€€) with the range under each, Identity and Location are underline tabs, and the location map is the same light map as the public pages, with a drop-shaped pin.
- Menu and prices: each dish is one closed line (name, category and price) that opens to edit it; a new dish starts open. Turn times, Insights totals and the "next step" buttons are laid out for a phone.
- `python -m app.seed.remove_mock_restaurants` deletes the five made-up restaurants of the first demo (Casa Lumen, Tagus Terrace, Tasca do Bairro, Miradouro 7, Pátio das Laranjeiras) with everything that hangs off them and their demo links. Only demo restaurants with those addresses; anything an owner made is never touched. `--allow-remote` for the shared demo database, after a backup. `app.seed.run` still creates them, because the automated tests are built on them.

## Restaurant discovery and weather (unreleased)

- Restaurant booking shows the forecast and bookable sunset tables. Restaurants can enable optional indoor table offers for rainy terrace bookings.
- The booking page no longer has the "Offers from …" card or the ".ics" link, and its two columns are aligned. On the confirmation page "Manage booking", "Add to Google Calendar" and "Get directions" sit on one line. After a confirmed booking one press of the browser's Back leaves the booking (before, the first press only skipped back over its steps).
- The booking confirmation email is sent at once after the booking (when `EMAIL_PROVIDER=resend`), not at the next 15-minute cron run; if the provider fails the email stays queued for the cron. Changes, cancellations, reminders and bookings waiting for a deposit still go with the cron.
- The "Reminders on your phone" block is gone from the booking form: when the restaurant sends phone messages, the phone number the diner typed in the form (a Portuguese mobile) is the one messaged, with no box to tick and no code to type. The consent row says the number was typed, not proven (`consent_version` `2026-11-23-typed`); a landline or a foreign number is only kept for the staff. The confirmation page still says where the messages go.
- The sample reviews no longer start with "Demo review": `python -m app.seed.demo_reviews` leaves the label out by default (`--label` brings it back) and a run removes it from reviews that have it. The reviews section of a restaurant page has a new layout: title, score, chairs and review count on one line, bigger score and chairs, the filters in one card and every review as a card with the initial of the author and the score in a pill.
- 15 well-known Porto restaurants were added (Café Majestic, Café Guarany, Cantinho do Avillez, Cantina 32, Antunes, O Afonso, A Regaleira, Abadia do Porto, Pedro dos Frangos, Raiz, Escondidinho, Tasquinha dos Sabores, Café do Cais, Café A Brasileira and Café Piolho), each with address and map position, a licensed cover photo with its credit, a sample menu, a floor plan, opening hours and reviews (`python -m app.seed.porto_catalogue`, then `lisbon_menus` and `demo_reviews`). Prices, hours, tables and reviews are invented. `public_catalogue --allow-remote` now publishes Lisbon and Porto together (35 restaurants).
- The "Near me" button was removed from the home page (bar and phone drawer): the place is chosen from the city list only, and the browser is never asked for the location.
- Choosing a city (or "Near me") now shows only the restaurants up to 25 km from it, not the whole country ("15 restaurants near Porto"); `GET /api/restaurants` and the natural search take `within` (metres). With no place chosen the home page opens its map on Lisbon, and the list is ordered Lisbon first (`anchor`, which orders the results and shows no distance). A click on the SeatPlan logo opens the home page as on arriving: no place, search or filters kept; Back to an older home page still brings back what was chosen.
- Map pins are drawn on their true places: zoomed far out (below zoom 12.5) every restaurant is a small dot with no number, instead of numbered discs pushed apart over the river or the sea; the numbers (nudged apart only a little) return when zoomed in. The home map opens on Lisbon one level closer (zoom 13) so the numbers are readable at once.
- Owner side: the demo owner has three restaurants, each with a complete floor plan and 90 days of bookings behind the insights (`python -m app.seed.owner_demo`). The service floor and the staff workspace (Floor, Dashboard, Optimise) were removed: the old links now lead to the opening hours, and the table-size option and the 90-minute turn times live on the Opening hours page. The menu no longer has "Public restaurant" or "Security". Guest messages is only the confirmation email (SMS and WhatsApp are switched off). Deposits have a clear "Ask guests for a deposit to book" switch, so the owner decides. Offers has eight ready-made offers to start from (one tap makes the offer). The location map of "Add a restaurant" is the site's map. Review and publish also shows the floor plan. The terms page says the terms were prepared by a team of lawyers.
- Discovery interprets English and Portuguese search phrases into editable search terms and booking context.
- Restaurant discovery and public pages support gated Portuguese, Spanish and French translations.
- The booking box on a restaurant page is as tall as the photo beside it. The weather card on the "Choose a time" step is headed "Weather for <day> in <town>" (the town comes from the restaurant's address) and has one reading of the weather (the hour picked, else 19:00) and the sunset on one line, with no source line, no indoor-table list and no "no seating catches the sunset" note; the Open-Meteo credit moved to the page footer. The menu page no longer carries the sample and allergy notes. The forecast is the real one (Open-Meteo, no key) whenever `WEATHER_PROVIDER=open-meteo`; with the default `demo` it still says "Simulated forecast". For the live site, set `WEATHER_PROVIDER=open-meteo` in Vercel.
- The party size on a restaurant page is always 1 to 10 people, and the hint "Including children. For more than N, please call the restaurant." is gone. A party that the restaurant's tables cannot seat is still refused by the server with its own message.
- The table step is lighter: the plan of the room is drawn in warm ivory with a fine board pattern, white tables with a soft shadow, the owner's zones (window, terrace, bar) as tinted areas with their names, and in the evening only a warmer tone with a lamp glow, never dark. The list view shows each table as a card and hides lines that are the same for every table. "Why this table" and the "Light during your visit" card are gone.
- A booking keeps its table 90 minutes by default, for every party size (the server's fallback was 120 minutes and the demo restaurants 90 to 180; the opening-hours template already said 90). The owner can still set another time per party size. The note on the table card now says "We hold the table for five minutes while you enter your details", because the five minutes are the hold while the diner fills in the form, not the length of the booking. The plan of the room is drawn in a soft Apple-style grey instead of warm ivory.
- A party is given a table that suits its size: by default a table for 4 is offered to 3 or 4 people and a table for 2 to 1 or 2, so a couple no longer gets a table for four. The owner can switch on "Let smaller parties book bigger tables" in the Schedule tab (column `venues.allow_larger_tables`, added by `python -m app.seed.migrate`, off for every restaurant). The server refuses a hold of a table that does not suit the party, and the map, the list, the weather and the rain plan follow the same rule. A minimum the owner set on a table is always kept.
- The tables of the demo restaurants are spread evenly in their rooms and zones, none touching another (`python -m app.seed.tidy_layouts`, run by the Lisbon catalogue command and by hand after `app.seed.run`; a plan whose zones were too tight is spread out a little). The room's wall on the diner's plan is light purple, and the key under the plan has "Recommended" for the star. The steps "When > Table > Details" sit on a grey line with the current step underlined in purple on it. The browser's Back button goes back one booking step (a held table is given back), and only then to the previous page. "Open in Google Maps", the phone, the website and Instagram are on one line.
- Searching for a day and time with no free table now says so: "No tables available around 14:30", with the day, the party and what to try. The demo restaurants serve lunch every day, Monday included (they were closed for lunch on Mondays), so a search around 14:30 finds tables.
- "NORI Restaurante Japonês" is now called "Nori". Casa da Índia shows a review score of 4,9 (`demo_reviews.TARGET_AVERAGES`; the scale is 0 to 10, so 4,9 is a low score). The review number on the cards of the main page is a little smaller, and the language tab steps out of the way when the page is scrolled.
- The booking confirmation page ends with its buttons: the on-page email preview, the note about the email and the copy-link field are gone. "Add to calendar" is now "Add to Google Calendar": it opens Google Calendar with the day, the hours (in the restaurant's time zone), the place and the manage link filled in, and the diner saves it in the calendar they choose there; the .ics file stays as a small link for other calendars. (Putting an event in a calendar with no step at all needs the diner to sign in with Google and a Google API key; this does not.) The manage page is laid out in two columns, with the booking and what can be done to it on the left and the restaurant, offers and arrival notice on the right.
- A booking made with the email of an account whose address is proven goes into that account's history at once; nobody has to sign in to book (`diner_flow.confirm_booking`).
- The optional things on the details step (occasion, dietary preferences, allergies, a chair) sit in one closed sub menu; the chair has no heading or description. `python -m app.seed.demo_messages` switches on phone messages (SMS and WhatsApp, with the confirmation) for the demo restaurants.
- Every demo restaurant has a sample menu (`python -m app.seed.lisbon_menus`) and the menu page reads like a printed carta: sections side by side, the price at the end of each line. The public page of a demo restaurant says the menu is a sample with indicative prices.
- "Continue with Google" (and Apple, when the project has it on) is now also under the diner log-in and sign-up forms, as it is for owners. A diner who continues with Google gets the diner account with that email (made on the first time, with the terms accepted by the note under the button), not an owner account. Two new routes, `POST /identity/diner/oauth/start` and `/identity/diner/oauth`, and the page `/restaurants/account/callback`. It shows only while `AUTH_PROVIDER=supabase` and Google is switched on in Supabase.
- The language control is a small flag and language name hanging under "Log in" on every Restaurants page (diner, owner and staff), and the choice applies to the whole site. The owner's room editor, the shared map controls, the page footer, the "page not found" screen and the phone summary of the home page are translated. The "Plan an event" link and the "Demo" badge are gone from the home page, which moves up. The quick choices in the search bar are now kinds of food (Portuguese, Seafood, Japanese, Italian, Pizza) instead of sunny tables, view and terrace; those three stay in the Filters. Events stay English and keep their own pages.

What changed in SeatPlan, newest first. Each line comes from an entry in
[`decisions-log.md`](decisions-log.md) (named in brackets), where the reasons
are written out in full. Two short names: "platform fixes" means the section
"fixes after the adversarial review (platform)", and "events and restaurants
fixes" means "fixes after the adversarial review (events, restaurants,
frontend, verification)". The version number is `APP_VERSION` in
`backend/app/config.py`.

Format: one section per version, with the groups Added, Changed, Fixed and
Security. "Not released" means it has not been deployed anywhere.

## [Unreleased]

Things planned but not done yet: the first Vercel deployment, real email
through Resend, usability sessions with real users.

### Added (2026-11-18)

- Deposits for restaurant bookings. The owner sets, per service, a deposit per person and a free-cancellation
  window; a diner accepts the terms, the booking waits as `pending` (it keeps its table) until the deposit is
  paid, and is then confirmed. Cancelling in time refunds it; after the deadline the restaurant keeps it; the
  restaurant cancelling always refunds. The default provider is a demo one (a clearly labelled pretend payment
  page, no money moves); Stripe is wired in behind `PAYMENT_PROVIDER=stripe` and only needs its keys
  (`backend/app/payments/READ_ME_FIRST.md`). Hosted Checkout only, so no card data reaches SeatPlan and the
  Content-Security-Policy is unchanged; webhooks are signature-checked, deduplicated and re-read from Stripe.
- Staff see each booking's deposit on the floor. New owner page "Deposits".
- Sign-in for restaurant owners and staff through Supabase Auth, prepared and switched off by default
  (`AUTH_PROVIDER=supabase` plus the project's URL and public key). Supabase only proves who owns an email
  address; SeatPlan keeps its own accounts and session tokens, so no other page changes. The browser talks
  only to SeatPlan (no new dependency, no change to the Content-Security-Policy). Includes sign-up with a
  confirmation link, "Forgot your password?", and a refusal to work if the project does not ask people to
  confirm their email. Accounts made before the switch still sign in with their password. Event organisers
  and diner accounts keep the built-in sign-in (they are shared with Events). 1 new table (`auth_identities`).
- "Continue with Google / Apple" and two-step verification (authenticator app) for owners and staff, through the
  same Supabase Auth set-up. A nonce kept in the browser tab stops a link someone else made from signing a
  visitor in; an account with two-step verification is never signed in by a password or Google or Apple alone;
  turning it on needs the password and a first code, turning it off the password and a current code. New
  "Security" page; the QR code is drawn by the generator in `frontend/src/qr/`. There are no recovery codes.
- Offers (discount coupons). The restaurant bears the cost: SeatPlan records the offer and who used it, and
  tells the staff what to take off the bill; nothing is paid or refunded through SeatPlan. The owner makes
  offers (a percentage, an amount or a free item, with dates, weekdays, a smallest party and a limit) and
  chooses how guests get each one: a shared code and link, sent by the owner to chosen guests (those who have
  not been in for 60 days, regulars, new guests, everyone, or a list), or automatically by a rule (win-back,
  a thank-you after the first visit, a reward on the Nth visit). Only guests who said yes to offers are ever
  emailed; every email says why and has a one-tap stop link; a guest gets at most one offer email in 14 days
  and a restaurant sends at most 200 a day. A guest types the code (or arrives with `?offer=CODE`) on the
  last step; a wrong code and somebody else's code answer the same and checking is rate limited. Cancelling a
  booking gives the use back. 3 new tables (`offers`, `offer_codes`, `offer_redemptions`). The shared link
  also comes as a QR code to print (a generator written out in full, `frontend/src/qr/`, checked with a real
  scanner), and the guest list has a "Send an offer to this group" shortcut.
- Weather, sunset and a rain plan. The booking page shows the day's forecast (a simulated one by default; Open-Meteo
  behind `WEATHER_PROVIDER=open-meteo`, no account needed for the free service, but its commercial terms must be
  reviewed before production) and the table that catches the sunset (worked out locally from the room's windows and
  the sun's position). An owner can opt in to a rain plan: when rain is forecast for a terrace booking the diner is
  offered a held indoor table by email and on their booking page, and only their click moves them. 3 new tables
  (`weather_cache`, `rain_plan_policies`, `rain_offers`).
- Natural-language search on the discovery page ("sushi for four near the river on Saturday", "esplanada para 2
  amanha as 19h30 ate 30 euros", "table pour deux demain soir terrasse"): English, Portuguese, Spanish and French
  words, number words, typos, days, times, budget and distance, shown as chips that can be taken back out. Rules
  only, offline, nothing stored; a `SearchProvider` interface lets a language model be plugged in later.
- The base of the languages (pt-PT, es, fr) with discovery and the public restaurant page translated, a language
  picker in the header and `?lang=`; hidden until `VITE_I18N_LOCALES` lists a language. English stays the default.
- Diners can create an account from the restaurant side (`/restaurants/account/sign-up`, with a link on the
  log-in page): name, email, password and a required consent box, then a 6-digit code by email. It is the same
  account events use, so one sign-in works on both sides; the code step is the existing `/guest/verify`, and
  no event is involved. The answer is the same whether or not the address already has an account (an existing
  account gets a note instead of a code), with the same limits on codes as event sign-ups. New: `POST
  /api/diner/sign-up`, two email texts, no new table. The account page (bookings and saved restaurants) is
  translated too. Nothing in the events code changed.
- The rest of the restaurant side now speaks pt-PT, es and fr too: the whole diner journey (party, time, table
  plan and card, chairs, details, consent, deposit and payment pages, confirmation, manage page, SMS/WhatsApp
  link page, offers unsubscribe, waitlist), the owner pages (profile, photos, hours, menu, deposits, guest
  messages, insights, offers, terms, security, review and publish, sign-up and password pages), the staff
  floor, schedule, dashboard and optimiser, and the sign-in page. The short sentences the server writes in
  English (light, view, what is near a table, reasons for a suggestion) are translated on the page from their
  closed set; a restaurant's own words stay as written. The translations are their own file, downloaded only
  when a language other than English is on (the main script is about 25% smaller for everyone else). English
  tests are unchanged. Still English: emails, calendar invites, the terms and privacy document, the
  deposit-terms text, server error messages, Events and the home page. A native speaker must review the
  translations before a language is released.
- Terms, privacy and offers on the last step of a booking (GDPR). Two separate boxes: the terms and privacy
  notice (required, also enforced by the server: `terms_not_accepted`; the words open in a window and carry a
  version) and, separately, optional and never pre-ticked, "offers from this restaurant". The terms say the
  restaurant is responsible for its guests' data (SeatPlan processes it on its behalf) and may use booking data
  for its own statistics. The consent of each booking is recorded with the version of the words; a guest's yes
  to offers is kept per restaurant and email, and is withdrawn with the link in any message (`/u/...`) or on
  the booking page. The owner can add their own words ("Terms and privacy" page). The wording is a draft that
  needs a lawyer's review. Every booking test and e2e spec now ticks the terms. Nothing sends offers yet.
- Owner "Insights" page: totals (bookings, guests, no-show and cancellation rates, returning guests, busiest
  weekdays and hours), the tables guests book most (ranked, and drawn on the floor plan in one purple ramp with
  the count on every table), and a guest book (visits, last visit, no-shows, usual party, allergies; filters for
  new, regular, lapsed and repeat no-shows). Worked out from the bookings the restaurant already has: no new
  table, nothing stored twice, only the owner of that restaurant can read it.
- Phone messages (SMS and WhatsApp) for restaurant bookings. The owner switches a channel on per restaurant
  ("Guest messages" page), chooses what to send and a monthly limit. A diner ticks "Send me booking messages",
  proves a Portuguese mobile with a 6-digit code, and gets a confirmation (optional), reminders 24 h and 3 h
  before and a cancellation notice; each message links to a page (`/m/...`) to confirm, cancel or stop. Numbers
  are deleted 30 days after the visit. The default provider is a demo one that only writes a masked line to the
  log; Twilio (SMS) and Meta's WhatsApp Cloud API are wired in behind environment variables
  (`backend/app/messaging/READ_ME_FIRST.md`). Replies and delivery receipts are not built yet.

### Added (2026-11-10 to 11)

- Shared event link: one link per event (`/j/<token>`), switched on and off,
  copied and replaced from the organiser's Settings tab, with an optional cap
  ("guest accounts", D1 to D7).
- Visitors: anyone with the link sees the event and the live map, names
  filtered as for attendees, and cannot hold or confirm a seat.
- Guest accounts: sign-up checked by an emailed 6-digit code, sign-in and
  sign-out, forgotten password, "My events", the attendee steps under
  `/my/<event>`, and deleting the account (GDPR) ("guest accounts").
- Seat emails for account holders with a picture of the room drawn on the
  server (PNG inline with a content id, alt text, `.ics`), with no new
  dependency ("guest accounts", D5 and section 9).
- `python -m app.seed.migrate` now also adds the listed new columns and
  indexes to an existing database, safely and repeatably, tested from the
  old schema on SQLite and Postgres ("guest accounts", migration).
- Playwright: `guest-account.spec.ts` (7 steps), a phone sign-up and three
  more axe scans.

### Security (2026-11-10 to 11)

- Fixed S30 to S40 from the reviews of guest accounts: demo codes only for
  uninvited `@example.com` addresses, a sign-up id that ties the code to the
  browser, constant-time sign-up, limits that strangers cannot use up, no
  typed name in code emails, removed guests cannot rejoin, no id reuse on
  SQLite, no join after "Make a new link", fairer limits for one Wi-Fi and for
  failed logins, and code tries counted before the compare. S41 is open and
  accepted (`security.md`, section 9).

### Fixed (2026-11-10 to 11)

- Saying "no" and then "yes" again could make more guests than seats; places
  left counted seats reserved for a tag; a full event refused invited
  guests' sign-ups; an applied plan sent no email to account holders; tall
  rooms' pictures were stretched; several texts ("1 places left", the
  privacy text, the delete dialog) said more than was true ("guest
  accounts", review fixes).

## [0.1.0] - 2026-11-10 (not released: no deployment has been done)

### Added

- Shared core: FastAPI app factory, settings from environment variables,
  SQLAlchemy models for both verticals, scrypt passwords, signed sessions,
  database-backed rate limits ("backend foundation").
- Five-minute seat and table holds guarded by a UNIQUE constraint;
  `commit_or_seat_taken` turns a clash on the final insert into 409
  `seat_taken` ("backend foundation", item 8).
- Privacy mode `first_initial` shows first name plus last initial
  ("backend foundation", item 9).
- Events optimiser: greedy, simulated annealing, re-plan with a change
  penalty, recommendations and an exact solver (CP-SAT or branch and bound)
  ("events optimiser").
- Events API: guests, raw-CSV import (all rows or none, 200 KB and 1000
  rows), export, organiser moves, auto-fill, re-plan, scenarios, what-if, undo
  and redo, exact check, and the attendee endpoints including
  `GET /a/{token}/people` ("events vertical API").
- Restaurants API in the new `restaurant_service/` package: slots, map, holds
  (one row per table per 15-minute slot), bookings, manage-or-cancel links,
  waitlist with offers, staff floor, walk-ins, what-if, dashboard, schedule
  ("restaurants vertical API").
- Frontend: React and Vite app, hand-drawn SVG seat map with pan, zoom and
  keyboard, attendee and organiser screens, diner and staff screens, a
  floor-plan editor ("frontend foundation and seat map", "events screens",
  "restaurant screens").
- Email outbox with an idempotency key per email, a `sending` claim with a
  10-minute lease, retries, an allowlist, console and Resend providers, and a
  GitHub Actions cron every 15 minutes ("email system").
- Calendar invites on confirmation, change and cancellation emails, built by
  `mail/invites.py` ("integration", item 1).
- Event reminders, one per guest per event, kept in step with the seat
  (platform fixes, item 13; events fixes, item 12).
- Staff optimiser endpoints `POST /staff/{vid}/optimise/service` and
  `/optimise/exact-check` (events and restaurants fixes, item 7).
- `DELETE /r/{vid}/hold/{hold_id}` to give a held table back (events and
  restaurants fixes, item 5).
- Table `demo_links` for the demo entry links (platform fixes, item 4).
- Command `python -m app.seed.migrate` to create tables on Postgres
  (platform fixes, item 5).
- Opt-in Postgres test run with `SEATPLAN_TEST_POSTGRES` (events and
  restaurants fixes, item 16).
- CI runs `ruff format --check .` (platform fixes, item 15).

### Changed

- The backend is imported as `app` and run from `backend/`; the seed command
  is `cd backend && python -m app.seed.run` ("backend foundation", item 1;
  "integration", item 13).
- Recommendations return `rank` and `match`, never a raw score, and rank with
  the guest's own "knows" list only (events optimiser item 5, superseded by
  the events and restaurants fixes, item 1).
- Events exact check also returns `heuristic_seated`, `exact_seated` and a
  `note`; `gap_percent` is null when the two plans seat a different number of
  guests (events and restaurants fixes, item 2).
- Safety cut-off for both optimisers lowered to 15 s, under Vercel's 30 s
  `maxDuration` (events and restaurants fixes, item 3).
- Emails use the real templates in `mail/templates.py`; the temporary helpers
  are gone ("integration", item 1).
- The waitlist offer email no longer promises a hold ("integration", item 4).
- `max_party` is per venue and returned on `GET /r/{vid}` and `GET /b/{token}`
  (events and restaurants fixes, item 6).
- Staff what-if and walk-ins take an optional `date`; the dashboard adds
  covers seated (events and restaurants fixes, item 8).
- Error codes `method_not_allowed` (405) and `internal` (500) added to the
  contract; 400 and 413 map to `validation` (platform fixes, item 9).
- Contract wording on real time: the browser uses the stream first and polls
  only when it fails (events and restaurants fixes, item 15).
- Contract corrected: there is no Playwright suite and no `report/` folder
  (platform fixes, item 14). Reversed later the same day: see the next line.
- Browser tests with Playwright and axe-core in `frontend/e2e/`, run by
  `npm run e2e` and a new `e2e` job in CI ("documentation and verification",
  item 2).
- The documentation set in `docs/` and a documentation index in the README
  ("documentation and verification", item 7).

### Fixed

- Two cold starts on Postgres raced on `CREATE TABLE`; the app no longer
  creates tables there (platform fixes, item 5).
- Two scenario saves at once could get the same number: UNIQUE(event_id, seq)
  on `plan_snapshots`, and saves take the event lock first (platform fixes,
  item 6; events and restaurants fixes, item 11).
- A Postgres deadlock or serialization failure on any route now answers 409
  `conflict` "please try again" instead of 500; every write on an event takes
  the event lock first (events and restaurants fixes, item 4).
- Pooled Postgres URLs with options such as `pgbouncer=` failed to connect;
  unknown options are now dropped (platform fixes, item 7).
- Control characters (such as NUL) in free text gave a 500 on Postgres; they
  are now a 422 (events and restaurants fixes, item 9).
- A random test failure when slow logins crossed a minute boundary; the test
  now freezes the clock (platform fixes, item 10).
- On a phone, tapping a table panned the map so the tap missed (events and
  restaurants fixes, item 14).
- Staff heard their own actions read back as someone else's (events and
  restaurants fixes, item 13).
- What-if refusal is a 409, not a 500 ("integration", item 9).
- Frontend and backend restaurant shapes did not match; all conversions now
  live in `frontend/src/api/restaurant.ts` ("integration", item 5).
- An unknown venue time zone or a date such as 9999-12-31 gave a 500; both
  are now a 422 ("documentation and verification", item 1).
- Accessibility: the recommended-seat halo stops after two breaths, focus is
  kept clear of the sticky header and hold bars, and event dates are in
  British English ("documentation and verification", item 6).

### Security

- Demo reset needs the `X-Demo-Key` header; the organiser-session path was
  removed, because the demo password is public (platform fixes, item 1).
- No public demo passwords on Postgres (platform fixes, item 2).
- `SECRET_KEY` is required on Postgres, demo mode or not (platform fixes,
  item 3).
- Raw demo tokens moved out of the audit log (platform fixes, item 4).
- On Vercel a missing `DATABASE_URL` stops the app instead of falling back to
  SQLite (platform fixes, item 7).
- Live stream refused past 30 opens a minute per address or 50 open streams
  per instance (platform fixes, item 8).
- Restaurant holds capped at 3 per client per venue and date, and never more
  than half the tables of a slot (events and restaurants fixes, item 5).
- Security headers on the static frontend in `vercel.json`: CSP, no framing,
  `no-referrer`, `nosniff` (platform fixes, item 12).
- `tzdata` added so time zones do not depend on the host (platform fixes,
  item 11).
- The email processing endpoint is rate limited before the secret check, and
  an empty `CRON_SECRET` rejects every call ("email system", item 4).
- `X-Forwarded-For` is trusted only on Vercel; on Postgres a `SECRET_KEY`
  shorter than 32 characters stops the app; `rate_limits` stores a keyed hash
  instead of the IP address; the console email provider masks addresses;
  `Strict-Transport-Security` in `vercel.json` ("documentation and
  verification", item 1; details in [`security.md`](security.md)).
- Booking caps (S8): at most 4 upcoming diner bookings per mailbox and
  restaurant, and 10 booking attempts per client address (IPv6: per /64) and
  restaurant per UTC day; both answer 429 `rate_limited` ("booking caps and
  outbox links", items 1 and 2).
- Personal links leave the email outbox (S9): a finished row has every
  `/b/`, `/e/` and `/a/` link replaced, cancelled reminders are blanked, and
  finished rows are emptied after 30 days ("booking caps and outbox links",
  items 3 and 4).
