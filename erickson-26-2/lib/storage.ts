"use client";

import type { WorkoutType } from "./plan";
import { SEED_BODY, SEED_RUNS } from "./seed";

// All data lives in localStorage on Jon's phone.
// Export/import gives a JSON safety net.

// GPS breadcrumb from Run Mode. t = seconds since run start.
export interface RoutePoint {
  lat: number;
  lng: number;
  t: number;
}

// Heart Rate Recovery test — captured right after a run ends (Run Mode only,
// and only when the strap was streaming). HRR = how fast HR drops post-stop; a
// fitter/less-taxed heart downshifts faster. Drops are bpm below the end-of-run
// HR at each checkpoint. See lib/recovery.ts for the HRR1 interpretation bands.
export type HRR1Label = "excellent" | "good" | "fair" | "poor";

export interface RecoveryTest {
  endHR: number; // rolling-avg HR at the moment STOP was pressed
  hrr1: number | null; // bpm drop at 1:00 (null if the checkpoint was missed)
  hrr2: number | null; // bpm drop at 2:00
  hrr1Label: HRR1Label | null; // score band for HRR1
  incomplete: boolean; // strap dropped / test ended before both checkpoints
  lowConfidence: boolean; // a captured reading was noisy (wide spread)
  completedAt: string; // ISO timestamp
  runType?: WorkoutType; // auto-tagged from the workout, for trend filtering
}

export interface RunLog {
  // Storage key. Absent on legacy/seeded/primary runs — those key by bare `date`
  // (one-per-day, back-compat). Additional same-day runs get `date#2`, `date#3`…
  // so a second run never overwrites the first. Effective key = `id ?? date`.
  id?: string;
  date: string;
  miles: number;
  minutes: number;
  rpe: number; // 1-10
  hr?: number; // avg heart rate, bpm
  notes: string;
  route?: RoutePoint[]; // Run Mode GPS trace, downsampled
  splits?: number[]; // per-mile seconds, Run Mode
  recoveryTest?: RecoveryTest; // Run Mode HRR test, if run + saved
}

// Jon's physiology numbers — all optional. Zones sharpen as fields fill in
// (Garmin watch supplies maxHR/restingHR; chest strap unlocks LTHR).
export interface Profile {
  age?: number;
  restingHR?: number; // bpm, morning resting
  maxHR?: number; // bpm, highest seen on watch
  lthr?: number; // bpm, lactate threshold HR (Garmin estimate w/ strap)
}

// Scale readings (Renpho bioimpedance) — Jon screenshots them in chat,
// Claude seeds them. Trend matters more than any single reading.
export interface BodyLog {
  date: string;
  weight: number; // lb
  bmi?: number;
  bodyFat?: number; // %
  muscleMass?: number; // lb
  visceralFat?: number; // index
  bmr?: number; // kcal
}

// Daily pushup/situp counts — the goal is 100 of each, every day.
export interface CalisLog {
  pushups: number;
  situps: number;
}

export const CALIS_GOAL = 100;

const RUNS_KEY = "hr_runs_v1";
const CALIS_KEY = "hr_calis_v1";
const RECOVERY_KEY = "hr_recovery_v1"; // standalone HRR tests (Progress), not tied to a run
const DONE_KEY = "hr_done_v1"; // workout date -> true (non-run completions: XT, strength)
const PROFILE_KEY = "hr_profile_v1";
const BODY_KEY = "hr_body_v1";
const SEEDED_KEY = "hr_seeded_v1"; // seed entries already merged (date#rev -> true)

const EXPORT_KEY = "hr_lastExport_v1"; // ISO timestamp of the last JSON export

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

// Returns whether the write actually landed. localStorage can throw (quota
// exceeded, private-mode quirks) — callers that persist irreplaceable data
// (a finished run) MUST check this instead of assuming success.
function write(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    if (key === RUNS_KEY) runsCache = value as Record<string, RunLog>;
    return true;
  } catch {
    if (key === RUNS_KEY) runsCache = null; // drop the (now inconsistent) cache
    return false;
  }
}

// getRuns() is called several times per render across views; parsing the whole
// store each time gets costly as GPS route blobs pile up. Cache the parsed map
// and invalidate on any write to RUNS_KEY (handled in write()).
let runsCache: Record<string, RunLog> | null = null;

export function getRuns(): Record<string, RunLog> {
  if (runsCache) return runsCache;
  runsCache = read(RUNS_KEY, {});
  return runsCache;
}

// Every run recorded on a given date. The store keys the day's primary run by
// bare date and extras by `date#2`/`#3`, so a plain `runs[date]` lookup misses
// the extras — use this for "did anything happen on this date" and per-day lists.
export function runsOn(date: string): RunLog[] {
  return Object.values(getRuns()).filter((r) => r.date === date);
}

// The effective storage key for a run: its explicit id, else its date (legacy).
export function runKey(log: RunLog): string {
  return log.id ?? log.date;
}

// Next free key for a run on `date`: the bare date if untaken (stays the
// "primary" run of the day), otherwise `date#2`, `date#3`, … Skips a specific
// key when re-keying an edit so a run never collides with itself.
export function nextRunId(date: string, skip?: string): string {
  const all = getRuns();
  if ((!all[date] || date === skip)) return date;
  for (let n = 2; ; n++) {
    const key = `${date}#${n}`;
    if (!all[key] || key === skip) return key;
  }
}

