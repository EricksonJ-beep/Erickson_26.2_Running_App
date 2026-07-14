"use client";

// Sensor Check — a fullscreen test harness for the same hardware Run Mode
// uses: GPS, the Polar H10 (Web Bluetooth heart rate), and the screen wake
// lock. Nothing here is saved; it's purely "is everything working?" so Jon
// can shake out the gear before a run instead of during one.

import { useCallback, useEffect, useRef, useState } from "react";
import { computeZones } from "@/lib/zones";
import { getProfile } from "@/lib/storage";
import { useHeartRate } from "@/lib/useHeartRate";
import { useWakeLock } from "@/lib/useWakeLock";
import { getTrappedErrors, clearTrappedErrors, TrappedError } from "@/lib/errorTrap";
import { isNativeApp } from "@/lib/nativeBridge";

const METERS_PER_MILE = 1609.344;

function fmtPaceFromSpeed(speed: number | null | undefined): string {
  if (speed == null || !isFinite(speed) || speed < 0.3) return "—";
  const sec = METERS_PER_MILE / speed;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")} /mi`;
}

function accuracyQuality(acc: number): { label: string; tone: "good" | "ok" | "bad" } {
  if (acc <= 8) return { label: "Excellent", tone: "good" };
  if (acc <= 15) return { label: "Good", tone: "good" };
  if (acc <= 30) return { label: "Fair", tone: "ok" };
  return { label: "Weak", tone: "bad" };
}

const TONE: Record<"good" | "ok" | "bad", string> = {
  good: "text-sage",
  ok: "text-gold",
  bad: "text-ember"
};

interface GpsState {
  status: "idle" | "acquiring" | "tracking" | "denied" | "unsupported";
  coords: GeolocationCoordinates | null;
  fixes: number;
  lastFixAt: number | null;
  error: string | null;
}

