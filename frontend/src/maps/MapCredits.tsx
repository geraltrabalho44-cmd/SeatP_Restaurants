import { useT } from "../i18n/I18nProvider";

export function MapCredits() {
  const { t } = useT();
  return (
    <p>
      {t("Map data")} &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> {t("and")}{" "}
      <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>
    </p>
  );
}