// Returns false if the write failed (storage full/unavailable) — the caller
// still holds the run and must not report success or discard it.
export function saveRun(log: RunLog): boolean {
  const all = { ...getRuns(), [runKey(log)]: log };
  return write(RUNS_KEY, all);
}

// Save a brand-new run, always in a free slot so it can never overwrite an
// existing same-day run. Returns the stored run, or null if the write failed.
export function addRun(log: RunLog): RunLog | null {
  const id = nextRunId(log.date);
  const stored: RunLog = { ...log, id };
  return saveRun(stored) ? stored : null;
}

export function deleteRun(key: string) {
  const all = { ...getRuns() };
  delete all[key];
  write(RUNS_KEY, all);
}

// Standalone HRR tests run from the Progress tab (no run to attach to).
// Run-attached recovery tests still live on their RunLog; the trend card merges both.
export function getRecoveryTests(): RecoveryTest[] {
  return read(RECOVERY_KEY, []);
}
export function saveRecoveryTest(t: RecoveryTest) {
  const all = getRecoveryTests();
  all.push(t);
  write(RECOVERY_KEY, all);
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

export function getBody(): Record<string, BodyLog> {
  return read(BODY_KEY, {});
}

export function getCalis(): Record<string, CalisLog> {
  return read(CALIS_KEY, {});
}
export function addCalis(date: string, kind: keyof CalisLog, delta: number) {
  const all = getCalis();
  const day = all[date] ?? { pushups: 0, situps: 0 };
  day[kind] = Math.max(0, day[kind] + delta);
  all[date] = day;
  write(CALIS_KEY, all);
}

// Merge Claude-seeded data (lib/seed.ts) into local storage. Each seed entry
// applies once per rev: rev 1 only fills empty dates (phone data wins),
// rev 2+ is a chat-supplied correction and overwrites.
export function applySeed() {
  if (typeof window === "undefined") return;
  const seen = read<Record<string, boolean>>(SEEDED_KEY, {});
  let seenChanged = false;

  // Run seed keys predate body seeds and stay unprefixed for back-compat.
  const merge = <T extends { date: string }>(
    storageKey: string,
    items: (T & { rev?: number })[],
    prefix: string
  ) => {
    const all = read<Record<string, T>>(storageKey, {});
    let changed = false;
    for (const { rev, ...item } of items) {
      const key = `${prefix}${item.date}#${rev ?? 1}`;
      if (seen[key]) continue;
      if (!all[item.date] || (rev ?? 1) > 1) {
        // Spread-merge so a rev 2+ correction (e.g. a chat-supplied time fix)
        // keeps any phone-captured extras — route/splits/HRR — it didn't include.
        all[item.date] = { ...all[item.date], ...item } as T;
        changed = true;
      }
      seen[key] = true;
      seenChanged = true;
    }
    if (changed) write(storageKey, all);
  };

  merge(RUNS_KEY, SEED_RUNS, "");
  merge(BODY_KEY, SEED_BODY, "body:");
  if (seenChanged) write(SEEDED_KEY, seen);
}

export function exportAll(): string {
  const json = JSON.stringify(
    {
      runs: getRuns(),
      recovery: getRecoveryTests(),
      done: getDone(),
      profile: getProfile(),
      body: getBody(),
      calis: getCalis(),
      seeded: read(SEEDED_KEY, {})
    },
    null,
    2
  );
  write(EXPORT_KEY, new Date().toISOString()); // stamp the backup so we can nudge on staleness
  return json;
}

// ISO timestamp of the last export, or null if never backed up. Progress uses
// this to warn when the only recovery path for this backend-less app is stale.
export function getLastExport(): string | null {
  return read<string | null>(EXPORT_KEY, null);
}

// Persistent storage: ask the browser not to evict our localStorage under
// pressure. Installed PWAs are auto-granted on Android (no prompt). Best-effort.
export async function requestPersistence(): Promise<void> {
  try {
    if (typeof navigator === "undefined") return;
    const s = navigator.storage;
    if (s?.persist && s.persisted && !(await s.persisted())) await s.persist();
  } catch {
    // storage manager unavailable — ignore
  }
}

// Rough localStorage footprint, for the Backup card. Best-effort; returns null
// where the Storage Manager API is missing (e.g. older Safari).
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    if (usage == null || quota == null) return null;
    return { usage, quota };
  } catch {
    return null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function importAll(json: string): boolean {
  try {
    const data = JSON.parse(json);
    if (!isRecord(data)) return false;
    if (!isRecord(data.runs) && !isRecord(data.done)) return false;
    if (isRecord(data.runs)) write(RUNS_KEY, data.runs);
    if (Array.isArray(data.recovery)) write(RECOVERY_KEY, data.recovery);
    if (isRecord(data.done)) write(DONE_KEY, data.done);
    if (isRecord(data.profile)) write(PROFILE_KEY, data.profile);
    if (isRecord(data.body)) write(BODY_KEY, data.body);
    if (isRecord(data.calis)) write(CALIS_KEY, data.calis);
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
