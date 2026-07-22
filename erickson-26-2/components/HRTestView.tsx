"use client";

// ─────────────────────────────────────────────────────────────────────────
// FITNESS TESTS — guided, strap-paired field tests that measure the two
// numbers the zone engine wants, instead of estimating them:
//
//  1. MAX HR  — graded build-to-failure run. Warm up, then ~8 min building
//     hard → very hard → an all-out finishing sprint (uphill if possible).
//     The highest bpm the strap ever reports is your true max — the field
//     substitute for a lab ramp test, and far better than the Tanaka age
//     estimate (208 − 0.7·age) the app falls back to.
//
//  2. LTHR (lactate threshold) — Joe Friel's 30-minute time-trial protocol
//     (Total Heart Rate Training): run a solo, all-out, *steady* 30-min TT;
//     your AVERAGE HR over the final 20 minutes is your LTHR. We capture that
//     20-min window automatically (time-weighted, gap-tolerant) so there's no
//     lap button to fumble. LTHR yields the most accurate zones the engine
//     has (Friel %LTHR).
//
// Both write straight to the profile (maxHR / lthr) and every target window
// in the app — Today, Plan, Run Mode — recomputes on save.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { computeZones, methodLabel } from "@/lib/zones";
import { getProfile, saveProfile } from "@/lib/storage";
import { useHeartRate } from "@/lib/useHeartRate";
import { useWakeLock } from "@/lib/useWakeLock";
import { useCues } from "@/lib/useCues";

type TestId = "maxhr" | "lthr";
type Phase = "intro" | "running" | "result";

const MAX_SAMPLE_GAP_S = 5; // don't credit the LTHR window across signal gaps

// ── Max HR protocol: graded build, all-out finish. (sec, label, spoken cue) ──
interface Stage {
  until: number; // ends at this elapsed second
  label: string;
  sub: string;
  say: string;
  tone: "info" | "alert";
}
const MAXHR_STAGES: Stage[] = [
  { until: 180, label: "BUILD",     sub: "Comfortably hard — settle in.",        say: "Build to a strong, controlled effort.",            tone: "info" },
  { until: 300, label: "HARD",      sub: "Hard. Breathing heavy.",               say: "Pick it up. Hard now, threshold effort.",          tone: "info" },
  { until: 420, label: "VERY HARD", sub: "As hard as you can hold.",             say: "Faster. As hard as you can hold.",                 tone: "alert" },
  { until: 480, label: "ALL OUT",   sub: "Sprint to the end — uphill if you can!", say: "All out now! Sprint, uphill if you can. Empty the tank.", tone: "alert" }
];
const MAXHR_DURATION = MAXHR_STAGES[MAXHR_STAGES.length - 1].until;

// ── LTHR protocol: 30-min solo TT, measure the final 20 min. ──
const LTHR_DURATION = 1800; // 30:00
const LTHR_WINDOW_START = 600; // measurement begins at 10:00
interface CueMark { at: number; say: string; tone: "info" | "alert"; }
const LTHR_CUES: CueMark[] = [
  { at: LTHR_WINDOW_START, say: "Ten minutes in. The measurement starts now — lock into your hardest steady effort.", tone: "alert" },
  { at: 1200, say: "Twenty minutes. Ten to go — hold it.", tone: "info" },
  { at: 1500, say: "Five minutes left. Don't fade.", tone: "info" },
  { at: 1740, say: "One minute. Everything you've got.", tone: "alert" }
];

