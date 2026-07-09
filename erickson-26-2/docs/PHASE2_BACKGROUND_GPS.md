# Phase 2 — Native Android Shell (Capacitor): Full Build Plan

> Status: **approved by Jon Jul 9 2026 — Milestone 1 BUILT the same day** (CI
> green, first APK produced). Remaining: Jon adds the `KEYSTORE_PASSWORD`
> secret → rebuild → sideload → first real device run. M2 (BLE HR), M3
> (ducking), M4 (polish) not started.
>
> Trigger: the Jul 8 lost run proved the browser ceiling is real — wake lock +
> lock overlay can't survive a screen-off + process kill. Checkpointing (shipped
> Jul 9) bounds the damage; only a native shell prevents it.
>
> **M1 as built:** `capacitor.config.ts` (remote-URL → Vercel), `android/`
> (Capacitor 8, SDK 36), `lib/nativeBridge.ts` (zero-dep access to the injected
> bridge — the web bundle imports nothing from @capacitor/*), `useGps` shared
> `onFix()` pipeline with native-watcher/web-watchPosition sources,
> `.github/workflows/android-apk.yml` (dispatch or `android-v*` tag → APK
> artifact). Signing: committed password-protected keystore
> (`android/signing/`, alias `erickson262`) + `KEYSTORE_PASSWORD` secret.

## What this buys

1. **Background GPS** — runs record with the phone locked and pocketed, start to
   finish. The whole "manage the screen mid-run" problem disappears.
2. **Immunity to Android's process killer** — a foreground service marks the app
   untouchable while a run is live.
3. **Voice cues duck Spotify** — native TTS requests transient audio focus, like
   turn-by-turn navigation. Browsers can never do this.
4. **Native BLE for the Polar H10** — the same transport Garmin/Strava use:
   better reconnects, streams while backgrounded.

## Locked decisions (flag before build if any look wrong)

- **Android only, sideloaded APK.** No Play Store, no iOS, **$0 total cost**.
  iOS only ever happens if Jon switches phones (would need Apple's $99/yr).
- **Remote-URL shell.** The webview loads `https://erickson-26-2.vercel.app`
  (`server.url` in `capacitor.config`), not a bundled static export. So
  `push = deploy` keeps updating the native app instantly; the service worker
  keeps offline caching. The APK only needs rebuilding when the *native* layer
  changes (plugins, permissions, icons).
- **The native app becomes the daily driver after Milestone 2** (once HR works).
  localStorage is per-app, so data migrates once via the existing
  Export → Import; the Chrome PWA stays installed as a fallback/read copy.
- **Adapters, not forks.** `Capacitor.isNativePlatform()` picks the backend at
  runtime. All filtering/distance/pace/split/zone math stays shared; only the
  position + BLE + speech *sources* swap. Browser dev flow (`npm run dev`)
  stays identical, and the web PWA keeps working forever.

## Milestone 1 — Shell + background GPS (the reliability fix)

The smallest shippable unit that fixes the Jul 8 failure.

- Add `@capacitor/core` + `@capacitor/cli` + `@capacitor/android`; `npx cap init`
  + `npx cap add android`; commit the generated `android/` Gradle project.
- `capacitor.config.ts`: `server.url` → the Vercel deployment.
- `@capacitor-community/background-geolocation` for the location watcher backed
  by a **foreground service** with the (mandatory, permanent-during-runs)
  notification.
- Extract a position-source interface from `useGps`: web backend =
  `watchPosition` (byte-for-byte current behavior); native backend = the plugin
  watcher feeding the same pipeline. Start/stop the service on run start/stop.
- Permissions: `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION` ("Allow all
  the time" flow), `FOREGROUND_SERVICE_LOCATION`, with an in-app explainer
  before the OS prompt.
- **CI:** GitHub Actions workflow builds + signs the APK (generated release
  keystore in repo secrets) on manual dispatch/tag; Jon downloads the artifact
  and sideloads. No Android Studio on anyone's machine.
- **Acceptance:** start a run, lock the phone, pocket it 10+ minutes, unlock —
  distance/route/splits complete, zero gap; notification visible throughout;
  crash-recovery checkpointing still works underneath.

## Milestone 2 — Native BLE heart rate

- `@capacitor-community/bluetooth-le` behind a `useHeartRate` adapter exposing
  the exact current API (status / bpm / recentSample / sampleAt / reconnect /
  totals). Same standard HR service (0x180D/0x2A37), same parsing, same
  reconnect-generation logic.
- HR keeps streaming with the screen off (rides Milestone 1's service).
- **Acceptance:** pair the H10, run with screen-off stretches — `zoneSeconds`,
  avg HR, drift alerts, and the post-run HRR test all complete; mid-run strap
  dropout reconnects.
- **After this milestone Jon migrates** (Export in Chrome → Import in the native
  app) and switches daily drivers.

## Milestone 3 — Audio focus: cues duck Spotify

- Native TTS (`@capacitor-community/text-to-speech` or a ~50-line custom plugin)
  requesting `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK`; `useCues` routes speech
  natively on-platform, Web Speech otherwise. Tones/vibration stay as-is.
- Cue gains can come back down from "shout over music" once ducking works.
- **Acceptance:** with Spotify playing, a cue lowers the music, speaks clearly,
  music restores.

## Milestone 4 — Polish + hardening

- App icon/splash from the existing lime-runner set; version string in Progress.
- First-launch checklist: battery-optimization exemption prompt (Samsung-style
  OEM killers can still harass foreground services until exempted).
- Docs: install/update guide; CLAUDE.md updates.

## What does not change

Every view, the plan, storage model, export/import, seed pipeline, Vercel
deploys, the browser dev loop, and the web PWA itself. The native shell is
purely additive — rollback at any point = keep using the PWA.

## Risks

- **Community plugin churn** — pin versions; adapters keep the blast radius to
  one file per capability.
- **Webview vs Chrome quirks** — both are Chromium (Android System WebView);
  low risk, but first-device-boot will surface anything.
- **Hardware-only validation** — CI can't fake GPS + BLE + the process killer.
  Every milestone ends as an APK on Jon's phone; his runs are the test bench,
  same as the strap tests were.

## Effort & sequencing

| Milestone | Scope | Estimate |
|---|---|---|
| M1 | Shell + background GPS + CI APK | 1–2 sessions |
| M2 | Native BLE HR | 1–2 sessions |
| M3 | TTS ducking | ½–1 session |
| M4 | Polish | ½ session |

Each milestone lands installable; M1 alone fixes the lost-run problem. Target:
comfortably done before the Aug 8 half, battle-tested well before Oct 10.
