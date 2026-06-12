"use client";

// Keeps the screen on during a run. Feature-detected: silently inert
// where the Wake Lock API is missing. Browsers release the lock when
// the tab is hidden, so we re-acquire on return to visibility.

import { useCallback, useEffect, useRef, useState } from "react";

export function useWakeLock() {
  const [active, setActive] = useState(false);
  const wantedRef = useRef(false);
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  const acquire = useCallback(async () => {
    wantedRef.current = true;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      sentinelRef.current = sentinel;
      setActive(true);
      sentinel.addEventListener("release", () => setActive(false));
    } catch {
      // denied (e.g. low battery) — run continues without it
    }
  }, []);

  const release = useCallback(() => {
    wantedRef.current = false;
    sentinelRef.current?.release().catch(() => {});
    sentinelRef.current = null;
    setActive(false);
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && wantedRef.current) acquire();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      sentinelRef.current?.release().catch(() => {});
    };
  }, [acquire]);

  return { active, acquire, release };
}
