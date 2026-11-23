import { useEffect, useRef, useState } from "react";
import * as L from "leaflet";
import { useT } from "../i18n/I18nProvider";
import { tr } from "../i18n/locale";
import "leaflet/dist/leaflet.css";
import "./maps.css";
import { DiscoveryBasemap } from "./discoveryBasemap";
import { DiscoveryLabels } from "./discoveryLabels";

export interface MapPoint { lat: number; lng: number }
export default function LeafletMap({ point, onChange }: { point: MapPoint | null; onChange: (point: MapPoint) => void }) {
  const { t } = useT();
  const host = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null), marker = useRef<L.Marker | null>(null);
  const change = useRef(onChange), current = useRef(point);
  change.current = onChange; current.current = point;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const view = L.map(host.current!, { scrollWheelZoom: false, zoomControl: false }).setView(current.current ?? { lat: 38.7223, lng: -9.1393 }, 13);
    L.control.zoom({ zoomInTitle: tr("Zoom in"), zoomOutTitle: tr("Zoom out") }).addTo(view);
    view.attributionControl.setPrefix(`<a href="https://leafletjs.com" title="${tr("A JavaScript library for interactive maps")}">Leaflet</a>`);
    map.current = view;
    // The same light map as the public pages (drawn from OpenFreeMap's tiles), so the owner places the pin on the map guests see.
    const tiles = new DiscoveryBasemap().addTo(view);
    new DiscoveryLabels().addTo(view);
    view.attributionControl.addAttribution(`&copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ${tr("contributors")}`);
    tiles.on("tileerror", () => setFailed(true));
    view.on("click", (event: L.LeafletMouseEvent) => change.current({ lat: event.latlng.lat, lng: event.latlng.lng }));
    return () => { view.remove(); map.current = null; marker.current = null; };
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
  return <><div ref={host} className="owner-location-map" role="region" aria-label={t("Restaurant location map")} />{failed && <p role="status">{t("Map tiles are unavailable. You can still enter latitude and longitude below.")}</p>}</>;
}
