"use client";

// Route drawn over real satellite imagery — Leaflet + Esri World Imagery
// (free, keyless; attribution required and kept). This module is only ever
// loaded lazily by SmartRouteMap, so Leaflet's ~42 KB never touches the main
// bundle and an offline session never fetches it at all.
//
// Colors come from the live VOLT CSS variables so the polyline/markers match
// the active theme. Tiles failing (dead zone, blocked CDN) calls onFail so
// the wrapper can drop back to the offline SVG trace.

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap } from "leaflet";
import type { RoutePoint } from "@/lib/storage";

const ESRI_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTRIBUTION =
  "Imagery &copy; Esri, Maxar, Earthstar Geographics";

// "200 245 66" (VOLT token triplet) → "rgb(200 245 66)", with a fallback for
// safety if the var is somehow missing.
function tokenColor(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `rgb(${v})` : fallback;
}

export default function SatelliteMap({
  route,
  height = 200,
  className = "",
  onFail
}: {
  route: RoutePoint[];
  height?: number;
  className?: string;
  onFail?: () => void; // tiles unreachable → wrapper falls back to the SVG trace
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const onFailRef = useRef(onFail);
  onFailRef.current = onFail;

  useEffect(() => {
    if (!divRef.current || route.length < 2) return;
    let map: LeafletMap | null = null;
    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || !divRef.current) return;

      const gold = tokenColor("--gold", "rgb(200 245 66)");
      const sage = tokenColor("--sage", "rgb(79 209 165)");
      const ember = tokenColor("--ember", "rgb(255 107 74)");
      const ink = tokenColor("--ink", "rgb(10 11 9)");

      map = L.map(divRef.current, {
        zoomControl: false, // pinch/double-tap zoom; keeps the card clean
        attributionControl: true
      });

      const tiles = L.tileLayer(ESRI_IMAGERY, {
        maxZoom: 19,
        attribution: ESRI_ATTRIBUTION
      }).addTo(map);

      // If the first tiles all error and none ever load, imagery is
      // unreachable — hand control back to the offline trace.
      let loaded = false;
      let errors = 0;
      tiles.on("tileload", () => {
        loaded = true;
      });
      tiles.on("tileerror", () => {
        errors++;
        if (!loaded && errors >= 3) onFailRef.current?.();
      });

      const latlngs = route.map((p) => [p.lat, p.lng] as [number, number]);
      // Dark halo under the gold line so it reads on bright imagery.
      L.polyline(latlngs, { color: ink, weight: 7, opacity: 0.55 }).addTo(map);
      L.polyline(latlngs, { color: gold, weight: 3.5, opacity: 0.95 }).addTo(map);
      const dot = (ll: [number, number], fill: string) =>
        L.circleMarker(ll, {
          radius: 6,
          color: ink,
          weight: 2,
          fillColor: fill,
          fillOpacity: 1
        }).addTo(map!);
      dot(latlngs[0], sage);
      dot(latlngs[latlngs.length - 1], ember);

      map.fitBounds(L.latLngBounds(latlngs), { padding: [24, 24] });
    });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [route]);

  return (
    <div
      ref={divRef}
      style={{ height }}
      className={`w-full bg-ink ${className}`}
      role="img"
      aria-label="Satellite map of your run route"
    />
  );
}
