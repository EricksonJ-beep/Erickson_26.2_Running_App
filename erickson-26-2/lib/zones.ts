// ─────────────────────────────────────────────────────────────
// HR ZONE ENGINE — computes Jon's personal zones from whatever
// data the profile has, best method first:
//   1. LTHR known        → Friel %LTHR zones (gold standard for training)
//   2. max + resting HR  → Karvonen heart-rate-reserve zones
//   3. max HR only       → %max zones (Tanaka age estimate as last resort)
// Zones drive the target windows shown on each workout.
// ─────────────────────────────────────────────────────────────

import type { Profile } from "./storage";

export interface Zone {
  z: string;
  name: string;
  lo: number; // bpm
  hi: number; // bpm
  use: string;
}

export const DEFAULT_AGE = 39;

// Tanaka, Monahan & Seals (2001): 208 − 0.7 × age.
// Beats the old 220 − age, but a real watch max beats both.
export function estMaxHR(age: number): number {
  return Math.round(208 - 0.7 * age);
}

export type ZoneMethod = "lthr" | "hrr" | "max";

export function zoneMethod(p: Profile): ZoneMethod {
  if (p.lthr) return "lthr";
  if (p.maxHR && p.restingHR) return "hrr";
  return "max";
}

export function methodLabel(p: Profile): string {
  const m = zoneMethod(p);
  if (m === "lthr")
    return `Built from your lactate threshold (${p.lthr} bpm) — the most accurate basis there is.`;
  if (m === "hrr")
    return `Built from max ${p.maxHR} + resting ${p.restingHR} bpm (Karvonen heart-rate reserve).`;
  if (p.maxHR)
    return `Built from max ${p.maxHR} bpm. Add your resting HR below for sharper zones.`;
  const age = p.age ?? DEFAULT_AGE;
  return `Est. max ${estMaxHR(age)} bpm (age ${age}, Tanaka). Enter your watch's numbers below to personalize.`;
}

const META = [
  { z: "Z1", name: "Recovery", use: "Walks, recovery jogs" },
  { z: "Z2", name: "Easy / Aerobic", use: "Easy + long runs — 80% of all miles" },
  { z: "Z3", name: "Steady", use: "Marathon-pace work" },
  { z: "Z4", name: "Threshold", use: "Tempo runs (lactate threshold)" },
  { z: "Z5", name: "VO₂", use: "Interval reps" }
];

export function computeZones(p: Profile): Zone[] {
  let bands: [number, number][];
  let scale: (f: number) => number;

  const m = zoneMethod(p);
  if (m === "lthr") {
    // Friel running zones as % of LTHR
    const t = p.lthr!;
    bands = [[0.7, 0.84], [0.85, 0.89], [0.9, 0.94], [0.95, 1.0], [1.0, 1.06]];
    scale = (f) => Math.round(t * f);
  } else if (m === "hrr") {
    // Karvonen: zone % applies to (max − resting), then resting added back
    const rest = p.restingHR!;
    const hrr = p.maxHR! - rest;
    bands = [[0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 1.0]];
    scale = (f) => Math.round(rest + hrr * f);
  } else {
    const max = p.maxHR ?? estMaxHR(p.age ?? DEFAULT_AGE);
    bands = [[0.5, 0.6], [0.6, 0.75], [0.75, 0.82], [0.82, 0.9], [0.9, 0.98]];
    scale = (f) => Math.round(max * f);
  }

  return META.map((meta, i) => ({
    ...meta,
    lo: scale(bands[i][0]),
    hi: scale(bands[i][1])
  }));
}

export interface HRGuide {
  target: string;
  note: string;
}

// Target windows + coaching notes per workout type, derived from live zones.
export function hrGuide(p: Profile): Record<string, HRGuide> {
  const [, z2, z3, z4, z5] = computeZones(p);
  const drift = z2.hi + 4;
  return {
    easy: {
      target: `${z2.lo}–${z2.hi} bpm (Z2)`,
      note: `If HR climbs past ${z2.hi}, walk 30 sec. Pace ego aside — the zone is the workout.`
    },
    long: {
      target: `${z2.lo}–${drift} bpm (Z2)`,
      note: `Stay Z2. Late-run drift to ~${drift} in heat is normal; above that, ease off.`
    },
    tempo: {
      target: `${z4.lo}–${z4.hi} bpm (Z4)`,
      note: "Settle into Z4 by the second tempo mile. HR lags effort by a minute."
    },
    intervals: {
      target: `${z5.lo}–${z5.hi} bpm (Z5)`,
      note: "Run reps by effort/pace — HR lags too much on short reps. Check it on recoveries."
    },
    halfRace: {
      target: `${z4.lo + 2}–${z4.hi + 2} bpm`,
      note: "Expect Z4 most of the race, Z5 in the final miles."
    },
    marathon: {
      target: `${z3.lo}–${z3.hi} bpm (Z3)`,
      note: `Discipline zone. The ${z3.hi} bpm cap for 20 miles is what makes the last 10K possible.`
    }
  };
}
