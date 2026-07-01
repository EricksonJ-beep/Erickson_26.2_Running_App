// Heart Rate Recovery (HRR) interpretation — the scoring layer for RecoveryTest
// (see lib/storage.ts). "HRR1" = bpm the heart rate drops in the first minute
// after stopping; the standard, most-cited checkpoint. Named `recovery` (not
// `hrr`) to avoid colliding with `hrr` = heart-rate *reserve* (Karvonen) in
// lib/zones.ts.
//
// Bands below are common fitness-context references, NOT a clinical tool. The
// sub-12 flag is used in some research as an autonomic-recovery warning — worth
// a soft "more easy days" nudge, never framed as medical advice.

import type { HRR1Label } from "./storage";

export interface HRRBand {
  label: HRR1Label;
  name: string; // display name
  min: number; // inclusive lower bound of the bpm drop
  text: string; // Tailwind text color (static — not interpolated, so it ships)
  bar: string; // Tailwind bg color for chart bars
}

// Ordered high → low so classify() can return the first band the drop clears.
export const HRR1_BANDS: HRRBand[] = [
  { label: "excellent", name: "Excellent", min: 30, text: "text-sage", bar: "bg-sage" },
  { label: "good", name: "Good", min: 21, text: "text-gold", bar: "bg-gold" },
  { label: "fair", name: "Fair", min: 12, text: "text-goldDim", bar: "bg-goldDim" },
  { label: "poor", name: "Poor", min: -Infinity, text: "text-ember", bar: "bg-ember" }
];

// Sub-12 HRR1 → soft recovery nudge (not a diagnosis).
export const HRR1_LOW_FLAG = 12;

export function classifyHRR1(drop: number): HRR1Label {
  for (const b of HRR1_BANDS) if (drop >= b.min) return b.label;
  return "poor";
}

export function hrr1BandInfo(label: HRR1Label): HRRBand {
  return HRR1_BANDS.find((b) => b.label === label) ?? HRR1_BANDS[HRR1_BANDS.length - 1];
}
