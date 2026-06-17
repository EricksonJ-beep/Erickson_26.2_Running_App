# Erickson 26.2 — Project Context for Claude

> Keep this file current. Update it at the end of each working session so the next
> session starts with an accurate picture instead of relearning the codebase.

## What This App Is
A personal marathon training PWA (Progressive Web App) built for Jon Erickson.
One integrated plan drives two races; everything is mobile-first and offline-capable.

**Races:**
- Half Marathon — Chippewa Falls, WI — **Aug 8, 2026** (goal: sub 2:00)
- Full Marathon — Ashland, WI (WhistleStop) — **Oct 10, 2026** (goal: finish strong)

**Live:** https://erickson-26-2.vercel.app
**Repo:** https://github.com/EricksonJ-beep/Erickson_26.2_Running_App

## Stack
- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript 5
- **Styling:** Tailwind CSS 3.4 (theme via CSS vars in `globals.css`)
- **Fonts:** Space Grotesk (display) + Inter (body), self-hosted via `next/font` so the SW caches them
- **Deployment:** Vercel (auto-deploys on push to `main`)
- **No backend / no auth** — all data is client-side in `localStorage`

> **Important:** the Next app lives in the **`erickson-26-2/`** subdirectory, not the repo
> root. Run npm commands from there. The repo root holds CLAUDE.md and design screenshots.

## Theme — "VOLT"
Jet black + electric lime. Dark is the default; `html.light` swaps the palette.
Palette tokens (RGB triplets in `app/globals.css`, token names kept from the original
theme so `gold` = primary accent = lime `200 245 66`): `ink` (page), `coal` (cards),
`seam` (borders), `bone`/`dust` (text), `gold`/`goldDim` (accent), `sage` (success),
`ember` (warning). Toggle persists to `hr_theme_v1`.

## Features (all shipped)
Single page, five bottom tabs (`app/page.tsx`): **Today · Plan · Log · Fuel · Progress**.

- **18-week dual-race plan** (`lib/plan.ts`, "HORNET RUNNER") — phases: Base → Half Build →
  Recovery Bridge → Marathon Build → Taper → Race Week. Built on 80/20 intensity, the 10%
  mileage rule, weekly lactate-threshold work, research-backed tapers. Edit workouts here.
  **Weekly rhythm:** Mon strength · Tue quality (tempo/intervals) · Wed easy · Thu cross-train ·
  Fri optional shakeout · **Sat long run** · **Sun rest**. (`d` in a `Spec` is the day offset
  from Monday, 0–6.) Past weeks 0–1 keep their original layout as logged history.
- **HR zone engine** (`lib/zones.ts`) — profile-driven, best method first: LTHR → Friel
  %LTHR; max+resting → Karvonen; max only → %max (Tanaka age estimate, default age 39).
  `hrGuide()` maps each workout type to a target bpm window + zone; shown per-run on **Today**
  (with pace/effort) and on every run row in the **Plan** tab.
- **Run Mode** (`components/RunView.tsx`) — fullscreen live tracker. GPS (`lib/useGps.ts`),
  live heart rate over Web Bluetooth standard HR service (`lib/useHeartRate.ts`, works with
  Polar H10; Chrome/Android only), screen wake lock (`lib/useWakeLock.ts`). Saves run with
  GPS route trace + per-mile splits. **Voice coaching** (Web Speech + WebAudio tone + vibrate,
  master 🔊/🔇 mute): pace+HR cue every ½ mile on every run (`cueIntervalMi`), pace coached to the
  workout's goal band, and both-direction HR drift alerts (above/below target zone, 25 s debounce,
  3 min warmup hold). **Phases:** `countdown → live → summary`. A 5→GO countdown (`COUNTDOWN_SEC`)
  pre-warms GPS — `useGps` runs during the count but only accumulates after `gps.start()` at GO,
  so cold-start scatter is discarded and tracking begins on a locked fix. **Lock controls** (🔒):
  full-screen stats-only overlay disabling every control (pocket the phone without mis-taps);
  hold-to-unlock 2 s (`UNLOCK_HOLD_MS`). Live screen shows a GPS accuracy readout
  (`gps.lastAccuracy`). GPS tuning: accuracy gate `MAX_ACCURACY_M` 20 m, min-movement gate
  `MIN_STEP_M` 1 m, Haversine summed per-segment. The phone-locked / background-GPS goal needs a
  native wrapper — see `erickson-26-2/docs/PHASE2_BACKGROUND_GPS.md` (Capacitor proposal, not built).
