"use client";

// Live GPS tracking for Run Mode. Geolocation needs a secure context —
// production HTTPS qualifies, and so does `npm run dev` on localhost.
//
// Filtering, in order: fixes with accuracy worse than 25 m are dropped;
// the first 3 otherwise-good fixes are dropped (cold-start scatter);
// any segment implying > 6.7 m/s (faster than 4:00/mi) is GPS jitter
// and dropped. Distance is Haversine over what survives.

import { useCallback, useEffect, useRef, useState } from "react";
import { RoutePoint } from "./storage";

const MAX_ACCURACY_M = 25;
const WARMUP_FIXES = 3;
const MAX_SPEED_MS = 6.7;
const PACE_WINDOW_MS = 45_000;
const PACE_MIN_WINDOW_M = 20;
const AUTOPAUSE_SPEED_MS = 0.5;
const AUTOPAUSE_AFTER_MS = 15_000;
const MAX_SEGMENT_GAP_MS = 10_000; // signal loss: don't count the gap as moving time
const ROUTE_SAMPLE_MS = 5_000;
const METERS_PER_MILE = 1609.344;

interface Pt {
  lat: number;
  lng: number;
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
  elapsedSec: number;
  movingSec: number;
  splits: number[]; // seconds per completed mile
  paused: boolean; // manual
  autoPaused: boolean;
}

export interface GpsResult {
  miles: number;
  movingSec: number;
  elapsedSec: number;
  splits: number[];
  route: RoutePoint[];
}

export function useGps(active: boolean) {
  const [state, setState] = useState<GpsState>({
    status: "acquiring",
    miles: 0,
    currentPaceSec: null,
    avgPaceSec: null,
    elapsedSec: 0,
    movingSec: 0,
    splits: [],
    paused: false,
    autoPaused: false
  });

  const ptsRef = useRef<Pt[]>([]);
  const warmupRef = useRef(0);
  const startRef = useRef(0);
  const movingMsRef = useRef(0);
  const splitsRef = useRef<number[]>([]);
  const pausedRef = useRef(false);
  const autoPausedRef = useRef(false);
  const lowSpeedSinceRef = useRef<number | null>(null);
  const skipSegmentRef = useRef(false); // bridge over a manual pause
  const statusRef = useRef<GpsState["status"]>("acquiring");

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

    const movingSec = movingMsRef.current / 1000;
    setState({
      status: statusRef.current,
      miles,
      currentPaceSec,
      avgPaceSec: miles > 0.05 ? movingSec / miles : null,
      elapsedSec: startRef.current ? (now - startRef.current) / 1000 : 0,
      movingSec,
      splits: splitsRef.current,
      paused: pausedRef.current,
      autoPaused: autoPausedRef.current
    });
  }, []);

  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      statusRef.current = "unsupported";
      snapshot();
      return;
    }
    startRef.current = Date.now();

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const t = Date.now();
        if (accuracy > MAX_ACCURACY_M) return;
        if (warmupRef.current < WARMUP_FIXES) {
          warmupRef.current++;
          return;
        }
        const pts = ptsRef.current;
        const prev = pts[pts.length - 1];

        if (!prev) {
          ptsRef.current.push({ lat: latitude, lng: longitude, t, d: 0 });
          statusRef.current = "tracking";
          snapshot();
          return;
        }

        const dt = t - prev.t;
        if (dt <= 0) return;
        const stepM = haversineMeters(prev.lat, prev.lng, latitude, longitude);
        const speed = stepM / (dt / 1000);
        if (speed > MAX_SPEED_MS) return; // jitter spike

        // Manual pause: track position but freeze distance + clock,
        // and bridge the gap so resume doesn't credit pause movement.
        if (pausedRef.current) {
          skipSegmentRef.current = true;
          snapshot();
          return;
        }
        if (skipSegmentRef.current) {
          skipSegmentRef.current = false;
          ptsRef.current.push({ lat: latitude, lng: longitude, t, d: prev.d });
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
        ptsRef.current.push({ lat: latitude, lng: longitude, t, d });

        if (!autoPausedRef.current && dt < MAX_SEGMENT_GAP_MS) {
          movingMsRef.current += dt;
        }

        // Mile split crossed?
        const newMiles = d / METERS_PER_MILE;
        if (Math.floor(newMiles) > Math.floor(prevMiles)) {
          const movingSecNow = movingMsRef.current / 1000;
          const prior = splitsRef.current.reduce((a, b) => a + b, 0);
          splitsRef.current = [...splitsRef.current, Math.round(movingSecNow - prior)];
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
  }, [active, snapshot]);

  const pause = useCallback(() => {
    pausedRef.current = true;
    snapshot();
  }, [snapshot]);

  const resume = useCallback(() => {
    pausedRef.current = false;
    lowSpeedSinceRef.current = null;
    autoPausedRef.current = false;
    snapshot();
  }, [snapshot]);

  const finish = useCallback((): GpsResult => {
    const pts = ptsRef.current;
    const route: RoutePoint[] = [];
    let lastT = -Infinity;
    for (const p of pts) {
      if (p.t - lastT < ROUTE_SAMPLE_MS) continue;
      lastT = p.t;
      route.push({
        lat: Math.round(p.lat * 1e5) / 1e5,
        lng: Math.round(p.lng * 1e5) / 1e5,
        t: Math.round((p.t - startRef.current) / 1000)
      });
    }
    return {
      miles: (pts[pts.length - 1]?.d ?? 0) / METERS_PER_MILE,
      movingSec: movingMsRef.current / 1000,
      elapsedSec: startRef.current ? (Date.now() - startRef.current) / 1000 : 0,
      splits: splitsRef.current,
      route
    };
  }, []);

  return { ...state, pause, resume, finish };
}
