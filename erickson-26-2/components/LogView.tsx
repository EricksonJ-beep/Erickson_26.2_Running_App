"use client";

import { useEffect, useState } from "react";
import { todayISO, workoutOn } from "@/lib/plan";
import { deleteRun, getRuns, paceOf, RunLog, saveRun } from "@/lib/storage";

export default function LogView() {
  const [date, setDate] = useState("");
  const [miles, setMiles] = useState("");
  const [minutes, setMinutes] = useState("");
  const [rpe, setRpe] = useState(5);
  const [hr, setHr] = useState("");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [, force] = useState(0);

  useEffect(() => {
    const t = todayISO();
    setDate(t);
    const planned = workoutOn(t);
    if (planned && planned.miles > 0) setMiles(String(planned.miles));
  }, []);

  if (!date) return null;

  const runs = getRuns();
  const history = Object.values(runs).sort((a, b) => (a.date < b.date ? 1 : -1));
  const displayHistory = showAll ? history : history.slice(0, 7);

  function loadRun(r: RunLog, scroll = true) {
    setDate(r.date);
    setMiles(String(r.miles));
    setMinutes(r.minutes > 0 ? String(r.minutes) : "");
    setRpe(r.rpe);
    setHr(r.hr ? String(r.hr) : "");
    setNotes(r.notes);
    setEditMode(true);
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
      setMinutes("");
      setRpe(5);
      setHr("");
      setNotes("");
      setEditMode(false);
    }
    const planned = workoutOn(d);
    setMiles(planned?.miles ? String(planned.miles) : "");
  }

  function cancelEdit() {
    const t = todayISO();
    setDate(t);
    const planned = workoutOn(t);
    setMiles(planned?.miles ? String(planned.miles) : "");
    setMinutes("");
    setRpe(5);
    setHr("");
    setNotes("");
    setEditMode(false);
  }

  function submit() {
    const m = parseFloat(miles);
    const t = parseFloat(minutes);
    if (!date || !m || m <= 0) return;
    const h = parseInt(hr);
    saveRun({
      date,
      miles: m,
      minutes: t || 0,
      rpe,
      hr: h > 0 ? h : undefined,
      notes: notes.trim()
    });
    setSaved(true);
    setNotes("");
    setEditMode(false);
    force((n) => n + 1);
    setTimeout(() => setSaved(false), 2000);
  }

  const livePace = paceOf(parseFloat(miles) || 0, parseFloat(minutes) || 0);

  return (
    <div className="space-y-4">
      <div className="bg-coal rounded-2xl border border-seam p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display font-bold text-2xl text-bone">
            {editMode ? "Edit run" : "Log a run"}
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
          {saved ? "Saved ✓" : editMode ? "Update run" : "Save run"}
        </button>
      </div>

      {history.length > 0 && (
        <div className="bg-coal rounded-2xl border border-seam p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="font-display font-semibold text-lg text-bone">Run history</h3>
            <span className="text-[11px] text-dust">{history.length} runs</span>
          </div>
          <div className="space-y-2">
            {displayHistory.map((r) => (
              <div key={r.date} className="bg-ink rounded-lg px-3 py-2.5">
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
                    <button
                      onClick={() => loadRun(r)}
                      className="text-dust text-xs px-2 py-1 border border-seam rounded"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => { deleteRun(r.date); force((n) => n + 1); }}
                      className="text-ember/70 text-xs px-2 py-1 border border-ember/30 rounded"
                    >
                      Del
                    </button>
                  </div>
                </div>
              </div>
            ))}
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
