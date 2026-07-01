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
Single page, four bottom tabs (`app/page.tsx`): **Today · Plan · Log · Progress**.

- **18-week dual-race plan** (`lib/plan.ts`, "HORNET RUNNER") — phases: Base → Half Build →
  Recovery Bridge → Marathon Build → Taper → Race Week. Built on 80/20 intensity, the 10%
  mileage rule, weekly lactate-threshold work, research-backed tapers. Edit workouts here.
  **Weekly rhythm:** Mon strength · Tue quality (tempo/intervals) · Wed easy · Thu cross-train ·
  Fri optional shakeout · **Sat long run** · **Sun rest**. (`d` in a `Spec` is the day offset
  from Monday, 0–6.) Past weeks 0–1 keep their original layout as logged history. Any workout can
  carry an optional `note` — a personal route/goal shown as a gold 📍 line on Today + Plan
  (e.g. wk 14 16-miler = "run around Big Lake Wissota").
- **HR zone engine** (`lib/zones.ts`) — profile-driven, best method first: LTHR → Friel
  %LTHR; max+resting → Karvonen; max only → %max (Tanaka age estimate, default age 39).
  `hrGuide()` maps each workout type to a target bpm window + zone; shown per-run on **Today**
  (with pace/effort) and on every run row in the **Plan** tab.
- **Run Mode** (`components/RunView.tsx`) — fullscreen live tracker. GPS (`lib/useGps.ts`),
  live heart rate over Web Bluetooth standard HR service (`lib/useHeartRate.ts`, works with
  Polar H10; Chrome/Android only), screen wake lock (`lib/useWakeLock.ts`). Saves run with
  GPS route trace + per-mile splits, and shows the route as an offline SVG map on the summary
  (`components/RouteMap.tsx`). **Time = wall-clock stopwatch** from GO minus *manual-pause* time
  (`useGps` `activeMs()`, timestamp-based so backgrounding can't lose time; auto-pause is
  display-only, freezes distance but never the clock). **Voice coaching** (Web Speech + WebAudio
  tone + vibrate, master 🔊/🔇 mute): pace+HR cue every ½ mile (`cueIntervalMi`), pace coached to the
  workout's goal band, both-direction HR drift alerts (25 s debounce, 3 min warmup hold), plus
  spoken "Heart rate signal lost/reconnected" and "GPS signal lost/back" (`GPS_STALE_MS` 12 s via
  `useGps.lastFixAt`). Tones are loud (alert/info gain 0.9/0.55) to punch through music — a browser
  PWA can't actually duck Spotify (no audio focus; needs the native shell). **Mid-run HR re-pair:**
  `useHeartRate` auto-reconnects all run long (backoff caps 8 s, no try limit); `connect()` is a
  clean re-pair (works even while "connected"); `reconnect()` is one-tap retry. Live screen surfaces
  ⟳ Re-pair (connected) / Reconnect+Re-pair (lost) / Pair (idle). **Phases:** `countdown → live →
  summary`. A 5→GO countdown (`COUNTDOWN_SEC`) pre-warms GPS — only accumulates after `gps.start()`
  at GO, so cold-start scatter is discarded. **Lock controls** (🔒): floating circular FAB on the
  right edge at mid-height (`top-1/2`, thumb-reachable one-handed); full-screen stats-only overlay
  disabling every control; hold-to-unlock 2 s (`UNLOCK_HOLD_MS`). Hold timers are guarded against a
  double-pointerdown interval leak + reset on lock-toggle/background/unmount (fixed the old
  "couldn't re-lock" glitch). Live screen shows a GPS accuracy readout (`gps.lastAccuracy`). GPS
  tuning: accuracy gate `MAX_ACCURACY_M` 20 m, min-movement gate `MIN_STEP_M` 1 m, Haversine summed
  per-segment. The phone-locked / background-GPS + music-ducking goals need a native wrapper — see
  `erickson-26-2/docs/PHASE2_BACKGROUND_GPS.md` (Capacitor proposal, not built).
