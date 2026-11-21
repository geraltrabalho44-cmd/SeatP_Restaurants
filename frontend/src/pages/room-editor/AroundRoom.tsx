import { word } from "./names";
import { tr } from "../../i18n/locale";
import { useT } from "../../i18n/I18nProvider";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { getOwnerProfile } from "../../api/owner";
import { Button, Select } from "../../design/components";
import { RoomNumberField } from "./ShapeTools";
import { findNearby } from "../../maps/nearbyFeatures";
import type { NearFeature } from "../../maps/nearbyFeatures";
import type { Room } from "./roomModel";
import { directionWord, setSurrounding, setTerrace, setTerraceSize, SURROUNDINGS, surroundingOf, terraceOn, terraceSize, wallFacing } from "./surroundings";
import type { SurroundingKind } from "./surroundings";

type Suggestions = { status: "idle" } | { status: "loading" } | { status: "no-pin" } | { status: "failed" } | { status: "ready"; found: NearFeature[] };
const NAMES: Record<NearFeature["kind"], string> = { sea: "The sea", river: "A river", park: "A park" };

/** Say what is outside each wall: it is drawn on the plan, diners read it, and the restaurant's location suggests it. */
export function AroundRoom({ room, side, onSide, onChange }: { room: Room; side: number; onSide: (side: number) => void; onChange: (room: Room) => void }) {
  const { t } = useT();
  const { venueId = "" } = useParams();
  const [error, setError] = useState(""), [suggestions, setSuggestions] = useState<Suggestions>({ status: "idle" });
  const apply = (target: number, kind: SurroundingKind | null) => {
    try { onChange(setSurrounding(room, target, kind)); setError(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : tr("Check the wall.")); }
  };
  const terrace = terraceOn(room, side);
  const tryChange = (change: () => Room) => { try { onChange(change()); setError(""); } catch (caught) { setError(caught instanceof Error ? caught.message : "Check the wall."); } };
  const suggest = async () => {
    setSuggestions({ status: "loading" });
    try {
      const profile = await getOwnerProfile(venueId);
      if (profile.lat === null || profile.lng === null) { setSuggestions({ status: "no-pin" }); return; }
      setSuggestions({ status: "ready", found: await findNearby(profile.lat, profile.lng) });
    } catch { setSuggestions({ status: "failed" }); }
  };
  return <section className="room-around" aria-labelledby="room-around-title">
    <h3 id="room-around-title">{t("Around the room")}</h3>
    <Select label={t("Wall")} value={String(side)} options={room.outline.points.map((_, i) => ({ value: String(i), label: t("Wall {n}", { n: i + 1 }) }))} onChange={e => { onSide(Number(e.target.value)); setError(""); }} />
    <Select label={t("What is outside")} value={surroundingOf(room, side)?.kind ?? ""} options={[{ value: "", label: t("Nothing in particular") }, ...SURROUNDINGS.map(s => ({ value: s.kind, label: word(s.label) }))]} onChange={e => apply(side, (e.target.value || null) as SurroundingKind | null)} />
    {terrace ? <>
      <h3>{t("Terrace on Wall {n}", { n: side + 1 })}</h3>
      <RoomNumberField label={t("Terrace width (m)")} value={terraceSize(room, side, terrace).along / 100} decimals={2} min={0.5} onCommit={m => tryChange(() => setTerraceSize(room, side, { along: m * 100 }))} />
      <RoomNumberField label={t("Terrace depth (m)")} value={terraceSize(room, side, terrace).depth / 100} decimals={2} min={0.5} onCommit={m => tryChange(() => setTerraceSize(room, side, { depth: m * 100 }))} />
      <Button variant="secondary" onClick={() => tryChange(() => setTerrace(room, side, false))}>{t("Remove terrace")}</Button>
    </> : <Button variant="secondary" onClick={() => tryChange(() => setTerrace(room, side, true))}>{t("Add terrace")}</Button>}
    {error && <p role="alert" className="room-error">{error}</p>}
    <Button variant="secondary" busy={suggestions.status === "loading"} onClick={() => void suggest()}>{t("Suggest from my location")}</Button>
    {suggestions.status === "no-pin" && <p role="status">{t("Place the pin on the map in your restaurant's profile first, and we can suggest what is around it.")}</p>}
    {suggestions.status === "failed" && <p role="status">{t("Could not look around your location just now. You can still choose by hand.")}</p>}
    {suggestions.status === "ready" && suggestions.found.length === 0 && <p role="status">{t("Nothing notable within a short walk (600 m): no sea, river or park. You can still choose by hand.")}</p>}
    {suggestions.status === "ready" && suggestions.found.length > 0 && <ul className="room-around-list" aria-label={t("Suggestions")}>
      {suggestions.found.map(item => {
        const facing = item.bearing === null ? null : wallFacing(room, item.bearing);
        return <li key={item.kind}>
          <span>{item.bearing === null ? t("{name}, right where you are.", { name: word(NAMES[item.kind]) }) : t("{name}, about {metres} m {direction}.", { name: word(NAMES[item.kind]), metres: item.metres, direction: word(`to the ${directionWord(item.bearing)}`) })}</span>
          {facing && <Button variant="secondary" onClick={() => { onSide(facing.side); apply(facing.side, item.kind); }}>{t("Put it on Wall {n}", { n: facing.side + 1 })}</Button>}
        </li>;
      })}
    </ul>}
  </section>;
}
