"use client";

import { useEffect, useState } from "react";
import {
  HALF_DATE, FULL_DATE, PACES, PACE_NOTES,
  daysUntil, findWeek, nextWorkout, todayISO, workoutOn, Workout
} from "@/lib/plan";
import { hrGuide } from "@/lib/zones";
import { getDone, getProfile, getRuns, paceOf, toggleDone } from "@/lib/storage";

const TYPE_PACE: Record<string, keyof typeof PACES | null> = {
  easy: "easy", long: "long", tempo: "tempo", intervals: "intervals", race: "halfRace"
};

export default function TodayView({ onGoLog }: { onGoLog: () => void }) {
  const [today, setToday] = useState("");
  const [, force] = useState(0);
  useEffect(() => setToday(todayISO()), []);
  if (!today) return null;

  const week = findWeek(today);
  const workout = workoutOn(today);
  const upNext = nextWorkout(today);
  const runs = getRuns();
  const done = getDone();
  const loggedRun = workout ? runs[workout.date] : null;
  const logged = workout && (runs[workout.date] || done[workout.date]);

  const toHalf = daysUntil(HALF_DATE, today);
  const toFull = daysUntil(FULL_DATE, today);

  const isRest = !workout;
  const guide = hrGuide(getProfile());
  const paceKey = workout ? TYPE_PACE[workout.type] : null;
  const isRace = workout?.type === "race";
  const racePace = isRace && workout.date === FULL_DATE ? PACES.marathon : PACES.halfRace;

  return (
    <div className="space-y-4">
      {/* Race day banner */}
      {isRace && (
        <div className="stripe rounded-xl px-5 py-4">
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
        <div className="stripe h-2" />
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
                        {isRace ? racePace : PACES[paceKey]}
                      </span>
                    </div>
                    <p className="text-xs text-dust mt-1">{PACE_NOTES[paceKey]}</p>
                  </div>
                  <div className="border-t border-seam pt-2.5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px] uppercase tracking-widest text-dust font-display font-semibold">
                        Target HR
                      </span>
                      <span className="font-display font-bold text-xl text-bone tabular-nums">
                        {isRace && workout.date === FULL_DATE
                          ? guide.marathon.target
                          : guide[paceKey].target}
                      </span>
                    </div>
                    <p className="text-xs text-dust mt-1">{guide[paceKey].note}</p>
                  </div>
                </div>
              )}

              <div className="mt-4 flex gap-2">
                {workout.miles > 0 ? (
                  <button
                    onClick={onGoLog}
                    className="flex-1 bg-gold text-ink font-display font-bold tracking-widest uppercase rounded-lg py-3 text-sm"
                  >
                    {logged ? "Update log →" : "Log this run"}
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

export type { Workout };
