# auth_providers: read me first

## Purpose

Lets restaurant owners and staff sign in with Supabase Auth instead of the built-in email and password,
**when it is switched on**: with email and password, with Google or Apple, and with a second step (a six-digit
code from an authenticator app). Off by default: with `AUTH_PROVIDER` unset nothing changes and these routes
answer 404.

Supabase answers one question only: *does this person own this email address?* SeatPlan keeps its own
accounts and its own session tokens, so every other page works exactly as before.

| File | One job |
|---|---|
| `supabase.py` | Calls Supabase's sign-in API over plain HTTPS (httpx, no SDK): sign up, sign in, reset a password, and check that the project asks people to confirm their email. Hides the key from `repr()` and from every error |
| `../restaurant_service/identity.py` | Turns a confirmed identity into a SeatPlan account: the same person as before, else an existing account with that email (linked), else a new owner account |
| `../routers/identity.py` | `GET /identity/config`, `POST /identity/owner/signup`, `/login`, `/reset`, `/set-password`, and for diners `POST /identity/diner/oauth/start` and `/identity/diner/oauth` (Google or Apple: finds or makes the diner account with that email and answers with a diner session; refused for an email that has two-step verification) |

## Switching it on (Martim does this; nothing here needs an account until then)

1. Make a project at supabase.com. In **Authentication > Providers > Email**, keep **Confirm email ON**.
   If it is off, anyone could sign up with somebody else's address, so SeatPlan refuses to work until it is on
   (it asks the project's settings before every 10 minutes of use).
2. In **Authentication > URL Configuration**, add `https://<your site>/owner/sign-in`,
   `https://<your site>/owner/reset-password`, `https://<your site>/owner/sign-in/callback**` and `https://<your site>/restaurants/account/callback**` (for diners) (the `**`
   lets the one-time check value after the `?` through) as redirect URLs.
   For Google and Apple, switch each on in **Authentication > Providers** and paste the client id and secret
   from Google Cloud Console / Apple Developer (Apple needs a paid developer account). SeatPlan offers a
   "Continue with ..." button only for the providers the project has on. Two-step verification (TOTP) is on by
   default in Supabase; check **Authentication > Multi-factor** if the setup page reports an error.
3. Set up an email sender (SMTP) in Supabase: its built-in sender is for tests and allows only a few emails an hour.
4. In Vercel: `AUTH_PROVIDER=supabase`, `SUPABASE_URL=https://<project>.supabase.co`,
   `SUPABASE_ANON_KEY=<the project's anon (public) key>`. The app refuses to start with the provider set and a
   key missing, or with an `http://` address (except localhost for development).

The anon key is public by design, but it is still kept out of logs and `repr()`. The service-role key is
**never** used or needed here.

## How it is kept safe

- Nothing is made or linked unless Supabase says the address was **confirmed**.
- Wrong password, unknown address and unconfirmed address all answer the same words; sign-up and reset
  answer the same whether or not the address has an account.
- The browser talks only to SeatPlan (`/api/identity/...`); SeatPlan talks to Supabase. The page's
  Content-Security-Policy is unchanged and no Supabase code or key reaches the browser.
- Only `organiser` and `staff` accounts can be reached this way; any other kind is refused.
- Rate limits per network, per email (keyed hash) and for sign-ups and resets.
- A password-reset token comes after the `#` of the link, so it never reaches a server log; the page takes
  it out of the address bar and sends it once. Resetting never signs anyone in.
- Accounts made before the switch still sign in with their password (the sign-in page tries the service first,
  then the built-in sign-in).

## Google, Apple and the second step

- The "Continue with Google / Apple" button is an ordinary link to Supabase's sign-in page. It comes back to
  `/owner/sign-in/callback?n=<nonce>#access_token=...`. The page keeps the nonce in this tab and refuses the
  return if it does not match (so a link someone else made cannot sign a visitor in as them), then SeatPlan
  asks Supabase who the token belongs to. A Google address is accepted only if Google confirmed it.
- An account with two-step verification is **never** signed in by a password, or by Google or Apple, alone:
  the answer is "a code is needed" (`mfa_required`), nothing is made or linked, and the session is made only
  after the code is checked (`POST /identity/owner/mfa`).
- The owner turns it on at **Security** (needs the password again and a first code, so it is on only when it
  really works) and off with the password and a current code. The QR code is drawn by SeatPlan's own
  generator (`frontend/src/qr/`) from the `otpauth://` address: no image from anyone else.
- **There are no recovery codes** (Supabase has none). An owner who loses the phone is locked out of that
  account until somebody with the project's admin access removes the factor in the Supabase dashboard
  (Authentication > Users > the user > remove the factor). The Security page says so before it turns on.

## Not done (and why)

- **Diner accounts on the restaurant pages.** They are `GuestAccount`s, shared with Events (Simao and Federico),
  and creating them from here would make accounts Events also sees. Needs their agreement first.
- **Recovery codes, passkeys, SMS codes.** Not offered by Supabase's authenticator-app step.
- **Event organisers** keep the built-in sign-in: it is shared with Events and is not touched.

## Likely walkthrough questions

**Why not use Supabase's own sign-in page and library in the browser?**
It needs a new dependency (`@supabase/supabase-js`), a looser Content-Security-Policy, and puts a key in
the browser. Going through SeatPlan keeps all three as they are, and keeps one kind of session for the app.

**What if Supabase is down?**
Owners see "The sign-in service could not be reached" (502), and nothing else is affected. Accounts with a
password can still sign in through the built-in route.

**Why link an existing account by email?**
Owning the confirmed address is the same proof that account was made with. Unconfirmed addresses link nothing.
