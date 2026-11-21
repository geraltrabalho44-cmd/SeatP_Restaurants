import type { LatLng, Map as LeafletMap, Point } from "leaflet";

/**
 * Zoom with the wheel or the trackpad that follows the fingers on every frame.
 *
 * Leaflet's own wheel zoom waits 40 ms, then runs a 250 ms animation and ignores the wheel while that animation runs, so a
 * trackpad swipe moves in jerks. Here the wheel only moves a goal; on every frame the map moves a part of the way to it, around
 * the point under the pointer, so the zoom starts at once, glides and eases to a stop. The tiles are scaled by the browser
 * meanwhile and the finer ones are drawn once the zoom settles, as with any Leaflet zoom.
 */
const PER_PIXEL = 0.007; // levels per pixel of wheel: one notch of a mouse (100 px) is a little under a level
const PINCH = 4; // a pinch on a trackpad arrives as a wheel with the control key and much smaller numbers
const CATCH_UP = 0.25; // the part of the way to the goal covered on each frame
const SETTLE_MS = 160; // quiet time that ends the gesture
const LINE_PX = 33; // a wheel counted in lines (Firefox) is turned into pixels

/** The parts of Leaflet that every smooth-zoom plugin uses (Leaflet has no public call for a zoom made of many small steps). */
interface Inner { _move(center: LatLng, zoom: number): unknown; _moveStart(zoomChanged: boolean, noMoveStart: boolean): unknown; _moveEnd(zoomChanged: boolean): unknown; _limitZoom(zoom: number): number; _animatingZoom?: boolean }

export function smoothWheelZoom(map: LeafletMap, element: HTMLElement, onUse: () => void = () => undefined): () => void {
  const inner = map as unknown as Inner;
  let wheeling = false, goal = 0, anchor: LatLng | null = null, pointer: Point | null = null, frame = 0, timer = 0;

  const step = (): void => {
    frame = 0;
    if (!wheeling || !anchor || !pointer) return;
    const now = map.getZoom();
    let zoom = now + (goal - now) * CATCH_UP;
    if (Math.abs(goal - zoom) < 0.003) zoom = goal;
    zoom = Math.round(zoom * 1000) / 1000;
    if (zoom !== now) {
      // Keep the place that was under the pointer under it.
      const offset = pointer.subtract(map.getSize().divideBy(2));
      inner._move(map.unproject(map.project(anchor, zoom).subtract(offset), zoom), zoom);
    }
    frame = requestAnimationFrame(step);
  };

  const finish = (): void => {
    timer = 0;
    if (!wheeling) return;
    wheeling = false;
    cancelAnimationFrame(frame);
    frame = 0;
    inner._moveEnd(true);
  };

  const onWheel = (event: WheelEvent): void => {
    if (inner._animatingZoom) { event.preventDefault(); return; } // a button's zoom is still running
    event.preventDefault();
    onUse();
    const pixels = event.deltaMode === 1 ? event.deltaY * LINE_PX : event.deltaMode === 2 ? event.deltaY * map.getSize().y : event.deltaY;
    pointer = map.mouseEventToContainerPoint(event);
    if (!wheeling) {
      wheeling = true;
      goal = map.getZoom();
      anchor = map.containerPointToLatLng(pointer);
      inner._moveStart(true, false);
    }
    goal = inner._limitZoom(goal - pixels * PER_PIXEL * (event.ctrlKey ? PINCH : 1));
    window.clearTimeout(timer);
    timer = window.setTimeout(finish, SETTLE_MS);
    if (!frame) frame = requestAnimationFrame(step);
  };

  element.addEventListener("wheel", onWheel, { passive: false });
  return () => {
    element.removeEventListener("wheel", onWheel);
    window.clearTimeout(timer);
    cancelAnimationFrame(frame);
    if (wheeling) { wheeling = false; inner._moveEnd(true); }
  };
}
