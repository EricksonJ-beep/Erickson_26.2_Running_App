"use client";

// Heart Rate Recovery (HRR) test — auto-launched from Run Mode the instant a run
// is stopped, but only when the strap was streaming (RunView gates on a fresh
// end-of-run reading). Stand/sit still for 2 minutes; the app captures how far
// HR has dropped at 1:00 (HRR1, scored) and 2:00 (HRR2, raw). Bigger drop =
// faster autonomic recovery = fitter/less-taxed. See lib/recovery.ts for bands.

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkoutType } from "@/lib/plan";
import type { RecoveryTest } from "@/lib/storage";
import type { useHeartRate } from "@/lib/useHeartRate";
import { classifyHRR1, hrr1BandInfo, HRR1_LOW_FLAG } from "@/lib/recovery";

const TEST_SEC = 120;
const CHECKPOINT1_SEC = 60;
const CHECKPOINT2_SEC = 120;
const CAPTURE_WINDOW_SEC = 5; // rolling-avg window for each checkpoint reading
const NOISE_SPREAD = 12; // bpm spread within the window → flag low-confidence
const GRACE_MS = 15_000; // strap dropped → freeze this long before ending early

function fmtMMSS(totalSec: number): string {
  const s = Math.max(0, Math.ceil(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function RecoveryTestView({
  endHR,
  hr,
  runType,
  cue,
  onDone,
  onSkip
}: {
  endHR: number;
  hr: ReturnType<typeof useHeartRate>;
  runType: WorkoutType;
  cue: (text: string, variant?: "info" | "alert") => void;
  onDone: (test: RecoveryTest) => void; // record saved with the run
  onSkip: () => void; // discarded — no record
}) {
  const [phase, setPhase] = useState<"recovering" | "results">("recovering");
  const [remaining, setRemaining] = useState(TEST_SEC);
  const [hrr1, setHrr1] = useState<number | null>(null);
  const [hrr2, setHrr2] = useState<number | null>(null);
  const [lowConf, setLowConf] = useState(false);
  const [incomplete, setIncomplete] = useState(false);
  const [result, setResult] = useState<RecoveryTest | null>(null);

  // Refs mirror the captured values so finish() can build the final record
  // synchronously (state updates are async and would lag a checkpoint).
  const hrr1Ref = useRef<number | null>(null);
  const hrr2Ref = useRef<number | null>(null);
  const lowConfRef = useRef(false);
  const incompleteRef = useRef(false);
  const hrr1DoneRef = useRef(false);
  const hrr2DoneRef = useRef(false);
  const finishedRef = useRef(false);

  // Timestamp-based clock with a pause offset, so backgrounding can't skew it
  // and a strap dropout freezes the countdown (checkpoints stay at true 1:00/2:00).
  const startRef = useRef(Date.now());
  const pausedMsRef = useRef(0);
  const pauseStartRef = useRef<number | null>(null);
  const graceRef = useRef<number | null>(null);

  const elapsedSec = useCallback(() => {
    const pausedNow = pauseStartRef.current ? Date.now() - pauseStartRef.current : 0;
    return (Date.now() - startRef.current - pausedMsRef.current - pausedNow) / 1000;
  }, []);

  const clearGrace = useCallback(() => {
    if (graceRef.current != null) {
      window.clearTimeout(graceRef.current);
      graceRef.current = null;
    }
  }, []);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    clearGrace();
    const drop1 = hrr1Ref.current;
    setResult({
      endHR,
      hrr1: drop1,
      hrr2: hrr2Ref.current,
      hrr1Label: drop1 != null ? classifyHRR1(drop1) : null,
      incomplete: incompleteRef.current || drop1 == null || hrr2Ref.current == null,
      lowConfidence: lowConfRef.current,
      completedAt: new Date().toISOString(),
      ...(runType ? { runType } : {})
    });
    setPhase("results");
  }, [endHR, runType, clearGrace]);

  // Capture a smoothed HR at a checkpoint; null if the strap has no fresh data.
  const capture = useCallback((): { drop: number; low: boolean } | null => {
    const s = hr.recentSample(CAPTURE_WINDOW_SEC);
    if (!s) return null;
    return { drop: endHR - s.avg, low: s.spread > NOISE_SPREAD || s.count < 2 };
  }, [hr, endHR]);

  // Announce the test once on mount.
  useEffect(() => {
    cue("Recovery test. Stand still.", "info");
    return () => clearGrace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Main tick — drives the countdown and fires the two checkpoint captures.
  useEffect(() => {
    if (phase !== "recovering") return;
    const id = window.setInterval(() => {
      const el = elapsedSec();
      setRemaining(Math.max(0, TEST_SEC - el));

      if (!hrr1DoneRef.current && el >= CHECKPOINT1_SEC) {
        hrr1DoneRef.current = true;
        const c = capture();
        if (c) {
          hrr1Ref.current = c.drop;
          setHrr1(c.drop);
          if (c.low) {
            lowConfRef.current = true;
            setLowConf(true);
          }
          cue(`One minute. Heart rate down ${Math.max(0, c.drop)}.`, "info");
        } else {
          incompleteRef.current = true;
          setIncomplete(true);
        }
      }

      if (!hrr2DoneRef.current && el >= CHECKPOINT2_SEC) {
        hrr2DoneRef.current = true;
        const c = capture();
        if (c) {
          hrr2Ref.current = c.drop;
          setHrr2(c.drop);
          if (c.low) {
            lowConfRef.current = true;
            setLowConf(true);
          }
        } else {
          incompleteRef.current = true;
          setIncomplete(true);
        }
        cue("Recovery test complete.", "info");
        finish();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [phase, elapsedSec, capture, cue, finish]);

  // Strap dropped mid-test → freeze the clock and give a grace window to
  // reconnect. If it comes back, resume where we left off; if not, end early and
  // save whatever checkpoints were captured (marked incomplete).
  useEffect(() => {
    if (phase !== "recovering") return;
    if (hr.status === "lost") {
      if (pauseStartRef.current == null) pauseStartRef.current = Date.now();
      if (graceRef.current == null) {
        graceRef.current = window.setTimeout(() => {
          incompleteRef.current = true;
          setIncomplete(true);
          finish();
        }, GRACE_MS);
      }
    } else if (hr.status === "connected") {
      if (pauseStartRef.current != null) {
        pausedMsRef.current += Date.now() - pauseStartRef.current;
        pauseStartRef.current = null;
      }
      clearGrace();
    }
  }, [hr.status, phase, finish, clearGrace]);

  const lost = hr.status === "lost";

  // ── Results screen ──
  if (phase === "results" && result) {
    const noData = result.hrr1 == null && result.hrr2 == null;
    const band = result.hrr1Label ? hrr1BandInfo(result.hrr1Label) : null;
    const lowRecovery = result.hrr1 != null && result.hrr1 < HRR1_LOW_FLAG;
    return (
      <div className="fixed inset-0 z-[70] bg-ink overflow-y-auto">
        <div className="mx-auto max-w-md min-h-full flex flex-col px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="text-[11px] uppercase tracking-widest text-dust font-display font-semibold">
            Heart rate recovery
          </div>

          {noData ? (
            <div className="mt-6 bg-coal rounded-xl border border-seam px-4 py-5 text-center">
              <div className="font-display font-bold text-2xl text-bone">Test incomplete</div>
              <p className="text-sm text-dust mt-2 leading-relaxed">
                The strap didn&apos;t stream a clean reading during the recovery window, so there&apos;s
                nothing to score. Nothing was saved.
              </p>
            </div>
          ) : (
            <>
              {/* HRR1 — the scored number */}
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-widest text-dust font-display font-semibold">
                  1-min drop (HRR1)
                </div>
                <div className="flex items-baseline gap-3">
                  <div className={`font-display font-black text-7xl tabular-nums ${band?.text ?? "text-bone"}`}>
                    {result.hrr1 != null ? Math.max(0, result.hrr1) : "—"}
                    <span className="text-2xl text-dust"> bpm</span>
                  </div>
                </div>
                {band && (
                  <div className={`font-display font-bold uppercase tracking-widest text-lg mt-1 ${band.text}`}>
                    {band.name}
                  </div>
                )}
              </div>

              {/* Supporting figures */}
              <div className="grid grid-cols-3 gap-3 mt-5">
                {[
                  { label: "End HR", value: `${result.endHR}` },
                  {
                    label: "2-min drop",
                    value: result.hrr2 != null ? `${Math.max(0, result.hrr2)}` : "—"
                  },
                  {
                    label: "HR at 2:00",
                    value: result.hrr2 != null ? `${result.endHR - result.hrr2}` : "—"
                  }
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

              {/* Flags */}
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="text-[10px] uppercase tracking-widest font-display font-semibold text-dust bg-coal border border-seam rounded-md px-2 py-1">
                  {runType} run
                </span>
                {result.incomplete && (
                  <span className="text-[10px] uppercase tracking-widest font-display font-semibold text-ember bg-ember/15 border border-ember/40 rounded-md px-2 py-1">
                    Incomplete
                  </span>
                )}
                {result.lowConfidence && (
                  <span className="text-[10px] uppercase tracking-widest font-display font-semibold text-goldDim bg-goldDim/15 border border-goldDim/40 rounded-md px-2 py-1">
                    Noisy reading
                  </span>
                )}
              </div>

              {lowRecovery && (
                <div className="bg-ember/15 border border-ember/40 rounded-xl px-4 py-3 mt-3">
                  <p className="text-xs text-bone/90 leading-relaxed">
                    A sub-12 one-minute drop can mean your body is still carrying fatigue — consider
                    leaning into more easy / recovery days. (General guidance, not medical advice.)
                  </p>
                </div>
              )}
            </>
          )}

          <div className="mt-auto pt-6">
            <button
              onClick={() => (noData ? onSkip() : onDone(result))}
              className="w-full bg-gold text-ink font-display font-bold tracking-widest uppercase rounded-xl py-4 text-base min-h-[48px]"
            >
              {noData ? "Continue" : "Save & continue"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Recovery countdown screen ──
  const pct = Math.min(1, (TEST_SEC - remaining) / TEST_SEC);
  return (
    <div className="fixed inset-0 z-[70] bg-ink flex flex-col">
      <div className="mx-auto max-w-md w-full flex-1 flex flex-col px-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <div className="text-[11px] uppercase tracking-widest text-dust font-display font-semibold text-center">
          Heart rate recovery · stand still
        </div>

        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="font-display font-black text-[7rem] leading-none tabular-nums text-gold">
            {fmtMMSS(remaining)}
          </div>

          {/* Progress + checkpoint ticks at 1:00 and 2:00 */}
          <div className="relative w-full mt-6 h-2 rounded-full bg-coal overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-gold" style={{ width: `${pct * 100}%` }} />
            <div className="absolute inset-y-0 left-1/2 w-px bg-ink/70" />
          </div>
          <div className="flex justify-between w-full text-[10px] text-dust mt-1.5 font-display font-semibold uppercase tracking-widest">
            <span className={hrr1 != null ? "text-sage" : ""}>
              1:00 {hrr1 != null ? `· −${Math.max(0, hrr1)}` : ""}
            </span>
            <span>2:00</span>
          </div>

          {/* Live HR + end reference */}
          <div className="grid grid-cols-2 gap-3 w-full mt-8">
            <div className="bg-coal rounded-xl border border-seam px-3 py-3 text-center">
              <div className="text-[10px] uppercase tracking-widest text-dust font-display font-semibold">
                Live HR
              </div>
              <div className={`font-display font-bold text-4xl tabular-nums mt-0.5 ${lost ? "text-ember" : "text-bone"}`}>
                {hr.bpm != null ? hr.bpm : "--"}
              </div>
            </div>
            <div className="bg-coal rounded-xl border border-seam px-3 py-3 text-center">
              <div className="text-[10px] uppercase tracking-widest text-dust font-display font-semibold">
                End HR
              </div>
              <div className="font-display font-bold text-4xl text-gold tabular-nums mt-0.5">{endHR}</div>
            </div>
          </div>

          {/* Strap-lost banner: frozen + reconnect grace */}
          {lost && (
            <div className="w-full mt-4 bg-ember/15 border border-ember/40 rounded-xl px-4 py-3">
              <div className="text-[11px] uppercase tracking-widest text-ember font-display font-bold">
                HR lost — timer frozen
              </div>
              <p className="text-xs text-bone/90 mt-1 leading-relaxed">
                Reconnect within {GRACE_MS / 1000}s to continue, or the test ends and saves what it has.
              </p>
              <button
                onClick={hr.reconnect}
                className="mt-2 w-full bg-gold text-ink font-display font-bold tracking-widest uppercase rounded-lg py-2.5 text-xs min-h-[44px]"
              >
                Reconnect
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-md w-full px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <button
          onClick={onSkip}
          className="w-full text-dust text-sm py-3 min-h-[48px] border border-seam rounded-xl bg-coal font-display font-semibold uppercase tracking-widest"
        >
          Skip test
        </button>
      </div>
    </div>
  );
}
