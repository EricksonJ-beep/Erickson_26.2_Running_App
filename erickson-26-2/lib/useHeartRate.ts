"use client";

// Live heart rate over Bluetooth (standard Heart Rate Service, 0x180D /
// characteristic 0x2A37 — the Polar H10 advertises it, so no vendor code).
//
// Two transports behind one identical API:
//   • Browser / PWA  → Web Bluetooth (navigator.bluetooth). Chrome/Android
//     only; iOS/desktop Safari report supported:false and stay inert.
//   • Native Android shell → @capacitor-community/bluetooth-le, so HR works
//     inside the Capacitor app (which has no Web Bluetooth) and keeps
//     streaming with the screen off. The plugin module is loaded lazily and
//     only on-device, so the web bundle never imports any @capacitor/* code.
//
// Both transports funnel every reading through onSample(hr); all the
// accumulation, zone, and rolling-window math is written exactly once.

import { useCallback, useEffect, useRef, useState } from "react";
import { computeZones } from "./zones";
import { getProfile } from "./storage";
import { isNativeApp } from "./nativeBridge";

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

// Full 128-bit UUIDs for the native plugin (Web Bluetooth accepts the short
// "heart_rate" aliases; the BLE-LE plugin wants the expanded form).
const HR_SERVICE = "0000180d-0000-1000-8000-00805f9b34fb";
const HR_MEASUREMENT = "00002a37-0000-1000-8000-00805f9b34fb";

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

// Lazy handle to the native BLE plugin (only ever loaded inside the shell).
type BleClientType = typeof import("@capacitor-community/bluetooth-le").BleClient;
let blePromise: Promise<BleClientType> | null = null;
function bleClient(): Promise<BleClientType> {
  if (!blePromise) {
    blePromise = import("@capacitor-community/bluetooth-le").then((m) => m.BleClient);
  }
  return blePromise;
}

export type HRStatus = "idle" | "connecting" | "connected" | "lost";

