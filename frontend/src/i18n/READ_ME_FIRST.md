# Restaurant languages

- catalogue.ts (discovery and public pages), catalogue.booking.ts (the booking journey, table plan and chairs),
  catalogue.manage.ts (manage page, owner pages, staff pages, sign-in), catalogue.services.ts (payments, SMS link
  page, weather, rain plan) and catalogue.server.ts (the English sentences the server writes) hold the English
  messages and their Portuguese (pt-PT), Spanish and French translations, in that order. catalogue.ts merges them.
  The merged catalogue is its own chunk: it is only downloaded when a language other than English is on.
- locale.ts resolves released locales, formats interpolated messages and holds the language in use. A component
  calls `const { t } = useT()` (it draws again when the language changes); a plain function (dates, money,
  form checks) calls `tr(...)`, which speaks the language the provider last set. `activeTag()` gives the Intl tag.
- I18nProvider.tsx exposes useT and manages explicit language preferences on restaurant routes. Events routes are
  always English.
- LanguagePicker.tsx renders native language names with keyboard support.
- pages/restaurant/serverText.ts puts the closed set of sentences the server writes in English (light, view, what
  is near a table, the reasons for a suggestion) in the language in use. A restaurant's own words are left as written.
- locale.test.ts checks detection, release gating and interpolation. catalogue.test.ts checks that every sentence
  has all three languages, with the same {placeholders}.

The English text of a screen is the key. English is always available and is what the English tests read, so adding
a language never changes them. To translate a new sentence: write it in English in the component with `t("...")`,
add it to the right catalogue file with the three translations, and run `npm test` (the catalogue test fails if a
language or a placeholder is missing).

Change VITE_I18N_LOCALES at build time to release another language. Names, reviews and restaurant-authored content
retain their original language.

Not translated yet: the emails (confirmation, reminder, offers; they need the diner's language saved on the
booking), calendar invites, the terms and privacy document, the deposit-terms text, and API error messages from the
server. Events screens and the home page stay English. A native speaker should review pt, es and fr before release.