function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function HRTestView({
  onClose,
  onSaved,
  initialTest
}: {
  onClose: () => void;
  onSaved?: () => void;
  initialTest?: TestId; // deep-link straight into a test (e.g. the Today card → max HR)
}) {
  const [test, setTest] = useState<TestId | null>(initialTest ?? null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<number | null>(null);
  const [savedTo, setSavedTo] = useState<TestId | null>(null);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  const hr = useHeartRate();
  const wake = useWakeLock();

  // Live HR readout state mirrors (so the result phase keeps the final numbers).
  const [peak, setPeak] = useState<number | null>(null);
  const [winAvg, setWinAvg] = useState<number | null>(null);

  // ── Test bookkeeping ──
  const startTsRef = useRef(0);
  const firedRef = useRef<Set<number>>(new Set());
  const stageIdxRef = useRef(-1);
  const peakRef = useRef<number | null>(null);
  const winSumRef = useRef(0);   // Σ bpm·dt over the LTHR measurement window
  const winSecRef = useRef(0);
  const lastSampleTsRef = useRef(0);

  // ── Audio cues — shared engine, quieter than Run Mode (indoor/track tests) ──
  const { ensureAudio, cue } = useCues(mutedRef, { alertGain: 0.28, infoGain: 0.16, speechRate: 1 });

  // ── Sample HR while running: track peak + accumulate the LTHR window ──
  useEffect(() => {
    if (phase !== "running" || hr.bpm == null) return;
    const bpm = hr.bpm;
    if (peakRef.current == null || bpm > peakRef.current) {
      peakRef.current = bpm;
      setPeak(bpm);
    }
    const now = Date.now();
    const sinceStart = (now - startTsRef.current) / 1000;
    if (test === "lthr" && sinceStart >= LTHR_WINDOW_START) {
      const dt = lastSampleTsRef.current
        ? Math.min((now - lastSampleTsRef.current) / 1000, MAX_SAMPLE_GAP_S)
        : 1;
      winSumRef.current += bpm * dt;
      winSecRef.current += dt;
      setWinAvg(Math.round(winSumRef.current / winSecRef.current));
    }
    lastSampleTsRef.current = now;
  }, [hr.bpm, phase, test]);

  const finish = useCallback(() => {
    const r = test === "maxhr"
      ? peakRef.current
      : (winSecRef.current > 0 ? Math.round(winSumRef.current / winSecRef.current) : null);
    setResult(r);
    setPhase("result");
    cue(test === "maxhr" ? "Stop. Test complete." : "Stop. Test complete. Great work.", "alert");
  }, [test, cue]);

  // ── 1 s ticker: drive the clock, fire stage/cue transitions, auto-finish ──
  useEffect(() => {
    if (phase !== "running") return;
    const id = window.setInterval(() => {
      const e = (Date.now() - startTsRef.current) / 1000;
      setElapsed(e);

      if (test === "maxhr") {
        const idx = MAXHR_STAGES.findIndex((s) => e < s.until);
        const cur = idx === -1 ? MAXHR_STAGES.length - 1 : idx;
        if (cur > stageIdxRef.current) {
          stageIdxRef.current = cur;
          cue(MAXHR_STAGES[cur].say, MAXHR_STAGES[cur].tone);
        }
        if (e >= MAXHR_DURATION) finish();
      } else {
        for (const c of LTHR_CUES) {
          if (e >= c.at && !firedRef.current.has(c.at)) {
            firedRef.current.add(c.at);
            cue(c.say, c.tone);
          }
        }
        if (e >= LTHR_DURATION) finish();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, test, cue, finish]);

  const begin = useCallback(() => {
    ensureAudio(); // unlock audio off this tap
    startTsRef.current = Date.now();
    lastSampleTsRef.current = 0;
    firedRef.current = new Set();
    stageIdxRef.current = -1;
    peakRef.current = hr.bpm ?? null;
    setPeak(hr.bpm ?? null);
    winSumRef.current = 0;
    winSecRef.current = 0;
    setWinAvg(null);
    setElapsed(0);
    setResult(null);
    wake.acquire();
    setPhase("running");
    cue(
      test === "maxhr"
        ? "Test started. Build to a strong effort."
        : "Test started. Run the hardest pace you can hold for thirty minutes. Steady and strong.",
      "info"
    );
  }, [test, hr.bpm, wake, ensureAudio, cue]);

  const abort = useCallback(() => {
    wake.release();
    setPhase("intro");
    setElapsed(0);
  }, [wake]);

  const close = useCallback(() => {
    wake.release();
    hr.disconnect();
    onClose();
  }, [wake, hr, onClose]);

  const saveResult = useCallback(() => {
    if (result == null || !test) return;
    const next = { ...getProfile(), [test === "maxhr" ? "maxHR" : "lthr"]: result };
    saveProfile(next);
    setSavedTo(test);
    onSaved?.();
  }, [result, test, onSaved]);

  // Preview the zones a saved result would produce.
  const previewProfile = result != null && test
    ? { ...getProfile(), [test === "maxhr" ? "maxHR" : "lthr"]: result }
    : null;

  const curStage = test === "maxhr"
    ? MAXHR_STAGES[stageIdxRef.current >= 0 ? stageIdxRef.current : 0]
    : null;
  const inWindow = test === "lthr" && elapsed >= LTHR_WINDOW_START;
  const duration = test === "maxhr" ? MAXHR_DURATION : LTHR_DURATION;
  const remaining = Math.max(0, duration - elapsed);

  return (
    <div className="fixed inset-0 z-50 bg-ink overflow-y-auto">
      <div className="mx-auto max-w-md min-h-full flex flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="bg-gold h-1.5 w-12 mb-2 rounded-sm" />
            <h1 className="font-display font-bold text-2xl tracking-wide text-bone leading-none">
              FITNESS <span className="text-gold">TESTS</span>
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
              Strap-paired field tests that measure your real numbers instead of estimating them.
              Pick a test, follow the cues, save the result — every zone in the app updates instantly.
            </p>
            <ReadinessNote />
            <TestCard
              title="Max heart rate"
              tag="~8 min · all-out finish"
              desc="Graded build-to-failure run. Warm up first, then build hard → very hard → an all-out sprint (uphill if you can). The peak bpm is your true max."
              onPick={() => { setTest("maxhr"); setPhase("intro"); }}
            />
            <TestCard
              title="Lactate threshold (LTHR)"
              tag="30 min · steady TT"
              desc="Joe Friel's 30-minute solo time trial. Hold the hardest pace you can sustain; your average HR over the final 20 minutes is your LTHR — the most accurate basis for zones."
              onPick={() => { setTest("lthr"); setPhase("intro"); }}
            />
          </div>
        )}

        {/* ── Intro / pre-test for a chosen test ── */}
        {test !== null && phase === "intro" && (
          <div className="space-y-4">
            <button onClick={() => setTest(null)} className="text-[11px] text-gold font-display font-semibold uppercase tracking-widest">
              ← All tests
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
                    {test === "maxhr" ? "Max HR test" : "Threshold (LTHR) test"}
                  </h2>
                  <ol className="mt-3 space-y-2 text-sm text-bone list-decimal list-inside leading-snug">
                    {test === "maxhr" ? (
                      <>
                        <li><span className="text-dust">Warm up 10–15 min easy</span> before starting — this test is the hard part only.</li>
                        <li>Find a stretch you can run hard, ideally with a hill for the finish.</li>
                        <li>Follow the voice cues: build for 3 min, hard to 5, very hard to 7, then an all-out sprint to 8:00.</li>
                        <li>Don&apos;t stop early — the peak comes in the last 60 seconds.</li>
                      </>
                    ) : (
                      <>
                        <li><span className="text-dust">Warm up 10–15 min easy</span> before starting.</li>
                        <li>Run <span className="text-bone font-semibold">solo</span> on flat ground or a treadmill — no drafting, no pacing off others.</li>
                        <li>Hold the hardest pace you can sustain for the full 30 min — even, not a sprint.</li>
                        <li>The app measures minutes 10–30 automatically. Just keep the effort steady.</li>
                      </>
                    )}
                  </ol>
                  <p className="text-[11px] text-dust mt-3 leading-snug">
                    {test === "maxhr"
                      ? "A true all-out effort. Stop immediately if you feel chest pain, dizziness, or faintness."
                      : "A genuine 30-minute race effort. Stop if you feel chest pain, dizziness, or faintness."}
                  </p>
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
                  onClick={begin}
                  disabled={hr.status !== "connected"}
                  className={`w-full font-display font-bold uppercase tracking-widest rounded-xl py-4 text-base min-h-[56px] ${
                    hr.status === "connected" ? "bg-gold text-ink" : "bg-coal border border-seam text-dust"
                  }`}
                >
                  {hr.status === "connected" ? "Start test" : "Connect strap to start"}
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Running ── */}
        {phase === "running" && (
          <div className="flex-1 flex flex-col">
            {/* Clock */}
            <div className="text-center mt-2">
              <div className="text-[10px] uppercase tracking-widest text-dust font-display font-semibold">
                {test === "maxhr" ? "Elapsed" : "Time left"}
              </div>
              <div className="font-display font-bold text-6xl text-bone tabular-nums leading-none mt-1">
                {mmss(test === "maxhr" ? elapsed : remaining)}
              </div>
            </div>

            {/* Stage / window banner */}
            <div className={`mt-5 rounded-2xl border p-5 text-center ${
              test === "maxhr"
                ? (curStage?.tone === "alert" ? "bg-ember/15 border-ember/40" : "bg-coal border-seam")
                : (inWindow ? "bg-gold/15 border-gold/40" : "bg-coal border-seam")
            }`}>
              {test === "maxhr" ? (
                <>
                  <div className={`font-display font-bold text-3xl tracking-wide ${curStage?.tone === "alert" ? "text-ember" : "text-gold"}`}>
                    {curStage?.label}
                  </div>
                  <div className="text-sm text-dust mt-1">{curStage?.sub}</div>
                </>
              ) : (
                <>
                  <div className={`font-display font-bold text-2xl tracking-wide ${inWindow ? "text-gold" : "text-bone"}`}>
                    {inWindow ? "MEASURING" : "SETTLE IN"}
                  </div>
                  <div className="text-sm text-dust mt-1">
                    {inWindow ? "Hold steady — this is the 20-min window that counts." : `Measurement begins at 10:00 (${mmss(Math.max(0, LTHR_WINDOW_START - elapsed))} to go).`}
                  </div>
                </>
              )}
            </div>

            {/* Live HR */}
            <div className="mt-5 bg-coal rounded-2xl border border-seam p-5">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-dust font-display font-semibold">Heart rate</div>
                  <div className="font-display font-bold text-7xl text-gold tabular-nums leading-none mt-1">
                    {hr.bpm ?? "—"}
                  </div>
                </div>
                <div className="text-right pb-1">
                  {test === "maxhr" ? (
                    <>
                      <div className="text-[10px] uppercase tracking-widest text-dust font-display font-semibold">Peak</div>
                      <div className="font-display font-bold text-3xl text-bone tabular-nums">{peak ?? "—"}</div>
                    </>
                  ) : (
                    <>
                      <div className="text-[10px] uppercase tracking-widest text-dust font-display font-semibold">Window avg</div>
                      <div className="font-display font-bold text-3xl text-bone tabular-nums">{inWindow ? (winAvg ?? "—") : "—"}</div>
                    </>
                  )}
                </div>
              </div>
              {hr.status === "lost" && <p className="text-[11px] text-ember mt-2">Strap signal lost — reconnecting…</p>}
            </div>

            <div className="flex-1" />
            <button
              onClick={finish}
              className="mt-5 w-full bg-ink border border-seam text-bone font-display font-bold uppercase tracking-widest rounded-xl py-4 text-sm min-h-[56px]"
            >
              {test === "lthr" ? "End early & use what I've got" : "Stop test"}
            </button>
          </div>
        )}

        {/* ── Result ── */}
        {phase === "result" && (
          <div className="space-y-4">
            <div className="bg-coal rounded-2xl border border-seam p-5 text-center">
              <div className="text-[10px] uppercase tracking-widest text-dust font-display font-semibold">
                {test === "maxhr" ? "Your max heart rate" : "Your LTHR"}
              </div>
              <div className="font-display font-bold text-7xl text-gold tabular-nums leading-none mt-2">
                {result ?? "—"}
              </div>
              <div className="text-sm text-dust mt-1">bpm</div>
              {test === "lthr" && (
                <p className="text-[11px] text-dust mt-3 leading-snug">
                  Time-weighted average over the final 20 minutes ({winSecRef.current > 0 ? `${Math.round(winSecRef.current / 60)} min of data` : "no data"}).
                </p>
              )}
              {test === "maxhr" && (
                <p className="text-[11px] text-dust mt-3 leading-snug">
                  Highest reading during the test. If you didn&apos;t truly empty the tank in the last sprint, re-run it for a higher number.
                </p>
              )}
            </div>

            {/* Zone preview */}
            {previewProfile && result != null && (
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

            {result != null ? (
              <button
                onClick={saveResult}
                disabled={savedTo === test}
                className={`w-full font-display font-bold uppercase tracking-widest rounded-xl py-4 text-base min-h-[56px] ${
                  savedTo === test ? "bg-sage/20 text-sage border border-sage/40" : "bg-gold text-ink"
                }`}
              >
                {savedTo === test ? "Saved ✓ — zones updated" : `Save as ${test === "maxhr" ? "Max HR" : "LTHR"}`}
              </button>
            ) : (
              <p className="text-sm text-ember text-center">No HR data captured — check the strap and try again.</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setResult(null); setPhase("intro"); }}
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

function ReadinessNote() {
  return (
    <div className="bg-ember/10 border border-ember/30 rounded-2xl p-4">
      <p className="text-[12px] text-bone leading-snug">
        <span className="font-display font-bold text-ember">Before you go all out:</span> these are
        maximal efforts. Only do them when healthy, well-rested, and cleared for hard exercise. Stop
        at any sign of chest pain, dizziness, or faintness.
      </p>
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
