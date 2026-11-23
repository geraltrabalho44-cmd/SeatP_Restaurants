import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Button, Checkbox, Field, Select, Skeleton } from "../../design/components";
import { CUISINES } from "../../api/owner";
import type { OwnerProfile, ProfileChanges } from "../../api/owner";
import type { Message } from "../../i18n/catalogue";
import { useT } from "../../i18n/I18nProvider";
import { tr } from "../../i18n/locale";
import { phoneError } from "../restaurant/validation";
import { reverseGeocode } from "../../maps/reverseGeocode";
import type { GeoPoint } from "../../maps/reverseGeocode";
import "./owner-v5.css"; // the cuisine pills and the price buttons are styled there, and the "Add a restaurant" page has no owner menu to load it
const LeafletMap = lazy(() => import("../../maps/LeafletMap"));

export const EMPTY_PROFILE: OwnerProfile = { public_id: "", status: "draft", slug: "", name: "", description: "", cuisines: [], price_level: 2, phone: null, website: null, instagram: null, google_maps_url: null, address: "", lat: null, lng: null, timezone: "Europe/Lisbon" };
/** The four price levels: the full sentence is the radio's name; the symbols and the short range are what the eye reads. */
const PRICES: { level: number; name: Message; range: Message }[] = [
  { level: 1, name: "€ · per person: under 15 €", range: "under 15 €" },
  { level: 2, name: "€€ · per person: 15–30 €", range: "15–30 €" },
  { level: 3, name: "€€€ · per person: 30–60 €", range: "30–60 €" },
  { level: 4, name: "€€€€ · per person: over 60 €", range: "over 60 €" },
];
export const cuisineLabel = (value: string) => tr((value[0].toUpperCase() + value.slice(1)) as Message);