export function useHeartRate() {
  const native = isNativeApp();
  const supported =
    native || (typeof navigator !== "undefined" && "bluetooth" in navigator);

  const [status, setStatus] = useState<HRStatus>("idle");
  const [bpm, setBpm] = useState<number | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(null);

  const deviceRef = useRef<BTDevice | null>(null); // web transport
  const charRef = useRef<BTCharacteristic | null>(null); // web: clean listener teardown
  const nativeIdRef = useRef<string | null>(null); // native transport: deviceId
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
  // Native disconnect handler, held in a ref so the notification/connect
  // callbacks can reach the latest one without a definition cycle.
  const onNativeDropRef = useRef<() => void>(() => {});

  const zoneOf = useCallback((hr: number): number | null => {
    const zones = zonesRef.current;
    if (hr < zones[0].lo) return null; // below Z1
    for (let i = zones.length - 1; i >= 0; i--) {
      if (hr >= zones[i].lo) return i;
    }
    return null;
  }, []);

  // Shared sample pipeline — every reading from either transport lands here.
  const onSample = useCallback(
    (hr: number) => {
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

  const onMeasurement = useCallback(
    (event: Event) => {
      const value = (event.target as BTCharacteristic).value;
      if (!value) return;
      onSample(parseHeartRate(value));
    },
    [onSample]
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

  // Like recentSample, but anchored: averages the samples in the `windowSec`
  // seconds leading up to epoch `atMs` (small forward tolerance for a sample
  // landing just past the mark). HRR checkpoints use this so a late timer tick
  // (throttled tab, backgrounded screen) still reads the HR *at* 1:00/2:00,
  // not whatever it is when the tick finally fires. Limited by the ~15 s ring
  // buffer — null if the mark has already slid out of the window.
  const sampleAt = useCallback((atMs: number, windowSec = 5) => {
    const lo = atMs - windowSec * 1000;
    const hi = atMs + 1000;
    const xs = recentRef.current.filter((s) => s.t >= lo && s.t <= hi).map((s) => s.hr);
    if (xs.length === 0) return null;
    const avg = Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
    const spread = Math.max(...xs) - Math.min(...xs);
    return { avg, spread, count: xs.length };
  }, []);

  // Serializable run totals for the mid-run crash-recovery checkpoint.
  const totals = useCallback(() => ({
    weightedSum: weightedSumRef.current,
    weightSec: weightSecRef.current,
    zoneSeconds: zoneSecondsRef.current.map((s) => Math.round(s * 10) / 10)
  }), []);

  // Rebuild the accumulators from a checkpoint after a page kill, so avg HR
  // and time-in-zone carry across the recovery. lastSample resets so no zone
  // time is credited across the dead gap (same rule as a signal gap).
  const restoreTotals = useCallback(
    (t: { weightedSum: number; weightSec: number; zoneSeconds: number[] }) => {
      weightedSumRef.current = t.weightedSum;
      weightSecRef.current = t.weightSec;
      zoneSecondsRef.current = [0, 0, 0, 0, 0].map((_, i) => t.zoneSeconds[i] ?? 0);
      lastSampleRef.current = 0;
    },
    []
  );

  // ── Web Bluetooth transport ──
  const subscribeWeb = useCallback(
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

  // ── Native BLE transport ──
  const subscribeNative = useCallback(
    async (deviceId: string) => {
      const BleClient = await bleClient();
      await BleClient.connect(deviceId, () => onNativeDropRef.current());
      await BleClient.startNotifications(deviceId, HR_SERVICE, HR_MEASUREMENT, (value) =>
        onSample(parseHeartRate(value))
      );
      reconnectsRef.current = 0;
      setStatus("connected");
    },
    [onSample]
  );

  const subscribe = native ? subscribeNative : subscribeWeb;

  // Strap dropped: keep retrying the known device with backoff for the whole
  // run (the last delay repeats). One loop at a time, guarded by generation.
  const handleDisconnect = useCallback(async () => {
    if (closedRef.current) return;
    const gen = genRef.current;
    if (reconnectGenRef.current === gen) return; // a loop for this generation is already running
    reconnectGenRef.current = gen;
    setStatus("lost");
    setBpm(null);
    const hasDevice = native ? nativeIdRef.current !== null : deviceRef.current !== null;
    while (hasDevice && !closedRef.current && genRef.current === gen) {
      const delay = RECONNECT_DELAYS_MS[Math.min(reconnectsRef.current, RECONNECT_DELAYS_MS.length - 1)];
      reconnectsRef.current++;
      await new Promise((r) => setTimeout(r, delay));
      if (closedRef.current || genRef.current !== gen) break;
      try {
        if (native) {
          if (nativeIdRef.current) await subscribeNative(nativeIdRef.current);
        } else if (deviceRef.current) {
          await subscribeWeb(deviceRef.current); // resets the backoff on success
        }
        if (genRef.current !== gen) break; // re-paired to a new device mid-attempt
        break;
      } catch {
        // strap still out of range — keep backing off and retrying
      }
    }
    if (reconnectGenRef.current === gen) reconnectGenRef.current = 0; // release only if still ours
  }, [native, subscribeNative, subscribeWeb]);

  // Keep the native disconnect callback pointing at the latest handler.
  useEffect(() => {
    onNativeDropRef.current = handleDisconnect;
  }, [handleDisconnect]);

  // Full (re-)pair: opens the device chooser. Tears down any prior device
  // first so the user can force a clean re-pair mid-run even while "connected".
  const connect = useCallback(async () => {
    if (!supported) return;
    closedRef.current = false; // revive the reconnect machinery
    reconnectsRef.current = 0;
    genRef.current++; // new generation — abandon any stale reconnect loop from the old device
    const gen = genRef.current;

    if (native) {
      try {
        setStatus("connecting");
        const BleClient = await bleClient();
        await BleClient.initialize();
        // Drop a prior strap so a mid-run re-pair is clean.
        const prevId = nativeIdRef.current;
        if (prevId) {
          try {
            await BleClient.stopNotifications(prevId, HR_SERVICE, HR_MEASUREMENT);
            await BleClient.disconnect(prevId);
          } catch {
            // already gone — ignore
          }
        }
        const device = await BleClient.requestDevice({ services: [HR_SERVICE] });
        if (genRef.current !== gen) return; // superseded by a newer connect()
        nativeIdRef.current = device.deviceId;
        setDeviceName(device.name ?? "HR strap");
        await subscribeNative(device.deviceId);
      } catch {
        setStatus(nativeIdRef.current ? "lost" : "idle");
      }
      return;
    }

    // Web transport
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
    try {
      setStatus("connecting");
      const bt = (navigator as Navigator & { bluetooth: BTApi }).bluetooth;
      const device = await bt.requestDevice({ filters: [{ services: ["heart_rate"] }] });
      deviceRef.current = device;
      setDeviceName(device.name ?? "HR strap");
      device.addEventListener("gattserverdisconnected", handleDisconnect);
      await subscribeWeb(device);
    } catch {
      // user dismissed the chooser, or connect failed
      setStatus(deviceRef.current ? "lost" : "idle");
    }
  }, [supported, native, subscribeNative, subscribeWeb, handleDisconnect]);

  // One-tap recovery: re-subscribe the already-paired strap without reopening
  // the chooser. Falls back to a full pair if no device is known yet.
  const reconnect = useCallback(async () => {
    closedRef.current = false;
    if (native) {
      if (!nativeIdRef.current) return connect();
      setStatus("connecting");
      try {
        await subscribeNative(nativeIdRef.current);
      } catch {
        handleDisconnect();
      }
      return;
    }
    const device = deviceRef.current;
    if (!device) return connect();
    setStatus("connecting");
    try {
      await subscribeWeb(device);
    } catch {
      handleDisconnect(); // drop into the backoff retry loop
    }
  }, [native, connect, subscribeNative, subscribeWeb, handleDisconnect]);

  const disconnect = useCallback(() => {
    closedRef.current = true;
    if (native) {
      const id = nativeIdRef.current;
      if (id) {
        bleClient().then((BleClient) => {
          BleClient.stopNotifications(id, HR_SERVICE, HR_MEASUREMENT).catch(() => {});
          BleClient.disconnect(id).catch(() => {});
        });
      }
      return;
    }
    try {
      charRef.current?.removeEventListener("characteristicvaluechanged", onMeasurement);
    } catch {
      // ignore
    }
    deviceRef.current?.gatt?.disconnect();
  }, [native, onMeasurement]);

  useEffect(() => {
    return () => {
      closedRef.current = true;
      if (native) {
        const id = nativeIdRef.current;
        if (id) {
          bleClient().then((BleClient) => {
            BleClient.stopNotifications(id, HR_SERVICE, HR_MEASUREMENT).catch(() => {});
            BleClient.disconnect(id).catch(() => {});
          });
        }
        return;
      }
      try {
        charRef.current?.removeEventListener("characteristicvaluechanged", onMeasurement);
      } catch {
        // ignore
      }
      deviceRef.current?.gatt?.disconnect();
    };
  }, [native, onMeasurement]);

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
    sampleAt, // rolling-avg anchored at a specific instant (HRR checkpoints)
    totals, // run accumulators for the mid-run checkpoint
    restoreTotals, // rebuild accumulators from a recovered checkpoint
    connect, // full (re-)pair via the chooser
    reconnect, // one-tap retry of the known strap, no chooser
    disconnect
  };
}
