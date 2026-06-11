"use client";

import { useEffect, useRef, useState } from "react";
import { PLAN, Phase, daysUntil, findWeek, todayISO } from "@/lib/plan";
import { computeZones, methodLabel } from "@/lib/zones";
import {
  exportAll, getDone, getProfile, getRuns, importAll, paceOf, saveProfile, Profile
} from "@/lib/storage";

const PHASE_COLOR: Record<Phase, string> = {
  "Half Build": "bg-gold",
  "Recovery Bridge": "bg-sage",
  "Marathon Build": "bg-ember",
  "Taper": "bg-goldDim",
  "Race Week": "bg-gold"
};

export default function ProgressView() {
  const [today, setToday] = useState("");
  const [, force] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setToday(todayISO()), []);
  if (!today) return null;

  const runsMap = getRuns();
  const doneMap = getDone();
  const runs = Object.values(runsMap);
  const currentWeekNum = findWeek(today)?.num ?? 0;

  // Weekly mileage vs plan
  const weekly = PLAN.map((w) => {
    let actual = 0;
    for (const r of runs) {
      const d = daysUntil(r.date, w.start);
      if (d >= 0 && d <= 6) actual += r.miles;
    }
    return { num: w.num, planned: w.plannedMiles, actual, phase: w.phase };
  });

  const maxMi = Math.max(...weekly.map((w) => Math.max(w.planned, w.actual)), 1);

  // Summary stats
  const totalActual = runs.reduce((a, r) => a + r.miles, 0);
  const totalRuns = runs.length;
  const totalMinutes = runs.reduce((a, r) => a + (r.minutes || 0), 0);
  const totalHours = Math.floor(totalMinutes / 60);
  const remMin = totalMinutes % 60;
  const totalTimeStr = totalMinutes > 0
    ? (totalHours > 0 ? `${totalHours}h ${remMin}m` : `${totalMinutes}m`)
    : "—";
  const avgPace = totalActual > 0 && totalMinutes > 0
    ? paceOf(totalActual, totalMinutes)
    : "—";

  // Compliance: required (non-optional) workouts in the past
  const pastWorkouts = PLAN.flatMap((w) => w.workouts)
    .filter((x) => x.date < today && !x.optional);
  const completedCount = pastWorkouts.filter(
    (x) => runsMap[x.date] || doneMap[x.date]
  ).length;
  const compliance =
    pastWorkouts.length > 0
      ? Math.round((completedCount / pastWorkouts.length) * 100)
      : 100;

  // Best week by actual miles logged
  const bestWeek = weekly.reduce(
    (best, w) => (w.actual > best.actual ? w : best),
    weekly[0]
  );

  // 10% ramp check on the last two completed weeks
  let rampWarning: string | null = null;
  const prev = weekly.find((w) => w.num === currentWeekNum - 1);
  const prev2 = weekly.find((w) => w.num === currentWeekNum - 2);
  if (prev && prev2 && prev2.actual > 0 && prev.actual > prev2.actual * 1.18) {
    rampWarning = `Last week jumped ${Math.round(
      ((prev.actual - prev2.actual) / prev2.actual) * 100
    )}% over the week before. The 10% rule says hold volume steady this week.`;
  }

  return (
    <div className="space-y-4">
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Total miles" value={totalActual.toFixed(1)} />
        <Stat label="Runs logged" value={String(totalRuns)} />
        <Stat label="Avg pace" value={avgPace} small />
        <Stat
          label="Compliance"
          value={`${compliance}%`}
          note={`${completedCount} / ${pastWorkouts.length} workouts`}
        />
      </div>

      {/* Best week */}
      {bestWeek.actual > 0 && (
        <div className="bg-coal rounded-xl px-4 py-3 border border-seam flex items-baseline justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-dust font-display font-semibold">
              Best week
            </div>
            <div className="text-xs text-dust mt-0.5">
              Wk {bestWeek.num} · {bestWeek.phase}
            </div>
          </div>
          <div className="font-display font-bold text-2xl text-gold tabular-nums">
            {bestWeek.actual.toFixed(1)}{" "}
            <span className="text-dust text-sm">mi</span>
          </div>
        </div>
      )}

      {/* Time on feet */}
      {totalMinutes > 0 && (
        <div className="bg-coal rounded-xl px-4 py-3 border border-seam flex items-baseline justify-between">
          <div className="text-[11px] uppercase tracking-widest text-dust font-display font-semibold">
            Time on feet
          </div>
          <div className="font-display font-bold text-2xl text-bone tabular-nums">
            {totalTimeStr}
          </div>
        </div>
      )}

      {/* Ramp warning */}
      {rampWarning && (
        <div className="bg-ember/15 border border-ember/40 rounded-xl px-4 py-3">
          <div className="text-[11px] uppercase tracking-widest text-ember font-display font-bold">
            Ramp check
          </div>
          <p className="text-xs text-bone/90 mt-1 leading-relaxed">{rampWarning}</p>
        </div>
      )}

      {/* Weekly miles chart */}
      <div className="bg-coal rounded-2xl border border-seam p-5">
        <h2 className="font-display font-bold text-xl text-bone">Weekly miles</h2>
        <p className="text-[11px] text-dust mt-0.5">Filled = logged · outline = planned</p>

        {/* Phase legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
          {(["Half Build", "Recovery Bridge", "Marathon Build", "Taper"] as Phase[]).map(
            (ph) => (
              <div key={ph} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-sm ${PHASE_COLOR[ph]}`} />
                <span className="text-[10px] text-dust">{ph}</span>
              </div>
            )
          )}
        </div>

        <div className="mt-4 flex items-end gap-[3px] h-36">
          {weekly.map((w) => (
            <div
              key={w.num}
              className="flex-1 flex flex-col items-center justify-end h-full relative"
            >
              {/* Planned outline bar */}
              <div
                className="w-full rounded-t border border-seam"
                style={{ height: `${(w.planned / maxMi) * 100}%` }}
              />
              {/* Actual filled bar */}
              {w.actual > 0 && (
                <div
                  className={`w-full rounded-t absolute bottom-0 ${
                    w.num === currentWeekNum ? "opacity-100" : "opacity-75"
                  } ${PHASE_COLOR[w.phase]}`}
                  style={{ height: `${(w.actual / maxMi) * 100}%` }}
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-dust mt-1.5">
          <span>Wk 1</span>
          <span>Half · Wk 9</span>
          <span>Wk 18 · 26.2</span>
        </div>
      </div>

      {/* HR zones — computed from profile */}
      <div className="bg-coal rounded-2xl border border-seam p-5">
        <h2 className="font-display font-bold text-xl text-bone">HR zones</h2>
        <p className="text-[11px] text-dust mt-0.5">{methodLabel(getProfile())}</p>
        <div className="mt-3 space-y-1.5">
          {computeZones(getProfile()).map((z) => (
            <div key={z.z} className="bg-ink rounded-lg px-3 py-2 flex items-center gap-3">
              <span className="font-display font-bold text-gold w-7">{z.z}</span>
              <span className="font-display font-semibold text-bone tabular-nums w-20">
                {z.lo}–{z.hi}
              </span>
              <span className="text-[11px] text-dust flex-1 leading-snug">
                {z.name} — {z.use}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Profile — feeds the zone engine */}
      <ProfileCard onSaved={() => force((n) => n + 1)} />

      {/* Backup */}
      <div className="bg-coal rounded-2xl border border-seam p-5">
        <h2 className="font-display font-bold text-xl text-bone">Backup</h2>
        <p className="text-[11px] text-dust mt-0.5">
          Data lives on this phone. Export a JSON copy now and then.
        </p>
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => {
              const blob = new Blob([exportAll()], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `erickson-262-${today}.json`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 10000);
            }}
            className="flex-1 bg-gold text-ink font-display font-bold uppercase tracking-wider rounded-lg py-2.5 text-sm"
          >
            Export data
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex-1 bg-ink border border-seam text-bone font-display font-bold uppercase tracking-wider rounded-lg py-2.5 text-sm"
          >
            Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (!window.confirm("Import will replace the data on this phone. Continue?")) return;
              const ok = importAll(await f.text());
              if (ok) force((n) => n + 1);
              else window.alert("That file doesn't look like an Erickson 26.2 backup.");
            }}
          />
        </div>
      </div>
    </div>
  );
}