export function IdentityForm({ profile, label, onSave }: { profile: OwnerProfile; label: string; onSave: (changes: ProfileChanges) => Promise<void> }) {
  const { t } = useT();
  const [values, setValues] = useState(profile), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const change = (patch: ProfileChanges) => setValues(v => ({ ...v, ...patch }));
  return <form className="owner-form" onSubmit={event => { event.preventDefault(); void (async () => {
    if (!values.name.trim() || values.cuisines.length < 1) { setError(t("Enter a name and choose one to three cuisines.")); return; }
    const phone = phoneError(values.phone ?? ""); if (phone) { setError(phone); return; }
    setBusy(true); setError("");
    try { const { name, description, cuisines, price_level, phone, website, instagram, google_maps_url, slug } = values; await onSave({ name, description, cuisines, price_level, phone, website: website || null, instagram: instagram || null, google_maps_url: google_maps_url || null, ...(slug ? { slug } : {}) }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : t("Could not save the identity.")); } finally { setBusy(false); }
  })(); }}>
    <Field label={t("Restaurant name")} value={values.name} required maxLength={120} onChange={e => change({ name: e.target.value })} />
    <label className="field"><span className="field-label">{t("Short description")}</span><textarea className="field-input" maxLength={300} value={values.description} onChange={e => change({ description: e.target.value })} /><span>{t("{n}/300 characters", { n: values.description.length })}</span></label>
    <fieldset className="owner-cuisines"><legend>{t("Cuisines (choose 1–3)")}</legend><p className="owner-cuisines-count" role="status">{t("{n} of 3 selected", { n: values.cuisines.length })}</p>{CUISINES.map(c => <Checkbox key={c} label={cuisineLabel(c)} checked={values.cuisines.includes(c)} disabled={values.cuisines.length === 3 && !values.cuisines.includes(c)} onChange={e => change({ cuisines: e.target.checked ? [...values.cuisines, c] : values.cuisines.filter(item => item !== c) })} />)}</fieldset>
    <fieldset className="owner-price"><legend>{t("Price range")}</legend><p className="owner-price-hint">{t("What one guest usually spends.")}</p>
      <div className="owner-price-options">{PRICES.map(({ level, name, range }) => <label key={level} className="owner-price-option">
        <input type="radio" name="price_level" value={level} required checked={values.price_level === level} aria-label={t(name)} onChange={() => change({ price_level: level })} />
        <span className="owner-price-symbol" aria-hidden="true">{"€".repeat(level)}</span><span className="owner-price-range" aria-hidden="true">{t(range)}</span>
      </label>)}</div>
    </fieldset>
    <Field label={t("Phone")} type="tel" value={values.phone ?? ""} maxLength={40} onChange={e => change({ phone: e.target.value })} />
    <Field label={t("Website")} type="url" value={values.website ?? ""} maxLength={200} onChange={e => change({ website: e.target.value })} />
    <Field label={t("Instagram")} value={values.instagram ?? ""} maxLength={31} pattern="@?[A-Za-z0-9._]{1,30}" onChange={e => change({ instagram: e.target.value })} />
    <Field label={t("Google Maps link")} type="url" value={values.google_maps_url ?? ""} maxLength={200} onChange={e => change({ google_maps_url: e.target.value })} />
    {profile.public_id && <Field label={t("Public link")} hint={profile.status === "published" ? t("Fixed after publication.") : t("Use lowercase letters, digits and hyphens.")} value={values.slug ?? ""} readOnly={profile.status === "published"} required={profile.status === "draft"} maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" onChange={e => change({ slug: e.target.value })} />}
    {error && <p role="alert" className="owner-error">{error}</p>}<Button type="submit" busy={busy}>{label}</Button>
  </form>;
}

export function LocationForm({ profile, label, onSave }: { profile: OwnerProfile; label: string; onSave: (changes: ProfileChanges) => Promise<void> }) {
  const { t } = useT();
  const [address, setAddress] = useState(profile.address), [lat, setLat] = useState(profile.lat?.toString() ?? ""), [lng, setLng] = useState(profile.lng?.toString() ?? "");
  const [timezone, setTimezone] = useState(profile.timezone), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [looking, setLooking] = useState(false), [lookupNote, setLookupNote] = useState("");
  const addressRef = useRef(address), autoFilled = useRef(profile.address), timer = useRef<number>(), request = useRef<AbortController | null>(null);
  addressRef.current = address;
  useEffect(() => () => { window.clearTimeout(timer.current); request.current?.abort(); }, []);
  // Fills the address from a pin. It never overwrites an address the owner typed.
  const lookup = (at: GeoPoint) => {
    window.clearTimeout(timer.current); request.current?.abort();
    timer.current = window.setTimeout(() => {
      const controller = new AbortController(); request.current = controller;
      setLooking(true); setLookupNote("");
      reverseGeocode(at, controller.signal).then(found => {
        if (controller.signal.aborted) return;
        if (!found) { setLookupNote(tr("No address found for this pin. Type the address in.")); return; }
        if (!addressRef.current.trim() || addressRef.current === autoFilled.current) { autoFilled.current = found; setAddress(found); setLookupNote(tr("Address filled from the pin. Check it and edit it if needed.")); }
        else setLookupNote("");
      }).catch(() => { if (!controller.signal.aborted) setLookupNote(tr("Could not look up the address. Type the address in.")); })
        .finally(() => { if (!controller.signal.aborted) setLooking(false); });
    }, 600);
  };
  const zones = ["Europe/Lisbon", "Atlantic/Madeira", "Atlantic/Azores"];
  const valid = lat.trim() !== "" && lng.trim() !== "" && Number.isFinite(Number(lat.replace(",", "."))) && Math.abs(Number(lat.replace(",", "."))) <= 90 && Number.isFinite(Number(lng.replace(",", "."))) && Math.abs(Number(lng.replace(",", "."))) <= 180;
  const point = valid ? { lat: Number(lat.replace(",", ".")), lng: Number(lng.replace(",", ".")) } : null;
  return <form className="owner-form" onSubmit={event => { event.preventDefault(); if (!point) { setError(t("Place the pin or enter valid latitude and longitude.")); return; } setBusy(true); setError(""); void onSave({ address, ...point, timezone }).catch(caught => setError(caught instanceof Error ? caught.message : t("Could not save the location."))).finally(() => setBusy(false)); }}>
    <Field label={t("Address")} value={address} required maxLength={200} onChange={e => setAddress(e.target.value)} />
    <Suspense fallback={<Skeleton label={t("Loading the location map")} lines={4} />}><LeafletMap point={point} onChange={p => { setLat(p.lat.toFixed(6)); setLng(p.lng.toFixed(6)); setError(""); lookup(p); }} /></Suspense>
    <p>{t("The sun on your tables is worked out from the pin, so place it on your building.")}</p>
    {looking && <p role="status">{t("Looking up the address…")}</p>}
    {lookupNote && <p role="status">{lookupNote}</p>}
    <div className="owner-location-fields"><Field label={t("Latitude")} value={lat} inputMode="decimal" required onChange={e => setLat(e.target.value)} /><Field label={t("Longitude")} value={lng} inputMode="decimal" required onChange={e => setLng(e.target.value)} /></div>
    <Select label={t("Time zone")} value={zones.includes(timezone) ? timezone : "other"} options={[...zones.map(value => ({ value, label: value })), { value: "other", label: t("Other…") }]} onChange={e => setTimezone(e.target.value === "other" ? "" : e.target.value)} />
    {!zones.includes(timezone) && <Field label={t("Other time zone")} value={timezone} required maxLength={64} onChange={e => setTimezone(e.target.value)} />}
    {error && <p role="alert" className="owner-error">{error}</p>}<Button type="submit" busy={busy}>{label}</Button>
  </form>;
}