- **Fitness tests** (`components/HRTestView.tsx`) — fullscreen, strap-paired field tests launched
  from the Progress tab that measure the two numbers the zone engine wants, instead of estimating.
  **Max HR:** graded build-to-failure run (~8 min: build → hard → very hard → all-out sprint, with
  escalating voice/tone cues); peak bpm = true max. **LTHR:** Joe Friel's 30-min solo TT — the app
  captures the *final 20 min* automatically (time-weighted, gap-tolerant) and that average = LTHR.
  Each result previews the zones it would produce, then `saveProfile`s `maxHR`/`lthr` (merges, so one
  test doesn't wipe the other field) and every window in the app recomputes. Reuses `useHeartRate` +
  `useWakeLock`; own cue engine mirrors Run Mode (mute toggle, readiness/safety warning up front).
- **Sensor check** (`components/DiagnosticsView.tsx`) — fullscreen diagnostics launched from the
  Progress tab. Tests GPS (raw accuracy/coords/fix quality), heart-rate strap (reuses
  `useHeartRate`), and screen wake lock (`useWakeLock`), plus a device-capability checklist.
  Nothing is logged — it's a pre-run gear shakeout.
- **Daily 100s** (`components/TodayView.tsx`) — pushup/situp counters, goal 100 each per day
  (`CALIS_GOAL`, `CalisLog` in storage). Progress tab shows a streak/totals card (`HundredsCard`).
- **Coach's guide** (`lib/guide.ts`) — effort anchors on the 1–10 RPE scale, WhistleStop race
  intel, setback/roadblock playbook. Surfaced in Plan/Today/Log.
- **Fueling & hydration playbook** (`FUELING_GUIDE` in `lib/guide.ts`) — evidence-based fuel/hydration
  reference under Plan → Coach's guide, as collapsible cards rendered by `FuelGuideBody` in `PlanView`.
  Tuned for ~95 kg (targets scale w/ weight, flagged via `FUEL_NOTE`). Covers: two-tank glycogen/fat
  model, carbs/fluid/sodium per-hour targets (half vs full), dual-source carbs, sweat-rate test,
  pre-run meals + top-off, carb loading, side-by-side half & full race-day timelines, gut-training
  progression tied to long runs, and a cheat sheet. The interactive tools the doc suggests (fuel
  calculator, sweat-rate logger, gut-training tracker, race-day timeline generator) are NOT built —
  reference content only, deferred as a future feature.
- **Daily Fire** (`lib/quotes.ts`) — 39 quotes, one chosen per day, shown in full (stationary) on Today.
- **Fuel tracking** (`components/FuelView.tsx`) — water / calories / protein per day.
- **Body composition** (`BodyLog`) — Renpho scale readings, seeded from chat screenshots,
  trended in Progress.
- **Chat-to-app seed pipeline** (`lib/seed.ts` + `applySeed` in `lib/storage.ts`) — Claude folds
  runs/body data Jon reports in chat. rev 1 only fills empty dates (phone data wins); rev 2+ is a
  correction and overwrites. `push = deploy`.
- **Progress** (`components/ProgressView.tsx`) — trends + JSON **export/import** backup.
- **PWA** — `public/manifest.json` + `public/sw.js` service worker, installable, offline.

## Data Model (`lib/storage.ts`)
All in `localStorage`, keys `hr_*_v1`: `RunLog` (incl. optional `route`, `splits`, `hr`),
`FuelLog`, `Profile` (age/resting/max/LTHR), `BodyLog`, `CalisLog`, plus `done` (non-run
completions) and `seeded` (dedupe ledger). `exportAll`/`importAll` cover everything.

## In Progress / Next Up
- [ ] **Awaiting Jon's first real Run Mode session.** Voice coaching (pace-to-target + both-direction
      HR drift alerts + beep/vibrate) shipped but is untested on real hardware (this dev env has no
      GPS/Bluetooth/speaker). After his first run, tune wording/thresholds; likely tweak = exempt
      **interval** days from HR alerts if they nag mid-rep (one-line change in `RunView.tsx`).
- [ ] **Sharpen HR zones with real data.** Zones still use an *estimated* max HR (Tanaka, age 39) —
      profile holds only `{age:39, maxHR:181}` (Jon set Tanaka explicitly; identical to the fallback,
      so zones are unchanged). **Now built:** Progress → Fitness tests runs guided strap-paired max-HR
      and LTHR (Friel 30-min TT) field tests that write the real numbers. Awaiting Jon's first test on
      real hardware; until then his easy runs read high (avg ~135 = top of est. Z2). LTHR is the bigger
      accuracy win — push him toward that test.
- [ ] **Jon is off-grid June 20–27, 2026** (Canada canoe trip). No app updates / no run logging that
      week; wk 3 mileage will be down by design (portaging = cross-train, no intervals, long run held
      to Sat Jun 27). Expect a seeding gap, not missed workouts.

## Known Issues
- Web Bluetooth HR is Chrome/Android only — iOS/Safari report unsupported and stay inert.
- localStorage is per-device: always log from the same phone; export periodically.

## Design Decisions & Constraints
- Mobile-first — used on a phone, often mid-run (Run Mode = huge numbers, 48px+ targets).
- Minimal UI, readable at a glance.
- No backend/auth — personal use, keep it simple.
- Race/training resources are for adapting ideas, never copying verbatim.

## Key Files & Structure
```
erickson-26-2/
  app/
    page.tsx          → shell: tabs, theme toggle, day re-key, applySeed
    layout.tsx        → fonts, PWA metadata, SW registration
    globals.css       → VOLT palette (dark + html.light)
  components/         → TodayView, PlanView, LogView, FuelView, ProgressView, RunView, DiagnosticsView
  lib/
    plan.ts           → 18-week schedule, dates, paces (edit the plan here)
    zones.ts          → HR zone engine + per-workout hrGuide() targets
    guide.ts          → coach's guide content
    quotes.ts         → Daily Fire quotes
    storage.ts        → localStorage model + export/import + seed merge
    seed.ts           → chat-seeded runs/body data
    useGps.ts / useHeartRate.ts / useWakeLock.ts → Run Mode + Sensor check hooks
  public/             → manifest.json, sw.js, icons
CLAUDE.md             → this file (repo root)
```

## How to Run Locally
```bash
cd erickson-26-2
npm install
npm run dev      # http://localhost:3000  (localhost is a secure context, so Bluetooth works)
npm run build    # production build
```

## Context for Claude
- Owner: Jon Erickson, 39, high school science teacher in Cadott, WI.
- Training alongside strength work (pushups, situps, lifting).
- Body comp baseline (June 4, 2026): 209.6 lb, 24.8% body fat, 150 lb muscle.
- Daily nutrition targets: ~2,400–2,500 cal, 170–190g protein, 250–320g carbs, 60–80g fat.
- Preferred style: direct, minimal explanation, finished code — not tutorials.
- When in doubt, prioritize mobile UX and clean visuals over complexity.
