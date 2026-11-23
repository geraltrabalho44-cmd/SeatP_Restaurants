# Email branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every SeatPlan email uses the product's palette, fonts and logo; restaurant emails carry "Change time" and "Cancel booking" buttons that open the manage page.

**Architecture:** One new style module holds the token colours and the button; the shared `_PAGE` shell in `templates.py` gets the logo header and a no-reply line. The logo is a PNG drawn at first use with `png.py` and added by `ResendProvider` as an inline `cid:logo` attachment (nothing stored in the database). The manage page reads `?action=change|cancel` and opens the existing form or confirmation dialog, never acting on its own.

**Tech Stack:** Python 3.12 / FastAPI / pytest / ruff (backend), React + vitest (frontend), Resend over httpx.

**Spec:** `docs/superpowers/specs/2026-11-23-email-branding-design.md`

## Global Constraints

- Colours from `frontend/src/design/tokens.css`: page `#f4efe6`, card `#fbf8f2`, ink `#1e2724`, muted `#545d58`, hairline `#c9bfae`, primary `#1f5a48`, on-primary `#fbf8f2`, brass `#7f5310`, danger `#9c3226`.
- Fonts: the `--font-display` and `--font-body` stacks of `tokens.css`, written with single quotes (they sit inside `style="..."`).
- One column, `max-width:560px`, inline styles only. No dark-mode styling, no tracking pixels.
- Logo is a PNG, 96 x 96, shown at 40 px, with alt text "SeatPlan" and the text "SeatPlan" beside it.
- Text contrast at least 4.5:1 (WCAG AA) for every text/background pair used.
- The HTML version prints no web address; buttons are the links. The plain-text version keeps its addresses.
- A link opened (GET) must never cancel or change a booking.
- Do not touch the protected event paths in `AGENTS.md`. Event emails change look only (they share `_PAGE`); their words, keys and timing stay.
- `EMAIL_ALLOWLIST` stays in force. No deposits or Stripe in this plan.
- Commands (Windows): backend from `backend/`: `..\.venv\Scripts\ruff.exe check .`, `..\.venv\Scripts\ruff.exe format --check .`, `..\.venv\Scripts\python.exe -m pytest -q`. Frontend from `frontend/`: `npm run typecheck`, `npm test`, `npm run build`, `npm run contrast`. Root: `.\.venv\Scripts\python.exe scripts/check_forbidden_paths.py --base main`.
- One verified commit per task, on `claude/email-branding`. No push, no PR.

## Review Focus

1. A restaurant phone, name or link containing `<`, `"` or `&` must be escaped in the new buttons and the "Cannot tap a button" line (Task 4).
2. A manage link that already has a query string gets `&action=...`, not a second `?` (Task 4).
3. Images off or no `cid:` support: the header still reads "SeatPlan" as text and the buttons still work (Task 1).
4. A scanner or preview opening `/b/<token>?action=cancel` makes no DELETE request (Task 6).
5. `?action=cancel` or `?action=change` on a booking that is already cancelled, or an unknown action value, opens nothing (Task 6).
6. The logo is never stored in `email_outbox` and is attached only to emails whose HTML contains `cid:logo` (Task 3).

---

### Task 1: Style module and the shared shell

**Files:**
- Create: `backend/app/mail/style.py`
- Modify: `backend/app/mail/templates.py` (`_PAGE`, `_BUTTON`, `_html_version`, `_text_version`, account seat email near line 339-374)
- Test: `backend/tests/test_mail_style.py`, `backend/tests/test_mail_templates.py`

**Interfaces:**
- Produces (`app/mail/style.py`): constants `BG, CARD, INK, MUTED, BORDER, PRIMARY, ON_PRIMARY, ACCENT, DANGER` (hex strings from Global Constraints), `FONT_DISPLAY: str`, `FONT_BODY: str`; `button_html(href: str, label: str, *, primary: bool = True) -> str` (escapes both; primary = filled `PRIMARY` with `ON_PRIMARY` text, secondary = 2 px `PRIMARY` border on `CARD`, same padding, `border-radius:6px`, inline-block, `margin:0 8px 8px 0`).
- Produces (`templates.py`): `NO_REPLY_TEXT = "Please do not reply to this email: nobody reads this address."`; `_BUTTON` is removed, callers use `button_html`.

