"use client";

import { useEffect, useState } from "react";
import {
  HALF_DATE, FULL_DATE, PACES, PACE_NOTES,
  daysUntil, findWeek, freeRunWorkout, nextWorkout, todayISO, workoutOn, Workout
} from "@/lib/plan";
import { hrGuide, bandKeyFor } from "@/lib/zones";
import { TYPE_EFFORT } from "@/lib/guide";
import RunView from "@/components/RunView";
import { quoteForDate } from "@/lib/quotes";
import {
  addCalis, CALIS_GOAL, clearLiveRun, getCalis, getDone, getLiveRun, getProfile, getRuns,
  runsOn, paceOf, toggleDone, LiveRunCheckpoint
} from "@/lib/storage";
import { checkForUpdate, dismissUpdate, UpdateInfo } from "@/lib/appUpdate";

export default function TodayView({ onGoLog }: { onGoLog: () => void }) {
  const [today, setToday] = useState("");
  const [runWorkout, setRunWorkout] = useState<Workout | null>(null); // the workout Run Mode is tracking (planned or free)
  // Crash recovery: a leftover mid-run checkpoint means a run was interrupted
  // (page killed) and never saved. Offer to recover it before anything else.
  const [pendingRecovery, setPendingRecovery] = useState<LiveRunCheckpoint | null>(null);
  const [resumeCp, setResumeCp] = useState<LiveRunCheckpoint | null>(null);
  const [, force] = useState(0);
  // Native app only: a newer APK is on GitHub (rare — native-layer changes only)
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  useEffect(() => {
    setToday(todayISO());
    setPendingRecovery(getLiveRun());
    checkForUpdate().then(setUpdate);
  }, []);
  if (!today) return null;

  // Launching a fresh run overwrites the checkpoint slot at GO — make sure an
  // unrecovered run is a conscious sacrifice, never a silent one.
  const launchRun = (w: Workout) => {
    if (pendingRecovery) {
      const mi = (pendingRecovery.gps.meters / 1609.344).toFixed(2);
      if (!window.confirm(
        `An interrupted run (${mi} mi) hasn't been recovered — starting a new run discards it for good. Continue?`
      )) return;
      clearLiveRun();
      setPendingRecovery(null);
    }
    setResumeCp(null);
    setRunWorkout(w);
  };

  const week = findWeek(today);
  const workout = workoutOn(today);
  const upNext = nextWorkout(today);
  const done = getDone();
  // Any run on the date counts (a day can now hold multiple, incl. a free run);
  // show the first for stats, and mark the day logged if any run OR a manual done.
  const todaysRuns = workout ? runsOn(workout.date) : [];
  const loggedRun = todaysRuns[0] ?? null;
  const logged = workout && (todaysRuns.length > 0 || done[workout.date]);

  const toHalf = daysUntil(HALF_DATE, today);
  const toFull = daysUntil(FULL_DATE, today);

  const isRest = !workout;
  const guide = hrGuide(getProfile());
  const paceKey = workout ? bandKeyFor(workout.type, workout.date) : undefined;
  const isRace = workout?.type === "race";

  return (
    <div className="space-y-4">
      {/* Run Mode — fullscreen takeover, covers the tab bar. Tracks either the
          day's planned workout or an ad-hoc free run. */}
      {runWorkout && (
        <RunView
          workout={runWorkout}
          resume={resumeCp ?? undefined}
          onClose={() => {
            setRunWorkout(null);
            setResumeCp(null);
            setPendingRecovery(getLiveRun()); // still set if the run wasn't saved/discarded
            force((n) => n + 1);
          }}
        />
      )}

      {/* Interrupted-run recovery — a checkpoint survived a page kill */}
      {pendingRecovery && (
        <div className="bg-coal rounded-xl border border-ember/40 px-4 py-3.5">
          <div className="text-[11px] uppercase tracking-widest text-ember font-display font-bold">
            Interrupted run found
          </div>
          <p className="text-xs text-bone/90 mt-1 leading-snug">
            {(pendingRecovery.gps.meters / 1609.344).toFixed(2)} mi ·{" "}
            {pendingRecovery.workout.title} · started {fmtClockTime(pendingRecovery.gps.startMs)} —
            the app was closed mid-run before it could be saved. Recover it to keep running, or
            stop right away and save what was tracked.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => {
                setResumeCp(pendingRecovery);
                setRunWorkout(pendingRecovery.workout);
                setPendingRecovery(null);
              }}
              className="flex-1 bg-gold text-ink font-display font-bold tracking-widest uppercase rounded-lg py-3 text-sm min-h-[48px]"
            >
              Recover run
            </button>
            <button
              onClick={() => {
                if (window.confirm("Discard the interrupted run? Its GPS trace and splits are lost for good.")) {
                  clearLiveRun();
                  setPendingRecovery(null);
                }
              }}
              className="px-4 bg-ink border border-seam text-dust font-display font-bold tracking-widest uppercase rounded-lg py-3 text-sm min-h-[48px]"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* App update — a newer APK was released (native-layer changes only) */}
      {update && (
        <div className="bg-coal rounded-xl border border-gold/40 px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-widest text-gold font-display font-bold">
              App update available
            </div>
            <p className="text-xs text-dust mt-0.5 leading-snug">
              A newer build ({update.tag.replace("android-", "")}) is ready to install.
            </p>
          </div>
          <a
            href={update.url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 bg-gold text-ink font-display font-bold tracking-widest uppercase rounded-lg px-3 py-2.5 text-xs min-h-[44px] flex items-center"
          >
            Get it
          </a>
          <button
            onClick={() => {
              dismissUpdate(update.tag);
              setUpdate(null);
            }}
            aria-label="Dismiss update notice"
            className="shrink-0 w-9 h-9 rounded-lg border border-seam text-dust text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* Daily fire — quote of the day, shown in full */}
      <DailyFire dateISO={today} />

      {/* Race day banner */}
      {isRace && (
        <div className="bg-gold rounded-xl px-5 py-4">
          <div className="font-display font-bold text-2xl text-ink tracking-widest uppercase leading-none">
            Race Day
          </div>
          <div className="text-ink/80 text-sm font-semibold mt-1">
            You've put in the work. Go get it, Jon.
          </div>
        </div>
      )}

      {/* Countdown strip */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Chippewa Falls 13.1", days: toHalf },
          { label: "Ashland 26.2", days: toFull }
        ].map((r) => (
          <div key={r.label} className="bg-coal rounded-xl px-4 py-3 border border-seam">
            <div className="font-display font-bold text-3xl text-gold leading-none">
              {r.days > 0 ? r.days : r.days === 0 ? "TODAY" : "✓"}
            </div>
            <div className="text-[11px] text-dust mt-1 font-medium">
              {r.days > 0 ? `days · ${r.label}` : r.label}
            </div>
          </div>
        ))}
      </div>

      {/* Today's bib */}
      <div className="bg-coal rounded-2xl border border-seam overflow-hidden">
        <div className="bg-gold h-2" />
        <div className="p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-display font-semibold tracking-[0.2em] uppercase text-dust">
                {week ? `Week ${week.num} · ${week.phase}` : "Off plan"}
              </div>
              {week?.focus && (
                <p className="text-[11px] text-dust italic mt-0.5 leading-snug">{week.focus}</p>
              )}
            </div>
            <div className="text-xs text-dust shrink-0">{fmt(today)}</div>
          </div>

          {isRest ? (
            <div className="mt-4">
              <div className="font-display font-bold text-5xl text-bone leading-none">REST</div>
              <p className="text-sm text-dust mt-3 leading-relaxed">
                Adaptation happens on the days off — muscle repairs, mitochondria multiply.
                Resting is training.
              </p>
            </div>
          ) : (
            <div className="mt-4">
              <div className="flex items-end gap-3">
                {workout.miles > 0 && (
                  <div className="font-display font-bold text-7xl text-gold leading-none tabular-nums">
                    {workout.miles}
                  </div>
                )}
                <div className="pb-1">
                  {workout.miles > 0 && (
                    <div className="text-xs text-dust font-medium -mb-0.5">miles</div>
                  )}
                  <div className="font-display font-semibold text-2xl text-bone leading-tight">
                    {workout.title}
                  </div>
                </div>
              </div>
              <p className="text-sm text-bone/85 mt-3 leading-relaxed">{workout.detail}</p>
              {workout.note && (
                <p className="text-sm text-gold mt-2 leading-relaxed">📍 {workout.note}</p>
              )}

              {/* Logged run summary */}
              {loggedRun && (
                <div className="mt-3 bg-sage/10 border border-sage/30 rounded-lg px-4 py-3 space-y-1">
                  <div className="text-[10px] uppercase tracking-widest text-sage font-display font-semibold">
                    Logged
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 items-baseline">
                    <span className="font-display font-bold text-xl text-bone tabular-nums">
                      {loggedRun.miles} mi
                    </span>
                    {loggedRun.minutes > 0 && (
                      <span className="text-sm text-dust">
                        {paceOf(loggedRun.miles, loggedRun.minutes)}
                      </span>
                    )}
                    {loggedRun.hr && (
                      <span className="text-sm text-dust">{loggedRun.hr} bpm avg</span>
                    )}
                    <span className="text-sm text-dust">RPE {loggedRun.rpe}</span>
                  </div>
                  {loggedRun.notes && (
                    <p className="text-xs text-dust italic leading-relaxed">{loggedRun.notes}</p>
                  )}
                </div>
              )}

              {paceKey && (
                <div className="mt-4 bg-ink rounded-lg px-4 py-3 border border-seam space-y-2.5">
                  <div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px] uppercase tracking-widest text-dust font-display font-semibold">
                        Target pace
                      </span>
                      <span className="font-display font-bold text-xl text-gold tabular-nums">
                        {PACES[paceKey]}
                      </span>
                    </div>
                    <p className="text-xs text-dust mt-1">{PACE_NOTES[paceKey]}</p>
                  </div>
                  {TYPE_EFFORT[workout.type] && (
                    <div className="border-t border-seam pt-2.5 flex items-baseline justify-between">
                      <span className="text-[11px] uppercase tracking-widest text-dust font-display font-semibold">
                        Target effort
                      </span>
                      <span className="font-display font-bold text-xl text-bone tabular-nums">
                        {TYPE_EFFORT[workout.type]}<span className="text-dust text-sm"> /10</span>
                      </span>
                    </div>
                  )}
                  <div className="border-t border-seam pt-2.5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px] uppercase tracking-widest text-dust font-display font-semibold">
                        Target HR
                      </span>
                      <span className="font-display font-bold text-xl text-bone tabular-nums">
                        {guide[paceKey].target}
                      </span>
                    </div>
                    <p className="text-xs text-dust mt-1">{guide[paceKey].note}</p>
                  </div>
                </div>
              )}

              {workout.miles > 0 && (
                <button
                  onClick={() => launchRun(workout)}
                  className="mt-4 w-full bg-gold text-ink font-display font-bold tracking-widest uppercase rounded-lg py-4 text-base min-h-[48px]"
                >
                  ▶ Start run
                </button>
              )}
              <div className="mt-2 flex gap-2">
                {workout.miles > 0 ? (
                  <button
                    onClick={onGoLog}
                    className="flex-1 bg-coal border border-seam text-bone font-display font-bold tracking-widest uppercase rounded-lg py-3 text-sm"
                  >
                    {logged ? "Update log →" : "Log manually"}
                  </button>
                ) : (
                  <button
                    onClick={() => { toggleDone(workout.date); force((n) => n + 1); }}
                    className={`flex-1 font-display font-bold tracking-widest uppercase rounded-lg py-3 text-sm border ${
                      logged
                        ? "bg-sage/20 text-sage border-sage/40"
                        : "bg-ink text-bone border-seam"
                    }`}
                  >
                    {logged ? "Done ✓" : "Mark done"}
                  </button>
                )}
              </div>
              {workout.optional && (
                <p className="text-[11px] text-dust mt-2 text-center">
                  Optional — skip it if your legs are asking.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Free run — launch Run Mode any day (even rest/cross-train), no plan
          workout needed. Full GPS/HR/split tracking, no pace target. */}
      <button
        onClick={() => launchRun(freeRunWorkout(today))}
        className="w-full bg-coal rounded-xl border border-seam active:border-gold/50 px-4 py-3.5 flex items-center justify-between text-left min-h-[48px]"
      >
        <div className="min-w-0">
          <div className="font-display font-bold tracking-widest uppercase text-gold text-sm">
            ▶ Free run
          </div>
          <div className="text-[11px] text-dust mt-0.5">
            Feeling good? Track any run — GPS, HR, splits. No plan pace.
          </div>
        </div>
        <span className="text-gold text-xl shrink-0 ml-3">→</span>
      </button>

      {/* The daily 100s — pushups & situps */}
      <Hundreds dateISO={today} />

      {/* Up next */}
      {upNext && upNext.date !== today && (
        <div className="bg-coal rounded-xl px-4 py-3 border border-seam flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-dust font-display font-semibold">
              Up next
            </div>
            <div className="text-sm text-bone mt-0.5">
              {fmt(upNext.date)} · {upNext.title}
            </div>
          </div>
          {upNext.miles > 0 && (
            <div className="font-display font-bold text-2xl text-gold tabular-nums">
              {upNext.miles}
              <span className="text-xs text-dust ml-1">mi</span>
            </div>
          )}
        </div>
      )}

      {week && <WeekMeter weekStart={week.start} planned={week.plannedMiles} />}
    </div>
  );
}

function Hundreds({ dateISO }: { dateISO: string }) {
  const [, bump] = useState(0);
  const day = getCalis()[dateISO] ?? { pushups: 0, situps: 0 };
  const bothDone = day.pushups >= CALIS_GOAL && day.situps >= CALIS_GOAL;

  const add = (kind: "pushups" | "situps", n: number) => {
    addCalis(dateISO, kind, n);
    bump((x) => x + 1);
  };

  return (
    <div className="bg-coal rounded-2xl border border-seam px-4 py-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-widest text-dust font-display font-semibold">
          The daily 100s
        </div>
        {bothDone && (
          <span className="text-[10px] font-display font-bold tracking-widest uppercase bg-sage/20 text-sage rounded px-1.5 py-0.5">
            Both done ✓
          </span>
        )}
      </div>

      {(["pushups", "situps"] as const).map((kind) => {
        const count = day[kind];
        const hit = count >= CALIS_GOAL;
        const pct = Math.min(100, (count / CALIS_GOAL) * 100);
        return (
          <div key={kind} className="mt-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-bone font-semibold capitalize">{kind}</span>
              <span
                className={`font-display font-bold text-2xl tabular-nums ${
                  hit ? "text-sage" : "text-gold"
                }`}
              >
                {count}
                <span className="text-dust text-sm font-semibold"> /{CALIS_GOAL}</span>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 bg-ink rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${hit ? "bg-sage" : "bg-gold"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => add(kind, -10)}
                aria-label={`Remove 10 ${kind}`}
                className="w-14 min-h-[48px] bg-ink border border-seam rounded-lg text-dust font-display font-bold text-sm"
              >
                −10
              </button>
              <button
                onClick={() => add(kind, 10)}
                className="flex-1 min-h-[48px] bg-ink border border-seam rounded-lg text-bone font-display font-bold text-sm"
              >
                +10
              </button>
              <button
                onClick={() => add(kind, 25)}
                className="flex-1 min-h-[48px] bg-ink border border-seam rounded-lg text-bone font-display font-bold text-sm"
              >
                +25
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DailyFire({ dateISO }: { dateISO: string }) {
  const q = quoteForDate(dateISO);
  return (
    <div className="bg-coal rounded-xl border border-gold/40 overflow-hidden">
      <div className="flex items-stretch">
        <div className="shrink-0 flex items-center px-3 bg-gold/15 border-r border-gold/30">
          <span className="font-display font-bold text-[10px] tracking-[0.18em] uppercase text-gold leading-none">
            Daily<br />Fire
          </span>
        </div>
        <div className="flex-1 px-4 py-2.5">
          <p className="font-display font-semibold text-base text-bone leading-snug">
            &ldquo;{q.text}&rdquo;
          </p>
          <p className="mt-1 text-xs text-dust">— {q.who}</p>
        </div>
      </div>
    </div>
  );
}

function WeekMeter({ weekStart, planned }: { weekStart: string; planned: number }) {
  const runs = getRuns();
  let actual = 0;
  for (const r of Object.values(runs)) {
    const d = daysUntil(r.date, weekStart);
    if (d >= 0 && d <= 6) actual += r.miles;
  }
  const pct = Math.min(100, planned ? (actual / planned) * 100 : 0);
  return (
    <div className="bg-coal rounded-xl px-4 py-3 border border-seam">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-widest text-dust font-display font-semibold">
          This week
        </span>
        <span className="font-display font-bold text-lg text-bone tabular-nums">
          {actual.toFixed(1)}{" "}
          <span className="text-dust text-sm">/ {planned.toFixed(1)} mi</span>
        </span>
      </div>
      <div className="mt-2 h-2 bg-ink rounded-full overflow-hidden">
        <div
          className="h-full bg-gold rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function fmt(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

// "Tue 7:41 PM" — when the interrupted run began (epoch ms).
function fmtClockTime(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  });
}

export type { Workout };
