# Work split between Claude and Codex (restaurants side)

Written 2026-11-18 for Martim's team. Read this whole file before touching code. It is the
single place that says who builds what, in which files, and the rules both of us follow.

Start point for both: branch `codex/restaurantes-ux` at commit `ad44909` (it holds Martim's work,
Sergio's `sergio/work`, `main`, Codex's integration, deposits, phone messages and Insights).
Check with `git log --oneline -8`. Each of us works on **our own branch off that commit** and
Martim merges them; we never push to `main`.

| | Branch to create | Worktree |
|---|---|---|
| Claude | `claude/offers-auth` | `C:\Users\marti\seatplan-rux` (already there) |
| Codex | `codex/search-weather-i18n` | his own, made with `git worktree add` |

---

## 1. Rules that apply to both (non-negotiable)

- **Never push to or edit `main`.** A PR, reviewed by someone else; a merge to `main` deploys to
  production. Before any merge: backup (`backups/backup.py`) and `python -m app.seed.migrate` on the
  production database. Never run `app.seed.run` or `app.seed.lisbon_catalogue` on production.
- **Never touch Events paths** (Simao and Federico own them): `frontend/src/pages/events/`,
  `editor/`, `join/`, `account/`, `backend/app/events_service/`, `backend/app/routers/events.py`,
  `attendee.py`, `guest_*.py`, `visitor.py`. Check with `python scripts/check_forbidden_paths.py --base main`.
- **Avoid `frontend/src/pages/room-editor/`** (Sergio edits it).
- **No new dependencies**, except `leaflet@1.9.4` and `@types/leaflet` (already allowed). Call
  external APIs with `httpx` (backend) or `fetch`; no vendor SDKs.
- **Nothing real is connected.** Every external service follows the same pattern as
  `backend/app/payments/` and `backend/app/messaging/`: a provider interface, a **demo provider by
  default** that sends or charges nothing, and the real one chosen only by environment variables.
  The app must refuse to start with a real provider and missing keys. Never put a key, token or
  `DATABASE_URL` in the repo, in a test or in a chat.
- **UI text and repo docs in English**; chat with Martim in Portuguese. English stays the default
  language, so no existing test changes.
- **Never delete or weaken a test.** Rate limit stays at 120 reads/minute; rerun specs that show
  "Too many attempts" alone.
- Every new folder gets a `READ_ME_FIRST.md` (purpose, one line per file, likely walkthrough
  questions). Update `docs/CHANGELOG.md` and the env table in `docs/deployment.md` + `.env.example`
  when you add a variable.
- New tables come from `db.create_all()` in `python -m app.seed.migrate`; a new column on an
  existing table must also be added to `NEW_COLUMNS` in `backend/app/seed/migrate.py`, in the same
  order as in `models.py`. List every new table in your final report (the deploy checklist needs it).
- Commit messages end with the attribution line your tool gives you. Commit and push **only when
  Martim says so**.
- Where he has not decided, **write the default you chose in the doc and the report**, and keep it
  easy to change. Do not ask him through pop-ups; ask in plain chat, short.
- Use `they/them` when someone's pronouns are unknown. Keep Martim's email private.

### Hot files (both of us may need them): edit only by adding, never by reformatting

`backend/app/models.py` (append classes at the end), `backend/app/main.py` (router imports and the
include list), `backend/app/config.py`, `backend/app/seed/migrate.py`, `frontend/src/App.tsx`,
`frontend/src/pages/owner/OwnerShell.tsx` (nav), `frontend/src/api/types.ts`,
`docs/CHANGELOG.md`, the `READ_ME_FIRST.md` tables. When Martim merges the two branches, a conflict
in these files is resolved by **keeping both sides**.

### How to check your work (same for both)

```
# backend (from backend/)
C:/Users/marti/seatplan/.venv/Scripts/ruff.exe check . ; ruff format --check .
python -m pytest -p no:cacheprovider --basetemp=<scratch> -W ignore -o addopts="" -v   # read the log, count PASSED/FAILED
# frontend (from frontend/)
npx tsc --noEmit -p . ; npx vitest run ; npm run contrast ; npm run build
E2E_API_PORT=<unique> E2E_WEB_PORT=<unique> E2E_PYTHON=C:/Users/marti/seatplan/.venv/Scripts/python.exe npx playwright test <file>
```

