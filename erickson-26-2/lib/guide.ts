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
  routeMap?: { src: string; caption?: string }; // course map image in public/
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
    ],
    routeMap: { src: "/half-route-map.png", caption: "Pure Water Days Half course — tap to zoom" }
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

// ─────────────────────────────────────────────────────────────
// FUELING & HYDRATION PLAYBOOK — surfaced under Coach's guide.
// Tuned for ~209 lb / 95 kg; the per-hour and per-kg targets scale,
// so re-run the math if Jon's baseline weight changes. Evidence-based
// (carb/hr ranges, dual-transportable carbs, drink-to-thirst, gut
// training). Reference only — the interactive calculators (fuel,
// sweat-rate, gut-training, timeline) are a separate future build.
// ─────────────────────────────────────────────────────────────

export const FUEL_NOTE = "Tuned for ~209 lb / 95 kg. The per-hour & per-kg targets scale — re-run the math if your weight changes.";

export interface FuelRow { k: string; v: string; note?: string }
export interface FuelBlock { heading?: string; text?: string; rows?: FuelRow[]; bullets?: string[] }
export interface FuelGuide { title: string; intro?: string; blocks: FuelBlock[] }

export const FUELING_GUIDE: FuelGuide[] = [
  {
    title: "Fuel · the two-tank engine",
    intro: "One mental model explains all of it.",
    blocks: [
      {
        text: "You run on two tanks. The premium tank — glycogen (stored carbs) — is fast and clean enough for race pace, but only holds ~90–120 min of it. The reserve tank — fat — is huge but too slow to hold pace alone. “The wall” is the premium tank running dry and forcing you onto the slow reserve. Every gel and sip during a race just tops off the premium tank before it empties."
      },
      {
        rows: [
          { k: "Premium · glycogen", v: "~1,500–2,000 kcal", note: "90–120 min at race effort · fast, race-pace fuel" },
          { k: "Reserve · fat", v: "tens of thousands kcal", note: "slow — can't hold race pace on its own" }
        ]
      },
      {
        heading: "Why the two races are coached differently",
        bullets: [
          "Half (≈2:00 for you): right at the edge of the tank. You won't fully bonk, but topping off keeps the back half honest.",
          "Full: you WILL drain it around mile 18–22 unless you refill steadily the whole way. Fueling is non-negotiable — and it starts the day before."
        ]
      }
    ]
  },
  {
    title: "Fuel · carbs, fluid & sodium per hour",
    intro: "The core targets. All per-hour, so they hold no matter your finish time.",
    blocks: [
      {
        heading: "Carbs / hour",
        rows: [
          { k: "Under ~75 min", v: "None needed", note: "water ± electrolytes — your tank covers it" },
          { k: "75–150 min · your half", v: "30–60 g/hr", note: "~1 gel (25 g) every 30–45 min, or drink + chews" },
          { k: "2.5 hr+ · your full", v: "60–90 g/hr", note: "steady intake every 20–30 min, multiple sources" }
        ]
      },
      {
        heading: "Dual-source carbs (marathon only)",
        text: "Glucose absorbs through one gut transporter that jams around 60 g/hr — a single-lane on-ramp at rush hour. Fructose uses a second transporter — a second lane. Products combining both (labeled “2:1”, “dual-source”, or “multiple transportable carbs”) open a two-lane highway up to ~90 g/hr without the GI distress of glucose backing up. The half doesn't need it; for the full, hit 60 g/hr minimum, then build toward 75–90 with dual-source."
      },
      {
        heading: "Fluid / hour",
        text: "Drink to thirst, with structure as a backstop — don't force huge volumes (over-drinking causes hyponatremia, more dangerous than mild dehydration), but don't wing it. Baseline ~16–24 oz/hr. Hot/humid day or heavy sweater → top of the range; cool day → bottom."
      },
      {
        heading: "Find your sweat rate (run it on a long run)",
        bullets: [
          "Weigh in minimal clothing right BEFORE a 1-hr run.",
          "Track how much fluid you drink during (oz).",
          "Towel off sweat, weigh right AFTER.",
          "Sweat loss (oz) = (lb lost × 16) + oz drunk. e.g. lose 2 lb, drink 16 oz → 48 oz/hr.",
          "Keep total loss under ~2% of body weight (~4 lb for you) to protect pace."
        ]
      },
      {
        heading: "Sodium / hour",
        text: "Water alone won't replace the sodium you sweat out. Target 300–600 mg/hr on long efforts; bump to 700–1,000 mg/hr if you're a salty sweater (white crust on hat/shirt). It's listed on most drink, tab, and gel labels."
      }
    ]
  },
  {
    title: "Fuel · before you run",
    intro: "Timing matters more than the exact food.",
    blocks: [
      {
        heading: "3–4 hr before — the real meal",
        text: "~1–2 g carb/kg ≈ 100–190 g for you. Low fat, low fiber (both sit in the gut and cramp), moderate protein.",
        bullets: [
          "Oatmeal + banana + honey",
          "2 slices toast + honey or jam + a banana",
          "Bagel + a little peanut butter + honey",
          "White rice + eggs (if your stomach likes it)"
        ]
      },
      {
        heading: "30–60 min before — the top-off",
        text: "~15–30 g fast carb to fill the liver tank without sitting heavy.",
        bullets: ["Banana", "Applesauce pouch", "Half a gel + water", "A few dates"]
      },
      {
        heading: "The iron rule",
        text: "Nothing new on race day. Every food and product above gets tested in training first."
      }
    ]
  },
  {
    title: "Fuel · carb loading",
    intro: "Marathon mainly — optional for the half.",
    blocks: [
      {
        text: "1–2 days before the full, deliberately overfill the premium tank. The modern protocol skips the old depletion misery — you just eat a lot of carbs for 1–2 days, ~7–10 g/kg/day. For you (~95 kg): roughly 600–800 g the day before.",
        bullets: [
          "Spread it across the whole day — not two giant meals.",
          "Lean on low-fiber easy carbs: white rice, pasta, bagels, pancakes, juice, sports drink, bananas, honey.",
          "Trim fat and fiber to make room — the one time white bread beats whole grain.",
          "Expect +2–4 lb of water: glycogen binds ~3 g water per 1 g. That's stored fuel, not fat."
        ]
      },
      {
        heading: "For the half",
        text: "No formal load needed — one solid high-carb day before is plenty."
      }
    ]
  },
  {
    title: "Fuel · race-day timeline — Half",
    blocks: [
      {
        rows: [
          { k: "Night before", v: "Normal carb-forward dinner, hydrate well" },
          { k: "3–3.5 hr before", v: "Pre-race meal ~100–150 g carbs, 16–20 oz fluid" },
          { k: "60 min before", v: "Sip fluid, optional top-off snack ~15–20 g" },
          { k: "15 min before", v: "A few sips of water; optional caffeine gel if you've trained with it" },
          { k: "Every 30–45 min", v: "Gel/chews to hit 30–60 g/hr + sip fluid each station" },
          { k: "After", v: "Carbs + protein within ~60 min (~3:1) to refill the tank" }
        ]
      }
    ]
  },
  {
    title: "Fuel · race-day timeline — Full",
    blocks: [
      {
        rows: [
          { k: "1–2 days before", v: "Carb load ~600–800 g/day" },
          { k: "Night before", v: "High-carb, low-fat dinner; hydrate" },
          { k: "3–4 hr before", v: "Pre-race meal ~150–190 g carbs, 16–24 oz fluid" },
          { k: "60 min before", v: "Top-off snack ~20–30 g, sip fluid" },
          { k: "15 min before", v: "Sips of water; optional caffeine" },
          { k: "Miles 1–6", v: "Start EARLY — first gel by ~30–40 min. Don't wait until you feel low." },
          { k: "Every 20–30 min", v: "Hit 60–90 g/hr dual-source + steady fluid + sodium" },
          { k: "After", v: "Carbs + protein + fluid + sodium ASAP" }
        ]
      },
      {
        heading: "The biggest marathon mistake",
        text: "Fuel before you feel empty. Refueling lags 15–20 min behind effort — by the time you feel the bonk, you're already underwater."
      }
    ]
  },
  {
    title: "Fuel · train your gut",
    intro: "Start now, on your long runs.",
    blocks: [
      {
        text: "Your gut is a trainable muscle. Untrained, it rejects 60+ g/hr (sloshing, cramps, worse). Trained, it absorbs more with no drama — built progressively, like mileage. Practice on any run over ~75 min (~8+ mi easy), always with the exact products you'll race."
      },
      {
        heading: "Progression tied to your long runs",
        rows: [
          { k: "6 mi (<75 min)", v: "Practice drinking on the move — carry a flask, sip every 15–20 min. No carbs yet." },
          { k: "8 mi", v: "Add 1 gel (~25 g) mid-run; get used to swallowing while running." },
          { k: "10 mi", v: "~40–50 g/hr — gel every ~40 min + fluid. Note how your stomach feels." },
          { k: "12 mi", v: "Push toward 60 g/hr. Your half-marathon dress rehearsal." },
          { k: "14–16+ mi", v: "Build to 75–90 g/hr with dual-source. Where gut training pays off." }
        ]
      },
      {
        heading: "Log it",
        text: "After each long run, note what you took, when, how much fluid, and a 1–5 gut-feel rating. A few runs in, you'll have YOUR formula instead of a generic one."
      }
    ]
  },
  {
    title: "Fuel · cheat sheet",
    blocks: [
      {
        rows: [
          { k: "Carbs / hr", v: "Half 30–60 g · Full 60–90 g", note: "dual-source for >60 g" },
          { k: "Fluid / hr", v: "16–24 oz", note: "run a sweat test to dial it in" },
          { k: "Sodium / hr", v: "300–600 mg", note: "700–1,000 if salty sweater" },
          { k: "Pre-meal", v: "3–4 hr out, 100–190 g carbs", note: "low fat / fiber" },
          { k: "Top-off", v: "30–60 min out, 15–30 g fast carb" },
          { k: "Carb load (full)", v: "~600–800 g the day before" }
        ]
      },
      {
        heading: "Two iron rules",
        bullets: ["Nothing new on race day.", "Fuel before you feel empty."]
      },
      {
        heading: "Shopping list to test",
        text: "Energy gels (a few brands, incl. one dual-source + one caffeinated), energy chews, electrolyte tabs/drink mix, bananas, honey, bagels, oatmeal, applesauce pouches, dates, and a handheld flask or hydration vest."
      }
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
