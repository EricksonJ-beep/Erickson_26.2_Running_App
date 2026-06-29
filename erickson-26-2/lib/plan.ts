// ─────────────────────────────────────────────────────────────
// HORNET RUNNER — 18-week dual-race plan
// Half Marathon: Chippewa Falls, Sat Aug 8 2026 (goal: sub-2:00 — race 9:00/mi, 9:09 redline)
// Marathon:      Ashland,        Sat Oct 10 2026 (goal: finish strong)
// Built on 80/20 intensity distribution, the 10% mileage rule,
// weekly lactate-threshold work, and research-backed taper windows.
// ─────────────────────────────────────────────────────────────

export type WorkoutType =
  | "rest"
  | "easy"
  | "tempo"
  | "intervals"
  | "long"
  | "xt"
  | "strength"
  | "race"
  | "walk";

export interface Workout {
  date: string; // YYYY-MM-DD
  type: WorkoutType;
  title: string;
  detail: string;
  miles: number; // planned run miles (0 for non-running)
  optional?: boolean;
  note?: string; // personal route/goal note (e.g. "Run around Big Lake")
}

export type Phase = "Base" | "Half Build" | "Recovery Bridge" | "Marathon Build" | "Taper" | "Race Week";

export interface Week {
  num: number;
  phase: Phase;
  start: string; // Monday YYYY-MM-DD
  focus: string;
  plannedMiles: number;
  workouts: Workout[];
}

export const HALF_DATE = "2026-08-08";
export const FULL_DATE = "2026-10-10";

export const PACES = {
  easy: "10:45–11:30 /mi",
  long: "10:30–11:15 /mi",
  tempo: "9:05–9:15 /mi",
  intervals: "8:20–8:35 /mi",
  halfRace: "9:00 /mi",
  marathon: "9:35–9:45 /mi"
};

// Numeric twins of PACES in seconds per mile, for live pace judgment
// in Run Mode. Race targets get a ±10 sec band around goal pace.
export const PACE_BANDS: Record<keyof typeof PACES, { lo: number; hi: number }> = {
  easy: { lo: 645, hi: 690 },
  long: { lo: 630, hi: 675 },
  tempo: { lo: 545, hi: 555 },
  intervals: { lo: 500, hi: 515 },
  halfRace: { lo: 530, hi: 550 }, // 8:50–9:10, centered on 9:00 goal; 9:09 is the sub-2:00 redline
  marathon: { lo: 575, hi: 585 }
};

// HR zones + per-workout targets now live in lib/zones.ts,
// computed from the profile (Settings on the Progress tab).

export const PACE_NOTES: Record<string, string> = {
  easy: "Conversational. Full sentences out loud. If in doubt, slower.",
  long: "Relaxed and steady. Builds the aerobic engine — 80% of the work lives here.",
  tempo: "Comfortably hard. Short phrases only. This is lactate-threshold training.",
  intervals: "Hard but controlled. You should finish the last rep able to do one more.",
  halfRace: "9:00/mi banks a ~2 min cushion under 2:00. 9:09 is the sub-2:00 redline — don't drift slower, except by design going up the mile-5 hill.",
  marathon: "Projected marathon effort. Practice it; don't race it in training."
};

// d = day offset from the week's Monday (0=Mon … 6=Sun)
interface Spec {
  d: number;
  type: WorkoutType;
  title: string;
  detail: string;
  miles?: number;
  optional?: boolean;
  note?: string; // personal route/goal note
}

function addDays(iso: string, n: number): string {
  const dt = new Date(iso + "T12:00:00");
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
}

function wk(num: number, phase: Phase, start: string, focus: string, specs: Spec[]): Week {
  const workouts = specs.map((s) => ({
    date: addDays(start, s.d),
    type: s.type,
    title: s.title,
    detail: s.detail,
    miles: s.miles ?? 0,
    optional: s.optional,
    note: s.note
  }));
  const plannedMiles = workouts.reduce((a, w) => a + w.miles, 0);
  return { num, phase, start, focus, plannedMiles, workouts };
}

const STR = (d: number): Spec => ({
  d,
  type: "strength",
  title: "Strength",
  detail: "30–40 min: squats, lunges, single-leg work, core, pushups. Keeps the chassis under the engine.",
  optional: true
});

const XT = (d: number, mins = 35): Spec => ({
  d,
  type: "xt",
  title: "Cross-train",
  detail: `${mins} min low-impact cardio — bike, swim, or brisk incline walk. Aerobic benefit, zero pounding.`,
  optional: true
});

