"use client";

// Live heart rate over Web Bluetooth (standard Heart Rate Service,
// 0x180D / characteristic 0x2A37). The Polar H10 advertises this
// standard service, so no vendor code is needed. Bluetooth requires a
// secure context — HTTPS in production, or `npm run dev` on localhost.
//
// Chrome on Android supports this; where navigator.bluetooth is absent
// (iOS, desktop Safari) the hook reports supported: false and stays inert.

import { useCallback, useEffect, useRef, useState } from "react";
import { computeZones } from "./zones";
import { getProfile } from "./storage";

// lib.dom carries no Web Bluetooth types and new @types deps are off
// the table, so declare the minimal slice used here.
interface BTCharacteristic extends EventTarget {
  startNotifications(): Promise<BTCharacteristic>;
  value?: DataView;
}
interface BTService {
  getCharacteristic(name: string): Promise<BTCharacteristic>;
}
interface BTGattServer {
  connected: boolean;
  connect(): Promise<BTGattServer>;
  disconnect(): void;
  getPrimaryService(name: string): Promise<BTService>;
}
interface BTDevice extends EventTarget {
  name?: string;
  gatt?: BTGattServer;
}
interface BTApi {
  requestDevice(options: { filters: { services: string[] }[] }): Promise<BTDevice>;
}

// Auto-reconnect backoff (ms). The last value repeats — we keep retrying a
// dropped strap for the whole run instead of giving up after a few tries, so a
// brief out-of-range moment or a sweat/contact blip doesn't kill HR for good.
const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 6000, 8000];
const MAX_SAMPLE_GAP_S = 5; // don't credit zone time across signal gaps

// Flags byte bit 0: 0 → uint8 HR at offset 1, 1 → uint16 LE at offset 1.
function parseHeartRate(value: DataView): number {
  const flags = value.getUint8(0);
  return flags & 0x1 ? value.getUint16(1, true) : value.getUint8(1);
}

export type HRStatus = "idle" | "connecting" | "connected" | "lost";

