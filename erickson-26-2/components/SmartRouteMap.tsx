"use client";

// The route display used on the Run Mode summary and in Log history:
// satellite imagery by default when online, the self-contained SVG trace
// otherwise — with a Satellite/Trace toggle so either is always a tap away.
//
// Fallback rules (never an error state, never a crash):
//   offline at mount            → trace, no Leaflet fetch attempted
//   Leaflet chunk fails to load → trace
//   satellite tiles unreachable → trace (SatelliteMap.onFail)
// The SVG trace remains the guarantee that route review works in a dead zone.

import { useEffect, useState, type ComponentType } from "react";
import type { RoutePoint } from "@/lib/storage";
import RouteMap from "./RouteMap";

type SatProps = {
  route: RoutePoint[];
  height?: number;
  className?: string;
  onFail?: () => void;
};

export default function SmartRouteMap({
  route,
  height = 200,
  className = ""
}: {
  route: RoutePoint[] | undefined;
  height?: number;
  className?: string;
}) {
  const [mode, setMode] = useState<"sat" | "trace">("trace");
  const [Sat, setSat] = useState<ComponentType<SatProps> | null>(null);
  const [satBroken, setSatBroken] = useState(false); // this session: don't retry a dead source

  // Default to satellite only once we know we're online (client-side).
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.onLine) setMode("sat");
  }, []);

  // Lazily pull in Leaflet the first time satellite view is shown.
  useEffect(() => {
    if (mode !== "sat" || Sat || satBroken) return;
    let dead = false;
    import("./SatelliteMap")
      .then((m) => {
        if (!dead) setSat(() => m.default);
      })
      .catch(() => {
        if (!dead) {
          setSatBroken(true);
          setMode("trace");
        }
      });
    return () => {
      dead = true;
    };
  }, [mode, Sat, satBroken]);

  if (!route || route.length < 2) return null;

  const showSat = mode === "sat" && Sat && !satBroken;

  return (
    <div className="relative">
      {showSat ? (
        <Sat
          route={route}
          height={height}
          className={className}
          onFail={() => {
            setSatBroken(true);
            setMode("trace");
          }}
        />
      ) : (
        <RouteMap route={route} height={height} className={className} />
      )}
      {/* Toggle — hidden if satellite is unavailable this session */}
      {!satBroken && (
        <div className="absolute top-2 right-2 z-[500] flex rounded-lg overflow-hidden border border-seam bg-ink/80 backdrop-blur-sm">
          {(["sat", "trace"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2.5 py-1 text-[10px] font-display font-bold uppercase tracking-widest min-h-[32px] ${
                mode === m ? "bg-gold text-ink" : "text-dust"
              }`}
            >
              {m === "sat" ? "Satellite" : "Trace"}
            </button>
          ))}
        </div>
      )}
      {mode === "sat" && !Sat && !satBroken && (
        <div
          style={{ height }}
          className={`absolute inset-x-0 top-0 flex items-center justify-center text-[11px] text-dust animate-pulse`}
        >
          Loading imagery…
        </div>
      )}
    </div>
  );
}
