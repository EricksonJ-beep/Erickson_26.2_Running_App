"use client";

import { useEffect, useState } from "react";
import { PLAN, findWeek, todayISO, Workout } from "@/lib/plan";
import { getDone, getRuns } from "@/lib/storage";

const TYPE_DOT: Record<string, string> = {
  easy: "bg-bone/60",
  tempo: "bg-gold",
  intervals: "bg-ember",
  long: "bg-gold",
  xt: "bg-dust",
  strength: "bg-dust",
  race: "bg-gold",
  walk: "bg-dust"
};

function weekEndISO(start: string): string {
  const dt = new Date(start + "T12:00:00");
  dt.setDate(dt.getDate() + 6);
  return dt.toISOString().slice(0, 10);
}

export default function PlanView() {
  const [today, setToday] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    const t = todayISO();
    setToday(t);
    const w = findWeek(t);
    setOpen(w ? w.num : 1);
  }, []);
  if (!today) return null;

  const runs = getRuns();
  const done = getDone();
  const currentWeekObj = findWeek(today);
  const currentWeekNum = currentWeekObj?.num;

  // Phase progress for the header card
  const phaseWeeks = currentWeekObj
    ? PLAN.filter((w) => w.phase === currentWeekObj.phase)
    : [];
  const weekInPhase = currentWeekObj
    ? phaseWeeks.findIndex((w) => w.num === currentWeekObj.num) + 1
    : 0;

  return (
    <div className="space-y-2">
      {/* Phase progress header */}
      {currentWeekObj && (
        <div className="bg-coal rounded-xl border border-gold/30 px-4 py-3 mb-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-dust font-display font-semibold">
                Current phase
              </div>
              <div className="font-display font-bold text-lg text-bone mt-0.5">
                {currentWeekObj.phase}
              </div>
              <div className="text-[11px] text-dust italic mt-0.5 leading-snug max-w-[220px]">
                {currentWeekObj.focus}
              </div>
            </div>
            <div className="text-right shrink-0 ml-3">
              <div className="font-display font-bold text-3xl text-gold tabular-nums leading-none">
                {weekInPhase}
                <span className="text-dust text-lg">/{phaseWeeks.length}</span>
              </div>
              <div className="text-[10px] text-dust mt-0.5">weeks in phase</div>
            </div>
          </div>
          <div className="mt-3 h-1.5 bg-ink rounded-full overflow-hidden">
            <div
              className="h-full bg-gold rounded-full transition-all"
              style={{ width: `${(weekInPhase / phaseWeeks.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {PLAN.map((w) => {
        const isOpen = open === w.num;
        const isCurrent = currentWeekNum === w.num;
        const isPast = weekEndISO(w.start) < today;
        const required = w.workouts.filter((x) => !x.optional);
        const doneCount = required.filter(
          (x) => runs[x.date] || done[x.date]
        ).length;
        const isComplete = isPast && doneCount === required.length && required.length > 0;

        return (
          <div
            key={w.num}
            className={`rounded-xl border overflow-hidden ${
              isCurrent
                ? "border-gold/50 bg-coal"
                : isComplete
                ? "border-sage/30 bg-coal"
                : "border-seam bg-coal"
            }`}
          >
            <button
              onClick={() => setOpen(isOpen ? null : w.num)}
              className="w-full px-4 py-3 flex items-center justify-between text-left"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display font-bold text-lg text-bone">Week {w.num}</span>
                  {isCurrent && (
                    <span className="text-[10px] font-display font-bold tracking-widest uppercase bg-gold text-ink rounded px-1.5 py-0.5">
                      Now
                    </span>
                  )}
                  {isComplete && (
                    <span className="text-[10px] font-display font-bold tracking-widest uppercase bg-sage/20 text-sage rounded px-1.5 py-0.5">
                      Done ✓
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-dust mt-0.5">
                  {w.phase} · wk of {fmtShort(w.start)}
                </div>
              </div>
              <div className="text-right">
                <div className="font-display font-bold text-xl text-gold tabular-nums">
                  {w.plannedMiles.toFixed(0)}
                </div>
                <div className="text-[10px] text-dust -mt-0.5">mi planned</div>
                {isPast && required.length > 0 && (
                  <div className="text-[10px] text-dust mt-0.5">
                    {doneCount}/{required.length} logged
                  </div>
                )}
              </div>
            </button>
            {isOpen && (
              <div className="px-4 pb-4">
                <p className="text-xs text-dust italic mb-3">{w.focus}</p>
                <div className="space-y-2">
                  {w.workouts.map((x) => (
                    <DayRow
                      key={x.date}
                      x={x}
                      logged={!!(runs[x.date] || done[x.date])}
                      isToday={x.date === today}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DayRow({
  x,
  logged,
  isToday
}: {
  x: Workout;
  logged: boolean;
  isToday: boolean;
}) {
  return (
    <div
      className={`rounded-lg px-3 py-2.5 ${
        isToday ? "bg-ink border border-gold/40" : "bg-ink"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className={`w-2 h-2 rounded-full shrink-0 ${TYPE_DOT[x.type] ?? "bg-dust"}`} />
        <span className="text-xs text-dust w-16 shrink-0">{fmtShort(x.date)}</span>
        <span className="text-sm text-bone flex-1 leading-snug">
          {x.title}
          {x.optional && <span className="text-dust text-xs"> · optional</span>}
        </span>
        {x.miles > 0 && (
          <span className="font-display font-semibold text-gold tabular-nums">{x.miles}</span>
        )}
        {logged && <span className="text-sage text-sm">✓</span>}
      </div>
      <p className="text-[11px] text-dust mt-1 ml-[18px] leading-snug">{x.detail}</p>
    </div>
  );
}

function fmtShort(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "numeric",
    day: "numeric"
  });
}

