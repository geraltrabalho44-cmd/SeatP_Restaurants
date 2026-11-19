# Restaurant languages

- catalogue.ts holds English UI messages and their Portuguese, Spanish and French translations.
- locale.ts resolves released locales and formats interpolated messages.
- I18nProvider.tsx exposes useT and manages explicit language preferences on restaurant routes.
- LanguagePicker.tsx renders native language names with keyboard support.
- locale.test.ts checks detection, release gating and interpolation.

English is always available. Change VITE_I18N_LOCALES at build time to release another language. Names, reviews and restaurant-authored content retain their original language.
