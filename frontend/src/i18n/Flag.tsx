import type { Locale } from "./locale";

// Small drawn flags (inline SVG, 3:2) so they look the same on every computer: the flag emoji turn into two
// letters on Windows. English shows the United Kingdom's flag, as most sites do. Decorative: the language is
// always written next to it, so the flag has no text of its own.
const FLAGS: Record<Locale, React.ReactNode> = {
  en: (
    <>
      <rect width="30" height="20" fill="#012169" />
      <path d="M0 0 30 20M30 0 0 20" stroke="#fff" strokeWidth="4" />
      <path d="M0 0 30 20M30 0 0 20" stroke="#C8102E" strokeWidth="1.6" />
      <path d="M15 0v20M0 10h30" stroke="#fff" strokeWidth="6.5" />
      <path d="M15 0v20M0 10h30" stroke="#C8102E" strokeWidth="3.6" />
    </>
  ),
  pt: (
    <>
      <rect width="30" height="20" fill="#FF0000" />
      <rect width="12" height="20" fill="#006600" />
      <circle cx="12" cy="10" r="4.2" fill="#FFCC00" />
      <circle cx="12" cy="10" r="2.4" fill="#FF0000" />
    </>
  ),
  es: (
    <>
      <rect width="30" height="20" fill="#AA151B" />
      <rect y="5" width="30" height="10" fill="#F1BF00" />
    </>
  ),
  fr: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <rect width="10" height="20" fill="#0055A4" />
      <rect x="20" width="10" height="20" fill="#EF4135" />
    </>
  ),
};

export function Flag({ locale }: { locale: Locale }) {
  return (
    <svg className="flag" viewBox="0 0 30 20" width="20" height="13" aria-hidden="true" focusable="false">
      <clipPath id={`flag-${locale}`}>
        <rect width="30" height="20" rx="2.5" />
      </clipPath>
      <g clipPath={`url(#flag-${locale})`}>{FLAGS[locale]}</g>
    </svg>
  );
}
