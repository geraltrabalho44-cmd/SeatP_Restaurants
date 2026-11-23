import { Link } from "react-router-dom";
import { EmptyState, PageShell } from "../design/components";
import { useT } from "../i18n/I18nProvider";

export default function NotFound() {
  const { t } = useT();
  return (
    <PageShell title={t("Page not found")}>
      <EmptyState headingLevel={1} title={t("This seat does not exist")} action={<Link to="/">{t("Back to the start")}</Link>}>
        <p>{t("The link may be old or mistyped. Personal links from an email still work if you open them exactly as sent.")}</p>
      </EmptyState>
    </PageShell>
  );
}
