import { useT } from "../../i18n/I18nProvider";

/** The forecast comes from Open-Meteo, which asks to be credited: the credit sits in the page footer, not in the weather card. */
export function WeatherCredit() {
  const { t } = useT();
  return <p><a href="https://open-meteo.com/" rel="noopener noreferrer" target="_blank">{t("Weather data by Open-Meteo.com")}</a></p>;
}
