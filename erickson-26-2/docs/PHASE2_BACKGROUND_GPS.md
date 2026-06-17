# Phase 2 Proposal — Background GPS (screen off, phone in pocket)

> Status: **proposal only — not built.** Decide before any work starts.

## The hard limit we're working around

Erickson 26.2 is a PWA. Mobile browsers **suspend JavaScript and stop / heavily
throttle `watchPosition` once the tab is backgrounded or the phone is locked.**
No PWA API changes this — not Wake Lock, not Service Workers (SW geolocation is
not available), not Background Sync, not Periodic Background Sync. Phase 1's wake
lock + lock overlay keep the screen *on* so tracking survives; they do **not**
let you lock the phone and pocket it.

The only way to log GPS with the screen fully off and freely switch to Spotify is
a **native app** that holds a background-location permission and runs a native
location service. That means wrapping the web app.

## Recommended approach: Capacitor + a background-geolocation plugin

[Capacitor](https://capacitorjs.com/) wraps the existing Next build in a native
iOS/Android shell and exposes native APIs to the same JS/TS code. Pair it with
**`@capacitor-community/background-geolocation`** (foreground-service /
significant-change location that keeps emitting while backgrounded).

### What changes in the repo

- **Static export.** Capacitor ships a folder of static assets, so the app must
  build to static HTML/JS. We're already fully client-side (no SSR, no API
  routes, `localStorage` only), so this is `output: "export"` in `next.config`
  plus confirming nothing relies on the server. Low risk.
- **Add native projects.** `npm i @capacitor/core @capacitor/cli` +
  `npx cap init`, then `npx cap add ios` and `npx cap add android`. This creates
  `ios/` and `android/` directories (native Xcode / Gradle projects) checked into
  the repo. Build step becomes `next build && next export && npx cap sync`.
- **Abstract the GPS source.** Introduce a thin adapter so `RunView` consumes one
  interface: web `watchPosition` (current `useGps`) in the browser, the Capacitor
  plugin when running natively (`Capacitor.isNativePlatform()`). The distance /
  filtering / pace / splits math in `useGps` stays — only the *position source*
  swaps. Vercel PWA keeps working unchanged.
- Web Bluetooth HR: Capacitor's webview does **not** expose Web Bluetooth, so the
  H10 path would need a native BLE plugin (`@capacitor-community/bluetooth-le`) and
  a second adapter, or HR stays browser-only. Worth scoping separately.

### Permissions & store implications

- **iOS:** `NSLocationWhenInUseUsageDescription` **and**
  `NSLocationAlwaysAndWhenInUseUsageDescription`, plus the `location` background
  mode in `Info.plist`. Requires an **Apple Developer account ($99/yr)** to build
  to a device and to ship. App Store review scrutinizes "always" location — need a
  clear in-app justification string. TestFlight is fine for personal use and skips
  public review.
- **Android:** `ACCESS_FINE_LOCATION` + `ACCESS_BACKGROUND_LOCATION` +
  `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_LOCATION`, and a persistent
  foreground-service notification while a run is active (Android requires the
  visible notification — can't be hidden). Sideload-installable; Play Store
  background-location listing requires a review form, but for personal use you can
  just install the APK and skip the store entirely.

### Rough effort

- Capacitor init + static export + Android shell building a run with background
  GPS: **~1–2 focused days.**
- iOS parity (needs a Mac + Xcode + Apple account): **+1 day**, gated on tooling.
- Native BLE HR adapter (if HR must work natively): **+1–2 days**, optional.

### Trade-offs to weigh

- You stop being a pure "open the URL" PWA on the tracked platform — installs are
  via TestFlight/APK, and updates need a rebuild + reinstall (the Vercel web
  version can still auto-update for everything that isn't background GPS).
- Two code paths (web + native) to keep in sync, mostly isolated to the GPS/BLE
  adapters.
- Android's mandatory foreground notification during runs is unavoidable.

## Recommendation

Do **Android-only Capacitor** first (no Apple account, sideload APK, fastest path
to the actual goal), keep Vercel PWA as the everyday version, and only add iOS if
you switch phones. Hold until after the first few real Phase-1 runs confirm wake
lock + lock overlay aren't already "good enough" for how you actually run.
