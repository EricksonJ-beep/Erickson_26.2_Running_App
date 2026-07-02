"use client";

// ─────────────────────────────────────────────────────────────────────────
// QUICK TESTS — strap-paired checks you can run any time from the Progress
// tab, no run required:
//
//  1. RESTING HR — sit/lie still ~2.5 min; the app tracks the lowest stable
//     (15 s rolling-average) heart rate after a 30 s settle. That's your
//     resting HR — it saves to the profile and sharpens Karvonen zones.
//
//  2. RECOVERY (HRR) — the same Heart Rate Recovery test that auto-runs after
//     a run, launched standalone. Get your HR up first (20–30 s hard), press
//     start, then stand still while it measures the 1:00 / 2:00 drop. Result
//     is stored on its own (getRecoveryTests) and joins the HR-recovery trend.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { computeZones, methodLabel } from "@/lib/zones";
import { getProfile, saveProfile, saveRecoveryTest, RecoveryTest } from "@/lib/storage";
import { useHeartRate } from "@/lib/useHeartRate";
import { useWakeLock } from "@/lib/useWakeLock";
import { useCues } from "@/lib/useCues";
import RecoveryTestView from "./RecoveryTestView";

type TestId = "resting" | "recovery";
type Phase = "intro" | "running" | "result" | "recovery";

const RESTING_SEC = 150; // 2:30 capture
const SETTLE_SEC = 30; // ignore the first 30 s while HR settles
const REST_WINDOW = 15; // rolling-avg window the resting low is drawn from
const REST_MIN_COUNT = 5; // need this many samples in the window to count it