export const PLAN: Week[] = [
  // ── PHASE 0 · BASE (pre-plan miles, logged after the fact) ──
  wk(0, "Base", "2026-06-01", "Base miles banked before the plan existed. They count.", [
    { d: 1, type: "easy", title: "Easy run", detail: "2 mi easy, ~9:30–10:00 pace.", miles: 2 },
    { d: 3, type: "easy", title: "Easy run", detail: "2 mi easy, ~9:30–10:00 pace.", miles: 2 },
    { d: 6, type: "long", title: "Long run", detail: "5 mi with your son — 1 mi run / 1 min walk. Longest run in a long while, and it worked.", miles: 5 }
  ]),

  // ── PHASE 1 · HALF BUILD ──
  wk(1, "Half Build", "2026-06-08", "Feeling stronger than the plan assumed — rolling with it, carefully.", [
    { d: 1, type: "easy", title: "Easy run", detail: "2 mi easy + 4×20-sec strides after. Strides = smooth, fast, relaxed — not sprints.", miles: 2 },
    { d: 2, type: "easy", title: "Easy run", detail: "2 mi conversational.", miles: 2 },
    { d: 3, type: "easy", title: "Easy run", detail: "3 mi easy on the treadmill.", miles: 3 },
    STR(4),
    { d: 6, type: "long", title: "Long run", detail: "6 mi relaxed with your sister. Run/walk welcome — 1 mi run / 1 min walk carried the 5-miler just fine.", miles: 6 }
  ]),
  wk(2, "Half Build", "2026-06-15", "First taste of threshold work — then pack up: the long run jumps to Friday and you leave for the Canada canoe trip Saturday the 20th.", [
    STR(0),
    { d: 1, type: "tempo", title: "Tempo intro", detail: "1 mi easy → 1 mi @ tempo (9:05–9:15) → 1 mi easy.", miles: 3 },
    { d: 2, type: "easy", title: "Easy run", detail: "3 mi conversational.", miles: 3 },
    XT(3),
    { d: 4, type: "long", title: "Long run", detail: "6 mi relaxed. Moved to Friday — you leave for the Canada canoe trip Saturday the 20th.", miles: 6, note: "Ran around Little Lake Wissota — good run." }
  ]),
  wk(3, "Half Build", "2026-06-22", "Off-grid canoe trip in Canada most of the week — portaging carries the load. No intervals; easy miles only if they happen. Mileage will dip, and that's fine. The long run waits for your return.", [
    { d: 0, type: "xt", title: "Canoe trip — Canada", detail: "Off-grid Mon–Fri. Paddling and portaging are the cross-training — legs, back, and heavy carries. No intervals this week, and no app updates until you're back; log what you can after.", optional: true },
    { d: 2, type: "easy", title: "Easy run (if it happens)", detail: "An easy 2–3 mi around camp if the route and time allow. Optional — the trip is the work.", miles: 3, optional: true },
    { d: 5, type: "long", title: "Long run", detail: "7 mi relaxed back home — you're back Saturday the 27th. Ease in; legs may be trip-tired.", miles: 7 }
  ]),
  wk(4, "Half Build", "2026-06-29", "Consolidate. Volume climbs gently on purpose.", [
    STR(0),
    { d: 1, type: "tempo", title: "Tempo", detail: "1 mi easy → 2×(1 mi @ tempo, 3 min jog) → ½ mi easy. ~3.5 mi.", miles: 3.5 },
    { d: 2, type: "easy", title: "Easy run", detail: "3 mi conversational.", miles: 3 },
    XT(3),
    { d: 5, type: "long", title: "Long run", detail: "8 mi relaxed. Practice mid-run hydration.", miles: 8 }
  ]),
  wk(5, "Half Build", "2026-07-06", "Volume climbs. Protect the easy days.", [
    STR(0),
    { d: 1, type: "intervals", title: "Intervals", detail: "1 mi easy → 5×(2 min hard / 2 min jog) → 1 mi easy. ~4 mi.", miles: 4 },
    { d: 2, type: "easy", title: "Easy run", detail: "3 mi conversational.", miles: 3 },
    XT(3),
    { d: 5, type: "long", title: "Long run", detail: "9 mi relaxed. Test race-day breakfast this morning.", miles: 9 }
  ]),
  wk(6, "Half Build", "2026-07-13", "Longest tempo yet. Race pace gets real.", [
    STR(0),
    { d: 1, type: "tempo", title: "Tempo", detail: "1 mi easy → 2 mi continuous @ tempo → 1 mi easy.", miles: 4 },
    { d: 2, type: "easy", title: "Easy run", detail: "4 mi conversational.", miles: 4 },
    XT(3),
    { d: 5, type: "long", title: "Long run", detail: "10 mi on a rolling route — first 8 relaxed, last 2 @ goal pace (9:00). Race pace on tired legs is the point. Chippewa's mile-5 hill is coming; fuel mid-run (gel or chews around mile 5).", miles: 10 }
  ]),
  wk(7, "Half Build", "2026-07-20", "Peak week of the half build.", [
    STR(0),
    { d: 1, type: "intervals", title: "Intervals", detail: "1 mi easy → 3×(1 mi @ 8:50–9:00, 3 min jog) → ½ mi easy. ~4.5 mi.", miles: 4.5 },
    { d: 2, type: "easy", title: "Easy run", detail: "3 mi conversational.", miles: 3 },
    XT(3),
    { d: 4, type: "easy", title: "Easy run", detail: "2 mi very relaxed.", miles: 2 },
    { d: 5, type: "long", title: "Long run — peak", detail: "12 mi relaxed on a rolling route. Longest run before race day. Full dress rehearsal: shoes, fuel, fluids — and practice quick light steps on the downhills.", miles: 12 }
  ]),
  wk(8, "Half Build", "2026-07-27", "Taper begins. Volume drops, sharpness stays.", [
    STR(0),
    { d: 1, type: "tempo", title: "Race-pace tempo", detail: "1 mi easy → 2 mi @ goal pace (9:00) → 1 mi easy. This pace should feel repeatable, not hard.", miles: 4 },
    { d: 2, type: "easy", title: "Easy run", detail: "3 mi conversational.", miles: 3 },
    { d: 5, type: "long", title: "Long run — taper", detail: "8 mi relaxed, last 2 @ race pace. Lock in pacing feel.", miles: 8 }
  ]),
  wk(9, "Race Week", "2026-08-03", "Chippewa Falls. Trust the work.", [
    { d: 1, type: "easy", title: "Easy + strides", detail: "3 mi easy + 4×20-sec strides. Legs stay awake, nothing more.", miles: 3 },
    { d: 3, type: "easy", title: "Shakeout", detail: "2 mi very easy.", miles: 2 },
    { d: 5, type: "race", title: "HALF MARATHON — Chippewa Falls", detail: "13.1 @ 9:00 average → ~1:57:54, a 2-min cushion under 2:00 (9:09 is the redline). Even effort, not even splits: bank seconds on the flats, spend them on the mile 4–5 hill, collect them back on the descent. Save a gear for the uphill finish. Hydrate every station.", miles: 13.1, note: "Goal: break 2:00. Race at 9:00/mi, never let average slip past 9:09." }
  ]),

  // ── PHASE 2 · RECOVERY BRIDGE ──
  wk(10, "Recovery Bridge", "2026-08-10", "Recovery IS training. The half banked fitness — don't spend it.", [
    { d: 1, type: "walk", title: "Walk", detail: "30 min easy walk. Blood flow, not effort.", optional: true },
    XT(3, 30),
    { d: 5, type: "easy", title: "Recovery jog", detail: "2–3 mi very easy. If anything aches, walk instead.", miles: 3 }
  ]),
  wk(11, "Recovery Bridge", "2026-08-17", "Build back gently. Nothing long, nothing hard.", [
    STR(0),
    { d: 1, type: "easy", title: "Easy run", detail: "3 mi conversational.", miles: 3 },
    { d: 2, type: "easy", title: "Easy run", detail: "3 mi + 4×20-sec strides.", miles: 3 },
    { d: 5, type: "long", title: "Long run", detail: "6 mi relaxed.", miles: 6 }
  ]),

  // ── PHASE 3 · MARATHON BUILD ──
  wk(12, "Marathon Build", "2026-08-24", "Marathon block opens. Long runs become the centerpiece.", [
    STR(0),
    { d: 1, type: "tempo", title: "Tempo", detail: "1 mi easy → 2 mi @ tempo → 1 mi easy.", miles: 4 },
    { d: 2, type: "easy", title: "Easy run", detail: "3 mi conversational.", miles: 3 },
    XT(3),
    { d: 4, type: "easy", title: "Easy run", detail: "2 mi very relaxed.", miles: 2 },
    { d: 5, type: "long", title: "Long run", detail: "12 mi relaxed. Fuel every 40–45 min from here on out.", miles: 12 }
  ]),
  wk(13, "Marathon Build", "2026-08-31", "School's back — protect the Saturday long run above all.", [
    STR(0),
    { d: 1, type: "intervals", title: "Intervals", detail: "1 mi easy → 4×(3 min hard / 2 min jog) → 1 mi easy. ~4 mi.", miles: 4 },
    { d: 2, type: "easy", title: "Easy run", detail: "4 mi conversational.", miles: 4 },
    { d: 4, type: "easy", title: "Easy run", detail: "2 mi very relaxed.", miles: 2 },
    { d: 5, type: "long", title: "Long run", detail: "14 mi relaxed — new lifetime distance. Slow is the whole point.", miles: 14 }
  ]),
  wk(14, "Marathon Build", "2026-09-07", "Marathon pace enters the long game.", [
    STR(0),
    { d: 1, type: "tempo", title: "MP tempo", detail: "1 mi easy → 3 mi @ marathon pace (9:35–9:45) → 1 mi easy.", miles: 5 },
    { d: 2, type: "easy", title: "Easy run", detail: "4 mi conversational.", miles: 4 },
    XT(3),
    { d: 4, type: "easy", title: "Easy run", detail: "2 mi very relaxed.", miles: 2 },
    { d: 5, type: "long", title: "Long run", detail: "16 mi relaxed. Practice full race nutrition: fuel + fluids on schedule.", miles: 16, note: "Goal: run around Big Lake Wissota." }
  ]),
  wk(15, "Marathon Build", "2026-09-14", "Cutback week. Absorb the gains.", [
    STR(0),
    { d: 1, type: "easy", title: "Easy run", detail: "4 mi conversational.", miles: 4 },
    { d: 2, type: "easy", title: "Easy run", detail: "3 mi + 4×20-sec strides.", miles: 3 },
    { d: 4, type: "easy", title: "Easy run", detail: "2 mi very relaxed.", miles: 2 },
    { d: 5, type: "long", title: "Long run", detail: "12 mi with final 4 @ marathon pace. Finish-strong rehearsal.", miles: 12 }
  ]),
  wk(16, "Marathon Build", "2026-09-21", "Peak week. The 20-miler is the final exam before taper.", [
    STR(0),
    { d: 1, type: "tempo", title: "Tempo", detail: "1 mi easy → 3 mi @ tempo → 1 mi easy.", miles: 5 },
    { d: 2, type: "easy", title: "Easy run", detail: "4 mi conversational.", miles: 4 },
    XT(3),
    { d: 4, type: "easy", title: "Easy run", detail: "2 mi very relaxed.", miles: 2 },
    { d: 5, type: "long", title: "Long run — 20-miler", detail: "20 mi relaxed. Dead-slow is fine. Full fueling rehearsal. This run makes Ashland possible.", miles: 20 }
  ]),

  // ── PHASE 4 · TAPER ──
  wk(17, "Taper", "2026-09-28", "Volume drops ~45%. Fitness rises while you rest.", [
    STR(0),
    { d: 1, type: "tempo", title: "MP tempo", detail: "1 mi easy → 2 mi @ marathon pace → 1 mi easy.", miles: 4 },
    { d: 2, type: "easy", title: "Easy run", detail: "3 mi conversational.", miles: 3 },
    { d: 5, type: "long", title: "Long run — taper", detail: "10 mi relaxed. Last long effort. Sleep is now a workout.", miles: 10 }
  ]),
  wk(18, "Race Week", "2026-10-05", "Ashland. 26.2. Run the first 20 with your head, the last 10K with your heart.", [
    { d: 1, type: "easy", title: "Easy + strides", detail: "3 mi easy + 4×20-sec strides.", miles: 3 },
    { d: 3, type: "easy", title: "Shakeout", detail: "2 mi very easy. Carb-load starts today.", miles: 2 },
    { d: 5, type: "race", title: "MARATHON — Ashland", detail: "26.2. Start slower than feels right (9:50–10:00 early miles). Fuel from mile 4, every 40 min. Even effort beats even pace on hills.", miles: 26.2 }
  ])
];

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function findWeek(dateISO: string): Week | undefined {
  return PLAN.find((w) => dateISO >= w.start && dateISO <= addDays(w.start, 6));
}

export function workoutOn(dateISO: string): Workout | undefined {
  const w = findWeek(dateISO);
  return w?.workouts.find((x) => x.date === dateISO);
}

export function nextWorkout(dateISO: string): Workout | undefined {
  for (const w of PLAN) {
    for (const x of w.workouts) {
      if (x.date > dateISO && x.miles > 0) return x;
    }
  }
  return undefined;
}

export function daysUntil(targetISO: string, fromISO: string): number {
  const a = new Date(fromISO + "T12:00:00").getTime();
  const b = new Date(targetISO + "T12:00:00").getTime();
  return Math.round((b - a) / 86400000);
}

export const TYPE_LABEL: Record<WorkoutType, string> = {
  rest: "Rest",
  easy: "Easy run",
  tempo: "Tempo",
  intervals: "Intervals",
  long: "Long run",
  xt: "Cross-train",
  strength: "Strength",
  race: "Race day",
  walk: "Walk"
};
