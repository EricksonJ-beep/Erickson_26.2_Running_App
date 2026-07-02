"use client";

import { useEffect, useRef, useState } from "react";
import { PLAN, Phase, daysUntil, findWeek, todayISO } from "@/lib/plan";
import { computeZones, methodLabel } from "@/lib/zones";
import {
  CALIS_GOAL, CalisLog, exportAll, getBody, getCalis, getDone, getLastExport, getProfile,
  getRecoveryTests, getRuns, importAll, paceOf, saveProfile, storageEstimate, Profile
} from "@/lib/storage";
import { hrr1BandInfo, HRR1_LOW_FLAG } from "@/lib/recovery";
import DiagnosticsView from "@/components/DiagnosticsView";
import HRTestView from "@/components/HRTestView";
import QuickTestView from "@/components/QuickTestView";

const PHASE_COLOR: Record<Phase, string> = {
  "Base": "bg-dust",
  "Half Build": "bg-gold",
  "Recovery Bridge": "bg-sage",
  "Marathon Build": "bg-ember",
  "Taper": "bg-goldDim",
  "Race Week": "bg-gold"
};

export default function ProgressView() {
  const [today, setToday] = useState("");
  const [, force] = useState(0);
  const [diagnostics, setDiagnostics] = useState(false);
  const [hrTest, setHrTest] = useState(false);
  const [quickTest, setQuickTest] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  useEffect(() => setToday(todayISO()), []);
  useEffect(() => {
    storageEstimate().then(setEstimate);
  }, []);
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
  const displayMin = Math.round(totalMinutes); // whole minutes for a clean readout
  const totalHours = Math.floor(displayMin / 60);
  const remMin = displayMin % 60;
  const totalTimeStr = totalMinutes > 0
    ? (totalHours > 0 ? `${totalHours}h ${remMin}m` : `${displayMin}m`)
    : "—";
  const avgPace = totalActual > 0 && totalMinutes > 0
    ? paceOf(totalActual, totalMinutes)
    : "—";

  // Compliance: required (non-optional) workouts in the past. Any run on the
  // date counts (a day can hold multiple runs), so match on the set of run dates.
  const runDates = new Set(runs.map((r) => r.date));
  const pastWorkouts = PLAN.flatMap((w) => w.workouts)
    .filter((x) => x.date < today && !x.optional);
  const completedCount = pastWorkouts.filter(
    (x) => runDates.has(x.date) || doneMap[x.date]
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
      {/* Sensor check — fullscreen takeover, covers the tab bar */}
      {diagnostics && <DiagnosticsView onClose={() => setDiagnostics(false)} />}

      {/* Fitness tests — fullscreen, writes max HR / LTHR to the profile */}
      {hrTest && <HRTestView onClose={() => setHrTest(false)} onSaved={() => force((n) => n + 1)} />}

      {/* Quick tests — fullscreen, resting HR (→ profile) + standalone recovery */}
      {quickTest && <QuickTestView onClose={() => setQuickTest(false)} onSaved={() => force((n) => n + 1)} />}

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
          <span>Wk 0</span>
          <span>Half · Wk 9</span>
          <span>Wk 18 · 26.2</span>
        </div>
      </div>

      {/* 80/20 intensity balance — time in zone from strap runs */}
      <IntensityCard today={today} />

      {/* The daily 100s — pushups & situps habit */}
      <HundredsCard today={today} />

      {/* Body composition — seeded from scale screenshots */}
      <BodyCard />

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

      {/* HR recovery — HRR trend from Run Mode recovery tests */}
      <RecoveryCard />

      {/* Fitness tests — measure real max HR / LTHR with the strap */}
      <div className="bg-coal rounded-2xl border border-seam p-5">
        <h2 className="font-display font-bold text-xl text-bone">Fitness tests</h2>
        <p className="text-[11px] text-dust mt-0.5 leading-snug">
          Measure your real max HR or lactate threshold with the strap — guided, science-based
          field tests. The result saves to your profile and sharpens every zone.
        </p>
        <button
          onClick={() => setHrTest(true)}
          className="mt-3 w-full bg-ink border border-seam text-bone font-display font-bold uppercase tracking-wider rounded-lg py-3 text-sm min-h-[48px]"
        >
          ⚡ Open fitness tests
        </button>
      </div>

      {/* Sensor check — test GPS, heart rate, wake lock */}
      <div className="bg-coal rounded-2xl border border-seam p-5">
        <h2 className="font-display font-bold text-xl text-bone">Sensor check</h2>
        <p className="text-[11px] text-dust mt-0.5">
          Test GPS and your heart-rate strap without starting a run. Nothing is logged.
        </p>
        <button
          onClick={() => setDiagnostics(true)}
          className="mt-3 w-full bg-ink border border-seam text-bone font-display font-bold uppercase tracking-wider rounded-lg py-3 text-sm min-h-[48px]"
        >
          ⚙ Open sensor check
        </button>
      </div>

      {/* Quick tests — resting HR + standalone recovery, any time, no run */}
      <div className="bg-coal rounded-2xl border border-seam p-5">
        <h2 className="font-display font-bold text-xl text-bone">Resting HR &amp; recovery</h2>
        <p className="text-[11px] text-dust mt-0.5 leading-snug">
          Two quick strap tests, no run needed. Capture your resting heart rate — it saves to your
          profile and sharpens zones — or run a standalone heart-rate recovery check any time.
        </p>
        <button
          onClick={() => setQuickTest(true)}
          className="mt-3 w-full bg-ink border border-seam text-bone font-display font-bold uppercase tracking-wider rounded-lg py-3 text-sm min-h-[48px]"
        >
          ❤ Open quick tests
        </button>
      </div>

      {/* Profile — feeds the zone engine */}
      <ProfileCard onSaved={() => force((n) => n + 1)} />

      {/* Backup */}
      <div className="bg-coal rounded-2xl border border-seam p-5">
        <h2 className="font-display font-bold text-xl text-bone">Backup</h2>
        <p className="text-[11px] text-dust mt-0.5">
          Data lives on this phone. Export a JSON copy now and then.
        </p>
        {(() => {
          const lastExport = getLastExport();
          const daysSince = lastExport ? daysUntil(today, lastExport.slice(0, 10)) : null;
          const stale = totalRuns > 0 && (lastExport == null || (daysSince != null && daysSince >= 21));
          if (!stale) return null;
          return (
            <p className="text-xs text-ember mt-2 leading-snug">
              {lastExport == null
                ? "You haven't exported a backup yet. It's the only way to recover this data if the phone or browser clears it."
                : `Last backup was ${daysSince} days ago. Export a fresh copy.`}
            </p>
          );
        })()}
        {estimate && estimate.quota > 0 && (
          <p className="text-[11px] text-dust mt-1.5 tabular-nums">
            Storage: {(estimate.usage / 1048576).toFixed(1)} MB used
            {" · "}
            {Math.round((estimate.usage / estimate.quota) * 100)}% of the browser budget
          </p>
        )}
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
              force((n) => n + 1); // refresh the staleness nudge now that we've backed up
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

// 80/20 intensity balance — the principle the whole plan is built on. Sums
// per-run time-in-zone (saved by Run Mode when the strap streamed) over the
// last 4 weeks: Z1–Z2 = easy, Z3+ = hard. Hidden until there's enough data.
function IntensityCard({ today }: { today: string }) {
  const runs = Object.values(getRuns()).filter((r) => {
    if (!r.zoneSeconds) return false;
    const age = daysUntil(today, r.date);
    return age >= 0 && age < 28;
  });
  let easySec = 0;
  let hardSec = 0;
  for (const r of runs) {
    const z = r.zoneSeconds!;
    easySec += (z[0] ?? 0) + (z[1] ?? 0);
    hardSec += (z[2] ?? 0) + (z[3] ?? 0) + (z[4] ?? 0);
  }
  const total = easySec + hardSec;
  if (total < 600) return null; // need ~10 min of strap time before the % means anything

  const easyPct = Math.round((easySec / total) * 100);
  const onTarget = easyPct >= 80;
  const hours = total / 3600;

  return (
    <div className="bg-coal rounded-2xl border border-seam p-5">
      <h2 className="font-display font-bold text-xl text-bone">80/20 balance</h2>
      <p className="text-[11px] text-dust mt-0.5 leading-snug">
        Time in Z1–Z2 (easy) vs Z3+ (hard) across strap runs, last 4 weeks. The plan is built
        on ~80% easy.
      </p>

      <div className="flex items-baseline gap-2 mt-3">
        <span
          className={`font-display font-bold text-3xl tabular-nums leading-none ${
            onTarget ? "text-sage" : "text-ember"
          }`}
        >
          {easyPct}%
        </span>
        <span className="text-xs text-dust">
          easy · {100 - easyPct}% hard · {runs.length} run{runs.length === 1 ? "" : "s"},{" "}
          {hours >= 1 ? `${hours.toFixed(1)} h` : `${Math.round(total / 60)} min`}
        </span>
      </div>

      {/* Meter with the 80% target tick */}
      <div className="relative mt-3 h-3 rounded-full overflow-hidden bg-ink flex">
        <div className={onTarget ? "bg-sage" : "bg-gold"} style={{ width: `${easyPct}%` }} />
        <div className="bg-ember/70 flex-1" />
        <div className="absolute inset-y-0 left-[80%] w-px bg-bone/70" />
      </div>
      <div className="flex justify-between text-[10px] text-dust mt-1">
        <span>easy</span>
        <span className="text-bone/70">80% target</span>
        <span>hard</span>
      </div>

      {!onTarget && (
        <p className="text-xs text-ember mt-2.5 leading-snug">
          Under 80% — the easy days may be running too hot. Slowing them down protects the
          quality days (and the 10% ramp).
        </p>
      )}
    </div>
  );
}

function prevISO(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function HundredsCard({ today }: { today: string }) {
  const all = getCalis();
  const entries = Object.entries(all);
  if (entries.length === 0) return null;

  const hitBoth = (d?: CalisLog) => !!d && d.pushups >= CALIS_GOAL && d.situps >= CALIS_GOAL;

  const totalPush = entries.reduce((a, [, d]) => a + d.pushups, 0);
  const totalSit = entries.reduce((a, [, d]) => a + d.situps, 0);
  const perfectDays = entries.filter(([, d]) => hitBoth(d)).length;

  // Streak of both-done days ending today — or yesterday, so an
  // unfinished today doesn't zero it out mid-day.
  let streak = 0;
  let cursor = hitBoth(all[today]) ? today : prevISO(today);
  while (hitBoth(all[cursor])) {
    streak++;
    cursor = prevISO(cursor);
  }

  // Last 14 days, oldest first
  const strip: { date: string; day: CalisLog | undefined }[] = [];
  let d = today;
  for (let i = 0; i < 14; i++) {
    strip.unshift({ date: d, day: all[d] });
    d = prevISO(d);
  }

  return (
    <div className="bg-coal rounded-2xl border border-seam p-5">
      <h2 className="font-display font-bold text-xl text-bone">The daily 100s</h2>
      <p className="text-[11px] text-dust mt-0.5">100 pushups + 100 situps, every day.</p>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <div className="bg-ink rounded-lg px-3 py-2.5">
          <div className="font-display font-bold text-2xl text-gold tabular-nums leading-none">
            {streak}
            <span className="text-dust text-sm ml-1">{streak === 1 ? "day" : "days"}</span>
          </div>
          <div className="text-[10px] text-dust mt-1">Current streak</div>
        </div>
        <div className="bg-ink rounded-lg px-3 py-2.5">
          <div className="font-display font-bold text-2xl text-bone tabular-nums leading-none">
            {perfectDays}
          </div>
          <div className="text-[10px] text-dust mt-1">Perfect days — both 100s hit</div>
        </div>
        <div className="bg-ink rounded-lg px-3 py-2.5">
          <div className="font-display font-bold text-2xl text-bone tabular-nums leading-none">
            {totalPush.toLocaleString()}
          </div>
          <div className="text-[10px] text-dust mt-1">Total pushups</div>
        </div>
        <div className="bg-ink rounded-lg px-3 py-2.5">
          <div className="font-display font-bold text-2xl text-bone tabular-nums leading-none">
            {totalSit.toLocaleString()}
          </div>
          <div className="text-[10px] text-dust mt-1">Total situps</div>
        </div>
      </div>

      {/* Last 14 days — sage = both, gold = partial, empty = nothing */}
      <div className="mt-4 flex gap-1">
        {strip.map(({ date, day }) => {
          const both = hitBoth(day);
          const some = !!day && (day.pushups > 0 || day.situps > 0);
          return (
            <div
              key={date}
              title={`${fmtShortDate(date)}: ${day?.pushups ?? 0} pushups · ${day?.situps ?? 0} situps`}
              className={`flex-1 h-8 rounded-sm ${
                both ? "bg-sage" : some ? "bg-gold/50" : "bg-ink border border-seam"
              }`}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-dust mt-1">
        <span>2 weeks ago</span>
        <span>today</span>
      </div>
    </div>
  );
}

function BodyCard() {
  const entries = Object.values(getBody()).sort((a, b) => (a.date < b.date ? 1 : -1));
  if (entries.length === 0) return null;
  const latest = entries[0];
  const prev = entries[1];
  const delta = prev ? latest.weight - prev.weight : null;

  return (
    <div className="bg-coal rounded-2xl border border-seam p-5">
      <h2 className="font-display font-bold text-xl text-bone">Body</h2>
      <p className="text-[11px] text-dust mt-0.5">
        Scale reading {fmtShortDate(latest.date)}. Single readings wobble — the trend is the signal.
      </p>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <div className="bg-ink rounded-lg px-3 py-2.5">
          <div className="font-display font-bold text-2xl text-gold tabular-nums leading-none">
            {latest.weight.toFixed(1)}
            <span className="text-dust text-sm ml-1">lb</span>
          </div>
          <div className="text-[10px] text-dust mt-1">
            Weight
            {delta !== null && (
              <span className={delta <= 0 ? "text-sage" : "text-ember"}>
                {" "}· {delta > 0 ? "+" : ""}{delta.toFixed(1)} vs last
              </span>
            )}
          </div>
        </div>
        {latest.bodyFat !== undefined && (
          <div className="bg-ink rounded-lg px-3 py-2.5">
            <div className="font-display font-bold text-2xl text-bone tabular-nums leading-none">
              {latest.bodyFat.toFixed(1)}
              <span className="text-dust text-sm ml-1">%</span>
            </div>
            <div className="text-[10px] text-dust mt-1">Body fat</div>
          </div>
        )}
        {latest.muscleMass !== undefined && (
          <div className="bg-ink rounded-lg px-3 py-2.5">
            <div className="font-display font-bold text-2xl text-bone tabular-nums leading-none">
              {latest.muscleMass.toFixed(1)}
              <span className="text-dust text-sm ml-1">lb</span>
            </div>
            <div className="text-[10px] text-dust mt-1">Muscle mass</div>
          </div>
        )}
        {latest.bmr !== undefined && (
          <div className="bg-ink rounded-lg px-3 py-2.5">
            <div className="font-display font-bold text-2xl text-bone tabular-nums leading-none">
              {latest.bmr}
              <span className="text-dust text-sm ml-1">kcal</span>
            </div>
            <div className="text-[10px] text-dust mt-1">BMR — fuel floor, before any running</div>
          </div>
        )}
      </div>
      {entries.length > 1 && (
        <div className="mt-3 space-y-1">
          {entries.slice(0, 8).map((e) => (
            <div key={e.date} className="flex items-baseline gap-3 text-sm bg-ink rounded-lg px-3 py-1.5">
              <span className="text-xs text-dust w-16 shrink-0">{fmtShortDate(e.date)}</span>
              <span className="font-display font-semibold text-bone tabular-nums">
                {e.weight.toFixed(1)} lb
              </span>
              {e.bodyFat !== undefined && (
                <span className="text-xs text-dust tabular-nums">{e.bodyFat.toFixed(1)}% bf</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function fmtShortDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

// completedAt is a UTC ISO timestamp; slicing it would date an evening test
// under tomorrow. Convert to the local calendar day, same basis as todayISO().
function localDateOf(ts: string): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// HRR trend — run-attached recovery tests + standalone ones from Quick tests.
function RecoveryCard() {
  const runTests = Object.values(getRuns())
    .filter((r) => r.recoveryTest && r.recoveryTest.hrr1 != null)
    .map((r) => ({ date: r.date, t: r.recoveryTest! }));
  const soloTests = getRecoveryTests()
    .filter((t) => t.hrr1 != null)
    .map((t) => ({ date: localDateOf(t.completedAt), t }));
  const tests = [...runTests, ...soloTests].sort((a, b) =>
    a.t.completedAt < b.t.completedAt ? -1 : 1
  ); // oldest → newest
  if (tests.length === 0) return null;

  const drops = tests.map((x) => Math.max(0, x.t.hrr1!));
  const latest = tests[tests.length - 1];
  const latestDrop = Math.max(0, latest.t.hrr1!);
  const best = Math.max(...drops);
  const last5 = drops.slice(-5);
  const rollingAvg = Math.round(last5.reduce((a, b) => a + b, 0) / last5.length);
  const scale = Math.max(best, 40); // fixed-ish reference so bars read intuitively
  const latestBand = latest.t.hrr1Label ? hrr1BandInfo(latest.t.hrr1Label) : null;
  const lowFlag = latestDrop < HRR1_LOW_FLAG;

  return (
    <div className="bg-coal rounded-2xl border border-seam p-5">
      <h2 className="font-display font-bold text-xl text-bone">HR recovery</h2>
      <p className="text-[11px] text-dust mt-0.5 leading-snug">
        One-minute HR drop after a run or standalone test (HRR1). Bigger drop = faster recovery.
      </p>

      <div className="grid grid-cols-3 gap-3 mt-3">
        <div className="bg-ink rounded-lg px-3 py-2.5">
          <div className={`font-display font-bold text-2xl tabular-nums leading-none ${latestBand?.text ?? "text-gold"}`}>
            −{latestDrop}
          </div>
          <div className="text-[10px] text-dust mt-1">Latest{latestBand ? ` · ${latestBand.name}` : ""}</div>
        </div>
        <div className="bg-ink rounded-lg px-3 py-2.5">
          <div className="font-display font-bold text-2xl text-bone tabular-nums leading-none">−{rollingAvg}</div>
          <div className="text-[10px] text-dust mt-1">Avg last {last5.length}</div>
        </div>
        <div className="bg-ink rounded-lg px-3 py-2.5">
          <div className="font-display font-bold text-2xl text-bone tabular-nums leading-none">−{best}</div>
          <div className="text-[10px] text-dust mt-1">Best</div>
        </div>
      </div>

      {/* Bar sparkline — one bar per test, colored by band */}
      <div className="mt-4 flex items-end gap-[3px] h-24">
        {tests.map((x) => {
          const d = Math.max(0, x.t.hrr1!);
          const band = x.t.hrr1Label ? hrr1BandInfo(x.t.hrr1Label) : null;
          return (
            <div
              key={x.t.completedAt}
              className="flex-1 flex flex-col justify-end h-full"
              title={`${fmtShortDate(x.date)}: −${d} bpm · ${x.t.runType ?? "solo"}`}
            >
              <div
                className={`w-full rounded-t ${band?.bar ?? "bg-dust"}`}
                style={{ height: `${Math.max(4, (d / scale) * 100)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-dust mt-1.5">
        <span>{fmtShortDate(tests[0].date)}</span>
        <span>{tests.length} test{tests.length === 1 ? "" : "s"}</span>
        <span>{fmtShortDate(latest.date)}</span>
      </div>

      {/* Recent tests */}
      <div className="mt-3 space-y-1">
        {tests
          .slice(-6)
          .reverse()
          .map((x) => {
            const band = x.t.hrr1Label ? hrr1BandInfo(x.t.hrr1Label) : null;
            return (
              <div key={x.t.completedAt} className="flex items-center gap-2 text-sm bg-ink rounded-lg px-3 py-1.5">
                <span className="text-xs text-dust w-12 shrink-0">{fmtShortDate(x.date)}</span>
                <span className={`font-display font-semibold tabular-nums w-12 ${band?.text ?? "text-bone"}`}>
                  −{Math.max(0, x.t.hrr1!)}
                </span>
                {x.t.hrr2 != null && (
                  <span className="text-xs text-dust tabular-nums">−{Math.max(0, x.t.hrr2)} @2m</span>
                )}
                <span className="text-[10px] uppercase tracking-widest text-dust ml-auto">{x.t.runType ?? "solo"}</span>
                {x.t.incomplete && <span className="text-[10px] text-ember">partial</span>}
              </div>
            );
          })}
      </div>

      {lowFlag && (
        <div className="bg-ember/15 border border-ember/40 rounded-xl px-4 py-3 mt-3">
          <p className="text-xs text-bone/90 leading-relaxed">
            Latest one-minute drop is under 12 bpm — the body may still be carrying fatigue.
            Consider more easy / recovery days. (General guidance, not medical advice.)
          </p>
        </div>
      )}
    </div>
  );
}

const PROFILE_RANGES: Record<keyof Profile, [number, number]> = {
  age: [10, 100],
  restingHR: [30, 100],
  maxHR: [120, 230],
  lthr: [100, 210]
};

function ProfileCard({ onSaved }: { onSaved: () => void }) {
  const [p, setP] = useState<Profile | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => setP(getProfile()), []);
  if (!p) return null;

  const field = (key: keyof Profile, label: string, placeholder: string) => {
    const [min, max] = PROFILE_RANGES[key];
    return (
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
          // Keep whatever number is typed so multi-digit entry works; the
          // range is enforced on Save, not per keystroke (that silently ate
          // every partial value and made the fields feel uneditable).
          onChange={(e) => {
            const raw = e.target.value;
            const n = parseInt(raw, 10);
            setP({ ...p, [key]: raw === "" || Number.isNaN(n) ? undefined : n });
            setSaved(false);
          }}
          className="mt-1 w-full bg-ink border border-seam rounded-lg px-3 py-2 text-bone tabular-nums text-sm focus:outline-none focus:border-gold"
        />
      </label>
    );
  };

  return (
    <div className="bg-coal rounded-2xl border border-seam p-5">
      <h2 className="font-display font-bold text-xl text-bone">Your numbers</h2>
      <p className="text-[11px] text-dust mt-0.5 leading-snug">
        From your Garmin: resting HR after a week of wear, max HR from a hard effort,
        LTHR from a threshold test with the chest strap. Every field is optional —
        zones use the best data you&apos;ve got.
      </p>
      <div className="grid grid-cols-2 gap-3 mt-3">
        {field("age", "Age", "39")}
        {field("restingHR", "Resting HR", "—")}
        {field("maxHR", "Max HR", "—")}
        {field("lthr", "Threshold HR", "—")}
      </div>
      <button
        onClick={() => {
          // Clamp each field to its valid range on save; drop anything that
          // doesn't make sense rather than persisting a half-typed number.
          const clean: Profile = {};
          (Object.keys(PROFILE_RANGES) as (keyof Profile)[]).forEach((key) => {
            const v = p[key];
            const [min, max] = PROFILE_RANGES[key];
            if (typeof v === "number" && v >= min && v <= max) clean[key] = v;
          });
          setP(clean);
          saveProfile(clean);
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