export function useHeartRate() {
  const supported =
    typeof navigator !== "undefined" && "bluetooth" in navigator;

  const [status, setStatus] = useState<HRStatus>("idle");
  const [bpm, setBpm] = useState<number | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(null);

  const deviceRef = useRef<BTDevice | null>(null);
  const charRef = useRef<BTCharacteristic | null>(null); // for clean listener teardown
  const zonesRef = useRef(computeZones(typeof window === "undefined" ? {} : getProfile()));
  const zoneSecondsRef = useRef([0, 0, 0, 0, 0]);
  const weightedSumRef = useRef(0); // Σ bpm·dt for time-weighted average
  const weightSecRef = useRef(0);
  const lastSampleRef = useRef(0);
  const recentRef = useRef<{ t: number; hr: number }[]>([]); // short rolling window (HRR capture)
  const reconnectsRef = useRef(0);
  // Each fresh (re-)pair bumps genRef; a running retry loop belongs to the
  // generation in reconnectGenRef (0 = none). When connect() bumps the
  // generation, any stale loop exits and — critically — its guard no longer
  // blocks the NEW device's auto-reconnect (the "strap lost → Re-pair" case).
  const genRef = useRef(0);
  const reconnectGenRef = useRef(0);
  const closedRef = useRef(false);

  const zoneOf = useCallback((hr: number): number | null => {
    const zones = zonesRef.current;
    if (hr < zones[0].lo) return null; // below Z1
    for (let i = zones.length - 1; i >= 0; i--) {
      if (hr >= zones[i].lo) return i;
    }
    return null;
  }, []);

  const onMeasurement = useCallback(
    (event: Event) => {
      const value = (event.target as BTCharacteristic).value;
      if (!value) return;
      const hr = parseHeartRate(value);
      if (hr < 30 || hr > 230) return; // sensor glitch
      const now = Date.now();
      const dt = lastSampleRef.current
        ? Math.min((now - lastSampleRef.current) / 1000, MAX_SAMPLE_GAP_S)
        : 1;
      lastSampleRef.current = now;
      weightedSumRef.current += hr * dt;
      weightSecRef.current += dt;
      // Keep a short rolling window for HRR capture (last ~15 s), so a checkpoint
      // reads a smoothed value instead of one spiky instantaneous sample.
      const buf = recentRef.current;
      buf.push({ t: now, hr });
      const cutoff = now - 15_000;
      while (buf.length && buf[0].t < cutoff) buf.shift();
      const z = zoneOf(hr);
      if (z !== null) zoneSecondsRef.current[z] += dt;
      setBpm(hr);
    },
    [zoneOf]
  );

  // Rolling-average HR over the last `windowSec` seconds, plus spread (max−min)
  // so callers can flag a noisy capture. Returns null if no fresh samples —
  // e.g. the strap dropped — which the HRR test treats as a missed checkpoint.
  const recentSample = useCallback((windowSec = 5) => {
    const cutoff = Date.now() - windowSec * 1000;
    const xs = recentRef.current.filter((s) => s.t >= cutoff).map((s) => s.hr);
    if (xs.length === 0) return null;
    const avg = Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
    const spread = Math.max(...xs) - Math.min(...xs);
    return { avg, spread, count: xs.length };
  }, []);

  const subscribe = useCallback(
    async (device: BTDevice) => {
      const server = await device.gatt!.connect();
      const service = await server.getPrimaryService("heart_rate");
      const ch = await service.getCharacteristic("heart_rate_measurement");
      await ch.startNotifications();
      // Drop any stale listener from a prior subscription so a re-pair or
      // reconnect can't end up double-counting measurements.
      charRef.current?.removeEventListener("characteristicvaluechanged", onMeasurement);
      ch.addEventListener("characteristicvaluechanged", onMeasurement);
      charRef.current = ch;
      reconnectsRef.current = 0;
      setStatus("connected");
    },
    [onMeasurement]
  );

  // Strap dropped: keep retrying the known device with backoff for the whole
  // run (the last delay repeats). One loop at a time, guarded by reconnectingRef.
  const handleDisconnect = useCallback(async () => {
    if (closedRef.current) return;
    const gen = genRef.current;
    if (reconnectGenRef.current === gen) return; // a loop for this generation is already running
    reconnectGenRef.current = gen;
    setStatus("lost");
    setBpm(null);
    const device = deviceRef.current;
    while (device && !closedRef.current && genRef.current === gen) {
      const delay = RECONNECT_DELAYS_MS[Math.min(reconnectsRef.current, RECONNECT_DELAYS_MS.length - 1)];
      reconnectsRef.current++;
      await new Promise((r) => setTimeout(r, delay));
      if (closedRef.current || genRef.current !== gen) break;
      try {
        await subscribe(device); // resets the backoff on success
        if (genRef.current !== gen) { // re-paired to a new device mid-attempt — drop this stale one
          try { device.gatt?.disconnect(); } catch { /* ignore */ }
          break;
        }
        break;
      } catch {
        // strap still out of range — keep backing off and retrying
      }
    }
    if (reconnectGenRef.current === gen) reconnectGenRef.current = 0; // release only if still ours
  }, [subscribe]);

  // Full (re-)pair: opens the device chooser. Must run inside a user gesture
  // per the Web Bluetooth spec. Tears down any prior device first so the user
  // can force a clean re-pair mid-run even while it shows "connected".
  const connect = useCallback(async () => {
    if (!supported) return;
    const prev = deviceRef.current;
    if (prev) {
      try {
        prev.removeEventListener("gattserverdisconnected", handleDisconnect);
        prev.gatt?.disconnect();
      } catch {
        // ignore
      }
    }
    charRef.current = null;
    closedRef.current = false; // revive the reconnect machinery
    reconnectsRef.current = 0;
    genRef.current++; // new generation — abandon any stale reconnect loop from the old device
    try {
      setStatus("connecting");
      const bt = (navigator as Navigator & { bluetooth: BTApi }).bluetooth;
      const device = await bt.requestDevice({ filters: [{ services: ["heart_rate"] }] });
      deviceRef.current = device;
      setDeviceName(device.name ?? "HR strap");
      device.addEventListener("gattserverdisconnected", handleDisconnect);
      await subscribe(device);
    } catch {
      // user dismissed the chooser, or connect failed
      setStatus(deviceRef.current ? "lost" : "idle");
    }
  }, [supported, subscribe, handleDisconnect]);

  // One-tap recovery: re-subscribe the already-paired strap without reopening
  // the chooser. Falls back to a full pair if no device is known yet.
  const reconnect = useCallback(async () => {
    const device = deviceRef.current;
    if (!device) return connect();
    closedRef.current = false;
    setStatus("connecting");
    try {
      await subscribe(device);
    } catch {
      handleDisconnect(); // drop into the backoff retry loop
    }
  }, [connect, subscribe, handleDisconnect]);

  const disconnect = useCallback(() => {
    closedRef.current = true;
    try {
      charRef.current?.removeEventListener("characteristicvaluechanged", onMeasurement);
    } catch {
      // ignore
    }
    deviceRef.current?.gatt?.disconnect();
  }, [onMeasurement]);

  useEffect(() => {
    return () => {
      closedRef.current = true;
      try {
        charRef.current?.removeEventListener("characteristicvaluechanged", onMeasurement);
      } catch {
        // ignore
      }
      deviceRef.current?.gatt?.disconnect();
    };
  }, [onMeasurement]);

  const avgBpm =
    weightSecRef.current > 0
      ? Math.round(weightedSumRef.current / weightSecRef.current)
      : null;

  return {
    supported,
    status,
    bpm,
    avgBpm,
    deviceName,
    zone: bpm !== null ? zoneOf(bpm) : null, // 0-indexed: 0 → Z1
    zoneSeconds: zoneSecondsRef.current,
    recentSample, // rolling-avg over the last N seconds (HRR capture)
    connect, // full (re-)pair via the chooser
    reconnect, // one-tap retry of the known strap, no chooser
    disconnect
  };
}
