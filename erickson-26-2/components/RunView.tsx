"use client";

// Run Mode — fullscreen live tracker. Read at arm's length mid-run:
// huge numbers, low density, 48px+ touch targets.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FULL_DATE, PACES, PACE_BANDS, todayISO, Workout, WorkoutType
} from "@/lib/plan";
import { hrBand, hrGuide, HRBandKey, computeZones } from "@/lib/zones";
import { useGps, GpsResult } from "@/lib/useGps";
import { useHeartRate } from "@/lib/useHeartRate";
import { useWakeLock } from "@/lib/useWakeLock";
import { getProfile, saveRun } from "@/lib/storage";

const TYPE_PACE_KEY: Partial<Record<WorkoutType, HRBandKey>> = {
  easy: "easy", long: "long", tempo: "tempo", intervals: "intervals", race: "halfRace"
};

// Fallback RPE by workout type when no HR data exists for the run.
const TYPE_RPE_FALLBACK: Partial<Record<WorkoutType, number>> = {
  easy: 5, long: 5, tempo: 7, intervals: 9, race: 8
};
const ZONE_RPE = [3, 5, 6, 8, 9]; // dominant Z1–Z5 → RPE
const ZONE_BAR_COLORS = ["bg-dust", "bg-sage", "bg-gold", "bg-goldDim", "bg-ember"];

