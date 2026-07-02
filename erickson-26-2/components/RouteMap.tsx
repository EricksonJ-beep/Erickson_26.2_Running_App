"use client";

// Self-contained SVG trace of a Run Mode GPS route. No tiles, no network, no
// deps — works fully offline and matches the VOLT theme. The saved `route`
// breadcrumb is projected and scaled to fit; start/finish are marked.
//
// "Both" plan: this is the offline trace. Optional street-map tiles (Leaflet +
// OSM) can be layered behind this same <path> later for an online view —
// the projection math here (lng·cos(lat), lat) is the standard web-map one.

import { RoutePoint } from "@/lib/storage";

// Total climb/descent over a saved route, in feet. GPS altitude wobbles by a
// few meters fix-to-fix, so raw deltas would inflate badly — only moves of
// ≥3 m from the last accepted reference count (simple hysteresis). Null when
// the route carries no altitude (pre-Jul-2026 runs, or a device that omits it).
export function elevationStats(
  route: RoutePoint[] | undefined
): { gainFt: number; lossFt: number } | null {
  if (!route) return null;
  const alts = route.map((p) => p.alt).filter((a): a is number => a != null);
  if (alts.length < 2) return null;
  const THRESH_M = 3;
  let gain = 0;
  let loss = 0;
  let ref = alts[0];
  for (const a of alts) {
    const d = a - ref;
    if (d >= THRESH_M) {
      gain += d;
      ref = a;
    } else if (d <= -THRESH_M) {
      loss -= d;
      ref = a;
    }
  }
  const FT_PER_M = 3.28084;
  return { gainFt: Math.round(gain * FT_PER_M), lossFt: Math.round(loss * FT_PER_M) };
}

export default function RouteMap({
  route,
  height = 190,
  className = ""
}: {
  route: RoutePoint[] | undefined;
  height?: number;
  className?: string;
}) {
  if (!route || route.length < 2) return null;

  const W = 320;
  const H = height;
  const PAD = 16;

  // Equirectangular projection around the mean latitude: 1° of longitude
  // shrinks by cos(lat), so the trace keeps a true-ish shape over a few miles.
  const meanLat = route.reduce((a, p) => a + p.lat, 0) / route.length;
  const cosLat = Math.cos((meanLat * Math.PI) / 180) || 1;
  const pts = route.map((p) => ({ x: p.lng * cosLat, y: p.lat }));

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const spanX = maxX - minX || 1e-9;
  const spanY = maxY - minY || 1e-9;
  const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY);
  const offX = (W - spanX * scale) / 2;
  const offY = (H - spanY * scale) / 2;

  // SVG y grows downward → flip latitude so north is up.
  const sx = (x: number) => offX + (x - minX) * scale;
  const sy = (y: number) => H - (offY + (y - minY) * scale);

  const screen = pts.map((p) => [sx(p.x), sy(p.y)] as const);
  const d = screen
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  const [startX, startY] = screen[0];
  const [endX, endY] = screen[screen.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`w-full h-auto block ${className}`}
      role="img"
      aria-label="Map of your run route"
    >
      <rect x="0" y="0" width={W} height={H} fill="rgb(var(--ink))" />
      {/* faint glow under the trace */}
      <path
        d={d}
        fill="none"
        stroke="rgb(var(--gold))"
        strokeOpacity="0.18"
        strokeWidth={8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d={d}
        fill="none"
        stroke="rgb(var(--gold))"
        strokeWidth={3}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* start (mint) + finish (coral) */}
      <circle cx={startX} cy={startY} r={5.5} fill="rgb(var(--sage))" stroke="rgb(var(--ink))" strokeWidth={2} />
      <circle cx={endX} cy={endY} r={5.5} fill="rgb(var(--ember))" stroke="rgb(var(--ink))" strokeWidth={2} />
    </svg>
  );
}