- [ ] **Step 1: Write failing tests** in `test_mail_style.py`:
  - `test_colours_match_the_design_tokens`: read `frontend/src/design/tokens.css` (path from `Path(__file__)`), find `--c-bg`, `--c-surface`, `--c-text`, `--c-text-muted`, `--c-border`, `--c-primary`, `--c-on-primary`, `--c-accent`, `--c-danger` and assert each equals `BG, CARD, INK, MUTED, BORDER, PRIMARY, ON_PRIMARY, ACCENT, DANGER` (case-insensitive).
  - `test_text_pairs_pass_wcag_aa`: with the WCAG relative-luminance formula, assert ratio >= 4.5 for INK/CARD, MUTED/CARD, MUTED/BG, ON_PRIMARY/PRIMARY, PRIMARY/CARD, ACCENT/CARD.
  - `test_button_escapes_and_has_two_looks`: `button_html('https://x/b/a?x=1&y="2"', "<b>Go</b>")` contains `href="https://x/b/a?x=1&amp;y=&quot;2&quot;"` and `&lt;b&gt;Go&lt;/b&gt;`; primary contains `background:#1f5a48`; `primary=False` contains `border:2px solid #1f5a48`.
  In `test_mail_templates.py` replace the assertion `"<img" not in parts.body_html` with `parts.body_html.count("<img") == 1 and 'src="cid:logo"' in parts.body_html and 'alt="SeatPlan"' in parts.body_html`; add `test_header_still_reads_with_images_off`: the HTML contains `SeatPlan` outside the `<img` tag (strip tags with a regex, assert "SeatPlan" in the remaining text); add `test_every_email_says_not_to_reply` over `_all_templates("Ana")`: `NO_REPLY_TEXT` in `body_text` and, HTML-escaped, in `body_html`; add `test_html_prints_no_web_address`: after removing every `href="..."` attribute, `"https://seatplan.example.com"` is not in `body_html`.
- [ ] **Step 2: Run** `..\.venv\Scripts\python.exe -m pytest tests/test_mail_style.py tests/test_mail_templates.py -q`. Expected: FAIL (module missing / assertions).
- [ ] **Step 3: Implement** `style.py` as specified. In `templates.py`: `_PAGE` becomes the linen page (`BG`), a header table (`<img src="cid:logo" width="40" height="40" alt="SeatPlan" style="display:block;border:0;">` + `{sender}` text in `FONT_DISPLAY`, 22 px bold, `INK`), the content card (`CARD`, 1 px `BORDER`, `border-radius:10px`, padding 24 px), body font `FONT_BODY`, then footer in `MUTED` followed by the HTML-escaped `NO_REPLY_TEXT`. `_html_version` and the account seat email use `button_html(...)` and drop the "If the button does not work, copy this link" paragraph. Add `NO_REPLY_TEXT` to `_text_version` (after the stop line) and to the account seat text. Build the `_PAGE` string from the constants so no hex is typed twice.
- [ ] **Step 4: Run** the two test files plus `tests/test_account_emails.py -q`. Expected: PASS. If an old test asserted the removed "copy this link" text, update it to the new rule.
- [ ] **Step 5: Commit** `feat(email): SeatPlan palette, fonts, logo header and no-reply line in the shared shell`.

### Task 2: The logo PNG

**Files:**
- Create: `backend/app/mail/logo.py`
- Test: `backend/tests/test_mail_logo.py`

**Interfaces:**
- Consumes: `encode_indexed`, `png_width` from `app/mail/png.py`.
- Produces: `LOGO_CONTENT_ID = "logo"`, `LOGO_SIZE = 96`, `logo_png() -> bytes` (cached with `functools.cache`), `logo_base64() -> str`.

