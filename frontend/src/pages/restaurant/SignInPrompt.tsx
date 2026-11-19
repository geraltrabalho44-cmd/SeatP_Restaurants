// Staff screens need a session. Instead of a bare "401", say what to do and
// bring the person straight back here after signing in.
import { Link } from "react-router-dom";
import { EmptyState } from "../../design/components";
import { useT } from "../../i18n/I18nProvider";

export function SignInPrompt({ venueId }: { venueId: string }) {
  const { t } = useT();
  const next = encodeURIComponent(`/staff/${venueId}`);
  return (
    <EmptyState title={t("Please sign in to see the floor")} action={<Link to={`/login?next=${next}`}>{t("Sign in as staff")}</Link>}>
      <p>{t("The staff floor shows guests' names and notes, so it is only for signed-in staff. You will come straight back here.")}</p>
    </EmptyState>
  );
}
