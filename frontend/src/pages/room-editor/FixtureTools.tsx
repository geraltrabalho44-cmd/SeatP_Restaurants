import { word } from "./names";
import { tr } from "../../i18n/locale";
import { useT } from "../../i18n/I18nProvider";
import { Button, Checkbox, Select } from "../../design/components";
import { ObjectFields, OBJECT_DRAG_TYPE } from "./ObjectFields";
import { FixtureIcon } from "./FixtureIcon";
import type { IconKind } from "./FixtureIcon";
import { editFixture, editZone, FIXTURE_NAMES, FIXTURE_PALETTE, removeZone, ZONE_NAMES, ZONE_PALETTE } from "./roomObjects";
import type { Room, RoomFixture, RoomZone } from "./roomModel";

interface Props { room: Room; selected: string | null; free: boolean; onFree: (free: boolean) => void; onSelect: (key: string | null) => void; onPlace: (value: string) => void; onChange: (room: Room) => void; onError: (message: string) => void }
export function FixtureTools({ room, selected, free, onFree, onSelect, onPlace, onChange, onError }: Props) {
  const { t } = useT();
  const item = room.fixtures.find(f => f.key === selected);
  const zone = room.zones.find(z => z.key === selected);
  const updateZone = (patch: Partial<RoomZone>) => { if (zone) onChange(editZone(room, zone.key, patch)); };
  const update = (patch: Partial<RoomFixture>) => { if (item) onChange(editFixture(room, item.key, patch)); };
  const safe = (patch: Partial<RoomFixture>) => { try { update(patch); } catch (caught) { onError(caught instanceof Error ? caught.message : tr("Check the fixed element.")); } };
  return <div className="room-form">
    <div className="room-object-palette">{[...FIXTURE_PALETTE.map(kind => ({ value: `fixture:${kind}`, kind, name: FIXTURE_NAMES[kind] })), ...ZONE_PALETTE.map(kind => ({ value: `zone:${kind}`, kind, name: ZONE_NAMES[kind] ?? kind }))].map(({ value, kind, name }) => <button type="button" draggable key={value} onDragStart={event => { event.dataTransfer.setData(OBJECT_DRAG_TYPE, value); event.dataTransfer.effectAllowed = "copy"; }} aria-label={t("Place {name}", { name: word(name) })} onClick={() => onPlace(value)}><svg viewBox="-12 -12 24 24" aria-hidden="true"><FixtureIcon kind={kind as IconKind} size={24} /></svg>{word(name)}</button>)}</div>
    <Checkbox label={t("Free placement (no grid snapping)")} checked={free} onChange={e => onFree(e.target.checked)} />
    {room.fixtures.length + room.zones.length > 1 && <Select label={t("Selected fixed element")} value={item?.key ?? zone?.key ?? ""} options={[{ value: "", label: t("Choose an element") }, ...room.fixtures.map((f, i) => ({ value: f.key, label: f.label || `${word(FIXTURE_NAMES[f.kind])} ${i + 1}` })), ...room.zones.map(z => ({ value: z.key, label: word(z.name) }))]} onChange={e => onSelect(e.target.value || null)} />}
    {item && <div key={item.key} className="room-form">
      <details className="room-more">
        <summary>{t("Size, position and shape")}</summary>
        <div className="room-form">
          <Select label={t("Fixed element shape")} value={item.shape} options={[{ value: "rect", label: t("Rectangle") }, { value: "circle", label: t("Circle") }]} onChange={e => safe({ shape: e.target.value as RoomFixture["shape"] })} />
          <ObjectFields item={item} onChange={update} />
        </div>
      </details>
      <Button variant="danger" onClick={() => { onChange({ ...room, fixtures: room.fixtures.filter(f => f.key !== item.key) }); onSelect(null); }}>{t("Remove fixed element")}</Button>
    </div>}
    {zone && <div key={zone.key} className="room-form">
      <details className="room-more">
        <summary>{t("Size and position")}</summary>
        <div className="room-form"><ObjectFields item={zone} onChange={updateZone} /></div>
      </details>
      <Button variant="danger" onClick={() => { onChange(removeZone(room, zone.key)); onSelect(null); }}>{t("Remove zone")}</Button>
    </div>}
  </div>;
}
