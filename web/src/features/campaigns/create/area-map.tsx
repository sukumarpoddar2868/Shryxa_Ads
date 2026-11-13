"use client";

import { useEffect, useRef } from "react";
import { LngLatBounds, Map as MapLibre, Marker, NavigationControl, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { isPlaced, type DraftPin } from "./blueprint";

/**
 * Free map (MapLibre + OpenFreeMap tiles, © OpenStreetMap) showing each
 * target area as a numbered, draggable pin with its radius circle.
 * An area without a map position (a Meta id the map couldn't place) is skipped.
 * Loaded client-only (see audience-section's dynamic import).
 */

const STYLE = "https://tiles.openfreemap.org/styles/positron";
const INDIA: [number, number] = [78.9, 20.6];

/** Polygon approximating a circle of `km` around a point (great-circle maths). */
function circle(lat: number, lng: number, km: number, steps = 64): [number, number][] {
  const R = 6371;
  const d = km / R;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lng * Math.PI) / 180;
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const θ = (2 * Math.PI * i) / steps;
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(θ));
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(d) * Math.cos(φ1), Math.cos(d) - Math.sin(φ1) * Math.sin(φ2));
    out.push([(λ2 * 180) / Math.PI, (φ2 * 180) / Math.PI]);
  }
  return out;
}

function areasGeoJSON(pins: DraftPin[]) {
  return {
    type: "FeatureCollection" as const,
    features: pins.flatMap((p, i) =>
      isPlaced(p) ? [{ type: "Feature" as const, properties: { i }, geometry: { type: "Polygon" as const, coordinates: [circle(p.lat, p.lng, p.radiusKm)] } }] : [],
    ),
  };
}

function fit(map: MapLibre, pins: DraftPin[]) {
  const placed = pins.filter(isPlaced);
  if (!placed.length) return;
  const b = new LngLatBounds();
  for (const p of placed) for (const c of circle(p.lat, p.lng, p.radiusKm, 16)) b.extend(c);
  map.fitBounds(b, { padding: 40, maxZoom: 13, duration: 600 });
}

export default function AreaMap({
  pins,
  onMove,
  onAdd,
  addMode,
}: {
  pins: DraftPin[];
  onMove: (index: number, lat: number, lng: number) => void;
  onAdd: (lat: number, lng: number) => void;
  addMode: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const markers = useRef<Marker[]>([]);
  const ready = useRef(false);
  const latest = useRef({ pins, onMove, onAdd, addMode });
  const fittedCount = useRef(-1);

  useEffect(() => {
    latest.current = { pins, onMove, onAdd, addMode };
  });

  const refs = { mapRef, ready, markers, latest, fittedCount };

  // Create the map once.
  useEffect(() => {
    if (!box.current) return;
    setWorkerUrl("/vendor/maplibre-gl-worker.mjs");
    const map = new MapLibre({ container: box.current, style: STYLE, center: INDIA, zoom: 3.6, attributionControl: { compact: true } });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      map.addSource("areas", { type: "geojson", data: areasGeoJSON(latest.current.pins) });
      // Brand accent from the design tokens (no raw colours in components).
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--color-lavender-deep").trim() || "purple";
      map.addLayer({ id: "areas-fill", type: "fill", source: "areas", paint: { "fill-color": accent, "fill-opacity": 0.14 } });
      map.addLayer({ id: "areas-line", type: "line", source: "areas", paint: { "line-color": accent, "line-width": 2 } });
      ready.current = true;
      draw(refs);
    });
    map.on("click", (e) => {
      if (latest.current.addMode) latest.current.onAdd(e.lngLat.lat, e.lngLat.lng);
    });
    mapRef.current = map;
    return () => {
      ready.current = false;
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- create once; `draw` reads refs
  }, []);

  // Redraw circles + markers whenever pins change.
  useEffect(() => {
    draw(refs);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `refs` are stable refs
  }, [pins]);

  useEffect(() => {
    const canvas = mapRef.current?.getCanvas();
    if (canvas) canvas.style.cursor = addMode ? "crosshair" : "";
  }, [addMode]);

  return <div ref={box} className="h-72 w-full overflow-hidden rounded-card" role="region" aria-label="Map of target areas" />;
}

type Refs = {
  mapRef: { current: MapLibre | null };
  ready: { current: boolean };
  markers: { current: Marker[] };
  latest: { current: { pins: DraftPin[]; onMove: (i: number, lat: number, lng: number) => void } };
  fittedCount: { current: number };
};

function draw({ mapRef, ready, markers, latest, fittedCount }: Refs) {
  const map = mapRef.current;
  if (!map || !ready.current) return;
  const { pins: ps } = latest.current;
  (map.getSource("areas") as GeoJSONSource | undefined)?.setData(areasGeoJSON(ps));
  markers.current.forEach((m) => m.remove());
  markers.current = ps.flatMap((p, i) => {
    if (!isPlaced(p)) return [];
    const el = document.createElement("div");
    el.className = "grid size-7 cursor-grab place-items-center rounded-full bg-ink text-[12px] font-extrabold text-chartreuse ring-2 ring-paper shadow-md";
    el.textContent = String(i + 1);
    el.title = `${p.name} · ${p.radiusKm} km — drag to move`;
    const m = new Marker({ element: el, draggable: true }).setLngLat([p.lng, p.lat]).addTo(map);
    m.on("dragend", () => {
      const ll = m.getLngLat();
      latest.current.onMove(i, Number(ll.lat.toFixed(6)), Number(ll.lng.toFixed(6)));
    });
    return [m];
  });
  // Re-fit only when pins are added/removed (not while dragging).
  if (fittedCount.current !== ps.length) {
    fittedCount.current = ps.length;
    fit(map, ps);
  }
}
