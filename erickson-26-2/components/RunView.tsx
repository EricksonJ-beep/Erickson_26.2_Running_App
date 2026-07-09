"use client";

// Run Mode — fullscreen live tracker. Read at arm's length mid-run:
// huge numbers, low density, 48px+ touch targets.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PACES, PACE_BANDS, Workout, WorkoutType
} from "@/lib/plan";
import { hrBand, hrGuide, computeZones, bandKeyFor } from "@/lib/zones";
import { useGps, GpsResult } from "@/lib/useGps";
import { useHeartRate } from "@/lib/useHeartRate";
import { useWakeLock } from "@/lib/useWakeLock";
import { useCues } from "@/lib/useCues";
import {
  getProfile, addRun, clearLiveRun, saveLiveRun, LiveRunCheckpoint, RecoveryTest
} from "@/lib/storage";
import { hrr1BandInfo } from "@/lib/recovery";
import RouteMap, { elevationStats } from "./RouteMap";
import RecoveryTestView from "./RecoveryTestView";

// Fallback RPE by workout type when no HR data exists for the run.
const TYPE_RPE_FALLBACK: Partial<Record<WorkoutType, number>> = {
  easy: 5, long: 5, tempo: 7, intervals: 9, race: 8
};
const ZONE_RPE = [3, 5, 6, 8, 9]; // dominant Z1–Z5 → RPE
const ZONE_BAR_COLORS = ["bg-dust", "bg-sage", "bg-gold", "bg-goldDim", "bg-ember"];

