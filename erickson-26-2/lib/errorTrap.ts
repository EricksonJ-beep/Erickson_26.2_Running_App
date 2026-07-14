"use client";

// Crash recorder. A production JS exception unmounts the whole React tree and
// Next shows its "Application error" page — on a phone there's no console to
// read, so the cause is lost. This traps window errors + unhandled rejections
// into localStorage; Sensor check (Diagnostics) surfaces them so a field
// failure on Jon's phone can be read back after the fact.

const KEY = "hr_lastError_v1";
const MAX_KEPT = 5;

export interface TrappedError {
  msg: string;
  stack?: string;
  at: string; // ISO timestamp
  ua: string; // browser/webview build — tells us WebView vs Chrome + version
}

export function getTrappedErrors(): TrappedError[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TrappedError[]) : [];
  } catch {
    return [];
  }
}

export function clearTrappedErrors() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

function record(msg: string, stack?: string) {
  try {
    const all = getTrappedErrors();
    all.unshift({
      msg: String(msg).slice(0, 500),
      stack: stack?.slice(0, 1500),
      at: new Date().toISOString(),
      ua: navigator.userAgent
    });
    window.localStorage.setItem(KEY, JSON.stringify(all.slice(0, MAX_KEPT)));
  } catch {
    // never let the recorder itself throw
  }
}

let installed = false;

export function installErrorTrap() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => {
    record(e.message || "window.onerror", e.error?.stack);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    record(
      r instanceof Error ? r.message : `unhandledrejection: ${String(r).slice(0, 300)}`,
      r instanceof Error ? r.stack : undefined
    );
  });
}
