import { useT } from "../../i18n/I18nProvider";
/**
 * North is always the top of the plan, so the compass is a small fixed mark in the corner: an outlined
 * circle with an arrow and an N. It is transparent, takes no clicks and never turns.
 */
export function NorthCompass() {
  const { t } = useT();
  return <div className="room-compass" role="img" aria-label={t("North is at the top of the plan")}>
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="18" />
      <path d="M 20 9 L 25 22 L 20 19 L 15 22 Z" />
      <text x="20" y="29.5" textAnchor="middle" dominantBaseline="central">N</text>
    </svg>
  </div>;
}