function fmtPace(sec: number | null): string {
  if (sec === null || !isFinite(sec) || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtClock(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

type StatusColor = "text-gold" | "text-ember" | "text-bone";

function paceColor(paceSec: number | null, band: { lo: number; hi: number } | null): StatusColor {
  if (paceSec === null || !band) return "text-bone";
  if (paceSec >= band.lo && paceSec <= band.hi) return "text-gold";
  if (paceSec < band.lo - 15 || paceSec > band.hi + 15) return "text-ember";
  return "text-bone";
}

function hrColor(bpm: number | null, band: { lo: number; hi: number } | null): StatusColor {
  if (bpm === null || !band) return "text-bone";
  if (bpm >= band.lo && bpm <= band.hi) return "text-gold";
  if (bpm < band.lo - 5 || bpm > band.hi + 5) return "text-ember";
  return "text-bone";
}

export default function RunView({
  workout,
  onClose
}: {
  workout: Workout;
  onClose: (saved: boolean) => void;
}) {
  const [phase, setPhase] = useState<"live" | "summary">("live");
  const [voiceOn, setVoiceOn] = useState(true);
  const voiceOnRef = useRef(true);
  voiceOnRef.current = voiceOn;

  const profile = getProfile();
  const isRace = workout.type === "race";
  const paceKey: HRBandKey | undefined =
    isRace && workout.date === FULL_DATE ? "marathon" : TYPE_PACE_KEY[workout.type];
  const judge = workout.type !== "intervals"; // HR lags, reps are short — coach by feel
  const paceBand = paceKey ? PACE_BANDS[paceKey] : null;
  const heartBand = paceKey ? hrBand(profile, paceKey) : null;
  const guide = paceKey ? hrGuide(profile)[paceKey] : null;
  const zones = computeZones(profile);

  const gps = useGps(phase === "live");
  const hr = useHeartRate();
  const wake = useWakeLock();

  // Result captured at the moment of STOP
  const [result, setResult] = useState<GpsResult | null>(null);
  const [finalHr, setFinalHr] = useState<{ avg: number | null; zoneSeconds: number[] }>({
    avg: null,
    zoneSeconds: [0, 0, 0, 0, 0]
  });
  const [rpe, setRpe] = useState(5);

  useEffect(() => {
    wake.acquire();
    return () => wake.release();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const speak = useCallback((text: string) => {
    if (!voiceOnRef.current) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    } catch {
      // speech is best-effort
    }
  }, []);

  // Half-mile voice cue
  const lastHalfRef = useRef(0);
  useEffect(() => {
    const half = Math.floor(gps.miles * 2);
    if (half > lastHalfRef.current && half > 0) {
      lastHalfRef.current = half;
      const parts = [`${(half / 2).toFixed(1)} miles.`];
      if (gps.currentPaceSec !== null) parts.push(`Current pace ${fmtPace(gps.currentPaceSec)}.`);
      if (hr.bpm !== null && hr.zone !== null)
        parts.push(`Heart rate ${hr.bpm}, zone ${hr.zone + 1}.`);
      speak(parts.join(" "));
    }
  }, [gps.miles, gps.currentPaceSec, hr.bpm, hr.zone, speak]);

  // Mile split cue
  const lastSplitCountRef = useRef(0);
  useEffect(() => {
    if (gps.splits.length > lastSplitCountRef.current) {
      lastSplitCountRef.current = gps.splits.length;
      const split = gps.splits[gps.splits.length - 1];
      speak(`Mile ${gps.splits.length} in ${fmtPace(split)}.`);
    }
  }, [gps.splits, speak]);

  // HR over-band cue: easy/long days only, after 30 continuous seconds
  // above the band; re-arms only once HR drops back inside.
  const overSinceRef = useRef<number | null>(null);
  const hrCueArmedRef = useRef(true);
  useEffect(() => {
    if (!heartBand || (workout.type !== "easy" && workout.type !== "long")) return;
    if (hr.bpm === null) return;
    if (hr.bpm > heartBand.hi) {
      if (overSinceRef.current === null) overSinceRef.current = Date.now();
      else if (Date.now() - overSinceRef.current >= 30_000 && hrCueArmedRef.current) {
        hrCueArmedRef.current = false;
        speak(`Heart rate ${hr.bpm} — ease off.`);
      }
    } else {
      overSinceRef.current = null;
      hrCueArmedRef.current = true;
    }
  }, [hr.bpm, heartBand, workout.type, speak]);

  // STOP long-press (1.5 s hold; release cancels)
  const [holdPct, setHoldPct] = useState(0);
  const holdTimerRef = useRef<number | null>(null);
  const holdStartRef = useRef(0);

  const doStop = useCallback(() => {
    const r = gps.finish();
    setResult(r);
    setFinalHr({ avg: hr.avgBpm, zoneSeconds: [...hr.zoneSeconds] });
    hr.disconnect();
    wake.release();
    // Default RPE: dominant HR zone if we have a minute of data, else by type
    const total = hr.zoneSeconds.reduce((a, b) => a + b, 0);
    if (total >= 60) {
      const dominant = hr.zoneSeconds.indexOf(Math.max(...hr.zoneSeconds));
      setRpe(ZONE_RPE[dominant]);
    } else {
      setRpe(TYPE_RPE_FALLBACK[workout.type] ?? 5);
    }
    setPhase("summary");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gps.finish, hr.avgBpm, hr.zoneSeconds, hr.disconnect, wake.release, workout.type]);

  const startHold = useCallback(() => {
    holdStartRef.current = Date.now();
    holdTimerRef.current = window.setInterval(() => {
      const pct = (Date.now() - holdStartRef.current) / 1500;
      if (pct >= 1) {
        window.clearInterval(holdTimerRef.current!);
        holdTimerRef.current = null;
        setHoldPct(0);
        doStop();
      } else {
        setHoldPct(pct);
      }
    }, 50);
  }, [doStop]);

  const cancelHold = useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHoldPct(0);
  }, []);

  function save() {
    if (!result) return;
    const totalZone = finalHr.zoneSeconds.reduce((a, b) => a + b, 0);
    const noteParts = [`Run Mode`, `${result.splits.length} split${result.splits.length === 1 ? "" : "s"}`];
    if (totalZone >= 60) {
      const dominant = finalHr.zoneSeconds.indexOf(Math.max(...finalHr.zoneSeconds));
      noteParts.push(`${Math.round((finalHr.zoneSeconds[dominant] / totalZone) * 100)}% Z${dominant + 1}`);
    }
    saveRun({
      date: todayISO(),
      miles: Math.round(result.miles * 100) / 100,
      minutes: Math.round((result.movingSec / 60) * 10) / 10,
      rpe,
      ...(finalHr.avg !== null ? { hr: finalHr.avg } : {}),
      notes: noteParts.join(" · "),
      route: result.route,
      splits: result.splits
    });
    onClose(true);
  }

  // ── Summary screen ──
  if (phase === "summary" && result) {
    const totalZone = finalHr.zoneSeconds.reduce((a, b) => a + b, 0);
    return (
      <div className="fixed inset-0 z-50 bg-ink overflow-y-auto">
        <div className="mx-auto max-w-md min-h-full flex flex-col px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="text-[11px] uppercase tracking-widest text-dust font-display font-semibold">
            Run complete
          </div>
          <div className="font-display font-bold text-6xl text-gold tabular-nums mt-2">
            {result.miles.toFixed(2)}
            <span className="text-2xl text-dust"> mi</span>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-5">
            {[
              { label: "Time", value: fmtClock(result.movingSec) },
              { label: "Avg pace", value: result.miles > 0.05 ? fmtPace(result.movingSec / result.miles) : "—" },
              { label: "Avg HR", value: finalHr.avg !== null ? `${finalHr.avg}` : "—" }
            ].map((c) => (
              <div key={c.label} className="bg-coal rounded-xl border border-seam px-3 py-3">
                <div className="text-[10px] uppercase tracking-widest text-dust font-display font-semibold">
                  {c.label}
                </div>
                <div className="font-display font-bold text-xl text-bone tabular-nums mt-0.5">
                  {c.value}
                </div>
              </div>
            ))}
          </div>

          {totalZone > 0 && (
            <div className="bg-coal rounded-xl border border-seam px-4 py-3 mt-3">
              <div className="text-[10px] uppercase tracking-widest text-dust font-display font-semibold mb-2">
                Time in zone
              </div>
              <div className="flex h-3 rounded-full overflow-hidden bg-ink">
                {finalHr.zoneSeconds.map((s, i) =>
                  s > 0 ? (
                    <div
                      key={i}
                      className={ZONE_BAR_COLORS[i]}
                      style={{ width: `${(s / totalZone) * 100}%` }}
                    />
                  ) : null
                )}
              </div>
              <div className="flex justify-between mt-1.5">
                {finalHr.zoneSeconds.map((s, i) => (
                  <span key={i} className="text-[10px] text-dust tabular-nums">
                    {zones[i].z} {totalZone > 0 ? Math.round((s / totalZone) * 100) : 0}%
                  </span>
                ))}
              </div>
            </div>
          )}

          {result.splits.length > 0 && (
            <div className="bg-coal rounded-xl border border-seam px-4 py-3 mt-3">
              <div className="text-[10px] uppercase tracking-widest text-dust font-display font-semibold mb-1.5">
                Splits
              </div>
              {result.splits.map((s, i) => (
                <div key={i} className="flex justify-between py-0.5">
                  <span className="text-sm text-dust">Mile {i + 1}</span>
                  <span className="font-display font-semibold text-bone tabular-nums">{fmtPace(s)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="bg-coal rounded-xl border border-seam px-4 py-3 mt-3">
            <div className="flex justify-between items-baseline">
              <span className="text-[10px] uppercase tracking-widest text-dust font-display font-semibold">
                Effort (RPE)
              </span>
              <span className="font-display font-bold text-gold text-lg">{rpe}</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={rpe}
              onChange={(e) => setRpe(parseInt(e.target.value))}
              className="w-full mt-1 accent-gold"
            />
          </div>

          <div className="mt-auto pt-5">
            <button
              onClick={save}
              className="w-full bg-gold text-ink font-display font-bold tracking-widest uppercase rounded-xl py-4 text-base min-h-[48px]"
            >
              Save run
            </button>
            <button
              onClick={() => onClose(false)}
              className="w-full text-dust text-sm py-3 mt-1 min-h-[48px]"
            >
              Discard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Live screen ──
  const showPairButton = hr.supported && (hr.status === "idle" || hr.status === "lost");
  return (
    <div className="fixed inset-0 z-50 bg-ink">
      <div className="mx-auto max-w-md h-full flex flex-col px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        {/* Header strip */}
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="font-display font-semibold text-bone leading-tight truncate">
              {workout.title}
              {workout.miles > 0 && <span className="text-dust"> · {workout.miles} mi</span>}
            </div>
            <div className="text-[11px] text-dust mt-0.5">
              {paceKey && (
                <>Target {isRace && workout.date === FULL_DATE ? PACES.marathon : PACES[paceKey]}</>
              )}
              {guide && <> · {guide.target}</>}
            </div>
          </div>
          <button
            onClick={() => setVoiceOn(!voiceOn)}
            aria-label={voiceOn ? "Mute voice cues" : "Unmute voice cues"}
            className={`shrink-0 ml-3 w-12 h-12 rounded-lg border text-lg leading-none ${
              voiceOn ? "bg-coal border-gold/40 text-gold" : "bg-coal border-seam text-dust"
            }`}
          >
            {voiceOn ? "🔊" : "🔇"}
          </button>
        </div>

        {/* Status line */}
        <div className="mt-2 min-h-[20px]">
          {gps.status === "acquiring" && (
            <span className="text-[11px] text-dust animate-pulse">Acquiring GPS…</span>
          )}
          {gps.status === "denied" && (
            <span className="text-[11px] text-ember">
              Location permission denied — enable it in site settings to track.
            </span>
          )}
          {gps.autoPaused && (
            <span className="text-[11px] font-display font-bold tracking-widest uppercase text-gold">
              Auto-paused
            </span>
          )}
          {hr.status === "lost" && (
            <span className="text-[11px] text-ember ml-2">HR lost — reconnecting…</span>
          )}
        </div>

        {/* Hero metrics */}
        <div className="flex-1 flex flex-col justify-center gap-6">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-dust font-display font-semibold">
              Distance
            </div>
            <div className="font-display font-bold text-8xl text-gold leading-none tabular-nums">
              {gps.miles.toFixed(2)}
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-widest text-dust font-display font-semibold">
              Current pace
            </div>
            <div
              className={`font-display font-bold text-6xl leading-none tabular-nums ${
                judge ? paceColor(gps.currentPaceSec, paceBand) : "text-bone"
              }`}
            >
              {fmtPace(gps.currentPaceSec)}
              {gps.currentPaceSec !== null && <span className="text-xl text-dust"> /mi</span>}
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-widest text-dust font-display font-semibold">
              Heart rate
            </div>
            {hr.bpm !== null ? (
              <div
                className={`font-display font-bold text-6xl leading-none tabular-nums ${
                  judge ? hrColor(hr.bpm, heartBand) : "text-bone"
                }`}
              >
                {hr.bpm}
                {hr.zone !== null && (
                  <span className="text-xl text-dust"> Z{hr.zone + 1}</span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <span className="font-display font-bold text-6xl leading-none text-dust">--</span>
                {showPairButton && (
                  <button
                    onClick={hr.connect}
                    className="bg-coal border border-seam rounded-lg px-4 text-bone font-display font-bold tracking-widest uppercase text-xs min-h-[48px]"
                  >
                    Pair HR strap
                  </button>
                )}
                {hr.status === "connecting" && (
                  <span className="text-xs text-dust animate-pulse">Pairing…</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Secondary row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Time", value: fmtClock(gps.movingSec) },
            { label: "Avg pace", value: fmtPace(gps.avgPaceSec) },
            {
              label: "Last split",
              value: gps.splits.length > 0 ? fmtPace(gps.splits[gps.splits.length - 1]) : "—"
            }
          ].map((c) => (
            <div key={c.label} className="bg-coal rounded-xl border border-seam px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-widest text-dust font-display font-semibold">
                {c.label}
              </div>
              <div className="font-display font-bold text-lg text-bone tabular-nums">{c.value}</div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex gap-3 mt-4">
          <button
            onClick={() => (gps.paused ? gps.resume() : gps.pause())}
            className={`flex-1 font-display font-bold tracking-widest uppercase rounded-xl py-4 text-sm min-h-[56px] border ${
              gps.paused
                ? "bg-gold text-ink border-gold"
                : "bg-coal text-bone border-seam"
            }`}
          >
            {gps.paused ? "Resume" : "Pause"}
          </button>
          <button
            onPointerDown={startHold}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
            onPointerCancel={cancelHold}
            className="relative flex-1 overflow-hidden bg-coal text-ember border border-ember/40 font-display font-bold tracking-widest uppercase rounded-xl py-4 text-sm min-h-[56px] select-none touch-none"
          >
            <span
              className="absolute inset-y-0 left-0 bg-ember/25 transition-none"
              style={{ width: `${holdPct * 100}%` }}
            />
            <span className="relative">{holdPct > 0 ? "Hold…" : "Stop"}</span>
          </button>
        </div>
        <p className="text-[10px] text-dust text-center mt-2">Hold STOP for 1.5 s to end the run</p>
      </div>
    </div>
  );
}
