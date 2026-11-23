import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createRestaurant, getOwnerProfile, saveOwnerProfile } from "../../api/owner";
import type { OwnerProfile } from "../../api/owner";
import { Button, ErrorState, PageShell, Skeleton } from "../../design/components";
import { useT } from "../../i18n/I18nProvider";
import { useLoad } from "../restaurant/useLoad";
import { EMPTY_PROFILE, IdentityForm, LocationForm } from "./ProfileForms";
import "./owner.css";

export default function NewRestaurantWizard() {
  const { t } = useT();
  const { venueId } = useParams();
  const { state, reload } = useLoad(() => venueId ? getOwnerProfile(venueId) : Promise.resolve(EMPTY_PROFILE), venueId ?? "new");
  return <PageShell title={t("Add a restaurant")}><Link className="owner-back" to="/owner">← {t("My restaurants")}</Link>
    {state.status === "loading" && <Skeleton label={t("Loading your setup")} lines={4} />}
    {state.status === "error" && <ErrorState message={t("Could not open your setup. Check your sign-in or retry.")} onRetry={() => reload()} />}
    {state.status === "ready" && <Wizard key={state.data.public_id || "new"} initial={state.data} />}
  </PageShell>;
}
function Wizard({ initial }: { initial: OwnerProfile }) {
  const { t } = useT();
  const [profile, setProfile] = useState(initial), [step, setStep] = useState(initial.cuisines.length && initial.price_level ? 2 : 1), [saved, setSaved] = useState(false);
  const pendingId = useRef(initial.public_id), navigate = useNavigate();
  return <section><h1>{t("Add a restaurant")}</h1><ol className="owner-steps" aria-label={t("Restaurant setup steps")}>{(["Identity", "Location", "Photos", "Opening hours", "Rooms", "Review"] as const).map((name, index) => <li key={name} aria-current={index + 1 === step ? "step" : undefined}>{index + 1}. {t(name)}</li>)}</ol>
    <p className="owner-step-note">{t("Step {n} of 6 · {name}", { n: Math.min(step, 2), name: step === 1 ? t("Identity") : t("Location") })}</p>
    {saved ? <><h2>{t("Location saved")}</h2><p>{t("You can leave and resume setup from your restaurants.")}</p><div className="ow-page-next"><Link className="btn btn-primary" to={`/owner/${profile.public_id}/photos`}>{t("Continue to photos")}</Link></div></> : step === 1 ? <><h2>{t("Identity")}</h2><IdentityForm key={profile.public_id} profile={profile} label={t("Save and continue")} onSave={async changes => {
      if (!pendingId.current) pendingId.current = (await createRestaurant(changes.name!)).public_id;
      const next = await saveOwnerProfile(pendingId.current, changes); setProfile(next); setStep(2);
      if (!initial.public_id) navigate(`/owner/${next.public_id}/setup`, { replace: true });
    }} /></> : <><h2>{t("Location")}</h2><Button variant="secondary" onClick={() => setStep(1)}>{t("Back")}</Button><LocationForm profile={profile} label={t("Save and continue")} onSave={async changes => { setProfile(await saveOwnerProfile(profile.public_id, changes)); setSaved(true); setStep(3); }} /></>}
  </section>;
}