function ProfileCard({ onSaved }: { onSaved: () => void }) {
  const [p, setP] = useState<Profile | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => setP(getProfile()), []);
  if (!p) return null;

  const field = (
    key: keyof Profile,
    label: string,
    placeholder: string,
    min: number,
    max: number
  ) => (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-dust font-display font-semibold">
        {label}
      </span>
      <input
        type="number"
        inputMode="numeric"
        value={p[key] ?? ""}
        placeholder={placeholder}
        min={min}
        max={max}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          setP({ ...p, [key]: Number.isFinite(n) && n >= min && n <= max ? n : undefined });
          setSaved(false);
        }}
        className="mt-1 w-full bg-ink border border-seam rounded-lg px-3 py-2 text-bone tabular-nums text-sm focus:outline-none focus:border-gold"
      />
    </label>
  );

  return (
    <div className="bg-coal rounded-2xl border border-seam p-5">
      <h2 className="font-display font-bold text-xl text-bone">Your numbers</h2>
      <p className="text-[11px] text-dust mt-0.5 leading-snug">
        From your Garmin: resting HR after a week of wear, max HR from a hard effort,
        LTHR from a threshold test with the chest strap. Every field is optional —
        zones use the best data you&apos;ve got.
      </p>
      <div className="grid grid-cols-2 gap-3 mt-3">
        {field("age", "Age", "39", 10, 100)}
        {field("restingHR", "Resting HR", "—", 30, 100)}
        {field("maxHR", "Max HR", "—", 120, 230)}
        {field("lthr", "Threshold HR", "—", 100, 210)}
      </div>
      <button
        onClick={() => {
          saveProfile(p);
          setSaved(true);
          onSaved();
        }}
        className="mt-3 w-full bg-gold text-ink font-display font-bold uppercase tracking-wider rounded-lg py-2.5 text-sm"
      >
        {saved ? "Saved ✓" : "Save — zones update instantly"}
      </button>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  small
}: {
  label: string;
  value: string;
  note?: string;
  small?: boolean;
}) {
  return (
    <div className="bg-coal rounded-xl px-4 py-3 border border-seam">
      <div
        className={`font-display font-bold text-gold leading-none tabular-nums ${
          small ? "text-xl" : "text-3xl"
        }`}
      >
        {value}
      </div>
      <div className="text-[11px] text-dust mt-1 font-medium">{label}</div>
      {note && <div className="text-[10px] text-dust/70 mt-0.5">{note}</div>}
    </div>
  );
}