function mmss(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function QuickTestView({ onClose, onSaved }: { onClose: () => void; onSaved?: () => void }) {
  const [test, setTest] = useState<TestId | null>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  const hr = useHeartRate();
  const wake = useWakeLock();

  // Resting-test bookkeeping
  const [remaining, setRemaining] = useState(RESTING_SEC);
  const [restLow, setRestLow] = useState<number | null>(null);
  const [restResult, setRestResult] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const restLowRef = useRef<number | null>(null);
  const startTsRef = useRef(0);
  const settleCuedRef = useRef(false);

  // endHR handed to the standalone recovery test
  const [recoveryEndHR, setRecoveryEndHR] = useState<number | null>(null);

  // ── Audio cues — shared engine, quieter than Run Mode (indoor tests) ──
  const { ensureAudio, cue } = useCues(mutedRef, { alertGain: 0.28, infoGain: 0.16, speechRate: 1 });

  // ── Resting-HR ticker: track the lowest 15 s rolling average after settle ──
  const finishResting = useCallback(() => {
    const r = restLowRef.current;
    setRestResult(r);
    setPhase("result");
    cue(r != null ? `Resting heart rate ${r}.` : "No steady reading — check the strap.", "info");
  }, [cue]);

  useEffect(() => {
    if (phase !== "running") return;
    const id = window.setInterval(() => {
      const el = (Date.now() - startTsRef.current) / 1000;
      setRemaining(Math.max(0, RESTING_SEC - el));

      if (el >= SETTLE_SEC && !settleCuedRef.current) {
        settleCuedRef.current = true;
        cue("Now measuring. Stay still.", "info");
      }
      if (el >= SETTLE_SEC) {
        const s = hr.recentSample(REST_WINDOW); // stable callback; reads a live ref buffer
        if (s && s.count >= REST_MIN_COUNT) {
          if (restLowRef.current == null || s.avg < restLowRef.current) {
            restLowRef.current = s.avg;
            setRestLow(s.avg);
          }
        }
      }
      if (el >= RESTING_SEC) finishResting();
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, hr.recentSample, cue, finishResting]);

  const beginResting = useCallback(() => {
    ensureAudio();
    startTsRef.current = Date.now();
    settleCuedRef.current = false;
    restLowRef.current = null;
    setRestLow(null);
    setRestResult(null);
    setSaved(false);
    setRemaining(RESTING_SEC);
    wake.acquire();
    setPhase("running");
    cue("Resting test. Sit still, relax, and breathe slowly.", "info");
  }, [ensureAudio, wake, cue]);

  const beginRecovery = useCallback(() => {
    ensureAudio();
    const s = hr.recentSample(5);
    const endHR = s?.avg ?? hr.bpm;
    if (endHR == null) return;
    setRecoveryEndHR(endHR);
    wake.acquire();
    setPhase("recovery");
  }, [ensureAudio, hr, wake]);

  const saveResting = useCallback(() => {
    if (restResult == null) return;
    saveProfile({ ...getProfile(), restingHR: restResult });
    setSaved(true);
    onSaved?.();
  }, [restResult, onSaved]);

  const close = useCallback(() => {
    wake.release();
    hr.disconnect();
    onClose();
  }, [wake, hr, onClose]);

  const abort = useCallback(() => {
    wake.release();
    setPhase("intro");
  }, [wake]);

  const pickTest = (t: TestId) => { setTest(t); setPhase("intro"); };

  // ── Standalone recovery test (reuses the Run Mode component) ──
  if (phase === "recovery" && recoveryEndHR != null) {
    return (
      <RecoveryTestView
        endHR={recoveryEndHR}
        hr={hr}
        cue={cue}
        onDone={(t: RecoveryTest) => { saveRecoveryTest(t); onSaved?.(); close(); }}
        onSkip={close}
      />
    );
  }

  const previewProfile = restResult != null ? { ...getProfile(), restingHR: restResult } : null;

  return (
    <div className="fixed inset-0 z-50 bg-ink overflow-y-auto">
      <div className="mx-auto max-w-md min-h-full flex flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="bg-gold h-1.5 w-12 mb-2 rounded-sm" />
            <h1 className="font-display font-bold text-2xl tracking-wide text-bone leading-none">
              QUICK <span className="text-gold">TESTS</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {phase === "running" && (
              <button
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? "Unmute cues" : "Mute cues"}
                className="w-10 h-10 rounded-lg bg-coal border border-seam text-lg leading-none"
              >
                {muted ? "🔇" : "🔊"}
              </button>
            )}
            <button
              onClick={phase === "running" ? abort : close}
              aria-label="Close"
              className="w-10 h-10 rounded-lg bg-coal border border-seam text-bone text-lg leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Test picker ── */}
        {test === null && (
          <div className="space-y-4">
            <p className="text-[11px] text-dust leading-snug">
              Two quick strap tests, no run needed. Capture your resting heart rate, or run a
              standalone heart-rate recovery check.
            </p>
            <TestCard
              title="Resting HR"
              tag="~2.5 min · sit still"
              desc="Sit or lie still while the strap settles. Captures your lowest steady heart rate and saves it to your profile — which sharpens your zones."
              onPick={() => pickTest("resting")}
            />
            <TestCard
              title="Recovery (HRR)"
              tag="2 min · after effort"
              desc="Get your heart rate up first, then hold still while it drops. Measures the 1- and 2-minute recovery — the same test that runs after a run, on demand."
              onPick={() => pickTest("recovery")}
            />
          </div>
        )}

        {/* ── Intro / pairing for a chosen test ── */}
        {test !== null && phase === "intro" && (
          <div className="space-y-4">
            <button onClick={() => setTest(null)} className="text-[11px] text-gold font-display font-semibold uppercase tracking-widest">
              ← Both tests
            </button>

            {!hr.supported ? (
              <div className="bg-coal rounded-2xl border border-seam p-5">
                <p className="text-sm text-ember leading-snug">
                  These tests need the heart-rate strap, and Web Bluetooth isn&apos;t available here.
                  Use Chrome on Android with your Polar H10.
                </p>
              </div>
            ) : (
              <>
                <div className="bg-coal rounded-2xl border border-seam p-5">
                  <h2 className="font-display font-bold text-xl text-bone">
                    {test === "resting" ? "Resting HR test" : "Recovery (HRR) test"}
                  </h2>
                  <ol className="mt-3 space-y-2 text-sm text-bone list-decimal list-inside leading-snug">
                    {test === "resting" ? (
                      <>
                        <li>Sit or lie down somewhere quiet. Best when you&apos;re calm — not right after coffee or exercise.</li>
                        <li>Stay still and breathe slowly for the full 2½ minutes.</li>
                        <li>The app ignores the first 30 s, then tracks your lowest steady reading.</li>
                        <li>Save it — your Karvonen zones use resting HR.</li>
                      </>
                    ) : (
                      <>
                        <li>Get your heart rate up first — 20–30 s hard (stairs, a quick jog) right before you start.</li>
                        <li>Hit start at the top of the effort, then <span className="text-bone font-semibold">stand still</span>.</li>
                        <li>Hold still 2 min while it measures the 1:00 and 2:00 drop.</li>
                        <li>Bigger drop = faster recovery. The result joins your HR-recovery trend.</li>
                      </>
                    )}
                  </ol>
                </div>

                {/* HR connect / readout */}
                <div className="bg-coal rounded-2xl border border-seam p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display font-bold text-lg text-bone">Heart-rate strap</h3>
                    <StatusPill
                      tone={hr.status === "connected" ? "good" : hr.status === "lost" ? "bad" : hr.status === "connecting" ? "ok" : "idle"}
                      label={hr.status === "connected" ? "Connected" : hr.status === "connecting" ? "Connecting…" : hr.status === "lost" ? "Signal lost" : "Off"}
                    />
                  </div>
                  {hr.status === "connected" ? (
                    <div className="mt-3 flex items-end gap-3">
                      <span className="font-display font-bold text-6xl text-gold tabular-nums leading-none">{hr.bpm ?? "—"}</span>
                      <span className="text-sm text-dust pb-1">bpm{hr.deviceName ? ` · ${hr.deviceName}` : ""}</span>
                    </div>
                  ) : (
                    <button
                      onClick={hr.connect}
                      className="mt-3 w-full bg-ink border border-seam text-bone font-display font-bold tracking-widest uppercase rounded-lg py-3 text-sm min-h-[48px]"
                    >
                      {hr.status === "connecting" ? "Connecting…" : "Connect strap"}
                    </button>
                  )}
                </div>

                <button
                  onClick={test === "resting" ? beginResting : beginRecovery}
                  disabled={hr.status !== "connected"}
                  className={`w-full font-display font-bold uppercase tracking-widest rounded-xl py-4 text-base min-h-[56px] ${
                    hr.status === "connected" ? "bg-gold text-ink" : "bg-coal border border-seam text-dust"
                  }`}
                >
                  {hr.status !== "connected"
                    ? "Connect strap to start"
                    : test === "resting" ? "Start resting test" : "Start — HR is up"}
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Resting: running ── */}
        {test === "resting" && phase === "running" && (
          <div className="flex-1 flex flex-col">
            <div className="text-center mt-2">
              <div className="text-[10px] uppercase tracking-widest text-dust font-display font-semibold">Time left</div>
              <div className="font-display font-bold text-6xl text-bone tabular-nums leading-none mt-1">{mmss(remaining)}</div>
            </div>

            <div className={`mt-5 rounded-2xl border p-5 text-center ${remaining <= RESTING_SEC - SETTLE_SEC ? "bg-gold/15 border-gold/40" : "bg-coal border-seam"}`}>
              <div className={`font-display font-bold text-2xl tracking-wide ${remaining <= RESTING_SEC - SETTLE_SEC ? "text-gold" : "text-bone"}`}>
                {remaining <= RESTING_SEC - SETTLE_SEC ? "MEASURING" : "SETTLE IN"}
              </div>
              <div className="text-sm text-dust mt-1">
                {remaining <= RESTING_SEC - SETTLE_SEC
                  ? "Stay still and breathe slow — chasing your lowest steady reading."
                  : `Get comfortable and still (${mmss(remaining - (RESTING_SEC - SETTLE_SEC))} to measuring).`}
              </div>
            </div>

            <div className="mt-5 bg-coal rounded-2xl border border-seam p-5">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-dust font-display font-semibold">Heart rate</div>
                  <div className={`font-display font-bold text-7xl tabular-nums leading-none mt-1 ${hr.status === "lost" ? "text-ember" : "text-gold"}`}>
                    {hr.bpm ?? "—"}
                  </div>
                </div>
                <div className="text-right pb-1">
                  <div className="text-[10px] uppercase tracking-widest text-dust font-display font-semibold">Lowest</div>
                  <div className="font-display font-bold text-3xl text-bone tabular-nums">{restLow ?? "—"}</div>
                </div>
              </div>
              {hr.status === "lost" && <p className="text-[11px] text-ember mt-2">Strap signal lost — reconnecting…</p>}
            </div>

            <div className="flex-1" />
            <button
              onClick={finishResting}
              className="mt-5 w-full bg-ink border border-seam text-bone font-display font-bold uppercase tracking-widest rounded-xl py-4 text-sm min-h-[56px]"
            >
              Finish now
            </button>
          </div>
        )}

        {/* ── Resting: result ── */}
        {test === "resting" && phase === "result" && (
          <div className="space-y-4">
            <div className="bg-coal rounded-2xl border border-seam p-5 text-center">
              <div className="text-[10px] uppercase tracking-widest text-dust font-display font-semibold">Your resting HR</div>
              <div className="font-display font-bold text-7xl text-gold tabular-nums leading-none mt-2">{restResult ?? "—"}</div>
              <div className="text-sm text-dust mt-1">bpm</div>
              <p className="text-[11px] text-dust mt-3 leading-snug">
                Lowest 15-second average after the settle period. Lower over time is a good sign your
                aerobic fitness is climbing.
              </p>
            </div>

            {previewProfile && restResult != null && (
              <div className="bg-coal rounded-2xl border border-seam p-5">
                <h3 className="font-display font-bold text-lg text-bone">Zones from this result</h3>
                <p className="text-[11px] text-dust mt-0.5">{methodLabel(previewProfile)}</p>
                <div className="mt-3 space-y-1.5">
                  {computeZones(previewProfile).map((z) => (
                    <div key={z.z} className="bg-ink rounded-lg px-3 py-2 flex items-center gap-3">
                      <span className="font-display font-bold text-gold w-7">{z.z}</span>
                      <span className="font-display font-semibold text-bone tabular-nums w-20">{z.lo}–{z.hi}</span>
                      <span className="text-[11px] text-dust flex-1 leading-snug">{z.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {restResult != null ? (
              <button
                onClick={saveResting}
                disabled={saved}
                className={`w-full font-display font-bold uppercase tracking-widest rounded-xl py-4 text-base min-h-[56px] ${
                  saved ? "bg-sage/20 text-sage border border-sage/40" : "bg-gold text-ink"
                }`}
              >
                {saved ? "Saved ✓ — zones updated" : "Save as resting HR"}
              </button>
            ) : (
              <p className="text-sm text-ember text-center">No steady HR captured — check the strap and try again.</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setRestResult(null); setPhase("intro"); }}
                className="flex-1 bg-ink border border-seam text-bone font-display font-bold uppercase tracking-widest rounded-lg py-3 text-sm min-h-[48px]"
              >
                Redo test
              </button>
              <button
                onClick={close}
                className="flex-1 bg-ink border border-seam text-bone font-display font-bold uppercase tracking-widest rounded-lg py-3 text-sm min-h-[48px]"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TestCard({ title, tag, desc, onPick }: { title: string; tag: string; desc: string; onPick: () => void }) {
  return (
    <button
      onClick={onPick}
      className="w-full text-left bg-coal rounded-2xl border border-seam p-5 active:border-gold transition-colors"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-xl text-bone">{title}</h2>
        <span className="text-[10px] font-display font-semibold uppercase tracking-widest text-gold">{tag}</span>
      </div>
      <p className="text-[12px] text-dust mt-2 leading-snug">{desc}</p>
      <span className="inline-block mt-3 text-sm font-display font-bold uppercase tracking-widest text-gold">Start →</span>
    </button>
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
