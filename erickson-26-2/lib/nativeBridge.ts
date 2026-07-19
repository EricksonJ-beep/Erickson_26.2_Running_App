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
// Screen pinning (lock-task mode) for Run Mode's lock overlay — blocks the OS
// home/recents gestures so a bouncing pocket can't leave the app. Same lazy
// registerPlugin + wrapper rules as everything else; on an APK without the
// plugin the calls reject and callers ignore it (overlay-only lock).
export interface ScreenPinPlugin {
  pin(): Promise<void>;
  unpin(): Promise<void>;
}
let pinPromise: Promise<ScreenPinPlugin | null> | null = null;
export function loadScreenPin(): Promise<ScreenPinPlugin | null> {
  if (!isNativeApp()) return Promise.resolve(null);
  if (!pinPromise) {
    pinPromise = import("@capacitor/core")
      .then((m) => {
        const proxy = m.registerPlugin<ScreenPinPlugin>("ScreenPin");
        const wrapped: ScreenPinPlugin = {
          pin: () => Promise.resolve(proxy.pin()),
          unpin: () => Promise.resolve(proxy.unpin())
        };
        return wrapped;
      })
      .catch(() => null);
  }
  return pinPromise;
}

// APK version info (AppInfoPlugin.java). NOTE: the plugin ships with the
// FIRST APK built after Jul 19 2026 — on earlier installs get() rejects and
// lib/appUpdate falls back to capability probing. Same wrapper rules apply.
export interface AppInfoPlugin {
  get(): Promise<{ version: string }>;
}
let appInfoPromise: Promise<AppInfoPlugin | null> | null = null;
export function loadAppInfo(): Promise<AppInfoPlugin | null> {
  if (!isNativeApp()) return Promise.resolve(null);
  if (!appInfoPromise) {
    appInfoPromise = import("@capacitor/core")
      .then((m) => {
        const proxy = m.registerPlugin<AppInfoPlugin>("AppInfo");
        const wrapped: AppInfoPlugin = { get: () => Promise.resolve(proxy.get()) };
        return wrapped;
      })
      .catch(() => null);
  }
  return appInfoPromise;
}

let geoPromise: Promise<BackgroundGeolocationPlugin | null> | null = null;
export function loadNativeGeo(): Promise<BackgroundGeolocationPlugin | null> {
  if (!isNativeApp()) return Promise.resolve(null);
  if (!geoPromise) {
    geoPromise = import("@capacitor/core")
      .then((m) => {
        const proxy = m.registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");
        // Two traps found in the field (Jon's crash log, Jul 14):
        // 1. Never resolve a promise with the raw registerPlugin proxy — the
        //    promise machinery probes `.then`, and the proxy turns that into
        //    a native call: `"BackgroundGeolocation.then()" is not
        //    implemented on android`. Resolve with a plain wrapper instead.
        // 2. Callback-style methods (addWatcher) can return the watcher id
        //    SYNCHRONOUSLY (a string), not a promise — chaining .then() on
        //    the raw return crashed ("addWatcher(...).then is not a
        //    function"). call() normalizes sync returns/throws to promises.
        const call = <T>(fn: () => T | Promise<T>): Promise<T> => {
          try {
            return Promise.resolve(fn());
          } catch (e) {
            return Promise.reject(e);
          }
        };
        const wrapped: BackgroundGeolocationPlugin = {
          addWatcher: (o, cb) => call(() => proxy.addWatcher(o, cb)),
          removeWatcher: (o) => call(() => proxy.removeWatcher(o)),
          openSettings: () => call(() => proxy.openSettings())
        };
        return wrapped;
      })
      .catch(() => null);
  }
  return geoPromise;
}
