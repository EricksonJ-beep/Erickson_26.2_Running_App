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
- **Free run** — Today has an always-visible **▶ Free run** button (below the day's bib card, shows on
  every day incl. rest/cross-train) that launches Run Mode with a synthetic off-plan workout
  (`freeRunWorkout()` in `lib/plan.ts`, `type: "free"`). Full GPS/HR/split/route/HRR tracking, but
  **no pace target** — the cue engine already null-guards the band, so it announces distance/pace/HR
  every ½ mi without "on pace"/drift nagging (header reads "No target · run by feel"). Saves through the
  same `addRun` (never overwrites; counts toward weekly mileage; if it's the day's only run it also
  marks that day done — "a run is a run", Jon's call). Run Mode is now launched via
  `setRunWorkout(workout | freeRunWorkout(today))` in `TodayView`, not a boolean. See
  `[[project_free_run]]`.
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
- **Quick tests** (`components/QuickTestView.tsx`) — fullscreen, strap-paired, launched from the
  Progress tab (card below Sensor check). Two on-demand tests, no run needed. **Resting HR:** sit/lie
  still ~2.5 min; ignores a 30 s settle, then tracks the lowest 15 s rolling average (via
  `useHeartRate.recentSample`) = resting HR, `saveProfile`d to `restingHR` (sharpens Karvonen zones),
  with a live zone preview. **Recovery (HRR):** the standalone version of the post-run test — get HR
  up, hit start (captures that as `endHR`), then it hands off to the shared `RecoveryTestView`
  (`runType` optional when standalone). Result saved to its own store (`saveRecoveryTest`, key
  `hr_recovery_v1`) and merged into `RecoveryCard`'s trend alongside run-attached ones. Own cue engine
  mirrors Run Mode / Fitness tests (tone + speech + vibrate, mute toggle).
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
- **Progress** (`components/ProgressView.tsx`) — trends + JSON **export/import** backup. Includes an
  **80/20 balance** card (`IntensityCard`): time in Z1–Z2 vs Z3+ summed from `RunLog.zoneSeconds`
  over the last 4 weeks of strap runs, with an 80%-easy target tick; hidden under 10 min of data.
- **Run route map** (`components/RouteMap.tsx`) — offline SVG trace of a saved GPS route (no tiles,
  no deps); start/finish dots, VOLT colors. On the Run Mode summary, and behind a per-run "Map"
  toggle in **Log** history (expands trace + per-mile splits). Runs since Jul 2026 also capture GPS
  **altitude** (`RoutePoint.alt`); `elevationStats()` (3 m hysteresis vs GPS wobble) shows ↑/↓ ft on
  the summary + Log expansion. Street-map tiles deferred to native.
- **PWA** — `public/manifest.json` + `public/sw.js` service worker, installable, offline.

## Data Model (`lib/storage.ts`)
All in `localStorage`, keys `hr_*_v1`: `RunLog` (incl. optional `route`, `splits`, `hr`, `type`,
`zoneSeconds`, `recoveryTest`), `Profile` (age/resting/max/LTHR), `BodyLog`, `CalisLog`, plus `done`
(non-run completions), `seeded` (dedupe ledger), and `recovery` (`hr_recovery_v1` — an array of
standalone `RecoveryTest`s from Quick tests, not tied to a run). `RecoveryTest` (`endHR`,
`hrr1`/`hrr2` drops, `hrr1Label`, `incomplete`, `lowConfidence`, optional `runType`) either rides on
its `RunLog` (post-run) or lives in the `recovery` array (standalone); `exportAll`/`importAll` cover
both, and the run-attached one also rides the seed pipeline for free.

**Multiple runs per day:** the runs store is still `Record<string, RunLog>`, but the key is now the
run's `runKey()` (`id ?? date`), not always the bare date. The **first/planned run of a day keeps its
bare-date key** (`2026-07-01`) — so every `runs[date]` lookup (Today's "done", Progress adherence),
the seed pipeline, and export/import are unchanged and **no migration** was needed. **Additional
same-day runs get suffix keys** (`2026-07-01#2`, `#3`…) via `nextRunId()`. `addRun()` always writes to
a free slot, so a second run **never overwrites** the first — both **Run Mode** and manual **Log** use
it (that was the bug: an evening extra run clobbered the morning's planned run). Extra runs auto-count
toward weekly mileage (everything sums `Object.values(runs)`) but don't affect adherence (that keys off
the primary `runs[date]`). In **Log**, when the selected day already has a run the form flips to "Add
another run" (won't overwrite; a hint says so); history rows key/edit/delete by `runKey`. See
`[[project_multi_run_per_day]]`.

## In Progress / Next Up
- [x] **Session Jul 2 2026 — shipped (4): Fable 5 review Low items (#14–19) — backlog cleared.**
      **#14** HRR checkpoint capture is time-anchored: new `useHeartRate.sampleAt(atMs)` reads the
      strap samples around the true 1:00/2:00 mark, so a late/throttled timer tick can't skew the
      reading (falls back to "now" + `lowConfidence` if the mark slid out of the ~15 s buffer).
      **#15** `RunView.save()` keys the run to `workout.date` instead of `todayISO()` (a run finished
      past midnight stays on the day it started), and `RecoveryCard` dates standalone tests by
      **local** day (`localDateOf`) instead of a UTC `slice(0,10)`.
      **#16** `PACE_NOTES` → `Record<keyof typeof PACES,…>`, `hrGuide()` → `Record<HRBandKey,…>`,
      `TYPE_DOT` → `Partial<Record<WorkoutType,…>>`; pruned dead `TYPE_LABEL` (plan.ts) and the unused
      `elapsedSec` from `GpsState`/`GpsResult`.
      **#17** Pinch-zoom re-enabled (dropped `maximumScale:1`), tab bar buttons get `aria-current`,
      Run Mode summary RPE slider got an `aria-label`.
      **#18** GPS **altitude** captured into `RoutePoint.alt` (whole meters, optional — old routes
      unaffected); `elevationStats()` exported from `RouteMap.tsx` (3 m hysteresis) renders
      "Elevation ↑/↓ ft" on the Run Mode summary + Log map expansion.
      **#19** Run Mode persists `type` + `zoneSeconds` on the `RunLog` (rides export/import + seed for
      free); new **80/20 balance** card on Progress — last 4 weeks of strap runs, Z1–Z2 vs Z3+ with an
      80% target tick and an "easy days running too hot" nudge. Build + tsc clean.
      **The Fable 5 review backlog (#1–19) is now fully shipped.**
- [x] **Session Jul 2 2026 — shipped (3): Fable 5 review hardening pass (High + Medium).** A read-only
      Fable 5 agent reviewed the codebase; built out items #1–13:
      **Data safety —** `write()` now returns success and `saveRun`/`addRun` propagate it; Run Mode keeps
      the summary up with a "Retry save" on a failed write instead of the old silent "Saved ✓" data loss
      (#1). `runsOn(date)`/run-date `Set`s replace bare `runs[date]` lookups in Today/Plan/Progress/Log so
      extra (`date#2`) runs aren't invisible (#2). Delete/Discard now `confirm()` (#3).
      `requestPersistence()` (navigator.storage.persist) on startup so Chrome won't evict data (#4).
      Saved GPS routes capped at 600 points in `useGps.finish()` (#5). Editing a run's **date** now
      re-keys it (save-new-then-delete-old) instead of duplicating (#6). Seed rev 2+ spread-merges so a
      chat time-fix can't wipe phone-captured route/splits/HRR (#10). Backup-staleness ember nudge +
      storage-usage line on Progress, `hr_lastExport_v1` stamped on export (#13).
      **Robustness —** HR `useHeartRate` reconnect now uses a **generation counter** so a mid-run Re-pair
      can't get its new device permanently blocked by a stale reconnect loop (#7).
      **Structure —** the tone/speak/vibrate cue engine is extracted to **`lib/useCues.ts`** (was
      copy-pasted in RunView/HRTestView/QuickTestView; RunView passes loud 0.9/0.55 gains, the tests
      quiet 0.28/0.16) (#8); the marathon-vs-half band special-case is unified in **`bandKeyFor()`** in
      `zones.ts`, used by RunView/TodayView/PlanView (#9); `getRuns()` is **memoized** (module cache,
      invalidated on write) (#12). SW: manifest/icons/course-maps are now **stale-while-revalidate**
      (cache `erickson-v7`) so swapping an asset no longer needs a reinstall (#11). Build + tsc clean.
      Low-priority items #14–19 were finished later the same day — see shipped (4) above.
- [x] **Session Jul 2 2026 — shipped (2):** **free run.** Always-visible **▶ Free run** button on Today
      launches Run Mode off-plan any day (rest/XT included) — full GPS/HR/split tracking, no pace target
      ("run by feel"). New `type: "free"` + `freeRunWorkout()`; saves via `addRun` (rides the multi-run
      structure — never overwrites, counts mileage, marks the day done if it's the only run).
      See `[[project_free_run]]`.
- [x] **Session Jul 2 2026 — shipped (1):** **multiple runs per day.** Logging a second run (manual or
      Run Mode) used to overwrite the day's first run because the store was keyed by bare date. Now
      `addRun` keys extra same-day runs `date#2`/`#3` (primary keeps the bare-date key → zero migration,
      all `runs[date]` lookups + seed/export untouched); Run Mode + Log both add instead of replace;
      extra runs count toward weekly mileage but not adherence. See `[[project_multi_run_per_day]]`.
- [x] **Session Jul 1 2026 — shipped:** post-run **Heart-Rate Recovery (HRR)** test (auto-launches
      after a run when the strap's streaming); standalone **Quick tests** under Progress (**Resting
      HR** → saves to profile; standalone **Recovery/HRR** that joins the trend); **removed the Fuel
      tab** + calorie/macro/water logging (race-day fueling *playbook* under Plan kept, per Jon);
      added the **WhistleStop full-marathon course map** PNG + **corrected its elevation** (~510 ft net
      drop, mid-race descent ≈mi 9–16 — was wrongly "flat / 322 ft"); Time-on-feet rounds to whole
      minutes; **Jul 4 long run 8→9 mi** (running w/ sister); seeded **Jul 1 body comp** (203.0 lb /
      23.4% BF, trending down from the Jun 4 baseline); **PWA icon finally live** on Jon's phone —
      required a full **uninstall→reinstall** (not just "remove from home screen"); his data survived.
      See `[[ref_pwa_icon_update]]`.
- [x] **Run Mode v2 punch list** (from the Jun 19 Little Lake 6-miler) is done: wall-clock stopwatch,
      HR re-pair + infinite auto-reconnect, lock-mode interval-leak fix + thumb FAB, offline route map,
      route notes, HR/GPS-lost cues. See `[[project_runmode_v2_punchlist]]`.
- [ ] **Real-hardware shakeout still pending** — the strap-driven tests are all type/build-verified
      only, never run against the real Polar H10: the post-run **HRR** test, the new **Resting HR**
      test, and the **standalone Recovery** test (strap pairing, checkpoint capture, resting-low
      tracking, strap-drop grace). Jon's next run with the strap is the validation.
- [ ] **Native shell (Capacitor) is the main lever.** Two things a browser PWA can't do, both
      requested: (1) reliable background GPS when the phone is pocketed/screen-off; (2) ducking
      Spotify during voice cues (no audio focus on web). Both live in `docs/PHASE2_BACKGROUND_GPS.md`.
      Also still possible in-browser: exempt **interval** days from HR drift alerts if they nag
      mid-rep (one-liner in `RunView.tsx`).
- [ ] **Sharpen HR zones with real data.** Zones still use an *estimated* max HR (Tanaka, age 39);
      profile holds only `{age:39, maxHR:181}`. Built and waiting on Jon: Progress → **Fitness tests**
      (guided max-HR + Friel 30-min LTHR TT) write the real numbers, and Progress → **Quick tests**
      captures a real **resting HR**. Until he runs them, easy runs read high (avg ~135 = top of est.
      Z2). LTHR is the biggest accuracy win — push him toward that test.

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
                        RecoveryTestView, HRTestView, QuickTestView, DiagnosticsView
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
