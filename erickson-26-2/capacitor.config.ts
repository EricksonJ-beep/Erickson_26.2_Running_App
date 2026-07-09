import type { CapacitorConfig } from "@capacitor/cli";

// Native Android shell (Phase 2). Remote-URL mode: the webview loads the live
// Vercel deployment, so every `push = deploy` updates the native app instantly
// and the service worker keeps offline caching. The `www/` placeholder is only
// shown if the app is opened with no network AND no SW cache (first launch).
// The APK needs rebuilding only when this native layer changes.
const config: CapacitorConfig = {
  appId: "com.erickson.run262",
  appName: "Erickson 26.2",
  webDir: "www",
  server: {
    url: "https://erickson-26-2.vercel.app",
    cleartext: false
  }
};

export default config;
