"use client";

import { useEffect, useState } from "react";
import { todayISO, workoutOn } from "@/lib/plan";
import { TYPE_EFFORT } from "@/lib/guide";
import { addRun, deleteRun, getRuns, paceOf, runKey, RunLog, saveRun } from "@/lib/storage";
import RouteMap from "./RouteMap";

export default function LogView() {
  const [date, setDate] = useState("");
  const [miles, setMiles] = useState("");
  const [minutes, setMinutes] = useState("");
  const [rpe, setRpe] = useState(5);
  const [hr, setHr] = useState("");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null); // storage key of run being edited; null = new run
  const [showAll, setShowAll] = useState(false);
  const [openMap, setOpenMap] = useState<string | null>(null); // run key whose route is expanded
  const [, force] = useState(0);
  const editMode = editKey !== null;

  useEffect(() => {
    const t = todayISO();
    setDate(t);
    const planned = workoutOn(t);
    if (planned && planned.miles > 0) setMiles(String(planned.miles));
  }, []);

  if (!date) return null;

  const runs = getRuns();
  const plannedToday = workoutOn(date);
  const targetEffort = plannedToday ? TYPE_EFFORT[plannedToday.type] : undefined;
  const history = Object.values(runs).sort((a, b) => (a.date < b.date ? 1 : -1));
  const displayHistory = showAll ? history : history.slice(0, 7);

  function clearForm() {
    setMinutes("");
    setRpe(5);
    setHr("");
    setNotes("");
  }

  function loadRun(r: RunLog, scroll = true) {
    setDate(r.date);
    setMiles(String(r.miles));
    setMinutes(r.minutes > 0 ? String(r.minutes) : "");
    setRpe(r.rpe);
    setHr(r.hr ? String(r.hr) : "");
    setNotes(r.notes);
    setEditKey(runKey(r));
    if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Picking a date that already has a run switches to editing it,
  // so saving never silently overwrites an old entry.
  function changeDate(d: string) {
    setDate(d);
    if (!d) return;
    const existing = getRuns()[d];
    if (existing) {
      loadRun(existing, false);
      return;
    }
    if (editMode) {
      clearForm();
      setEditKey(null);
    }
    const planned = workoutOn(d);
    setMiles(planned?.miles ? String(planned.miles) : "");
  }

  // Start a fresh, blank entry for the CURRENT date without loading the
  // existing run — so a second same-day run is added, never an overwrite.
  function addAnother() {
    setEditKey(null);
    clearForm();
    const planned = workoutOn(date);
    setMiles(planned?.miles ? String(planned.miles) : "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    const t = todayISO();
    setDate(t);
    const planned = workoutOn(t);
    setMiles(planned?.miles ? String(planned.miles) : "");
    clearForm();
    setEditKey(null);
  }

  function submit() {
    const m = parseFloat(miles);
    const t = parseFloat(minutes);
    if (!date || !m || m <= 0) return;
    const h = parseInt(hr);
    const fields = {
      date,
      miles: m,
      minutes: t || 0,
      rpe,
      hr: h > 0 ? h : undefined,
      notes: notes.trim()
    };
    if (editKey) {
      // Preserve Run-Mode extras (route/splits/recoveryTest) not shown in the form.
      const existing = getRuns()[editKey];
      saveRun({ ...existing, ...fields, id: editKey });
    } else {
      addRun(fields); // always a free slot — never overwrites a same-day run
    }
    setSaved(true);
    clearForm();
    setEditKey(null);
    const planned = workoutOn(date);
    setMiles(planned?.miles ? String(planned.miles) : "");
    force((n) => n + 1);
    setTimeout(() => setSaved(false), 2000);
  }

  const hasRunOnDate = !!runs[date];

  const livePace = paceOf(parseFloat(miles) || 0, parseFloat(minutes) || 0);

  return (
    <div className="space-y-4">
      <div className="bg-coal rounded-2xl border border-seam p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display font-bold text-2xl text-bone">
            {editMode ? "Edit run" : hasRunOnDate ? "Add another run" : "Log a run"}
          </h2>
          {editMode && (
            <button
              onClick={cancelEdit}
              className="text-xs text-dust border border-seam rounded px-2 py-1"
            >
              Cancel
            </button>
          )}
        </div>
        {!editMode && hasRunOnDate && (
          <p className="text-[11px] text-dust mt-1 leading-snug">
            A run is already logged for this day — saving adds a second run, it won’t
            overwrite. Use <span className="text-bone">Edit</span> below to change an existing one.
          </p>
        )}

        <label className="block mt-4">
          <span className="text-[11px] uppercase tracking-widest text-dust font-display font-semibold">
            Date
          </span>
          <input
            type="date"
            value={date}
            onChange={(e) => changeDate(e.target.value)}
            className="mt-1 w-full bg-ink border border-seam rounded-lg px-3 py-2.5 text-bone"
          />
        </label>

        <div className="grid grid-cols-2 gap-3 mt-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-widest text-dust font-display font-semibold">
              Miles
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              placeholder="0.0"
              value={miles}
              onChange={(e) => setMiles(e.target.value)}
              className="mt-1 w-full bg-ink border border-seam rounded-lg px-3 py-2.5 text-bone text-lg font-display font-semibold"
            />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-widest text-dust font-display font-semibold">
              Minutes
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="1"
              min="0"
              placeholder="0"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="mt-1 w-full bg-ink border border-seam rounded-lg px-3 py-2.5 text-bone text-lg font-display font-semibold"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="flex flex-col justify-center bg-ink rounded-lg px-3 py-2 border border-seam">
            <span className="text-[11px] uppercase tracking-widest text-dust font-display font-semibold">
              Pace
            </span>
            <span className="font-display font-bold text-lg text-gold tabular-nums">
              {livePace}
            </span>
          </div>
          <label className="block">
            <span className="text-[11px] uppercase tracking-widest text-dust font-display font-semibold">
              Avg HR
            </span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max="220"
              placeholder="bpm"
              value={hr}
              onChange={(e) => setHr(e.target.value)}
              className="mt-1 w-full bg-ink border border-seam rounded-lg px-3 py-2.5 text-bone text-lg font-display font-semibold"
            />
          </label>
        </div>

        <label className="block mt-4">
          <div className="flex justify-between items-baseline">
            <span className="text-[11px] uppercase tracking-widest text-dust font-display font-semibold">
              Effort (RPE)
              {targetEffort && (
                <span className="normal-case tracking-normal font-body font-normal"> · target {targetEffort}</span>
              )}
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
          <div className="flex justify-between text-[10px] text-dust">
            <span>easy chat</span>
            <span>race effort</span>
          </div>
        </label>

        <label className="block mt-3">
          <span className="text-[11px] uppercase tracking-widest text-dust font-display font-semibold">
            Notes
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Legs, weather, shoes, anything worth remembering…"
            className="mt-1 w-full bg-ink border border-seam rounded-lg px-3 py-2.5 text-bone text-sm"
          />
        </label>

        <button
          onClick={submit}
          className="mt-4 w-full bg-gold text-ink font-display font-bold tracking-widest uppercase rounded-lg py-3 text-sm"
        >
          {saved ? "Saved ✓" : editMode ? "Update run" : hasRunOnDate ? "Add run" : "Save run"}
        </button>
        {editMode && (
          <button
            onClick={addAnother}
            className="mt-2 w-full border border-seam text-dust font-display font-semibold tracking-widest uppercase rounded-lg py-2.5 text-xs"
          >
            + Add another run this day
          </button>
        )}
      </div>

      {history.length > 0 && (
        <div className="bg-coal rounded-2xl border border-seam p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="font-display font-semibold text-lg text-bone">Run history</h3>
            <span className="text-[11px] text-dust">{history.length} runs</span>
          </div>
          <div className="space-y-2">
            {displayHistory.map((r) => {
              const key = runKey(r);
              const hasRoute = !!r.route && r.route.length > 1;
              const mapOpen = openMap === key;
              return (
                <div key={key} className="bg-ink rounded-lg px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-bone">
                        {fmt(r.date)} ·{" "}
                        <span className="font-display font-semibold text-gold">{r.miles} mi</span>
                        {r.minutes > 0 && (
                          <span className="text-dust"> · {paceOf(r.miles, r.minutes)}</span>
                        )}
                        <span className="text-dust"> · RPE {r.rpe}</span>
                        {r.hr ? <span className="text-dust"> · {r.hr} bpm</span> : null}
                      </div>
                      {r.notes && (
                        <div className="text-[11px] text-dust truncate mt-0.5">{r.notes}</div>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {hasRoute && (
                        <button
                          onClick={() => setOpenMap(mapOpen ? null : key)}
                          aria-expanded={mapOpen}
                          className={`text-xs px-2 py-1 border rounded ${
                            mapOpen ? "text-gold border-gold/40" : "text-dust border-seam"
                          }`}
                        >
                          {mapOpen ? "Hide" : "Map"}
                        </button>
                      )}
                      <button
                        onClick={() => loadRun(r)}
                        className="text-dust text-xs px-2 py-1 border border-seam rounded"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => { deleteRun(key); force((n) => n + 1); }}
                        className="text-ember/70 text-xs px-2 py-1 border border-ember/30 rounded"
                      >
                        Del
                      </button>
                    </div>
                  </div>
                  {hasRoute && mapOpen && (
                    <div className="mt-2.5">
                      <RouteMap route={r.route} className="rounded-lg" height={170} />
                      {r.splits && r.splits.length > 0 && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                          {r.splits.map((s, i) => (
                            <span key={i} className="text-[11px] text-dust tabular-nums">
                              <span className="text-bone/70">Mi {i + 1}</span> {fmtSplit(s)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {history.length > 7 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="mt-3 w-full py-2 text-xs text-dust border border-seam rounded-lg"
            >
              {showAll ? "Show less" : `See all ${history.length} runs`}
            </button>
          )}
        </div>
      )}
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

function fmtSplit(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