export default function DiagnosticsView({ onClose }: { onClose: () => void }) {
  // ── Capability check (evaluated on mount, client-side) ──
  const [caps, setCaps] = useState({
    secure: false,
    geolocation: false,
    bluetooth: false,
    wakeLock: false
  });
  useEffect(() => {
    setCaps({
      secure: window.isSecureContext,
      geolocation: "geolocation" in navigator,
      bluetooth: "bluetooth" in navigator,
      wakeLock: "wakeLock" in navigator
    });
  }, []);

  // ── GPS test (raw watcher — unfiltered, shows real accuracy) ──
  const [gps, setGps] = useState<GpsState>({
    status: "idle",
    coords: null,
    fixes: 0,
    lastFixAt: null,
    error: null
  });
  const watchRef = useRef<number | null>(null);
  const [, tick] = useState(0); // 1 s re-render so "last fix" age stays live

  const stopGps = useCallback(() => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    setGps((g) => ({ ...g, status: "idle" }));
  }, []);

  const startGps = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGps((g) => ({ ...g, status: "unsupported" }));
      return;
    }
    setGps({ status: "acquiring", coords: null, fixes: 0, lastFixAt: null, error: null });
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGps((g) => ({
          status: "tracking",
          coords: pos.coords,
          fixes: g.fixes + 1,
          lastFixAt: Date.now(),
          error: null
        }));
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGps((g) => ({ ...g, status: "denied", error: "Location permission denied." }));
        } else {
          setGps((g) => ({
            ...g,
            error: err.code === err.TIMEOUT ? "Waiting for a fix…" : "Position unavailable — still trying…"
          }));
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  }, []);

  // Keep the "last fix" age ticking while a watch is live.
  useEffect(() => {
    if (gps.status !== "tracking" && gps.status !== "acquiring") return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [gps.status]);

  // Clean up the GPS watch when the panel closes.
  useEffect(() => {
    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, []);

  // ── Heart rate test (same hook Run Mode uses) ──
  const hr = useHeartRate();
  const zones = computeZones(getProfile());
  const zoneName = hr.zone !== null ? zones[hr.zone]?.name : null;

  // ── Wake lock test (same hook Run Mode uses) ──
  const wake = useWakeLock();

  const close = () => {
    stopGps();
    if (wake.active) wake.release();
    hr.disconnect();
    onClose();
  };

  const fixAge =
    gps.lastFixAt ? Math.max(0, Math.round((Date.now() - gps.lastFixAt) / 1000)) : null;

  return (
    <div className="fixed inset-0 z-50 bg-ink overflow-y-auto">
      <div className="mx-auto max-w-md min-h-full flex flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="bg-gold h-1.5 w-12 mb-2 rounded-sm" />
            <h1 className="font-display font-bold text-2xl tracking-wide text-bone leading-none">
              SENSOR <span className="text-gold">CHECK</span>
            </h1>
          </div>
          <button
            onClick={close}
            aria-label="Close sensor check"
            className="w-10 h-10 rounded-lg bg-coal border border-seam text-bone text-lg leading-none"
          >
            ✕
          </button>
        </div>
        <p className="text-[11px] text-dust mb-4 leading-snug">
          Test your gear here — nothing is logged. Run a quick check before heading out so
          there are no surprises mid-run.
        </p>

        <div className="space-y-4">
          {/* Capability check */}
          <div className="bg-coal rounded-2xl border border-seam p-5">
            <h2 className="font-display font-bold text-lg text-bone">This device</h2>
            <div className="mt-3 space-y-1.5">
              <CapRow ok={caps.secure} label="Secure connection (HTTPS)" need="needed for GPS & Bluetooth" />
              <CapRow ok={caps.geolocation} label="GPS / location" />
              <CapRow ok={caps.bluetooth} label="Bluetooth heart rate" need={caps.bluetooth ? undefined : "use Chrome on Android"} />
              <CapRow ok={caps.wakeLock} label="Keep screen awake" need={caps.wakeLock ? undefined : "optional"} />
            </div>
          </div>

          {/* GPS */}
          <div className="bg-coal rounded-2xl border border-seam p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-lg text-bone">GPS</h2>
              <StatusPill
                tone={
                  gps.status === "tracking" ? "good" :
                  gps.status === "denied" || gps.status === "unsupported" ? "bad" :
                  gps.status === "acquiring" ? "ok" : "idle"
                }
                label={
                  gps.status === "tracking" ? "Live" :
                  gps.status === "acquiring" ? "Acquiring…" :
                  gps.status === "denied" ? "Denied" :
                  gps.status === "unsupported" ? "Unsupported" : "Off"
                }
              />
            </div>

            {gps.status === "tracking" && gps.coords && (
              <>
                <div className="mt-3 flex items-end gap-2">
                  <span className="font-display font-bold text-5xl text-bone tabular-nums leading-none">
                    {Math.round(gps.coords.accuracy)}
                  </span>
                  <span className="text-sm text-dust pb-1">m accuracy</span>
                  <span className={`pb-1 ml-auto font-display font-bold ${TONE[accuracyQuality(gps.coords.accuracy).tone]}`}>
                    {accuracyQuality(gps.coords.accuracy).label}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Cell label="Latitude" value={gps.coords.latitude.toFixed(5)} />
                  <Cell label="Longitude" value={gps.coords.longitude.toFixed(5)} />
                  <Cell label="Speed" value={fmtPaceFromSpeed(gps.coords.speed)} />
                  <Cell
                    label="Altitude"
                    value={gps.coords.altitude != null ? `${Math.round(gps.coords.altitude)} m` : "—"}
                  />
                  <Cell label="Fixes" value={String(gps.fixes)} />
                  <Cell label="Last fix" value={fixAge != null ? `${fixAge}s ago` : "—"} tone={fixAge != null && fixAge > 5 ? "bad" : undefined} />
                </div>
                <p className="text-[11px] text-dust mt-3 leading-snug">
                  Step outside and wait for accuracy to settle under ~15 m. Walk a few paces —
                  latitude and longitude should change.
                </p>
              </>
            )}

            {gps.status === "acquiring" && (
              <p className="text-sm text-dust mt-3">
                Searching for satellites… {gps.error ?? "this can take 10–30 s outdoors."}
              </p>
            )}
            {gps.status === "denied" && (
              <p className="text-sm text-ember mt-3 leading-snug">
                Location is blocked for this site. Enable it in your browser/site settings, then
                try again.
              </p>
            )}
            {gps.status === "unsupported" && (
              <p className="text-sm text-ember mt-3">This browser can&apos;t provide GPS.</p>
            )}

            <button
              onClick={gps.status === "idle" || gps.status === "unsupported" ? startGps : stopGps}
              className={`mt-4 w-full font-display font-bold tracking-widest uppercase rounded-lg py-3 text-sm min-h-[48px] ${
                gps.status === "idle" || gps.status === "unsupported"
                  ? "bg-gold text-ink"
                  : "bg-ink border border-seam text-bone"
              }`}
            >
              {gps.status === "idle" || gps.status === "unsupported" ? "Start GPS test" : "Stop"}
            </button>
          </div>

          {/* Heart rate */}
          <div className="bg-coal rounded-2xl border border-seam p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-lg text-bone">Heart rate</h2>
              <StatusPill
                tone={
                  hr.status === "connected" ? "good" :
                  hr.status === "lost" ? "bad" :
                  hr.status === "connecting" ? "ok" : "idle"
                }
                label={
                  hr.status === "connected" ? "Connected" :
                  hr.status === "connecting" ? "Connecting…" :
                  hr.status === "lost" ? "Signal lost" : "Off"
                }
              />
            </div>

            {!hr.supported ? (
              <p className="text-sm text-ember mt-3 leading-snug">
                Web Bluetooth isn&apos;t available here, so the heart-rate strap can&apos;t connect.
                Use Chrome on Android for HR. GPS still works on this device.
              </p>
            ) : (
              <>
                {hr.status === "connected" && (
                  <div className="mt-3 flex items-end gap-3">
                    <span className="font-display font-bold text-6xl text-gold tabular-nums leading-none">
                      {hr.bpm ?? "—"}
                    </span>
                    <div className="pb-1">
                      <div className="text-xs text-dust font-medium -mb-0.5">bpm</div>
                      {zoneName && (
                        <div className="font-display font-semibold text-bone leading-tight">
                          Z{(hr.zone ?? 0) + 1} · {zoneName}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {hr.deviceName && (
                  <p className="text-[11px] text-dust mt-2">Device: {hr.deviceName}</p>
                )}
                {hr.status === "lost" && (
                  <p className="text-sm text-ember mt-2">
                    Lost the strap — moving back in range will auto-reconnect.
                  </p>
                )}
                {(hr.status === "idle" || hr.status === "lost") ? (
                  <button
                    onClick={hr.connect}
                    className="mt-4 w-full bg-gold text-ink font-display font-bold tracking-widest uppercase rounded-lg py-3 text-sm min-h-[48px]"
                  >
                    Connect strap
                  </button>
                ) : (
                  <button
                    onClick={hr.disconnect}
                    className="mt-4 w-full bg-ink border border-seam text-bone font-display font-bold tracking-widest uppercase rounded-lg py-3 text-sm min-h-[48px]"
                  >
                    {hr.status === "connecting" ? "Cancel" : "Disconnect"}
                  </button>
                )}
                <p className="text-[11px] text-dust mt-3 leading-snug">
                  Wet the Polar H10 strap and wear it before connecting. Watch the number track
                  your pulse for a few seconds.
                </p>
              </>
            )}
          </div>

          {/* Wake lock */}
          <div className="bg-coal rounded-2xl border border-seam p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-lg text-bone">Screen wake lock</h2>
              <StatusPill tone={wake.active ? "good" : "idle"} label={wake.active ? "Holding" : "Off"} />
            </div>
            {caps.wakeLock ? (
              <>
                <button
                  onClick={() => (wake.active ? wake.release() : wake.acquire())}
                  className={`mt-3 w-full font-display font-bold tracking-widest uppercase rounded-lg py-3 text-sm min-h-[48px] ${
                    wake.active ? "bg-ink border border-seam text-bone" : "bg-gold text-ink"
                  }`}
                >
                  {wake.active ? "Release" : "Keep screen awake"}
                </button>
                <p className="text-[11px] text-dust mt-3 leading-snug">
                  While holding, the screen shouldn&apos;t dim or sleep — the same lock Run Mode
                  uses so your stats stay visible.
                </p>
              </>
            ) : (
              <p className="text-sm text-dust mt-3 leading-snug">
                Not supported on this browser. The screen may sleep mid-run; it won&apos;t stop
                tracking, but you&apos;ll have to wake it to see your numbers.
              </p>
            )}
          </div>

          {/* Crash log — errors trapped by lib/errorTrap, for field debugging */}
          <ErrorLogCard />
        </div>
      </div>
    </div>
  );
}

// Recent trapped errors + the exact browser/webview build. When something
// fails on the phone mid-field ("this page couldn't load"), this card is how
// the actual exception gets read back after the fact.
function ErrorLogCard() {
  const [errors, setErrors] = useState<TrappedError[]>([]);
  const [ua, setUa] = useState("");
  const [native, setNative] = useState(false);
  useEffect(() => {
    setErrors(getTrappedErrors());
    setUa(navigator.userAgent);
    setNative(isNativeApp());
  }, []);

  return (
    <div className="bg-coal rounded-2xl border border-seam p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-lg text-bone">Crash log</h2>
        <StatusPill tone={errors.length ? "bad" : "good"} label={errors.length ? `${errors.length} caught` : "Clean"} />
      </div>

      {errors.length === 0 ? (
        <p className="text-sm text-dust mt-3">No errors recorded on this device.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {errors.map((e, i) => (
            <div key={i} className="bg-ink rounded-lg px-3 py-2">
              <div className="text-[10px] text-dust tabular-nums">
                {new Date(e.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </div>
              <div className="text-xs text-ember leading-snug break-words mt-0.5">{e.msg}</div>
              {e.stack && (
                <div className="text-[10px] text-dust leading-snug break-words mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap">
                  {e.stack}
                </div>
              )}
            </div>
          ))}
          <button
            onClick={() => {
              clearTrappedErrors();
              setErrors([]);
            }}
            className="w-full py-2 text-xs text-dust border border-seam rounded-lg"
          >
            Clear log
          </button>
        </div>
      )}

      <p className="text-[10px] text-dust mt-3 leading-snug break-words">
        {native ? "Native app" : "Browser"} · {ua}
      </p>
    </div>
  );
}

function CapRow({ ok, label, need }: { ok: boolean; label: string; need?: string }) {
  return (
    <div className="bg-ink rounded-lg px-3 py-2 flex items-center gap-3">
      <span className={`font-display font-bold ${ok ? "text-sage" : "text-ember"}`}>
        {ok ? "✓" : "✕"}
      </span>
      <span className="text-sm text-bone flex-1">{label}</span>
      {need && <span className="text-[11px] text-dust">{need}</span>}
    </div>
  );
}

function StatusPill({ tone, label }: { tone: "good" | "ok" | "bad" | "idle"; label: string }) {
  const cls =
    tone === "good" ? "bg-sage/15 text-sage border-sage/30" :
    tone === "ok" ? "bg-gold/15 text-gold border-gold/30" :
    tone === "bad" ? "bg-ember/15 text-ember border-ember/30" :
    "bg-ink text-dust border-seam";
  return (
    <span className={`text-[10px] font-display font-semibold uppercase tracking-widest px-2.5 py-1 rounded-full border ${cls}`}>
      {label}
    </span>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <div className="bg-ink rounded-lg px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-dust font-display font-semibold">
        {label}
      </div>
      <div className={`font-display font-semibold tabular-nums ${tone === "bad" ? "text-ember" : "text-bone"}`}>
        {value}
      </div>
    </div>
  );
}
