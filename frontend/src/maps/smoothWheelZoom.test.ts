// The wheel moves a goal; the map follows it a little on every frame and is told when the gesture is over.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Map as LeafletMap } from "leaflet";
import { smoothWheelZoom } from "./smoothWheelZoom";

function fakeMap(zoom = 13) {
  const state = { zoom, calls: [] as number[], started: 0, ended: 0 };
  const point = (x: number, y: number) => ({ x, y, subtract: (o: { x: number; y: number }) => point(x - o.x, y - o.y), divideBy: (n: number) => point(x / n, y / n) });
  const map = {
    getZoom: () => state.zoom,
    getSize: () => point(800, 600),
    mouseEventToContainerPoint: () => point(400, 300),
    containerPointToLatLng: () => ({ lat: 38.7, lng: -9.1 }),
    project: () => point(0, 0),
    unproject: () => ({ lat: 38.7, lng: -9.1 }),
    _limitZoom: (z: number) => Math.max(5, Math.min(19, z)),
    _moveStart: () => { state.started += 1; },
    _move: (_center: unknown, z: number) => { state.zoom = z; state.calls.push(z); },
    _moveEnd: () => { state.ended += 1; },
  };
  return { map: map as unknown as LeafletMap, state };
}

describe("smoothWheelZoom", () => {
  let frames: FrameRequestCallback[] = [];
  beforeEach(() => {
    vi.useFakeTimers();
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
    vi.stubGlobal("cancelAnimationFrame", () => { frames = []; });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  const runFrame = () => { const now = frames; frames = []; for (const callback of now) callback(0); };

  it("zooms in a little on every frame while the wheel turns, then ends the gesture once", () => {
    const element = document.createElement("div");
    const { map, state } = fakeMap();
    const stop = smoothWheelZoom(map, element);
    const event = new WheelEvent("wheel", { deltaY: -100, cancelable: true });
    element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true); // the page behind the map does not scroll
    expect(state.started).toBe(1);
    for (let i = 0; i < 12; i++) runFrame();
    expect(state.calls.length).toBeGreaterThan(8); // it moved on (nearly) every frame
    expect(state.calls).toEqual([...state.calls].sort((a, b) => a - b)); // always in the one direction
    expect(state.zoom).toBeGreaterThan(13.4);
    expect(state.zoom).toBeLessThanOrEqual(13.7 + 1e-9); // 100 px of wheel is 0.7 of a level
    expect(state.ended).toBe(0);
    vi.advanceTimersByTime(200);
    expect(state.ended).toBe(1);
    stop();
  });

  it("zooms out for the other direction, never past the limits, and a pinch counts for more", () => {
    const element = document.createElement("div");
    const { map, state } = fakeMap(5.2);
    smoothWheelZoom(map, element);
    element.dispatchEvent(new WheelEvent("wheel", { deltaY: 500, cancelable: true }));
    for (let i = 0; i < 40; i++) runFrame();
    expect(state.zoom).toBe(5);
    const pinch = fakeMap();
    smoothWheelZoom(pinch.map, element);
    element.dispatchEvent(new WheelEvent("wheel", { deltaY: -10, ctrlKey: true, cancelable: true }));
    for (let i = 0; i < 40; i++) runFrame();
    expect(pinch.state.zoom).toBeCloseTo(13 + 10 * 0.007 * 4, 1);
  });

  it("stops listening and finishes an unfinished gesture when it is removed", () => {
    const element = document.createElement("div");
    const { map, state } = fakeMap();
    const stop = smoothWheelZoom(map, element);
    element.dispatchEvent(new WheelEvent("wheel", { deltaY: -50, cancelable: true }));
    stop();
    expect(state.ended).toBe(1);
    const again = new WheelEvent("wheel", { deltaY: -50, cancelable: true });
    element.dispatchEvent(again);
    expect(again.defaultPrevented).toBe(false);
  });
});
