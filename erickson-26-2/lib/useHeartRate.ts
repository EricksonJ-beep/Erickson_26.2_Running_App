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

const MAX_RECONNECTS = 3;
const RECONNECT_DELAYS_MS = [1000, 3000, 6000];
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
  const zonesRef = useRef(computeZones(typeof window === "undefined" ? {} : getProfile()));
  const zoneSecondsRef = useRef([0, 0, 0, 0, 0]);
  const weightedSumRef = useRef(0); // Σ bpm·dt for time-weighted average
  const weightSecRef = useRef(0);
  const lastSampleRef = useRef(0);
  const reconnectsRef = useRef(0);
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
      const z = zoneOf(hr);
      if (z !== null) zoneSecondsRef.current[z] += dt;
      setBpm(hr);
    },
    [zoneOf]
  );

  const subscribe = useCallback(
    async (device: BTDevice) => {
      const server = await device.gatt!.connect();
      const service = await server.getPrimaryService("heart_rate");
      const ch = await service.getCharacteristic("heart_rate_measurement");
      await ch.startNotifications();
      ch.addEventListener("characteristicvaluechanged", onMeasurement);
      reconnectsRef.current = 0;
      setStatus("connected");
    },
    [onMeasurement]
  );

  const handleDisconnect = useCallback(async () => {
    if (closedRef.current) return;
    setStatus("lost");
    setBpm(null);
    const device = deviceRef.current;
    while (device && reconnectsRef.current < MAX_RECONNECTS && !closedRef.current) {
      const delay = RECONNECT_DELAYS_MS[reconnectsRef.current];
      reconnectsRef.current++;
      await new Promise((r) => setTimeout(r, delay));
      if (closedRef.current) return;
      try {
        await subscribe(device);
        return;
      } catch {
        // strap still out of range — next backoff step
      }
    }
  }, [subscribe]);

  // Must run inside a user gesture (button tap) per the Web Bluetooth spec.
  const connect = useCallback(async () => {
    if (!supported) return;
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

  const disconnect = useCallback(() => {
    closedRef.current = true;
    deviceRef.current?.gatt?.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      closedRef.current = true;
      deviceRef.current?.gatt?.disconnect();
    };
  }, []);

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
    connect,
    disconnect
  };
}
