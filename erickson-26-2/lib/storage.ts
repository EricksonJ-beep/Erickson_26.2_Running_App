"use client";

import { SEED_RUNS } from "./seed";

// All data lives in localStorage on Jon's phone.
// Export/import gives a JSON safety net.

export interface RunLog {
  date: string;
  miles: number;
  minutes: number;
  rpe: number; // 1-10
  hr?: number; // avg heart rate, bpm
  notes: string;
}

export interface FuelLog {
  date: string;
  waterOz: number;
  calories: number;
  protein: number;
}

// Jon's physiology numbers — all optional. Zones sharpen as fields fill in
// (Garmin watch supplies maxHR/restingHR; chest strap unlocks LTHR).
export interface Profile {
  age?: number;
  restingHR?: number; // bpm, morning resting
  maxHR?: number; // bpm, highest seen on watch
  lthr?: number; // bpm, lactate threshold HR (Garmin estimate w/ strap)
}

const RUNS_KEY = "hr_runs_v1";
const FUEL_KEY = "hr_fuel_v1";
const DONE_KEY = "hr_done_v1"; // workout date -> true (non-run completions: XT, strength)
const PROFILE_KEY = "hr_profile_v1";
const SEEDED_KEY = "hr_seeded_v1"; // seed entries already merged (date#rev -> true)

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable — fail quietly
  }
}

export function getRuns(): Record<string, RunLog> {
  return read(RUNS_KEY, {});
}
export function saveRun(log: RunLog) {
  const all = getRuns();
  all[log.date] = log;
  write(RUNS_KEY, all);
}
export function deleteRun(date: string) {
  const all = getRuns();
  delete all[date];
  write(RUNS_KEY, all);
}

export function getFuel(): Record<string, FuelLog> {
  return read(FUEL_KEY, {});
}
export function saveFuel(log: FuelLog) {
  const all = getFuel();
  all[log.date] = log;
  write(FUEL_KEY, all);
}

export function getDone(): Record<string, boolean> {
  return read(DONE_KEY, {});
}
export function toggleDone(date: string) {
  const all = getDone();
  if (all[date]) delete all[date];
  else all[date] = true;
  write(DONE_KEY, all);
}

export function getProfile(): Profile {
  return read(PROFILE_KEY, {});
}
export function saveProfile(p: Profile) {
  write(PROFILE_KEY, p);
}

// Merge Claude-seeded runs (lib/seed.ts) into local data. Each seed entry
// applies once per rev: rev 1 only fills empty dates (phone data wins),
// rev 2+ is a chat-supplied correction and overwrites.
export function applySeed() {
  if (typeof window === "undefined") return;
  const seen = read<Record<string, boolean>>(SEEDED_KEY, {});
  const runs = getRuns();
  let runsChanged = false;
  let seenChanged = false;
  for (const { rev, ...run } of SEED_RUNS) {
    const key = `${run.date}#${rev ?? 1}`;
    if (seen[key]) continue;
    if (!runs[run.date] || (rev ?? 1) > 1) {
      runs[run.date] = run;
      runsChanged = true;
    }
    seen[key] = true;
    seenChanged = true;
  }
  if (runsChanged) write(RUNS_KEY, runs);
  if (seenChanged) write(SEEDED_KEY, seen);
}

export function exportAll(): string {
  return JSON.stringify(
    {
      runs: getRuns(),
      fuel: getFuel(),
      done: getDone(),
      profile: getProfile(),
      seeded: read(SEEDED_KEY, {})
    },
    null,
    2
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function importAll(json: string): boolean {
  try {
    const data = JSON.parse(json);
    if (!isRecord(data)) return false;
    if (!isRecord(data.runs) && !isRecord(data.fuel) && !isRecord(data.done)) return false;
    if (isRecord(data.runs)) write(RUNS_KEY, data.runs);
    if (isRecord(data.fuel)) write(FUEL_KEY, data.fuel);
    if (isRecord(data.done)) write(DONE_KEY, data.done);
    if (isRecord(data.profile)) write(PROFILE_KEY, data.profile);
    if (isRecord(data.seeded)) write(SEEDED_KEY, data.seeded);
    return true;
  } catch {
    return false;
  }
}

export function paceOf(miles: number, minutes: number): string {
  if (!miles || !minutes) return "—";
  const p = minutes / miles;
  const m = Math.floor(p);
  const s = Math.round((p - m) * 60);
  return `${m}:${String(s).padStart(2, "0")} /mi`;
}
