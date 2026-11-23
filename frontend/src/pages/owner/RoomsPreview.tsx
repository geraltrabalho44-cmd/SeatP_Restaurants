import { useState } from "react";
import { getRooms } from "../../api/rooms";
import type { Room } from "../room-editor/roomModel";
import { roomName } from "../room-editor/names";
import { useT } from "../../i18n/I18nProvider";
import { useLoad } from "../restaurant/useLoad";
import "../restaurant/floor-plan.css";
import "./rooms-preview.css";

const MARGIN = 24;

/** A chair seen from above, turned away from its table, as on the guests' plan. */
function Chair({ seat, centre }: { seat: { x: number; y: number }; centre: { x: number; y: number } }) {
  const angle = (Math.atan2(-(seat.x - centre.x), seat.y - centre.y) * 180) / Math.PI;
  return (
    <g transform={`translate(${seat.x} ${seat.y}) rotate(${angle})`}>
      <rect className="fp-seat" x={-11} y={-9} width={22} height={17} rx={7} />
      <rect className="fp-back" x={-11} y={9.5} width={22} height={5} rx={2.5} />
    </g>
  );
}

/** One room drawn from above, read-only: the walls, the zones, the fixtures and every table with its name and size. */
function RoomDrawing({ room }: { room: Room }) {
  const { t } = useT();
  const points = room.outline.points;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const x0 = Math.min(...xs) - MARGIN, y0 = Math.min(...ys) - MARGIN;
  const width = Math.max(...xs) - Math.min(...xs) + MARGIN * 2, height = Math.max(...ys) - Math.min(...ys) + MARGIN * 2;
  const shape = points.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <svg className="rp-room" viewBox={`${x0} ${y0} ${width} ${height}`} role="img" aria-label={t("Floor plan")}>
      <polygon points={shape} className="rp-floor" />
      {room.zones.map((zone) => (
        <g key={zone.key}>
          <rect x={zone.x} y={zone.y} width={zone.w} height={zone.h} className="rp-zone" />
          <text x={zone.x + 10} y={zone.y + 22} className="rp-zone-name">{zone.name}</text>
        </g>
      ))}
      {room.fixtures.map((fixture) => (
        <g key={fixture.key} transform={`rotate(${fixture.rotation} ${fixture.x + fixture.w / 2} ${fixture.y + fixture.h / 2})`}>
          {fixture.shape === "circle"
            ? <ellipse cx={fixture.x + fixture.w / 2} cy={fixture.y + fixture.h / 2} rx={fixture.w / 2} ry={fixture.h / 2} className="rp-fixture" />
            : <rect x={fixture.x} y={fixture.y} width={fixture.w} height={fixture.h} rx="6" className="rp-fixture" />}
          {fixture.label && <text x={fixture.x + fixture.w / 2} y={fixture.y + fixture.h / 2 + 5} className="rp-fixture-name" textAnchor="middle">{fixture.label}</text>}
        </g>
      ))}
      <polygon points={shape} className="rp-wall" />
      {room.tables.filter((table) => table.is_active).map((table) => (
        <g key={table.key}>
          {table.seats.map((seat) => <Chair key={seat.key} seat={seat} centre={{ x: table.x + table.w / 2, y: table.y + table.h / 2 }} />)}
          <g transform={`rotate(${table.rotation} ${table.x + table.w / 2} ${table.y + table.h / 2})`}>
          {table.shape === "round"
            ? <ellipse cx={table.x + table.w / 2} cy={table.y + table.h / 2} rx={table.w / 2} ry={table.h / 2} className="rp-table" />
            : <rect x={table.x} y={table.y} width={table.w} height={table.h} rx="10" className="rp-table" />}
          <text x={table.x + table.w / 2} y={table.y + table.h / 2 + 5} className="rp-table-name" textAnchor="middle" transform={`rotate(${-table.rotation} ${table.x + table.w / 2} ${table.y + table.h / 2})`}>{table.label}</text>
          </g>
        </g>
      ))}
    </svg>
  );
}

/** The restaurant's floor plan as guests will see its rooms, for the "Review and publish" preview. */
export function RoomsPreview({ venueId }: { venueId: string }) {
  const { t } = useT();
  const { state } = useLoad(() => getRooms(venueId), venueId);
  const [current, setCurrent] = useState(0);
  if (state.status === "loading") return <p className="rb-muted" role="status">{t("Loading the floor plan…")}</p>;
  if (state.status === "error") return <p className="rb-muted">{t("The floor plan is unavailable.")}</p>;
  const rooms = state.data.rooms;
  if (rooms.length === 0) return <p className="rb-muted">{t("No rooms yet. Draw your floor plan to see it here.")}</p>;
  const room = rooms[Math.min(current, rooms.length - 1)];
  return (
    <section className="rp-preview" aria-label={t("Floor plan")}>
      <div className="rp-head">
        <h3>{t("Floor plan")}</h3>
        {rooms.length > 1 && (
          <div role="tablist" aria-label={t("Rooms")} className="rp-tabs">
            {rooms.map((item, index) => (
              <button key={item.key} type="button" role="tab" aria-selected={index === current} className={index === current ? "is-current" : undefined} onClick={() => setCurrent(index)}>{roomName(item.name)}</button>
            ))}
          </div>
        )}
      </div>
      <RoomDrawing room={room} />
    </section>
  );
}