- **Fitness tests** (`components/HRTestView.tsx`) — fullscreen, strap-paired field tests launched
  from the Progress tab that measure the two numbers the zone engine wants, instead of estimating.
  **Max HR:** graded build-to-failure run (~8 min: build → hard → very hard → all-out sprint, with
  escalating voice/tone cues); peak bpm = true max. **LTHR:** Joe Friel's 30-min solo TT — the app
  captures the *final 20 min* automatically (time-weighted, gap-tolerant) and that average = LTHR.
  Each result previews the zones it would produce, then `saveProfile`s `maxHR`/`lthr` (merges, so one
  test doesn't wipe the other field) and every window in the app recomputes. Reuses `useHeartRate` +
  `useWakeLock`; own cue engine mirrors Run Mode (mute toggle, readiness/safety warning up front).
- **Heart Rate Recovery (HRR) test** (`components/RecoveryTestView.tsx`, `lib/recovery.ts`) —
  auto-launches from Run Mode the instant a run is **stopped**, but only when the strap is still
  streaming a fresh reading (RunView gates on `hr.recentSample(5)` at STOP; keeps HR + wake lock
  alive through the test, then tears them down on done/skip). Stand still 2 min; captures the bpm
  **drop** below end-of-run HR at 1:00 (**HRR1**, scored) and 2:00 (**HRR2**, raw) — bigger drop =
  faster autonomic recovery = fitter/less-taxed. Timestamp-based clock w/ pause offset (backgrounding
  can't skew it); a strap dropout **freezes** the countdown + gives a 15 s reconnect grace before
  ending early and saving what it has (marked `incomplete`). Checkpoints read a 5 s rolling avg via
  `useHeartRate.recentSample()` (new: ~15 s ring buffer), flagging `lowConfidence` on a noisy spread.
  Scoring bands live in `lib/recovery.ts` (`classifyHRR1`: Excellent ≥30 / Good ≥21 / Fair ≥12 /
  Poor; named `recovery`/HRR1 to avoid colliding with `hrr` = heart-rate *reserve* in `zones.ts`).
  Sub-12 HRR1 → soft "more easy days" nudge (general guidance, **not** medical advice). Result saved
  on the `RunLog` (`recoveryTest`), shown on the Run Mode summary + trended in Progress' `RecoveryCard`
  (latest/avg-last-5/best, band-colored bar sparkline, recent-tests list). *Type/build-verified;
  awaiting a real Polar H10 shakeout — the checkpoint capture + strap-drop grace paths haven't run
  on hardware yet.*
- **Sensor check** (`components/DiagnosticsView.tsx`) — fullscreen diagnostics launched from the
  Progress tab. Tests GPS (raw accuracy/coords/fix quality), heart-rate strap (reuses
  `useHeartRate`), and screen wake lock (`useWakeLock`), plus a device-capability checklist.
  Nothing is logged — it's a pre-run gear shakeout.
- **Daily 100s** (`components/TodayView.tsx`) — pushup/situp counters, goal 100 each per day
  (`CALIS_GOAL`, `CalisLog` in storage). Progress tab shows a streak/totals card (`HundredsCard`).
- **Coach's guide** (`lib/guide.ts`) — effort anchors on the 1–10 RPE scale, WhistleStop race
  intel, setback/roadblock playbook. Surfaced in Plan/Today/Log. `RaceIntel.courseMaps` embeds
  course images (in `public/`) at the top of an intel card — Chippewa Falls 13.1 shows the official
  Pure Water Days/YMCA route map + the elevation profile (`public/half-route-map.png`,
  `half-elevation.png`); Ashland 26.2 shows the official WhistleStop course + elevation + aid-station
  map (`public/full-route-map.png`). Tap to open full-res, SW runtime-caches them for offline course
  recon. Rendered by `RouteMapImage` in `PlanView` (each hides itself if its asset is missing, so the
  intel wiring can ship before the PNG is dropped in). **Marathon elevation was corrected from the
  official full-marathon map:** ~510 ft net drop (start 1,150 ft → finish 640 ft), concentrated as a
  mid-race descent ≈mi 9–16 — not the earlier "flat, 322 ft" read; takeaways updated to match.
- **Fueling & hydration playbook** (`FUELING_GUIDE` in `lib/guide.ts`) — evidence-based fuel/hydration
  reference under Plan → Coach's guide, as collapsible cards rendered by `FuelGuideBody` in `PlanView`.
  Tuned for ~95 kg (targets scale w/ weight, flagged via `FUEL_NOTE`). Covers: two-tank glycogen/fat
  model, carbs/fluid/sodium per-hour targets (half vs full), dual-source carbs, sweat-rate test,
  pre-run meals + top-off, carb loading, side-by-side half & full race-day timelines, gut-training
  progression tied to long runs, and a cheat sheet. Reference content only — the interactive tools
  the source doc floated (fuel calculator, sweat-rate logger, gut-training tracker, race-day timeline
  generator) were considered and **declined by Jon**; don't re-pitch them unless he asks.
- **Daily Fire** (`lib/quotes.ts`) — 39 quotes, one chosen per day, shown in full (stationary) on Today.
- **Body composition** (`BodyLog`) — Renpho scale readings, seeded from chat screenshots,
  trended in Progress.
- **Chat-to-app seed pipeline** (`lib/seed.ts` + `applySeed` in `lib/storage.ts`) — Claude folds
  runs/body data Jon reports in chat. rev 1 only fills empty dates (phone data wins); rev 2+ is a
  correction and overwrites. `push = deploy`.
- **Progress** (`components/ProgressView.tsx`) — trends + JSON **export/import** backup.
- **Run route map** (`components/RouteMap.tsx`) — offline SVG trace of a saved GPS route (no tiles,
  no deps); start/finish dots, VOLT colors. On the Run Mode summary, and behind a per-run "Map"
  toggle in **Log** history (expands trace + per-mile splits). Street-map tiles deferred to native.
- **PWA** — `public/manifest.json` + `public/sw.js` service worker, installable, offline.

## Data Model (`lib/storage.ts`)
All in `localStorage`, keys `hr_*_v1`: `RunLog` (incl. optional `route`, `splits`, `hr`,
`recoveryTest`), `Profile` (age/resting/max/LTHR), `BodyLog`, `CalisLog`, plus `done`
(non-run completions) and `seeded` (dedupe ledger). `RecoveryTest` (`endHR`, `hrr1`/`hrr2` drops,
`hrr1Label`, `incomplete`, `lowConfidence`, `runType`) rides on its `RunLog`, so `exportAll`/
`importAll` and the seed pipeline carry it for free.

## In Progress / Next Up
- [x] **Jon's first real Run Mode session happened (Jun 19 2026, Little Lake 6-miler).** Surfaced
      bugs/requests, all addressed this session: time was wrong (per-fix accumulation dropped
      backgrounded time → now a wall-clock stopwatch); HR wasn't paired & couldn't relink mid-run
      (→ re-pair UI + infinite auto-reconnect); lock mode glitched/wouldn't re-lock (→ interval-leak
      guard) and the button moved to a thumb-reachable FAB; added offline route map, per-workout
      route notes, and HR-lost/GPS-lost voice cues + louder tones. He ran Polar Flow in parallel
      (will keep doing so until this app's HR/time prove accurate) — he'll hand over Polar data
      (avg HR 145, max 172) to seed today's run manually. See `[[project_runmode_v2_punchlist]]`.
- [ ] **Native shell (Capacitor) is now the main lever.** Two things a browser PWA can't do, both
      requested: (1) reliable background GPS when the phone is pocketed/screen-off; (2) ducking
      Spotify during voice cues (no audio focus on web — #7 only made our cues louder). Both live in
      `docs/PHASE2_BACKGROUND_GPS.md`. Also still possible in-browser if he wants: exempt **interval**
      days from HR drift alerts if they nag mid-rep (one-liner in `RunView.tsx`).
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
  components/         → TodayView, PlanView, LogView, ProgressView, RunView,
                        RecoveryTestView, HRTestView, DiagnosticsView
  lib/
    plan.ts           → 18-week schedule, dates, paces (edit the plan here)
    zones.ts          → HR zone engine + per-workout hrGuide() targets
    recovery.ts       → HRR1 scoring bands + classifyHRR1() (post-run recovery test)
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
