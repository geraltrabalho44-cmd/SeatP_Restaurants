import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { getOwnerProfile, saveOwnerProfile } from "../../api/owner";
import type { OwnerProfile } from "../../api/owner";
import { Button, ErrorState, Skeleton } from "../../design/components";
import { useT } from "../../i18n/I18nProvider";
import { OwnerShell } from "./OwnerShell";
import { useLoad } from "../restaurant/useLoad";
import { IdentityForm, LocationForm } from "./ProfileForms";
import { ListingPreview } from "./ListingPreview";
import "./owner.css";

export default function ProfilePage() {
  const { t } = useT();
  const { venueId = "" } = useParams();
  const { state, reload } = useLoad(() => getOwnerProfile(venueId), venueId);
  return <OwnerShell title={t("Restaurant profile")} venueId={venueId} current="profile">
    <div className="ow-page-head"><div><h1 className="ow-title">{t("Restaurant profile")}</h1><p className="rb-muted">{t("Help guests recognise your restaurant and find the entrance.")}</p></div></div>
    {state.status === "loading" && <Skeleton label={t("Loading your profile")} lines={4} />}
    {state.status === "error" && <ErrorState message={t("Could not open this profile. Check your sign-in or retry.")} onRetry={() => reload()} />}
    {state.status === "ready" && <Profile key={state.data.public_id} initial={state.data} />}
  </OwnerShell>;
}
function Profile({ initial }: { initial: OwnerProfile }) {
  const { t } = useT();
  const [profile, setProfile] = useState(initial);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useSearchParams();
  const location = query.get("section") === "location";
  const selectSection = (next: boolean): void => { setQuery(next ? { section: "location" } : {}, { replace: true }); setMessage(""); };
  const save = async (changes: Parameters<typeof saveOwnerProfile>[1]) => { const next = await saveOwnerProfile(profile.public_id, changes); setProfile(next); setMessage(profile.status === "published" && next.status === "draft" ? t("Profile saved as a draft. New bookings are closed until you fix the problems and publish again. Existing bookings are kept.") : t("Profile saved")); };
  return (
    <div className="ow-two">
      <section className="rb-card ow-checks" aria-label={t("Profile editor")}>
        <nav className="owner-profile-tabs" aria-label={t("Profile sections")}>
          <Button variant={!location ? "primary" : "secondary"} aria-pressed={!location} onClick={() => selectSection(false)}>{t("Identity")}</Button>
          <Button variant={location ? "primary" : "secondary"} aria-pressed={location} onClick={() => selectSection(true)}>{t("Location")}</Button>
        </nav>
        <span role="status">{message}</span>
        {location ? <LocationForm profile={profile} label={t("Save profile")} onSave={save} /> : <IdentityForm profile={profile} label={t("Save profile")} onSave={save} />}
      </section>
      <aside className="rb-card ow-listing" aria-label={t("Listing preview")}>
        <h2 className="ow-card-title">{t("Listing preview")}</h2>
        <ListingPreview venueId={profile.public_id} name={profile.name} profile={profile} />
        <Link className="btn btn-secondary" to={`/owner/${encodeURIComponent(profile.public_id)}/photos`}>{t("Edit photos")}</Link>
      </aside>
    </div>
  );
}
