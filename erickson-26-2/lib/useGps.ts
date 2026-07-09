"use client";

// Live GPS tracking for Run Mode. Geolocation needs a secure context —
// production HTTPS qualifies, and so does `npm run dev` on localhost.
//
// Filtering, in order: fixes with accuracy worse than MAX_ACCURACY_M are
// dropped; the first 3 otherwise-good fixes are dropped (cold-start scatter);
// any segment under MIN_STEP_M is treated as standing jitter; any segment
// implying > 6.7 m/s (faster than 4:00/mi) is GPS jitter. Distance is
// Haversine over what survives.
//
// Pre-warm: the hook can be `active` (watchPosition running, fix locking)
// without having `start()`ed — distance/time only accumulate after start(),
// so the countdown can warm GPS up and we throw away everything before GO.

import { useCallback, useEffect, useRef, useState } from "react";
import { LiveRunCheckpoint, RoutePoint } from "./storage";

// Drop fixes worse than this (m). Tighter than the old 25 m: on a track with
// open sky the H10/phone usually reports 5–15 m, so 20 keeps the good ones
// and rejects the scatter that cuts corners.
const MAX_ACCURACY_M = 20;
// Segments shorter than this (m) are GPS jitter while standing still, not
// real movement — small enough that a slow walk (~1.3 m/s ≈ 1.3 m/fix) still
// counts, large enough to swallow sub-metre wander.
const MIN_STEP_M = 1.0;
const WARMUP_FIXES = 3;
const MAX_SPEED_MS = 6.7;
const PACE_WINDOW_MS = 45_000;
const PACE_MIN_WINDOW_M = 20;
const AUTOPAUSE_SPEED_MS = 0.5;
const AUTOPAUSE_AFTER_MS = 15_000;
const ROUTE_SAMPLE_MS = 5_000;
// Hard cap on saved route points. A 20-miler at 5 s sampling is ~2,400 points
// (~120 KB); every saveRun re-serializes the whole runs map, so unbounded
// routes would crowd the ~5 MB localStorage budget right when runs get longest.
// RouteMap renders into a ~320 px viewbox, so 600 points loses nothing visible.
const MAX_ROUTE_POINTS = 600;
const METERS_PER_MILE = 1609.344;

interface Pt {
  lat: number;
  lng: number;
  alt: number | null; // meters above sea level, if the device reports it
  t: number; // ms epoch
  d: number; // cumulative meters at this point
}

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface GpsState {
  status: "unsupported" | "acquiring" | "tracking" | "denied";
  miles: number;
  currentPaceSec: number | null; // sec per mile over trailing 45 s; null = standing
  avgPaceSec: number | null;
  movingSec: number; // the run clock: wall clock since GO minus manual-pause time
  splits: number[]; // seconds per completed mile
  paused: boolean; // manual
  autoPaused: boolean;
  lastAccuracy: number | null; // m, from the most recent fix (signal sanity check)
  lastFixAt: number | null; // ms epoch of the most recent fix of any kind; null until first
}

export interface GpsResult {
  miles: number;
  movingSec: number;
  splits: number[];
  route: RoutePoint[];
}

