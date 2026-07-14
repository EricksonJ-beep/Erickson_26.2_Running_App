"use client";

// Access to the Capacitor bridge that the native Android shell injects into
// its webview (remote-URL mode — the shell loads the live Vercel site).
//
// Deliberately dependency-free: the web bundle imports NOTHING from
// @capacitor/*, so the PWA stays exactly what it was. In a plain browser
// `window.Capacitor` is absent and everything here reports "not native";
// inside the shell, the injected bridge exposes registered native plugins on
// `window.Capacitor.Plugins` (built from the plugin headers the Android side
// hands to native-bridge.js — no page-side registerPlugin needed).

// The slice of @capacitor-community/background-geolocation we call. Location
// fields mirror the plugin: metric units, epoch-ms time, nullable altitude.
export interface NativeLocation {
  latitude: number;
  longitude: number;
  accuracy: number; // meters
  altitude: number | null; // meters, or null if the device didn't report it
  time: number | null; // ms epoch
  simulated?: boolean;
}

export interface NativeWatcherError {
  code?: string; // "NOT_AUTHORIZED" → user denied location permission
  message?: string;
}

export interface BackgroundGeolocationPlugin {
  addWatcher(
    options: {
      backgroundTitle?: string; // foreground-service notification title
      backgroundMessage?: string; // ...and body; presence keeps GPS alive backgrounded
      requestPermissions?: boolean;
      stale?: boolean; // false → skip cached last-known fixes
      distanceFilter?: number; // meters between callbacks; 0 = every fix
    },
    callback: (position?: NativeLocation, error?: NativeWatcherError) => void
  ): Promise<string>; // watcher id
  removeWatcher(options: { id: string }): Promise<void>;
  openSettings(): Promise<void>; // app's OS settings page (fix a "denied")
}

interface CapacitorBridge {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

function bridge(): CapacitorBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor ?? null;
}

// True only inside the native Android shell (never in a browser/PWA).
export function isNativeApp(): boolean {
  try {
    return bridge()?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

// The native background-GPS plugin, or null (browser, or load failure —
// callers fall back to web geolocation on null).
//
// @capacitor-community/background-geolocation ships NO JavaScript — only the
// native implementation plus type definitions. Its documented usage is to
// call registerPlugin("BackgroundGeolocation") yourself. That's why the
// injected `window.Capacitor.Plugins` proxy never exposed it (field-tested
// Jul 14: GPS silently fell back to screen-on web tracking) — nothing had
// registered it. registerPlugin comes from a lazy import of @capacitor/core,
// the same mechanism the BLE HR transport uses (proven on device); gated on
// isNativeApp(), so the PWA never fetches the chunk.
let geoPromise: Promise<BackgroundGeolocationPlugin | null> | null = null;
export function loadNativeGeo(): Promise<BackgroundGeolocationPlugin | null> {
  if (!isNativeApp()) return Promise.resolve(null);
  if (!geoPromise) {
    geoPromise = import("@capacitor/core")
      .then((m) => m.registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation"))
      .catch(() => null);
  }
  return geoPromise;
}
