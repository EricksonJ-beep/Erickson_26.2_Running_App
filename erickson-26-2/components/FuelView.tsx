"use client";

import { useEffect, useState } from "react";
import { todayISO } from "@/lib/plan";
import { FuelLog, getFuel, saveFuel } from "@/lib/storage";

const TARGETS = { waterOz: 110, calories: 2450, protein: 180 };

export default function FuelView() {
  const [date, setDate] = useState("");
  const [water, setWater] = useState(0);
  const [cal, setCal] = useState(0);
  const [pro, setPro] = useState(0);
  const [calIn, setCalIn] = useState("");
  const [proIn, setProIn] = useState("");

  useEffect(() => {
    const t = todayISO();
    setDate(t);
    const f = getFuel()[t];
    if (f) {
      setWater(f.waterOz);
      setCal(f.calories);
      setPro(f.protein);
    }
  }, []);

  if (!date) return null;

  function persist(w: number, c: number, p: number) {
    setWater(w);
    setCal(c);
    setPro(p);
    saveFuel({ date, waterOz: w, calories: c, protein: p });
  }

  // Last 7 days of fuel logs (today + previous 6)
  const allFuel = getFuel();
  const fuelHistory: FuelLog[] = Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(date + "T12:00:00");
    dt.setDate(dt.getDate() - i);
    const d = dt.toISOString().slice(0, 10);
    return allFuel[d] ?? null;
  }).filter((f): f is FuelLog => f !== null);

  return (
    <div className="space-y-4">
      <Meter
        label="Water"
        value={water}
        target={TARGETS.waterOz}
        unit="oz"
        note="Add ~16 oz per hour of running on top of the daily target."
      >
        <div className="grid grid-cols-4 gap-2 mt-3">
          {[8, 16, 24].map((n) => (
            <button
              key={n}
              onClick={() => persist(water + n, cal, pro)}
              className="bg-ink border border-seam rounded-lg py-2.5 text-bone font-display font-semibold text-sm"
            >
              +{n} oz
            </button>
          ))}
          <button
            onClick={() => persist(0, cal, pro)}
            className="bg-ink border border-seam rounded-lg py-2.5 text-dust text-xs"
          >
            Reset
          </button>
        </div>
      </Meter>

      <Meter
        label="Calories"
        value={cal}
        target={TARGETS.calories}
        unit="cal"
        note="2,400–2,500/day. On long-run days the upper end is your friend."
      >
        <AddRow
          value={calIn}
          setValue={setCalIn}
          placeholder="Add calories"
          onAdd={(n) => persist(water, cal + n, pro)}
          onReset={() => persist(water, 0, pro)}
        />
      </Meter>

      <Meter
        label="Protein"
        value={pro}
        target={TARGETS.protein}
        unit="g"
        note="170–190 g/day protects muscle while mileage climbs."
      >
        <AddRow
          value={proIn}
          setValue={setProIn}
          placeholder="Add grams"
          onAdd={(n) => persist(water, cal, pro + n)}
          onReset={() => persist(water, cal, 0)}
        />
      </Meter>

      {/* 7-day history */}
      {fuelHistory.length > 0 && (
        <div className="bg-coal rounded-2xl border border-seam p-5">
          <h2 className="font-display font-bold text-xl text-bone">Recent days</h2>
          <p className="text-[11px] text-dust mt-0.5">
            Green = target met · dust = under
          </p>
          <div className="mt-3 space-y-1.5">
            {fuelHistory.map((f) => (
              <div
                key={f.date}
                className="bg-ink rounded-lg px-3 py-2.5 flex items-center gap-3"
              >
                <span className="text-xs text-dust w-20 shrink-0">{fmtDay(f.date, date)}</span>
                <div className="flex flex-1 gap-3 justify-between">
                  <span
                    className={`text-xs tabular-nums ${
                      f.waterOz >= TARGETS.waterOz ? "text-sage" : "text-dust"
                    }`}
                  >
                    {f.waterOz} oz
                  </span>
                  <span
                    className={`text-xs tabular-nums ${
                      f.calories >= TARGETS.calories ? "text-sage" : "text-dust"
                    }`}
                  >
                    {f.calories.toLocaleString()} cal
                  </span>
                  <span
                    className={`text-xs tabular-nums ${
                      f.protein >= TARGETS.protein ? "text-sage" : "text-dust"
                    }`}
                  >
                    {f.protein} g pro
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Race fueling rules */}
      <div className="bg-coal rounded-xl border border-seam px-4 py-3">
        <div className="text-[11px] uppercase tracking-widest text-dust font-display font-semibold">
          Race fueling rules
        </div>
        <ul className="text-xs text-bone/85 mt-2 space-y-1.5 leading-relaxed">
          <li>• Runs over 75 min: 30–60 g carbs per hour (gel/chews every 40–45 min).</li>
          <li>• Never debut new fuel on race day — every gel gets tested on a long run first.</li>
          <li>• Carb-load the 2 days before each race; taper fiber the final 24 hours.</li>
        </ul>
      </div>
    </div>
  );
}

function Meter({
  label,
  value,
  target,
  unit,
  note,
  children
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
  note: string;
  children: React.ReactNode;
}) {
  const pct = Math.min(100, (value / target) * 100);
  const hit = value >= target;
  return (
    <div className="bg-coal rounded-2xl border border-seam p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display font-bold text-xl text-bone">{label}</h2>
        <div
          className={`font-display font-bold text-2xl tabular-nums ${
            hit ? "text-sage" : "text-gold"
          }`}
        >
          {value.toLocaleString()}{" "}
          <span className="text-dust text-sm font-semibold">
            / {target.toLocaleString()} {unit}
          </span>
        </div>
      </div>
      <div className="mt-2.5 h-2.5 bg-ink rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${hit ? "bg-sage" : "bg-gold"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-dust mt-2">{note}</p>
      {children}
    </div>
  );
}

function AddRow({
  value,
  setValue,
  placeholder,
  onAdd,
  onReset
}: {
  value: string;
  setValue: (s: string) => void;
  placeholder: string;
  onAdd: (n: number) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex gap-2 mt-3">
      <input
        type="number"
        inputMode="numeric"
        min="0"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="flex-1 bg-ink border border-seam rounded-lg px-3 py-2.5 text-bone font-display font-semibold"
      />
      <button
        onClick={() => {
          const n = parseInt(value);
          if (n > 0) {
            onAdd(n);
            setValue("");
          }
        }}
        className="bg-gold text-ink font-display font-bold uppercase tracking-wider rounded-lg px-5 text-sm"
      >
        Add
      </button>
      <button
        onClick={onReset}
        className="bg-ink border border-seam rounded-lg px-3 text-dust text-xs"
      >
        Reset
      </button>
    </div>
  );
}

function fmtDay(iso: string, today: string): string {
  if (iso === today) return "Today";
  const dt = new Date(iso + "T12:00:00");
  const todayDt = new Date(today + "T12:00:00");
  const diff = Math.round((todayDt.getTime() - dt.getTime()) / 86400000);
  if (diff === 1) return "Yesterday";
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
}