- [ ] **Step 1: Write failing tests.** Helper `pixel(png, x, y) -> tuple[int,int,int]` in the test (inflate IDAT with `zlib`, strip the filter byte, look up PLTE). Tests: `png_width(logo_png()) == 96`; `len(logo_png()) < 8000`; `logo_png() is logo_png()`; `pixel(…, 48, 48) == (0xF4,0xEF,0xE6)` (the table); `pixel(…, 16, 48) == (0xD9,0xA4,0x41)` (the brass chair); `pixel(…, 12, 12) == (0x1F,0x5A,0x48)` (green square); `pixel(…, 0, 0) == (0xF4,0xEF,0xE6)` (corner shows the page colour); `base64.b64decode(logo_base64()) == logo_png()`.
- [ ] **Step 2: Run** `pytest tests/test_mail_logo.py -q`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `logo_png()`: shapes from `frontend/public/favicon.svg` scaled by 3 (rounded square r=24 in `#1F5A48`; table circle centre (48,48) r=18 and chairs r=7.8 at (48,16.5), (79.5,48), (48,79.5) in `#F4EFE6`; chair at (16.5,48) in `#D9A441`; outside the square `#F4EFE6`). Anti-alias by 4x supersampling, then map each output pixel's averaged colour to a palette of at most 256 entries built from the colours that occur.
- [ ] **Step 4: Run** the test file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(email): draw the SeatPlan logo as a small PNG`.

### Task 3: Attach the logo when sending

**Files:**
- Modify: `backend/app/mail/providers.py` (`ResendProvider._payload`)
- Test: `backend/tests/test_mail_providers.py`

**Interfaces:** Consumes `LOGO_CONTENT_ID`, `logo_base64` (Task 2).

- [ ] **Step 1: Write failing tests** using the file's fake-transport client: an `OutgoingEmail` whose `body_html` contains `src="cid:logo"` sends an attachment `{"filename": "logo.png", "content": logo_base64(), "content_id": "logo"}`; one without `cid:logo` has no such attachment; with `ics` and `image_png` also set, the order is `invite.ics`, `seat-map.png`, `logo.png`; `OutgoingEmail` has no logo field (the outbox is untouched).
- [ ] **Step 2: Run** `pytest tests/test_mail_providers.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement** in `_payload`: after the existing attachments, append the logo when `f"cid:{LOGO_CONTENT_ID}"` is in `message.body_html`.
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(email): attach the logo inline when an email uses it`.

### Task 4: Restaurant buttons, phone line and the payment note slot

**Files:**
- Modify: `backend/app/mail/style.py` (add `with_action`), `backend/app/mail/restaurant_templates.py` (`RestaurantBooking`, `_button`, `_html`, `_text`, `_picture_html`, `_photo_html`, `_where_html`, `_details_html` colours), `backend/app/mail/templates.py` (`booking_cancellation`)
- Test: `backend/tests/test_restaurant_emails.py`, `backend/tests/test_mail_templates.py`

**Interfaces:**
- Produces: `with_action(link: str, action: Literal["change", "cancel"]) -> str` in `style.py` (adds `action=<action>` with `?` or `&`); `RestaurantBooking.note: str = ""`; `booking_cancellation(..., manage_link: str, note: str = "") -> EmailParts`.

- [ ] **Step 1: Write failing tests:**
  - `with_action("https://s/b/t", "change") == "https://s/b/t?action=change"`; with `"https://s/b/t?x=1"` gives `"https://s/b/t?x=1&action=cancel"`.
  - For kinds `confirmed`, `changed`, `reminder`: HTML has buttons "Change time" (primary) and "Cancel booking" (secondary) whose hrefs are `…?action=change` / `…?action=cancel`; HTML has no `copy this link`; with `phone="+351 210 000 000"` it has `Cannot tap a button? Call +351 210 000 000.`; with `phone=None` it has no `Cannot tap`; a phone `<b>1</b>` is escaped; the text version still has `Manage my booking: <link>`.
  - `note="Your deposit is refunded."` appears in text and HTML of all three kinds and of `booking_cancellation(..., note=...)`; empty note adds nothing.
  - Update `test_restaurant_emails.py`: `count("<img") == 2` becomes `== 3` (logo, photo, map); the "no photo, map or address" test asserts `count("<img") == 1`.
- [ ] **Step 2: Run** `pytest tests/test_restaurant_emails.py tests/test_mail_templates.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement.** `_button(link, phone)` renders both buttons then the phone line (in `MUTED`, escaped). Replace the hard-coded grey/blue colours in the restaurant HTML with `style.py` constants (photo and map borders `BORDER`, links `PRIMARY`, `th`/`td` ink). Render `note` as a paragraph before the buttons when non-empty. `_closing` text: "You can change or cancel the booking with the buttons below." (reminder: "If you cannot come, please cancel with the button below so someone else can have the table."); keep the text version's single manage link.
- [ ] **Step 4: Run** both files plus `tests/test_account_emails.py`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(email): change and cancel buttons, phone fallback and payment note slot in restaurant emails`.

### Task 5: Full backend check

**Files:** none new.

- [ ] **Step 1: Run** `..\.venv\Scripts\ruff.exe check .`, `..\.venv\Scripts\ruff.exe format --check .`, `..\.venv\Scripts\python.exe -m pytest -q` from `backend/`. Expected: all pass. Fix only what this change broke (for example other tests that assert the old `<img` count or the old footer); never weaken a test.
- [ ] **Step 2: Run** `.\.venv\Scripts\python.exe scripts/check_forbidden_paths.py --base main` from the root. Expected: no forbidden path touched.
- [ ] **Step 3: Commit** any formatting fixes: `chore(email): format and lint`.

### Task 6: The manage page opens what the button asked for

**Files:**
- Modify: `frontend/src/pages/restaurant/ManageBookingPage.tsx` (`ManageBooking`)
- Test: `frontend/src/pages/restaurant/__tests__/manage.test.tsx`

**Interfaces:** Consumes `useSearchParams` from `react-router-dom`. Produces: `?action=change` starts with the time form open; `?action=cancel` starts with the cancel dialog open; both only when `isEditable(booking)`; any other value does nothing.

- [ ] **Step 1: Write failing tests** (extend `renderManage(token = "tok123", search = "")` to start at `/b/${token}${search}`): `?action=cancel` shows the dialog "Cancel this booking?" and `callsTo(calls, "DELETE", "/api/b/tok123")` is empty; `?action=change` shows the "Time" field; `?action=cancel` with `{ ...BOOKING, status: "cancelled" }` shows no dialog; `?action=bogus` shows neither; the existing tests still pass unchanged.
- [ ] **Step 2: Run** `npm test -- manage` from `frontend/`. Expected: new tests FAIL.
- [ ] **Step 3: Implement:** read `action` once with `useSearchParams`; use it only as the initial value of `panel` (`"time"`) and `cancelling` (`true`) when `isEditable(booking)`.
- [ ] **Step 4: Run** `npm run typecheck`, `npm test`, `npm run build`, `npm run contrast`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(manage): open the change form or cancel dialog from the email buttons`.