Last full result at `ad44909`: backend 1003 passed + 7 new (Insights), vitest ~644, contrast 182/0.
Known flaky/pre-existing, not ours: `room-shape.spec.ts` L-shaped (2 tests, Sergio's editor, pass
alone), `restaurant-ambience.spec.ts:57` (two-diner race), "staff seat a walk-in" between 20:00 and
20:15, `test_two_verifies_at_once_make_one_account`, and `PaymentsPage` tests when the machine is
loaded.

Look at your own screen: log in as `organiser@example.com` / `demo-organiser-2026` at
`http://127.0.0.1:5181` (backend :8000). Use real screenshots (Playwright) for UI work, desktop and 390 px.

---

## 2. What exists now (do not rebuild it)

| Feature | Where | Notes |
|---|---|---|
| Deposits (Stripe-ready, demo provider) | `backend/app/payments/`, `restaurant_service/booking_payments.py`, `policies.py`, `frontend/src/pages/pay/` | `pending` booking keeps its table until paid |
| Phone messages (Twilio/WhatsApp-ready, demo provider) | `backend/app/messaging/`, `restaurant_service/phone_messages.py`, `frontend/src/pages/messages/`, `PhoneOptIn.tsx` | Consent per booking, 6-digit code, signed `/m/<token>` links |
| Owner Insights (totals, busiest tables heat plan, guest book) | `restaurant_service/insights.py`, `routers/owner_insights.py`, `frontend/src/pages/owner/InsightsPage.tsx` | Worked out from `bookings`; no table of its own |
| "Running late" | Codex's earlier work | |
| Design specs (unreviewed drafts) | `docs/superpowers/specs/2026-11-17-*-design.md` | i18n, weather-sunset, search-accessibility, payments-giftcards, table-alerts-heatmap, menu-widget, booking-details-crm, my-bookings, messaging |

Read the `READ_ME_FIRST.md` of every folder you touch.

---

## 3. Martim's decisions (2026-11-18)

1. **GDPR matters everywhere.** At the **last step of the booking** the diner ticks (a) **terms and
   conditions** (required; the text opens from a link) and (b) a **separate, optional, unticked**
   "I'd like to receive offers from this restaurant" box. The restaurant owner may use the booking
   data for their own statistics; the terms and privacy text must say so. Legal wording is a
   draft: mark it "to be reviewed by a lawyer" in the docs; this is not legal advice.
2. **Discount coupons, not gift cards.** The cost is the restaurant's; no money moves through
   SeatPlan. The owner has **many kinds of offers to choose from** and sets them per restaurant:
   a shared link or QR, sent to chosen guests (for example "not seen for 60 days", regulars, new
   guests, or any list), or automatic (win-back, birthday, after the Nth visit...). Offers go only
   to guests who ticked the offers box.
3. **No** editor for promoting events / free newsletters. Not wanted.
4. **Supabase Auth** for the logins. Martim wants it for owners, staff and diners ("every login").
   **Conflict to resolve with him:** the diner and organiser login is shared with Events
   (`GuestAccount`, `require_organiser`, `events_service`, `guest_*.py`, `join/`, `account/`),
   which are forbidden paths. Until Simao and Federico agree, Supabase covers the **restaurant
   side only** (owner, staff, diner accounts used on restaurant pages); the existing email-code
   login stays as the default and as the fallback. Backend proxy over `httpx`, no
   `@supabase/supabase-js`, on only when `SUPABASE_URL` and the keys are set.
5. Languages: pt-PT, en, es, fr; English stays the default (see the i18n spec).

---

## 4. The split

### Claude (`claude/offers-auth`)