export function useGps(active: boolean) {
  const [state, setState] = useState<GpsState>({
    status: "acquiring",
    miles: 0,
    currentPaceSec: null,
    avgPaceSec: null,
    movingSec: 0,
    splits: [],
    paused: false,
    autoPaused: false,
    lastAccuracy: null,
    lastFixAt: null
  });

  const ptsRef = useRef<Pt[]>([]);
  const warmupRef = useRef(0);
  const startRef = useRef(0);
  // Time is a wall-clock stopwatch from GO, minus only the time spent in a
  // *manual* pause. This is robust to the app being backgrounded (Spotify,
  // screen off) — it recomputes from timestamps, so no elapsed time is ever
  // lost the way per-fix accumulation was. Auto-pause is display-only and
  // never stops this clock.
  const pauseAccumMsRef = useRef(0); // total manual-paused ms, completed pauses
  const pauseStartRef = useRef<number | null>(null); // ms epoch of current manual pause
  const splitsRef = useRef<number[]>([]);
  const pausedRef = useRef(false);
  const autoPausedRef = useRef(false);
  const lowSpeedSinceRef = useRef<number | null>(null);
  const skipSegmentRef = useRef(false); // bridge over a manual pause
  const statusRef = useRef<GpsState["status"]>("acquiring");
  const startedRef = useRef(false); // false during countdown pre-warm
  const pendingRef = useRef<{ lat: number; lng: number; alt: number | null; t: number } | null>(null);
  const lastAccuracyRef = useRef<number | null>(null);
  const lastFixAtRef = useRef<number | null>(null); // any fix arriving = we have signal
  // Trace carried over from a crash-recovered run — merged ahead of the live
  // points when building the saved route (its `t` values are already relative).
  const restoredRouteRef = useRef<RoutePoint[]>([]);

  // Elapsed active time (ms) at instant `now`: wall clock since GO, less all
  // manual-pause time (completed + any in-progress pause). Pure timestamp math.
  const activeMs = useCallback((now: number): number => {
    if (!startRef.current) return 0;
    let ms = now - startRef.current - pauseAccumMsRef.current;
    if (pauseStartRef.current !== null) ms -= now - pauseStartRef.current;
    return Math.max(0, ms);
  }, []);

  const snapshot = useCallback(() => {
    const pts = ptsRef.current;
    const now = Date.now();
    const last = pts[pts.length - 1];
    const meters = last?.d ?? 0;
    const miles = meters / METERS_PER_MILE;

    // Trailing-window pace
    let currentPaceSec: number | null = null;
    if (last && !pausedRef.current && !autoPausedRef.current) {
      const cutoff = now - PACE_WINDOW_MS;
      let first = last;
      for (let i = pts.length - 1; i >= 0 && pts[i].t >= cutoff; i--) first = pts[i];
      const windowM = last.d - first.d;
      const windowMs = last.t - first.t;
      if (windowM >= PACE_MIN_WINDOW_M && windowMs > 0) {
        currentPaceSec = (windowMs / 1000) / (windowM / METERS_PER_MILE);
      }
    }

    const movingSec = activeMs(now) / 1000;
    setState({
      status: statusRef.current,
      miles,
      currentPaceSec,
      avgPaceSec: miles > 0.05 ? movingSec / miles : null,
      movingSec,
      splits: splitsRef.current,
      paused: pausedRef.current,
      autoPaused: autoPausedRef.current,
      lastAccuracy: lastAccuracyRef.current,
      lastFixAt: lastFixAtRef.current
    });
  }, [activeMs]);

  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      statusRef.current = "unsupported";
      snapshot();
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy, altitude } = pos.coords;
        const t = Date.now();
        lastAccuracyRef.current = accuracy;
        lastFixAtRef.current = t; // a fix arrived → signal is alive
        if (accuracy > MAX_ACCURACY_M) {
          snapshot(); // surface the bad-accuracy reading, count nothing
          return;
        }
        if (warmupRef.current < WARMUP_FIXES) {
          warmupRef.current++;
          snapshot();
          return;
        }

        // Pre-warm: GPS is locked but the run hasn't started. Hold the latest
        // good fix as the start baseline; accumulate nothing until start().
        if (!startedRef.current) {
          pendingRef.current = { lat: latitude, lng: longitude, alt: altitude, t };
          statusRef.current = "tracking";
          snapshot();
          return;
        }

        const pts = ptsRef.current;
        const prev = pts[pts.length - 1];

        if (!prev) {
          ptsRef.current.push({ lat: latitude, lng: longitude, alt: altitude, t, d: 0 });
          statusRef.current = "tracking";
          snapshot();
          return;
        }

        const dt = t - prev.t;
        if (dt <= 0) return;
        const stepM = haversineMeters(prev.lat, prev.lng, latitude, longitude);
        const speed = stepM / (dt / 1000);
        if (speed > MAX_SPEED_MS) return; // jitter spike
        // Min-movement gate: ignore sub-metre wander while standing still, but
        // never drop a point during a manual pause (handled below).
        if (stepM < MIN_STEP_M && !pausedRef.current) {
          snapshot();
          return;
        }

        // Manual pause: track position but freeze distance + clock,
        // and bridge the gap so resume doesn't credit pause movement.
        if (pausedRef.current) {
          skipSegmentRef.current = true;
          snapshot();
          return;
        }
        if (skipSegmentRef.current) {
          skipSegmentRef.current = false;
          ptsRef.current.push({ lat: latitude, lng: longitude, alt: altitude, t, d: prev.d });
          snapshot();
          return;
        }

        // Auto-pause: standing still for 15 s stops the moving clock.
        if (speed < AUTOPAUSE_SPEED_MS) {
          if (lowSpeedSinceRef.current === null) lowSpeedSinceRef.current = t;
          else if (t - lowSpeedSinceRef.current >= AUTOPAUSE_AFTER_MS) autoPausedRef.current = true;
        } else {
          lowSpeedSinceRef.current = null;
          autoPausedRef.current = false;
        }

        const prevMiles = prev.d / METERS_PER_MILE;
        const d = prev.d + (autoPausedRef.current ? 0 : stepM);
        ptsRef.current.push({ lat: latitude, lng: longitude, alt: altitude, t, d });

        // Mile split crossed? Time per mile is the wall-clock stopwatch delta.
        const newMiles = d / METERS_PER_MILE;
        if (Math.floor(newMiles) > Math.floor(prevMiles)) {
          const activeSecNow = activeMs(t) / 1000;
          const prior = splitsRef.current.reduce((a, b) => a + b, 0);
          splitsRef.current = [...splitsRef.current, Math.round(activeSecNow - prior)];
        }

        snapshot();
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          statusRef.current = "denied";
          snapshot();
        }
        // timeouts/unavailable: keep watching — signal often returns
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );

    // 1 s ticker only triggers recomputation from timestamps —
    // nothing accumulates on the timer itself.
    const ticker = window.setInterval(snapshot, 1000);
    return () => {
      navigator.geolocation.clearWatch(watchId);
      window.clearInterval(ticker);
    };
  }, [active, snapshot, activeMs]);

  // Begin accumulating at GO. Anything captured during pre-warm is discarded;
  // the latest locked fix (if any) becomes the zero-distance baseline so the
  // first real segment isn't a cold-start jump.
  const start = useCallback(() => {
    startedRef.current = true;
    startRef.current = Date.now();
    pauseAccumMsRef.current = 0;
    pauseStartRef.current = null;
    splitsRef.current = [];
    pausedRef.current = false;
    autoPausedRef.current = false;
    lowSpeedSinceRef.current = null;
    skipSegmentRef.current = false;
    const p = pendingRef.current;
    ptsRef.current = p ? [{ lat: p.lat, lng: p.lng, alt: p.alt, t: Date.now(), d: 0 }] : [];
    snapshot();
  }, [snapshot]);

  const pause = useCallback(() => {
    if (!pausedRef.current) {
      pausedRef.current = true;
      pauseStartRef.current = Date.now();
    }
    snapshot();
  }, [snapshot]);

  const resume = useCallback(() => {
    if (pausedRef.current && pauseStartRef.current !== null) {
      pauseAccumMsRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = null;
    }
    pausedRef.current = false;
    lowSpeedSinceRef.current = null;
    autoPausedRef.current = false;
    snapshot();
  }, [snapshot]);

  // Downsample the live points into a storable route, prepending any trace
  // recovered from a checkpoint. Shared by finish() and checkpoint().
  const buildRoute = useCallback((): RoutePoint[] => {
    const restored = restoredRouteRef.current;
    let route: RoutePoint[] = [...restored];
    // Resume the 5 s sampling clock from the last restored point (its t is
    // relative seconds; live points carry epoch ms).
    let lastT = restored.length
      ? startRef.current + restored[restored.length - 1].t * 1000
      : -Infinity;
    for (const p of ptsRef.current) {
      if (p.t - lastT < ROUTE_SAMPLE_MS) continue;
      lastT = p.t;
      route.push({
        lat: Math.round(p.lat * 1e5) / 1e5,
        lng: Math.round(p.lng * 1e5) / 1e5,
        t: Math.round((p.t - startRef.current) / 1000),
        // Whole meters — GPS altitude wobbles ±several m, finer is noise.
        ...(p.alt != null ? { alt: Math.round(p.alt) } : {})
      });
    }
    // Cap the point budget on very long runs — even stride, always keeping the
    // start and finish so the trace still closes correctly.
    if (route.length > MAX_ROUTE_POINTS) {
      const stride = Math.ceil(route.length / MAX_ROUTE_POINTS);
      const last = route[route.length - 1];
      route = route.filter((_, i) => i % stride === 0);
      if (route[route.length - 1] !== last) route.push(last);
    }
    return route;
  }, []);

  const finish = useCallback((): GpsResult => {
    const pts = ptsRef.current;
    return {
      miles: (pts[pts.length - 1]?.d ?? 0) / METERS_PER_MILE,
      movingSec: activeMs(Date.now()) / 1000,
      splits: splitsRef.current,
      route: buildRoute()
    };
  }, [activeMs, buildRoute]);

  // Serializable snapshot of the run in flight, for the crash-recovery
  // checkpoint. Null until GO — there's nothing worth recovering pre-start.
  const checkpoint = useCallback((): LiveRunCheckpoint["gps"] | null => {
    if (!startedRef.current || !startRef.current) return null;
    const last = ptsRef.current[ptsRef.current.length - 1];
    return {
      startMs: startRef.current,
      pauseAccumMs: pauseAccumMsRef.current,
      pausedAtMs: pauseStartRef.current,
      meters: last?.d ?? 0,
      last: last ? { lat: last.lat, lng: last.lng, alt: last.alt } : null,
      route: buildRoute(),
      splits: [...splitsRef.current]
    };
  }, [buildRoute]);

  // Rebuild the run from a checkpoint after a page kill. The dead gap
  // (checkpoint → now) counts as manual-pause time: no fixes were tracked, so
  // crediting the clock would wreck pace and splits. The first live fix
  // bridges from the last known position with zero distance credit — same
  // mechanics as resuming from a manual pause.
  const restore = useCallback((c: LiveRunCheckpoint["gps"], savedAt: number) => {
    const now = Date.now();
    startedRef.current = true;
    startRef.current = c.startMs;
    pauseAccumMsRef.current =
      c.pauseAccumMs + (c.pausedAtMs != null ? now - c.pausedAtMs : now - savedAt);
    pauseStartRef.current = null;
    pausedRef.current = false;
    autoPausedRef.current = false;
    lowSpeedSinceRef.current = null;
    skipSegmentRef.current = true; // bridge the gap
    splitsRef.current = [...c.splits];
    restoredRouteRef.current = c.route;
    pendingRef.current = null;
    ptsRef.current = c.last
      ? [{ lat: c.last.lat, lng: c.last.lng, alt: c.last.alt, t: savedAt, d: c.meters }]
      : [];
    snapshot();
  }, [snapshot]);

  return { ...state, start, pause, resume, finish, checkpoint, restore };
}