### Task 7: Docs and the real send

**Files:**
- Modify: `docs/email.md` (section 1 "no images" bullet; new section 11 "Look, logo and buttons"), `backend/app/mail/READ_ME_FIRST.md` (rows for `style.py`, `logo.py`), `.env.example` (no change expected)

- [ ] **Step 1: Update the docs:** section 11 states the palette source (`tokens.css`, guarded by `test_colours_match_the_design_tokens`), the logo attachment (`cid:logo`, ~size measured from `len(logo_png())`), the two buttons and the `?action=` rule (never acts on open), the no-reply line, and the payment `note` slot with a pointer to `seatp-restaurants-main`. Mark the Gmail/Outlook/Apple Mail rendering **[verified <date>]** only after Step 3.
- [ ] **Step 2: Send one real email.** From the root, in PowerShell, load `.env` (command in the chat handoff), then run a one-off script saved in the scratchpad (not in the repo) that builds `booking_email("confirmed", ...)` with sample facts (phone set, link `https://seatplan.example.com/b/demo-token`) and sends it with `ResendProvider(os.environ["RESEND_API_KEY"], os.environ["EMAIL_FROM"])` to the only allowed address. Expected: Resend answers with an id.
- [ ] **Step 3: Ask the project owner to open it** in Gmail on desktop and phone and report: logo visible, colours and fonts as the app, both buttons, phone line, no raw address. Fix what they report (loop on Tasks 1 or 4), then mark the docs **[verified]** with the date.
- [ ] **Step 4: Commit** `docs(email): look, logo and buttons`.
