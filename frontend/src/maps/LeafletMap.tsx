import { useEffect, useRef, useState } from "react";
import * as L from "leaflet";
import { useT } from "../i18n/I18nProvider";
import { tr } from "../i18n/locale";
import "leaflet/dist/leaflet.css";
import { DiscoveryBasemap } from "./discoveryBasemap";
import { DiscoveryLabels } from "./discoveryLabels";
import { smoothWheelZoom } from "./smoothWheelZoom";
import "./maps.css";

export interface MapPoint { lat: number; lng: number }
export default function LeafletMap({ point, onChange }: { point: MapPoint | null; onChange: (point: MapPoint) => void }) {
  const { t } = useT();
  const host = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null), marker = useRef<L.Marker | null>(null);
  const change = useRef(onChange), current = useRef(point);
  change.current = onChange; current.current = point;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    // The same map as everywhere else on the site: the soft basemap with area names, a smooth wheel and the round zoom buttons.
    const view = L.map(host.current!, { scrollWheelZoom: false, zoomSnap: 0, attributionControl: false, zoomControl: false, minZoom: 0, maxZoom: 19 }).setView(current.current ?? { lat: 38.7223, lng: -9.1393 }, 13);
    const stopWheel = smoothWheelZoom(view, host.current!);
    map.current = view;
    const tiles = new DiscoveryBasemap().addTo(view);
    new DiscoveryLabels().addTo(view);
    tiles.on("tileerror", () => setFailed(true));
    view.on("click", (event: L.LeafletMouseEvent) => change.current({ lat: event.latlng.lat, lng: event.latlng.lng }));
    return () => { stopWheel(); view.stop(); view.remove(); map.current = null; marker.current = null; };
  }, []);
  useEffect(() => {
    const view = map.current;
    if (!view) return;
    if (!point) { marker.current?.remove(); marker.current = null; return; }
    if (!marker.current) {
      marker.current = L.marker(point, { draggable: true, title: tr("Restaurant location"), alt: tr("Restaurant pin"), icon: L.divIcon({ className: "owner-map-pin", html: '<span aria-hidden="true"></span>', iconSize: [36, 44], iconAnchor: [18, 42] }) }).addTo(view);
      marker.current.on("dragend", () => { const next = marker.current!.getLatLng(); change.current({ lat: next.lat, lng: next.lng }); });
    } else marker.current.setLatLng(point);
    if (!view.getBounds().contains(point)) view.panTo(point);
  }, [point?.lat, point?.lng]);
  const zoomBy = (step: number) => { const view = map.current; view?.setZoom(view.getZoom() + step, { animate: false }); };
  return <><div className="owner-location-wrap discover-map-panel"><div ref={host} className="owner-location-map" role="region" aria-label={t("Restaurant location map")} />
    <div className="discover-map-zoom" role="group" aria-label={t("Map zoom")}>
      <button type="button" aria-label={t("Zoom in")} onClick={() => zoomBy(1)}>+</button>
      <button type="button" aria-label={t("Zoom out")} onClick={() => zoomBy(-1)}>−</button>
    </div></div>{failed && <p role="status">{t("Map tiles are unavailable. You can still enter latitude and longitude below.")}</p>}</>;
}
