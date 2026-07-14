"use client";

// Shared audio-cue engine for Run Mode and the fullscreen fitness/quick tests.
// A "cue" = an attention tone (WebAudio, so it cuts through music the app can't
// duck in a browser) + a haptic buzz + the spoken line a beat later. Extracted
// so the four screens that coach by voice stay in lockstep — the next tone or
// timing tweak lands in one place.
//
// `mutedRef.current === true` silences everything; passing a ref (not a boolean)
// lets callers flip mute without re-creating these callbacks. Tones differ by
// context (loud outdoors for Run Mode, softer indoors for the tests), so gain
// and speech are configurable.

import { useCallback, useEffect, useRef } from "react";
import { isNativeApp } from "./nativeBridge";

// Native TTS (shell only): Android's speech engine takes transient audio
// focus, so cues duck Spotify and hand the volume back — the thing Web Speech
// can never do. Same lazy-load + wrapper pattern as GPS/BLE: the import is
// gated on isNativeApp() (the PWA never fetches the chunk), and we never
// resolve a promise with the raw registerPlugin proxy — its thenable probe
// becomes a bogus native call ("TextToSpeech.then() is not implemented").
interface NativeTTS {
  speak(o: { text: string; lang?: string; rate?: number; volume?: number }): Promise<void>;
  stop(): Promise<void>;
}
let ttsPromise: Promise<NativeTTS | null> | null = null;
function loadNativeTTS(): Promise<NativeTTS | null> {
  if (!isNativeApp()) return Promise.resolve(null);
  if (!ttsPromise) {
    ttsPromise = import("@capacitor-community/text-to-speech")
      .then((m) => {
        const proxy = m.TextToSpeech;
        const wrapped: NativeTTS = {
          speak: (o) => Promise.resolve(proxy.speak(o)),
          stop: () => Promise.resolve(proxy.stop())
        };
        return wrapped;
      })
      .catch(() => null);
  }
  return ttsPromise;
}

export interface CueOptions {
  alertGain?: number; // WebAudio peak gain for an "alert" tone
  infoGain?: number; // ... for a routine "info" tone
  speechVolume?: number; // SpeechSynthesisUtterance.volume (can't exceed system volume)
  speechRate?: number; // SpeechSynthesisUtterance.rate
}

export function useCues(
  mutedRef: { current: boolean },
  opts: CueOptions = {}
) {
  // Read live via a ref so the memoized callbacks never go stale on option changes.
  const cfgRef = useRef<Required<CueOptions>>({
    alertGain: 0.9,
    infoGain: 0.55,
    speechVolume: 1,
    speechRate: 0.98
  });
  cfgRef.current = { ...cfgRef.current, ...opts };

  const audioCtxRef = useRef<AudioContext | null>(null);

  // The first user gesture (a Start/GO tap) lets the context start; resume defensively.
  const ensureAudio = useCallback(() => {
    if (typeof window === "undefined") return null;
    try {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!audioCtxRef.current && Ctx) audioCtxRef.current = new Ctx();
      if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume().catch(() => {});
      return audioCtxRef.current;
    } catch {
      return null;
    }
  }, []);

  const tone = useCallback(
    (variant: "info" | "alert") => {
      const ctx = ensureAudio();
      if (!ctx) return;
      try {
        const freqs = variant === "alert" ? [880, 1175, 880] : [620, 830];
        const dur = 0.11;
        const gap = 0.06;
        const peak = variant === "alert" ? cfgRef.current.alertGain : cfgRef.current.infoGain;
        freqs.forEach((f, i) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = f;
          const t0 = ctx.currentTime + i * (dur + gap);
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
          osc.connect(g).connect(ctx.destination);
          osc.start(t0);
          osc.stop(t0 + dur + 0.02);
        });
      } catch {
        // audio is best-effort
      }
    },
    [ensureAudio]
  );

  // Raw TTS. Best-effort; re-checks mute at speak time (a cue speaks ~240 ms
  // later, so muting in that window should still suppress the line). In the
  // native shell the line goes through Android TTS (ducks music); the browser
  // keeps Web Speech; native failure falls back to Web Speech.
  const webSpeak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.volume = cfgRef.current.speechVolume;
      u.rate = cfgRef.current.speechRate;
      window.speechSynthesis.speak(u);
    } catch {
      // speech is best-effort
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (mutedRef.current) return;
      if (isNativeApp()) {
        loadNativeTTS().then((tts) => {
          if (!tts) return webSpeak(text);
          tts
            .speak({
              text,
              lang: "en-US",
              rate: cfgRef.current.speechRate,
              volume: cfgRef.current.speechVolume
            })
            .catch(() => webSpeak(text));
        });
        return;
      }
      webSpeak(text);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [webSpeak]
  );

  // Tone lands first, spoken line a beat later so it isn't stepped on. "alert"
  // reads more urgent than a routine "info" update.
  const cue = useCallback(
    (text: string, variant: "info" | "alert" = "info") => {
      if (mutedRef.current) return;
      tone(variant);
      try {
        navigator.vibrate?.(variant === "alert" ? [110, 60, 110] : 45);
      } catch {
        // vibration unsupported (iOS) — ignore
      }
      window.setTimeout(() => speak(text), 240);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [tone, speak]
  );

  useEffect(() => {
    return () => {
      audioCtxRef.current?.close().catch(() => {});
      try {
        window.speechSynthesis?.cancel();
      } catch {
        // ignore
      }
      if (ttsPromise) ttsPromise.then((t) => t?.stop().catch(() => {}));
    };
  }, []);

  return { ensureAudio, tone, speak, cue };
}
