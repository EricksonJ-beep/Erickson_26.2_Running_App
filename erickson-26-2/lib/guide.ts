// ─────────────────────────────────────────────────────────────
// Coach's guide — reference material that backs the plan.
// Effort anchors match the 1–10 RPE slider on the Log screen.
// Race intel sourced from the WhistleStop course page (historical
// weather averages); takeaways adapted to this plan.
// ─────────────────────────────────────────────────────────────

import { WorkoutType } from "./plan";

// Target effort on the same 1–10 scale Jon logs after every run.
export const TYPE_EFFORT: Partial<Record<WorkoutType, string>> = {
  easy: "4–5",
  long: "5–6",
  tempo: "6–8",
  intervals: "8.5+"
};

export const EFFORT_GUIDE: { type: WorkoutType; label: string; rpe: string; feel: string }[] = [
  {
    type: "easy",
    label: "Easy run",
    rpe: "4–5",
    feel: "Full sentences out loud, nose-breathing possible. Pace can swing a lot day to day — there is no such thing as too slow."
  },
  {
    type: "long",
    label: "Long run",
    rpe: "5–6",
    feel: "Steady and controlled. Finish tired but strong — like you had a couple more miles in the tank. Marathon-pace segments push to 7–8; the rest stays relaxed. The challenge is time on feet, not speed."
  },
  {
    type: "tempo",
    label: "Tempo",
    rpe: "6–8",
    feel: "Comfortably hard. A steady burn in the legs and lungs, but breathing and form stay under control. If you can chat freely it's too easy; if you can't hold the effort to the end it's too hard."
  },
  {
    type: "intervals",
    label: "Intervals",
    rpe: "8.5+",
    feel: "Hard but composed — a word or two of speech, max. Aim for even reps; if the first one was too hot, adjust. Save anything extra for the last rep or two."
  }
];

// Course intel for both races, from the official course pages/maps.
export interface RaceIntel {
  title: string;
  race: string;
  facts: { label: string; value: string; note: string }[];
  takeaways: string[];
}

export const RACE_INTEL: RaceIntel[] = [
  {
    title: "Race intel · Chippewa Falls 13.1",
    race: "Chippewa Falls Half Marathon · start/finish at the YMCA",
    facts: [
      { label: "Surface", value: "Paved city roads", note: "single loop" },
      { label: "Profile", value: "Rolling", note: "~880–1,125 ft" },
      { label: "The hill", value: "~175 ft climb", note: "crests near mile 5, fast descent after" },
      { label: "Finish", value: "Uphill", note: "dips to the course low ~mile 12, then climbs to the line" },
      { label: "Support", value: "7 water stops", note: "restrooms + cheer squads on course" }
    ],
    takeaways: [
      "The mile 4–5 hill decides this race. Climb by effort, not pace — give time back going up, collect it on the descent.",
      "Practice controlled downhill running: short, quick steps, let gravity do the work. The drop off the hill is where free speed lives.",
      "The last mile dips, then climbs to the finish. Save a gear — a 2:00 finish comes from even effort, not even splits.",
      "Run some July tempos and long runs on rolling routes so race day's profile feels familiar."
    ]
  },
  {
    title: "Race intel · Ashland 26.2",
    race: "WhistleStop Marathon · Ashland, WI",
    facts: [
      { label: "Surface", value: "Unpaved rail trail", note: "packed crushed gravel" },
      { label: "Profile", value: "Flat, gradual decline", note: "322 ft net drop to the finish" },
      { label: "Typical temp", value: "47°F, cloudy", note: "historical average" },
      { label: "Humidity / wind", value: "High · gentle", note: "~79% · ~8 mph" },
      { label: "Altitude", value: "Sea level", note: "671 ft" }
    ],
    takeaways: [
      "Run some long runs on crushed gravel or rail trail — soft surface changes your footstrike and rhythm.",
      "You'll train through Wisconsin summer and race at 47°F. Cool race day is free speed; don't let it pull you out too fast.",
      "A net downhill still pounds the quads late. The strength days are course prep, not extra credit.",
      "Flat course, even-effort pacing — no hills to budget for. The 9:50–10:00 early miles plan holds."
    ]
  }
];

// When training doesn't go to plan — the short version.
export const ROADBLOCKS: { when: string; play: string }[] = [
  {
    when: "Missed a run",
    play: "Shuffle the week or drop it entirely. Fitness comes from months of consistency, not any single day. Never cram two hard days back-to-back to catch up."
  },
  {
    when: "Everything feels like a grind",
    play: "Tired is normal; constant fatigue isn't. Check sleep, food, stress, and water first. Then swap the next hard day for easy — recovery is what turns training into fitness."
  },
  {
    when: "Sharp or one-sided pain",
    play: "Stop. Discomfort that fades as you warm up is training; pain that sharpens is a warning. A few days off now beats weeks off later."
  },
  {
    when: "One awful run",
    play: "Log it honestly and move on. Bad runs happen to everyone and predict nothing. The next one almost always feels better."
  },
  {
    when: "Brutal weather",
    play: "Run by effort, not pace. Heat and wind raise the cost of every mile — slower splits at the same effort is the workout done right."
  },
  {
    when: "Taper restlessness",
    play: "Feeling twitchy in race week is fitness arriving, not fitness leaving. Rehearse the race morning in your head instead of adding miles."
  }
];
