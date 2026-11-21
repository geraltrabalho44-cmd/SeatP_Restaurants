import { tableLabel, word } from "./names";
import { tr } from "../../i18n/locale";
import { useT } from "../../i18n/I18nProvider";
import { useState } from "react";
import { Button, Select } from "../../design/components";
import type { Room, RoomTable } from "./roomModel";
import { OBJECT_DRAG_TYPE } from "./ObjectFields";
import { FixtureIcon } from "./FixtureIcon";
import type { IconKind } from "./FixtureIcon";
import { editTable, setChairCount, TABLE_KINDS, TABLE_NAMES } from "./tableModel";

interface Props { room: Room; selected: string | null; onSelect: (key: string | null) => void; onPlace: (value: string, zoneKey?: string) => void; onChange: (room: Room) => void; onError: (message: string) => void }
export function TableTools({ room, selected, onSelect, onPlace, onChange, onError }: Props) {
  const { t } = useT();
  const table = room.tables.find(t => t.key === selected), terraces = room.zones.filter(z => z.kind === "terrace");
  const [where, setWhere] = useState(""), target = terraces.some(z => z.key === where) ? where : "";
  const update = (patch: Partial<Omit<RoomTable, "id" | "key" | "seats">>) => { if (table) onChange(editTable(room, table.key, patch)); };
  const safe = (fn: () => void) => { try { fn(); } catch (caught) { onError(caught instanceof Error ? caught.message : tr("Check the table.")); } };
  return <div className="room-form">
    <h3>{t("Add a table")}</h3>
    <div className="room-object-palette">{TABLE_KINDS.map(kind => <button type="button" draggable key={kind} onDragStart={event => { event.dataTransfer.setData(OBJECT_DRAG_TYPE, `table:${kind}`); event.dataTransfer.effectAllowed = "copy"; }} aria-label={t("Place {name}", { name: word(TABLE_NAMES[kind]) })} onClick={() => onPlace(`table:${kind}`, target || undefined)}><svg viewBox="-12 -12 24 24" aria-hidden="true"><FixtureIcon kind={`${kind}_table` as IconKind} size={24} /></svg>{word(TABLE_NAMES[kind])}</button>)}</div>
    {terraces.length > 0 && <Select label={t("Put new tables")} value={target} options={[{ value: "", label: t("Inside the room") }, ...terraces.map(z => ({ value: z.key, label: t("On {name}", { name: word(z.name) }) }))]} onChange={e => setWhere(e.target.value)} />}
    <Select label={t("Selected table")} value={table?.key ?? ""} options={[{ value: "", label: t("Choose a table") }, ...room.tables.map(row => ({ value: row.key, label: tableLabel(row.label) }))]} onChange={event => { onSelect(event.target.value || null); }} />
    {table && <div key={table.key} className="room-form">
      <p>{t("{n} chairs", { n: table.seats.length })}</p><div className="room-actions"><Button variant="secondary" aria-label={t("Remove chair")} disabled={table.seats.length <= 1} onClick={() => safe(() => onChange(setChairCount(room, table.key, table.seats.length - 1)))}>−</Button><Button variant="secondary" aria-label={t("Add chair")} disabled={table.seats.length >= 20} onClick={() => safe(() => onChange(setChairCount(room, table.key, table.seats.length + 1)))}>+</Button></div>
      <Select label={t("Table zone")} value={table.zone_key ?? ""} options={[{ value: "", label: t("No zone") }, ...room.zones.map(z => ({ value: z.key, label: word(z.name) }))]} onChange={e => update({ zone_key: e.target.value || null })} />
    </div>}
  </div>;
}
