import type { BodyLog, RunLog } from "./storage";

// ─────────────────────────────────────────────────────────────
// CLAUDE-SEEDED RUNS — Jon reports runs in chat; Claude adds them
// here and deploys. On next app open the phone merges them into
// localStorage (applySeed in storage.ts).
//
// Rules:
//   • No rev (or rev 1): fill-if-missing. Anything Jon logged on
//     the phone for that date WINS — never clobbered.
//   • rev 2+: a correction Jon gave in chat — overwrites the phone
//     entry for that date. Bump rev only when Jon supplies new
//     numbers for a date already seeded.
//   • One run per date (matches the app's storage model).
//   • Estimated values are called out in notes so Jon can fix them.
// ─────────────────────────────────────────────────────────────

export type SeedRun = RunLog & { rev?: number };

export const SEED_RUNS: SeedRun[] = [
  // Week 0 — pre-plan base (days approximate, Jon said they don't matter)
  {
    date: "2026-06-02",
    miles: 2,
    minutes: 19,
    rpe: 3,
    notes: "Pre-plan base run, ~9:30–10:00 pace. Time estimated — edit if off."
  },
  {
    date: "2026-06-04",
    miles: 2,
    minutes: 19,
    rpe: 3,
    notes: "Pre-plan base run, ~9:30–10:00 pace. Time estimated — edit if off."
  },
  {
    date: "2026-06-07",
    miles: 5,
    minutes: 49,
    rpe: 5,
    notes:
      "With son — 1 mi run / 1 min walk the whole way. Longest run in a long while and it felt good. Time estimated."
  },

  // Week 1 — treadmill block
  {
    date: "2026-06-09",
    miles: 2,
    minutes: 19,
    rpe: 3,
    notes: "Treadmill, ~9:30–10:00 pace. Time estimated."
  },
  {
    date: "2026-06-10",
    miles: 2,
    minutes: 19,
    rpe: 3,
    notes: "Treadmill, ~9:30–10:00 pace. Time estimated."
  },
  {
    date: "2026-06-11",
    miles: 3,
    minutes: 29,
    rpe: 5,
    hr: 140,
    notes:
      "Treadmill @ 9:30. HR ~135 through 2 mi, drifted to 155 in mile 3 at the same pace — that pace is Z3 effort right now. Easy days should sit slower."
  },

  // Week 2 — base building
  {
    date: "2026-06-14",
    miles: 6.5,
    minutes: 65,
    rpe: 5,
    notes: "Long run."
  },
  {
    date: "2026-06-15",
    miles: 1,
    minutes: 12,
    rpe: 2,
    notes: "Light warmup before lifting."
  },
  {
    date: "2026-06-16",
    miles: 3.1,
    minutes: 29,
    rpe: 6,
    hr: 135,
    notes:
      "Sore from lifting Monday but fine during the run. Max HR hit 153 at the end; 2nd mile mostly around 143 HR."
  },
  {
    date: "2026-06-17",
    miles: 3,
    minutes: 32,
    rpe: 4,
    hr: 135,
    notes:
      "Easy. Had to hold back to stay in the HR zone."
  },

  // Fri long run — first real Run Mode session. App HR didn't pair and in-app
  // time was buggy (both fixed after this run), so HR + time come from the
  // Polar H10 / Polar Flow. rev 2 to overwrite any broken partial the app saved.
  {
    date: "2026-06-19",
    miles: 6,
    minutes: 66,
    rpe: 5,
    hr: 146,
    rev: 2,
    notes:
      "Long run around Little Lake Wissota — good run. HR from Polar H10: avg 146, max 172, min 61 — sat mostly 140–150, classic early spike, strong climb to ~170 at the finish. Distance ~6 mi (app GPS was accurate; Polar distance unreliable). Time 66 min from Polar."
  }
];

// Scale readings from Jon's Renpho screenshots — same rev rules as runs.
export type SeedBody = BodyLog & { rev?: number };

export const SEED_BODY: SeedBody[] = [
  {
    date: "2026-06-11",
    weight: 204.2,
    bmi: 28.0,
    bodyFat: 23.6,
    muscleMass: 148.2,
    visceralFat: 10,
    bmr: 1897
  }
];