// Pre-start countdown. GPS pre-warms during this window; tracking begins at GO.
const COUNTDOWN_SEC = 5;
// Press-and-hold duration to leave the lock-controls overlay.
const UNLOCK_HOLD_MS = 2000;
// No GPS fix for this long (while running) → spoken "signal lost" cue.
const GPS_STALE_MS = 12_000;
// Mid-run checkpoint cadence. Android can kill the backgrounded PWA at any
// moment; at 10 s the worst case is losing a few strides, not the run.
const CHECKPOINT_MS = 10_000;

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
  resume,
  onClose
}: {
  workout: Workout;
  resume?: LiveRunCheckpoint; // recover a crash-interrupted run: skip countdown, restore state
  onClose: (saved: boolean) => void;
}) {
  const [phase, setPhase] = useState<"countdown" | "live" | "recovery" | "summary">(
    resume ? "live" : "countdown"
  );
  const [count, setCount] = useState(COUNTDOWN_SEC); // 5→1, then 0 = GO
  const [locked, setLocked] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const voiceOnRef = useRef(true);
  voiceOnRef.current = voiceOn;
  const mutedRef = useRef(false); // useCues silences when true
  mutedRef.current = !voiceOn;

  const profile = getProfile();
  const paceKey = bandKeyFor(workout.type, workout.date); // undefined for a free run → no target
  const judge = workout.type !== "intervals"; // HR lags, reps are short — coach by feel
  const paceBand = paceKey ? PACE_BANDS[paceKey] : null;
  const heartBand = paceKey ? hrBand(profile, paceKey) : null;
  const guide = paceKey ? hrGuide(profile)[paceKey] : null;
  const zones = computeZones(profile);

  const gps = useGps(phase === "countdown" || phase === "live");
  const hr = useHeartRate();
  const wake = useWakeLock();

  // Result captured at the moment of STOP
  const [result, setResult] = useState<GpsResult | null>(null);
  const [finalHr, setFinalHr] = useState<{ avg: number | null; zoneSeconds: number[] }>({
    avg: null,
    zoneSeconds: [0, 0, 0, 0, 0]
  });
  const [rpe, setRpe] = useState(5);
  // HRR recovery test: end-of-run HR handed to the test, and its saved result.
  const [recoveryEndHR, setRecoveryEndHR] = useState<number | null>(null);
  const [recoveryResult, setRecoveryResult] = useState<RecoveryTest | null>(null);
  const [saveError, setSaveError] = useState(false); // localStorage write failed — don't lose the run

  useEffect(() => {
    wake.acquire();
    // Recovering an interrupted run: rebuild GPS + HR accumulators from the
    // checkpoint before any fix arrives. The strap needs a manual re-pair
    // (Web Bluetooth requires a gesture after a reload) — the live screen's
    // Pair button covers that.
    if (resume) {
      gps.restore(resume.gps, resume.savedAt);
      hr.restoreTotals(resume.hr);
    }
    return () => wake.release();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Crash-recovery checkpoint: persist the run in flight every CHECKPOINT_MS,
  // plus immediately on backgrounding (the moment Android is most likely to
  // kill us) and at GO. Cleared only on an explicit save or discard — so a
  // kill during the summary or HRR test still leaves the run recoverable.
  useEffect(() => {
    if (phase !== "live") return;
    const writeCheckpoint = () => {
      const g = gps.checkpoint();
      if (!g) return;
      saveLiveRun({ workout, savedAt: Date.now(), gps: g, hr: hr.totals() });
    };
    writeCheckpoint();
    const id = window.setInterval(writeCheckpoint, CHECKPOINT_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden") writeCheckpoint();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", writeCheckpoint);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", writeCheckpoint);
    };
  }, [phase, gps.checkpoint, hr.totals, workout]);

  // Loud cues (alert/info gain 0.9/0.55, speech at full volume) so they punch
  // through music outdoors — a browser PWA can't duck Spotify. Shared engine.
  const { ensureAudio, tone, cue } = useCues(mutedRef, {
    alertGain: 0.9,
    infoGain: 0.55,
    speechVolume: 1,
    speechRate: 0.98
  });

  // Countdown → GO. Ticks each second with a haptic buzz + tone; at zero we
  // commit the GPS baseline (gps.start) and drop into the live screen. GPS has
  // been warming the whole time, so "GO" means a fix is already locked.
  useEffect(() => {
    if (phase !== "countdown") return;
    ensureAudio(); // warm the audio graph off the Start-run gesture
    if (count > 0) {
      try {
        navigator.vibrate?.(60);
      } catch {
        // vibration unsupported — ignore
      }
      if (voiceOnRef.current) tone("info");
      const id = window.setTimeout(() => setCount((c) => c - 1), 1000);
      return () => window.clearTimeout(id);
    }
    // count === 0 → GO
    try {
      navigator.vibrate?.(180);
    } catch {
      // ignore
    }
    if (voiceOnRef.current) tone("alert");
    const id = window.setTimeout(() => {
      gps.start();
      setPhase("live");
    }, 650);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, count]);

  // Cadence: a pace + HR cue every half mile, every run length (Jon's getting
  // used to the app and likes the frequency). Cue points on a whole mile
  // announce that mile's split; the rest use trailing pace. Drift alerts
  // (HR / pace out of band) are separate and fire independently.
  const cueIntervalMi = 0.5;
  const lastCueStepRef = useRef(0);
  useEffect(() => {
    const step = Math.floor(gps.miles / cueIntervalMi + 1e-6);
    if (step <= lastCueStepRef.current || step === 0) return;
    lastCueStepRef.current = step;

    const milestone = step * cueIntervalMi;
    const mileIdx = Math.round(milestone);
    const wholeMile = Math.abs(milestone - mileIdx) < 1e-6;
    const split = wholeMile && gps.splits.length >= mileIdx ? gps.splits[mileIdx - 1] : null;
    const paceSec = split ?? gps.currentPaceSec;

    const parts: string[] = [];
    if (split != null) parts.push(`Mile ${mileIdx}, ${fmtPace(split)}.`);
    else
      parts.push(
        `${milestone.toFixed(1)} miles${paceSec != null ? `, ${fmtPace(paceSec)} pace` : ""}.`
      );

    // Coach to the workout's goal pace — except intervals, whose band is the
    // rep pace and would misjudge the jog recoveries.
    if (workout.type !== "intervals" && paceBand && paceSec != null) {
      if (paceSec >= paceBand.lo && paceSec <= paceBand.hi) {
        parts.push("On pace.");
      } else {
        const fast = paceSec < paceBand.lo;
        const raw = fast ? paceBand.lo - paceSec : paceSec - paceBand.hi;
        if (raw >= 4) {
          const d = Math.max(5, Math.round(raw / 5) * 5);
          parts.push(fast ? `${d} seconds fast, ease back.` : `${d} seconds slow.`);
        } else {
          parts.push("On pace.");
        }
      }
    }
    if (hr.bpm != null && hr.zone != null) parts.push(`Heart rate ${hr.bpm}, zone ${hr.zone + 1}.`);

    cue(parts.join(" "), "info");
  }, [gps.miles, gps.splits, gps.currentPaceSec, hr.bpm, hr.zone, paceBand, cueIntervalMi, workout.type, cue]);

  // HR drift alert — both directions, every run type, using the workout's
  // target HR band. Fires after 25 s continuously out of zone and re-arms
  // only once HR returns. Held off during the first 3 min of moving (warmup).
  const hrOutSinceRef = useRef<number | null>(null);
  const hrAlertArmedRef = useRef(true);
  const hrLastDirRef = useRef<"high" | "low" | null>(null);
  useEffect(() => {
    if (!heartBand || hr.bpm === null) return;
    if (gps.movingSec < 180) {
      hrOutSinceRef.current = null;
      hrAlertArmedRef.current = true;
      return;
    }
    const dir: "high" | "low" | null =
      hr.bpm > heartBand.hi ? "high" : hr.bpm < heartBand.lo ? "low" : null;

    if (dir === null) {
      hrOutSinceRef.current = null;
      hrAlertArmedRef.current = true; // back in zone → re-arm
      hrLastDirRef.current = null;
      return;
    }
    if (hrLastDirRef.current !== dir) {
      hrLastDirRef.current = dir;
      hrOutSinceRef.current = Date.now();
      return;
    }
    if (hrOutSinceRef.current === null) hrOutSinceRef.current = Date.now();
    else if (Date.now() - hrOutSinceRef.current >= 25_000 && hrAlertArmedRef.current) {
      hrAlertArmedRef.current = false;
      cue(
        dir === "high"
          ? `Heart rate ${hr.bpm}, above zone. Ease off.`
          : `Heart rate ${hr.bpm}, below zone. Pick it up.`,
        "alert"
      );
    }
  }, [hr.bpm, heartBand, gps.movingSec, cue]);

  // Spoken alert when the strap drops mid-run, and when it comes back. Only on
  // real transitions during the live run — skips the initial pairing.
  const prevHrStatusRef = useRef(hr.status);
  useEffect(() => {
    if (phase !== "live") {
      prevHrStatusRef.current = hr.status;
      return;
    }
    const prev = prevHrStatusRef.current;
    prevHrStatusRef.current = hr.status;
    if (prev !== "lost" && hr.status === "lost") {
      cue("Heart rate signal lost.", "alert");
    } else if (prev === "lost" && hr.status === "connected") {
      cue("Heart rate reconnected.", "info");
    }
  }, [hr.status, phase, cue]);

  // Spoken alert on a GPS dropout (no fix for GPS_STALE_MS) and its recovery.
  // gps.movingSec ticks every second, so staleness is caught even when no new
  // fix is arriving. Paused running is exempt (standing still, signal aside).
  const gpsLostRef = useRef(false);
  useEffect(() => {
    if (phase !== "live" || gps.paused) return;
    const last = gps.lastFixAt;
    if (last == null) return;
    const stale = Date.now() - last > GPS_STALE_MS;
    if (stale && !gpsLostRef.current) {
      gpsLostRef.current = true;
      cue("GPS signal lost.", "alert");
    } else if (!stale && gpsLostRef.current) {
      gpsLostRef.current = false;
      cue("GPS signal back.", "info");
    }
  }, [gps.lastFixAt, gps.movingSec, gps.paused, phase, cue]);

  // STOP long-press (1.5 s hold; release cancels)
  const [holdPct, setHoldPct] = useState(0);
  const holdTimerRef = useRef<number | null>(null);
  const holdStartRef = useRef(0);

  const doStop = useCallback(() => {
    const r = gps.finish();
    setResult(r);
    setFinalHr({ avg: hr.avgBpm, zoneSeconds: [...hr.zoneSeconds] });
    // Default RPE: dominant HR zone if we have a minute of data, else by type
    const total = hr.zoneSeconds.reduce((a, b) => a + b, 0);
    if (total >= 60) {
      const dominant = hr.zoneSeconds.indexOf(Math.max(...hr.zoneSeconds));
      setRpe(ZONE_RPE[dominant]);
    } else {
      setRpe(TYPE_RPE_FALLBACK[workout.type] ?? 5);
    }
    // HRR test gate: only if the strap is streaming a fresh reading at STOP.
    // If so, keep HR + wake lock alive and run the 2-min recovery test first;
    // otherwise skip straight to the summary and tear the strap down.
    const endSample = hr.recentSample(5);
    if (endSample) {
      setRecoveryEndHR(endSample.avg);
      setPhase("recovery");
    } else {
      hr.disconnect();
      wake.release();
      setPhase("summary");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gps.finish, hr.avgBpm, hr.zoneSeconds, hr.recentSample, hr.disconnect, wake.release, workout.type]);

  const startHold = useCallback(() => {
    if (holdTimerRef.current !== null) return; // guard: a second pointerdown would leak an interval
    holdStartRef.current = Date.now();
    holdTimerRef.current = window.setInterval(() => {
      const pct = (Date.now() - holdStartRef.current) / 1500;
      if (pct >= 1) {
        if (holdTimerRef.current !== null) {
          window.clearInterval(holdTimerRef.current);
          holdTimerRef.current = null;
        }
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

  // Unlock the lock-controls overlay — deliberate 2 s press-and-hold so a
  // pocket touch can't dismiss it.
  const [unlockPct, setUnlockPct] = useState(0);
  const unlockTimerRef = useRef<number | null>(null);
  const unlockStartRef = useRef(0);

  const startUnlock = useCallback(() => {
    if (unlockTimerRef.current !== null) return; // guard: double pointerdown would leak an interval
    unlockStartRef.current = Date.now();
    unlockTimerRef.current = window.setInterval(() => {
      const pct = (Date.now() - unlockStartRef.current) / UNLOCK_HOLD_MS;
      if (pct >= 1) {
        if (unlockTimerRef.current !== null) {
          window.clearInterval(unlockTimerRef.current);
          unlockTimerRef.current = null;
        }
        setUnlockPct(0);
        setLocked(false);
        try {
          navigator.vibrate?.(60);
        } catch {
          // ignore
        }
      } else {
        setUnlockPct(pct);
      }
    }, 50);
  }, []);

  const cancelUnlock = useCallback(() => {
    if (unlockTimerRef.current !== null) {
      window.clearInterval(unlockTimerRef.current);
      unlockTimerRef.current = null;
    }
    setUnlockPct(0);
  }, []);

  // Safety net for the hold timers: clear any in-flight interval when the lock
  // overlay toggles (the button that owns the hold unmounts), when the app is
  // backgrounded (a missed pointerup would otherwise leak a self-firing
  // interval — the old "couldn't re-lock" glitch), and on unmount.
  useEffect(() => {
    const reset = () => {
      if (holdTimerRef.current !== null) {
        window.clearInterval(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      if (unlockTimerRef.current !== null) {
        window.clearInterval(unlockTimerRef.current);
        unlockTimerRef.current = null;
      }
      setHoldPct(0);
      setUnlockPct(0);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") reset();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      reset();
    };
  }, [locked]);

  function save() {
    if (!result) return;
    const totalZone = finalHr.zoneSeconds.reduce((a, b) => a + b, 0);
    const noteParts = [
      workout.type === "free" ? `Free run` : `Run Mode`,
      `${result.splits.length} split${result.splits.length === 1 ? "" : "s"}`
    ];
    if (totalZone >= 60) {
      const dominant = finalHr.zoneSeconds.indexOf(Math.max(...finalHr.zoneSeconds));
      noteParts.push(`${Math.round((finalHr.zoneSeconds[dominant] / totalZone) * 100)}% Z${dominant + 1}`);
    }
    // Key the run to the workout's date, not "now" — a run that starts before
    // midnight and saves after belongs to the day it was launched for.
    const stored = addRun({
      date: workout.date,
      miles: Math.round(result.miles * 100) / 100,
      minutes: Math.round((result.movingSec / 60) * 10) / 10,
      rpe,
      ...(finalHr.avg !== null ? { hr: finalHr.avg } : {}),
      notes: noteParts.join(" · "),
      type: workout.type,
      route: result.route,
      splits: result.splits,
      // Full per-zone seconds (not just the "% Z2" note) so Progress can build
      // the weekly 80/20 intensity meter from real strap data.
      ...(totalZone > 0 ? { zoneSeconds: finalHr.zoneSeconds.map((s) => Math.round(s)) } : {}),
      ...(recoveryResult ? { recoveryTest: recoveryResult } : {})
    });
    // If the write failed (storage full / private mode), keep the summary up so
    // the run isn't lost — never report success or close on a failed save.
    if (!stored) {
      setSaveError(true);
      return;
    }
    clearLiveRun(); // the run is safely in the log — drop the crash checkpoint
    onClose(true);
  }

  // ── HRR recovery test ── fires right after STOP when the strap was streaming.
  // HR + wake lock stay live through it; onDone/onSkip tear them down and move on.
  if (phase === "recovery" && recoveryEndHR != null) {
    return (
      <RecoveryTestView
        endHR={recoveryEndHR}
        hr={hr}
        runType={workout.type}
        cue={cue}
        onDone={(test) => {
          setRecoveryResult(test);
          hr.disconnect();
          wake.release();
          setPhase("summary");
        }}
        onSkip={() => {
          hr.disconnect();
          wake.release();
          setPhase("summary");
        }}
      />
    );
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

          {recoveryResult && recoveryResult.hrr1 != null && (
            <div className="bg-coal rounded-xl border border-seam px-4 py-3 mt-3">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-widest text-dust font-display font-semibold">
                  HR recovery · 1 min
                </div>
                <span
                  className={`text-[10px] uppercase tracking-widest font-display font-bold ${
                    recoveryResult.hrr1Label ? hrr1BandInfo(recoveryResult.hrr1Label).text : "text-bone"
                  }`}
                >
                  {recoveryResult.hrr1Label ? hrr1BandInfo(recoveryResult.hrr1Label).name : ""}
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span
                  className={`font-display font-bold text-3xl tabular-nums ${
                    recoveryResult.hrr1Label ? hrr1BandInfo(recoveryResult.hrr1Label).text : "text-bone"
                  }`}
                >
                  −{Math.max(0, recoveryResult.hrr1)} bpm
                </span>
                {recoveryResult.hrr2 != null && (
                  <span className="text-xs text-dust">· −{Math.max(0, recoveryResult.hrr2)} at 2 min</span>
                )}
              </div>
            </div>
          )}

          {result.route.length > 1 && (
            <div className="bg-coal rounded-xl border border-seam p-3 mt-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] uppercase tracking-widest text-dust font-display font-semibold">
                  Route
                </div>
                <div className="flex items-center gap-3 text-[10px] text-dust">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sage" /> Start</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-ember" /> Finish</span>
                </div>
              </div>
              <RouteMap route={result.route} className="rounded-lg" height={200} />
              {(() => {
                const elev = elevationStats(result.route);
                if (!elev) return null;
                return (
                  <div className="text-[11px] text-dust tabular-nums mt-2">
                    Elevation <span className="text-bone/80">↑ {elev.gainFt} ft</span>
                    {" · "}
                    <span className="text-bone/80">↓ {elev.lossFt} ft</span>
                  </div>
                );
              })()}
            </div>
          )}

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
              aria-label="Effort, RPE 1 to 10"
              className="w-full mt-1 accent-gold"
            />
          </div>

          <div className="mt-auto pt-5">
            {saveError && (
              <p className="text-xs text-ember mb-2 leading-snug">
                Couldn’t save — this phone’s storage may be full. Free up space and tap Save
                again. Don’t leave this screen: the run isn’t stored yet.
              </p>
            )}
            <button
              onClick={save}
              className="w-full bg-gold text-ink font-display font-bold tracking-widest uppercase rounded-xl py-4 text-base min-h-[48px]"
            >
              {saveError ? "Retry save" : "Save run"}
            </button>
            <button
              onClick={() => {
                if (window.confirm("Discard this run? GPS route, splits, and HR won’t be saved.")) {
                  clearLiveRun();
                  onClose(false);
                }
              }}
              className="w-full text-dust text-sm py-3 mt-1 min-h-[48px]"
            >
              Discard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Countdown screen ──
  if (phase === "countdown") {
    const gpsReady = gps.status === "tracking";
    return (
      <div className="fixed inset-0 z-50 bg-ink flex flex-col">
        <div className="mx-auto max-w-md w-full flex-1 flex flex-col items-center justify-center px-5 text-center">
          <div className="font-display font-semibold text-bone truncate max-w-full">
            {workout.title}
          </div>
          <div
            className={`font-display font-black leading-none tabular-nums mt-6 ${
              count > 0 ? "text-gold text-[9rem]" : "text-sage text-[7rem]"
            }`}
          >
            {count > 0 ? count : "GO"}
          </div>
          <div className="mt-8 text-[11px] uppercase tracking-widest font-display font-semibold">
            {gps.status === "denied" ? (
              <span className="text-ember">
                Location denied — enable it in site settings.
              </span>
            ) : gpsReady ? (
              <span className="text-sage">● GPS locked{gps.lastAccuracy != null ? ` · ±${Math.round(gps.lastAccuracy)} m` : ""}</span>
            ) : (
              <span className="text-dust animate-pulse">Acquiring GPS…</span>
            )}
          </div>
        </div>
        <div className="mx-auto max-w-md w-full px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <button
            onClick={() => onClose(false)}
            className="w-full text-dust text-sm py-3 min-h-[48px]"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Lock-controls overlay ──
  // Live stats only; every control is gone so a pocket touch can't pause,
  // stop, or hit anything underneath. Hold 2 s to unlock.
  if (phase === "live" && locked) {
    return (
      <div className="fixed inset-0 z-[60] bg-ink flex flex-col">
        <div className="mx-auto max-w-md w-full flex-1 flex flex-col justify-center gap-7 px-6 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="text-center text-[11px] uppercase tracking-widest text-dust font-display font-semibold">
            🔒 Locked
          </div>
          <div className="text-center">
            <div className="text-[11px] uppercase tracking-widest text-dust font-display font-semibold">
              Distance
            </div>
            <div className="font-display font-bold text-8xl text-gold leading-none tabular-nums">
              {gps.miles.toFixed(2)}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: "Pace", value: fmtPace(gps.currentPaceSec) },
              { label: "Time", value: fmtClock(gps.movingSec) },
              { label: "HR", value: hr.bpm !== null ? `${hr.bpm}` : "--" }
            ].map((c) => (
              <div key={c.label}>
                <div className="text-[10px] uppercase tracking-widest text-dust font-display font-semibold">
                  {c.label}
                </div>
                <div className="font-display font-bold text-3xl text-bone tabular-nums mt-0.5">
                  {c.value}
                </div>
              </div>
            ))}
          </div>
          {gps.autoPaused && (
            <div className="text-center text-[11px] font-display font-bold tracking-widest uppercase text-gold">
              Auto-paused
            </div>
          )}
        </div>
        <div className="mx-auto max-w-md w-full px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <button
            onPointerDown={startUnlock}
            onPointerUp={cancelUnlock}
            onPointerLeave={cancelUnlock}
            onPointerCancel={cancelUnlock}
            className="relative w-full overflow-hidden bg-coal text-bone border border-seam font-display font-bold tracking-widest uppercase rounded-xl py-5 text-sm min-h-[56px] select-none touch-none"
          >
            <span
              className="absolute inset-y-0 left-0 bg-gold/25 transition-none"
              style={{ width: `${unlockPct * 100}%` }}
            />
            <span className="relative">{unlockPct > 0 ? "Hold…" : "Hold to unlock"}</span>
          </button>
        </div>
      </div>
    );
  }

  // ── Live screen ──
  return (
    <div className="fixed inset-0 z-50 bg-ink">
      <div className="relative mx-auto max-w-md h-full flex flex-col px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        {/* Header strip */}
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="font-display font-semibold text-bone leading-tight truncate">
              {workout.title}
              {workout.miles > 0 && <span className="text-dust"> · {workout.miles} mi</span>}
            </div>
            <div className="text-[11px] text-dust mt-0.5">
              {paceKey ? (
                <>
                  Target {PACES[paceKey]}
                  {guide && <> · {guide.target}</>}
                </>
              ) : (
                <>No target · run by feel</>
              )}
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

        {/* Lock — floating on the right edge, mid-height: big and thumb-
            reachable one-handed mid-run, instead of buried in the top corner. */}
        <button
          onClick={() => setLocked(true)}
          aria-label="Lock controls"
          className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-16 h-16 rounded-full bg-coal/95 border border-seam text-bone text-2xl leading-none flex flex-col items-center justify-center shadow-lg shadow-black/40 active:scale-95 active:border-gold/60"
        >
          🔒
          <span className="text-[8px] font-display font-bold uppercase tracking-widest text-dust mt-0.5">
            Lock
          </span>
        </button>

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
          {gps.status === "tracking" && gps.lastAccuracy != null && (
            <span
              className={`text-[11px] ml-2 ${gps.lastAccuracy <= 12 ? "text-dust" : "text-ember"}`}
            >
              GPS ±{Math.round(gps.lastAccuracy)} m
            </span>
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
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-widest text-dust font-display font-semibold">
                Heart rate
              </div>
              {/* Force a fresh pairing any time — even while connected, in case
                  readings look wrong and Jon wants to re-test the strap. */}
              {hr.supported && hr.bpm !== null && (
                <button
                  onClick={hr.connect}
                  aria-label="Re-pair HR strap"
                  className="text-[10px] font-display font-semibold uppercase tracking-widest text-dust border border-seam rounded-md px-2 py-1 min-h-[32px]"
                >
                  ⟳ Re-pair
                </button>
              )}
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
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-display font-bold text-6xl leading-none text-dust">--</span>
                {hr.supported && hr.status === "connecting" && (
                  <span className="text-xs text-dust animate-pulse">Pairing…</span>
                )}
                {hr.supported && hr.status === "lost" && (
                  <>
                    <button
                      onClick={hr.reconnect}
                      className="bg-gold text-ink rounded-lg px-4 font-display font-bold tracking-widest uppercase text-xs min-h-[48px]"
                    >
                      Reconnect
                    </button>
                    <button
                      onClick={hr.connect}
                      className="bg-coal border border-seam rounded-lg px-4 text-bone font-display font-bold tracking-widest uppercase text-xs min-h-[48px]"
                    >
                      Re-pair
                    </button>
                  </>
                )}
                {hr.supported && hr.status === "idle" && (
                  <button
                    onClick={hr.connect}
                    className="bg-coal border border-seam rounded-lg px-4 text-bone font-display font-bold tracking-widest uppercase text-xs min-h-[48px]"
                  >
                    Pair HR strap
                  </button>
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
