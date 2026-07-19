"use client";

// "Update available" check for the native app. The shell loads the live site,
// so the web layer always knows about the newest GitHub release — but it can't
// know which APK it's running inside without asking the native side. Strategy:
//   1. Ask the AppInfo plugin for the exact versionName (ships with the next
//      APK build — this file is deliberately ahead of it).
//   2. On APKs without AppInfo, infer the generation by probing a plugin we
//      know shipped in v0.5.0 (ScreenPin.unpin() is a safe no-op) — good
//      enough to answer "is there something newer than what I'm running".
// Latest release comes from the public GitHub API (CORS-open, unauthenticated;
// cached 6 h so we stay far from rate limits). Browser/PWA: never checks.

import { isNativeApp, loadAppInfo, loadScreenPin } from "./nativeBridge";

const RELEASES_API =
  "https://api.github.com/repos/EricksonJ-beep/Erickson_26.2_Running_App/releases/latest";
const CACHE_KEY = "hr_updateCheck_v1"; // { at, tag, url } — last successful API result
const DISMISS_KEY = "hr_updateDismiss_v1"; // release tag Jon dismissed
const CACHE_TTL_MS = 6 * 3_600_000;

export interface UpdateInfo {
  tag: string; // e.g. "android-v0.6.0"
  url: string; // release page (one tap from the card)
}

function parseVersion(s: string): [number, number, number] {
  const m = s.match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
}

function isNewer(a: [number, number, number], b: [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

async function installedVersion(): Promise<string> {
  const info = await loadAppInfo();
  if (info) {
    try {
      return (await info.get()).version;
    } catch {
      // APK predates the AppInfo plugin — fall through to the probe
    }
  }
  const pin = await loadScreenPin();
  if (pin) {
    try {
      await pin.unpin(); // no-op when not pinned; rejects if the plugin is absent
      return "0.5.0";
    } catch {
      // pre-0.5.0 APK; exact number doesn't matter, only "older than latest"
    }
  }
  return "0.4.0";
}

async function latestRelease(): Promise<UpdateInfo | null> {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (raw) {
      const c = JSON.parse(raw) as { at: number; tag: string; url: string };
      if (Date.now() - c.at < CACHE_TTL_MS) return { tag: c.tag, url: c.url };
    }
  } catch {
    // bad cache — refetch
  }
  try {
    const res = await fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return null;
    const data = (await res.json()) as { tag_name?: string; html_url?: string };
    if (!data.tag_name || !data.html_url) return null;
    const info = { tag: data.tag_name, url: data.html_url };
    try {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), ...info }));
    } catch {
      // cache write is best-effort
    }
    return info;
  } catch {
    return null; // offline — try again next launch
  }
}

// Null = up to date, dismissed, not the native app, or couldn't tell.
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isNativeApp()) return null;
  const latest = await latestRelease();
  if (!latest) return null;
  try {
    if (window.localStorage.getItem(DISMISS_KEY) === latest.tag) return null;
  } catch {
    // ignore
  }
  const current = await installedVersion();
  return isNewer(parseVersion(latest.tag), parseVersion(current)) ? latest : null;
}

export function dismissUpdate(tag: string) {
  try {
    window.localStorage.setItem(DISMISS_KEY, tag);
  } catch {
    // ignore
  }
}
