# Handoff, 2026-11-19: the restaurant work now lives in this repository

For Sérgio and his coding agent. No passwords are in this file on purpose: the repository is public. Ask Martim for the shared account details (they were sent on WhatsApp).

## Why there is a new repository

The `main` of the original repository (simaoglopes-eng/seatplan) still has the 14 November version. Everything Martim and Sérgio built since then sits in a branch of it, 195 commits ahead. Pushing that branch to `main` would publish it straight to the live site (CI passes, then a robot deploys), and the live database does not have the 14 new tables yet, so pages would break. Nobody had reviewed it either. So the team decided to put the restaurant work in a repository of its own and carry on from here. The original repository and its site are untouched.

This repository holds the whole project with its full history, Events included (the restaurant side shares the database, the seat map and the guest accounts with it). Sérgio's commits are all in it.

## What Martim and Claude did (to 2026-11-19)

- Deposits for bookings, with a demo payment page (Stripe ready, off).
- SMS and WhatsApp reminders (Twilio / Meta ready, off), with phone consent.
- Owner Insights (totals, busiest tables on the floor plan, guest book) and discount coupons (shared link and QR, sent to chosen guests, automatic rules). Only guests who accepted offers are emailed.
- Terms, privacy and offers on the last booking step (GDPR; the wording is a draft that needs a lawyer).
- Weather, sunset table and rain plan, natural-language search, and the base of the languages (Codex's work, finished).
- The whole restaurant side in pt-PT, es and fr: diner journey, owner pages, staff screens, sign-in. English is the default and the tests read English. The translations load only when another language is on. A native speaker must review them.
- Owner and staff sign-in through Supabase Auth, off by default: Google and Apple buttons and two-step verification, written and tested with a simulated Supabase, **never tried against a real Supabase yet**.
- Diner accounts from the restaurant side: `/restaurants/account/sign-up`, an emailed code, the same account that events use.
- Tests: about 1160 backend and 770 frontend, plus the Playwright suite. Known flaky ones: `room-shape.spec.ts` (L-shaped room), and a rate limit when the whole e2e suite runs at once (run the failing spec alone).

## The live site

- Address: https://seatplan-final.vercel.app (Vercel project `seatplan-final`, team `SeatPlan`, Hobby plan).
- Vercel is connected to **this repository**: every push to `main` deploys by itself. So work on branches and open pull requests; do not push to `main` casually.
- Database: Neon (`neon-claret-dog`, region London), added through the Vercel Marketplace. It sets `DATABASE_URL`.
- The Vercel project owner is the shared account (login details on WhatsApp). The two workflows `deploy.yml` and `email-cron.yml` are switched off here on purpose (the Vercel Git integration does the deploys, and there is no cron secret yet).
- Environment variables set in Vercel (names only): `SECRET_KEY`, `DEMO_KEY`, `CRON_SECRET`, `DEMO_MODE=1`, `DEMO_ORGANISER_PASSWORD`, `DEMO_STAFF_PASSWORD`, `FRONTEND_ORIGIN`, `PUBLIC_BASE_URL`, `EMAIL_PROVIDER=console` (no real email is sent), `EMAIL_FROM`, `VITE_I18N_LOCALES=en,pt,es,fr`. The demo accounts are `organiser@example.com` and `staff@example.com`, with the two demo passwords above (read them in Vercel, Settings, Environment Variables).
- Tables are created by hand, never by the app: `cd backend && python -m app.seed.migrate` with `DATABASE_URL` set to the **unpooled** Neon URL (Vercel, Storage, Neon, Open in Neon). It only adds tables and columns, and is safe to run again. Run it **before** a deploy that adds tables or columns. The demo data came from `python -m app.seed.run`.
- Real payments, SMS, WhatsApp, weather and email are all still in demo mode. See `docs/deployment.md` for each variable.

## Supabase (half done)

- A Supabase project named `SeatPlan` exists (organisation `SeatPlan`, Europe). Nothing in the site uses it yet.
- Still to do: in Authentication, Providers, Email keep "Confirm email" ON; in URL Configuration set Site URL to the address above and add as Redirect URLs `/owner/sign-in`, `/owner/sign-in/callback` and `/owner/reset-password` on that address; copy the Project URL and the **anon** key (never the service_role key); in Vercel add `AUTH_PROVIDER=supabase`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` and redeploy without the build cache; then try sign-up, confirmation email, sign-in, password reset, two-step verification and Google.
- The free Supabase email sender allows only a few emails an hour. Fine for testing; for real use connect an email provider under Authentication, SMTP (or Resend).
- Diner accounts stay on the events guest accounts, not on Supabase. Moving them needs Simão and Federico to agree.

## Open items

1. Sérgio must be invited to this repository (Settings, Collaborators, Write). His coding agent can then push branches and open pull requests here with a token or his own login.
2. Reset the Neon password (it was shown in a chat) and check that the Vercel variables updated, then redeploy.
3. Finish Supabase (above).
4. Delete the local file `vercel-env.txt` Martim's machine has in a temporary folder; it holds the demo secrets.
5. Email in other languages (needs the diner's language saved on the booking), calendar invites, the terms and privacy text and server error messages are still English.
6. Before anything goes to real users: a lawyer reviews the terms, a native speaker reviews the translations, and real email needs a verified sending domain.

## Rules that still apply

Read the `READ_ME_FIRST.md` of a folder before editing it. Tests first for pure logic and security. One verified change per commit. Never commit secrets. Do not edit the Events paths listed in `AGENTS.md` without Simão and Federico: `python scripts/check_forbidden_paths.py --base <the base branch>` checks that.