| # | Work | Main files (Claude owns these) |
|---|---|---|
| C1 | **Consent at the last booking step**: terms and conditions box (required), separate offers box (optional), versioned consent records (who, when, which text, which restaurant), unsubscribe, owner-side terms/privacy text | `frontend/src/pages/restaurant/StepDetails.tsx` and its new components, `routers/restaurants.py` (`BookingIn`), new `restaurant_service/consents.py`, `frontend/src/pages/legal/` |
| C2 | **Coupons**: owner builds offers (kinds above), audiences from the guest book, redeem a code while booking, usage and cost shown in Insights, send by email to consenting guests (messaging provider pattern for SMS later) | new `restaurant_service/offers*.py`, `routers/owner_offers.py`, `routers/offers.py`, `frontend/src/pages/owner/Offers*.tsx`, `api/offers.ts`; reads `restaurant_service/insights.py` |
| C3 | **Supabase Auth** preparation (restaurant side, see decision 4) | new `backend/app/auth_providers/`, `routers/auth_supabase.py`, `security.py` (additive), login pages under `pages/owner` / `pages/discover` only |
| C4 | Then: **i18n of the booking flow, owner and staff pages** (after Codex's core is merged) | `pages/restaurant/`, `pages/owner/`, `backend/app/mail/restaurant_templates.py` |

### Codex (`codex/search-weather-i18n`)

| # | Work | Main files (Codex owns these) |
|---|---|---|
| X1 | **Weather and sunset**: forecast per day for the booking date (Open-Meteo through `httpx`, no key, cached), a rain plan (suggest indoor tables when rain is forecast), the table with the best sunset (computed locally from latitude/longitude and the room's north direction, no network). Spec: `2026-11-17-weather-sunset-design.md`. Provider interface with a demo/offline provider by default | new `backend/app/weather/`, `restaurant_service/weather_view.py`, `routers/weather.py`, `frontend/src/pages/restaurant/Weather*.tsx`, `StepTable.tsx` (additive) |
| X2 | **Natural-language and very flexible search** ("sushi for 4 near the river on Saturday", typos, synonyms, Portuguese and English words, price, cuisine, features, distance, time). A pure, tested query parser plus the existing discovery filters; no AI service required, with a `SearchProvider` interface so an LLM can be plugged in later. Spec: `2026-11-17-search-accessibility-design.md` (search part) | `restaurant_service/discovery.py`, new `restaurant_service/search_query.py`, `frontend/src/pages/discover/` |
| X3 | **i18n core and discovery**: `frontend/src/i18n/` (typed catalogues, `useT`, picker, `Intl` formatting), `<html lang>`, detection, then migrate **discovery and the public restaurant page** into pt/es/fr. Spec: `2026-11-17-i18n-design.md` phases 0-1. Released languages behind `VITE_I18N_LOCALES` (default `en`) | new `frontend/src/i18n/`, `pages/discover/`, `pages/restaurant-public/`, `design/components/` (additive strings only) |

Order inside each list is the order to do them. After X1-X3 Codex can take the backlog below.

### Backlog (not started; take after the above, tell Martim first)

Per-table alerts ("tell me when this table is free"), per-table reviews and "book the same table
again", embeddable widget + QR (needs a `frame-ancestors` exception in `vercel.json`),
accessibility and noise info per table, replies/delivery receipts for phone messages (YES/CANCEL/STOP
webhooks), the waitlist "a table is free" phone message.

---

## 5. Who must not edit what (to keep merges easy)

- Claude does not edit: `backend/app/weather/`, `search_query.py`, `discovery.py`, `frontend/src/i18n/`,
  `pages/discover/`, `pages/restaurant-public/`.
- Codex does not edit: `StepDetails.tsx`, `BookingPage.tsx`'s details step, `routers/restaurants.py`
  `BookingIn`, anything named `offers*`, `consents*`, `auth_providers`, `pages/owner/` (except adding
  its own strings after Claude's C4).
- If you need a change in a file the other owns, **write it down in your report to Martim** instead
  of editing; he decides.
- If both need `StepTable.tsx` (weather block vs. the table step), Codex adds a **new component and a
  single line** in `StepTable.tsx`; Claude does not touch `StepTable.tsx` in this round.

## 6. What to report when you finish a piece

Plain Portuguese, short: what works and how to try it at `http://127.0.0.1:5181`; test numbers; what
is **not** done; new tables and env vars; what Martim must do himself (accounts, keys, legal review);
files you wanted to change but do not own.
