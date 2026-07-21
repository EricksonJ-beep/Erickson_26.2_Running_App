"use client";

// Segment runner for structured workouts (intervals / tempo / progression).
// Walks a workout's Segment[] live off the GPS distance + run clock: announces
// each segment on start, auto-advances the instant its distance/time trigger is
// hit, and reports the current segment + progress so Run Mode can scope its
// pace judgment and draw the segment card. Voice is full-detail every rep, per
// Jon's spec. A plain (segment-less) run bypasses all of this.

import { useEffect, useRef, useState } from "react";
import { PACES, Segment } from "./plan";

export interface SegState {
  active: boolean; // segmented workout, in the live phase
  done: boolean; // every segment complete
  index: number;
  segment: Segment | null;
  total: number;
  repCurrent: number | null; // 1-based position among the work reps
  repTotal: number | null;
  paceKey: keyof typeof PACES | undefined; // current segment's target, if any
  isTimed: boolean; // current segment ends on time (→ count down) vs distance (→ count up)
  elapsedMi: number; // distance covered in the current segment
  elapsedSec: number; // time in the current segment
  targetMi: number | null; // distance-segment goal
  remainingSec: number | null; // time-segment countdown
}

export interface SegCheckpoint {
  index: number;
  startMi: number;
  startSec: number;
}

function fmtPace(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function miWord(mi: number): string {
  if (mi === 0.5) return "half a mile";
  const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  if (Number.isInteger(mi) && mi < words.length) return `${words[mi]} mile${mi === 1 ? "" : "s"}`;
  return `${mi} miles`;
}

function timeWord(sec: number): string {
  if (sec % 60 === 0) {
    const m = sec / 60;
    return `${m} minute${m === 1 ? "" : "s"}`;
  }
  return `${sec} seconds`;
}

function untilWord(seg: Segment): string {
  return seg.until.type === "distance" ? miWord(seg.until.miles) : timeWord(seg.until.seconds);
}

// Spoken intro for a segment starting.
function startLine(seg: Segment): string {
  const paceLabel = seg.paceKey ? PACES[seg.paceKey].replace("/mi", "").trim() : "";
  switch (seg.kind) {
    case "warmup":
      return `Warm up. ${untilWord(seg)} ${seg.effort ?? "easy"}.`;
    case "cooldown":
      return `Cool down. ${untilWord(seg)} easy. Great work.`;
    case "recovery":
      return `Recovery jog. ${untilWord(seg)}.`;
    case "work":
      return seg.paceKey
        ? `${seg.label}. ${untilWord(seg)} at ${paceLabel} pace. Go.`
        : `${seg.label}. ${seg.effort ?? "hard"} for ${untilWord(seg)}. Go.`;
  }
}

// Spoken close-out for a finishing segment (only work reps report a result).
function doneLine(seg: Segment, paceSec: number): string {
  if (seg.kind !== "work") return "";
  if (seg.until.type === "distance" && paceSec > 0) return `${seg.label} done. ${fmtPace(paceSec)}.`;
  return `${seg.label} done.`;
}

export function useSegmentRunner(opts: {
  segments: Segment[] | undefined;
  miles: number;
  movingSec: number;
  running: boolean; // Run Mode is in the live phase
  cue: (text: string, variant?: "info" | "alert") => void;
  resume?: SegCheckpoint | null;
}): SegState & { checkpoint(): SegCheckpoint | null } {
  const { segments, miles, movingSec, running, cue, resume } = opts;

  const idxRef = useRef(resume?.index ?? 0);
  const startMiRef = useRef(resume?.startMi ?? 0);
  const startSecRef = useRef(resume?.startSec ?? 0);
  const startedRef = useRef(false);
  const pingedRef = useRef(false); // "ten seconds" heads-up fired for the current timed segment
  const doneRef = useRef(false);
  const [idx, setIdx] = useState(idxRef.current); // re-render on advance

  useEffect(() => {
    if (!segments || segments.length === 0 || !running || doneRef.current) return;

    // First tick after GO (or after a crash-recovery resume): announce the
    // segment we're on and anchor its start markers to the current totals.
    if (!startedRef.current) {
      startedRef.current = true;
      if (!resume) {
        startMiRef.current = miles;
        startSecRef.current = movingSec;
      }
      cue(startLine(segments[idxRef.current]), "info");
      return;
    }

    const seg = segments[idxRef.current];
    const elapsedMi = miles - startMiRef.current;
    const elapsedSec = movingSec - startSecRef.current;

    // Heads-up near the end of a longer timed segment, so a surge/jog change
    // isn't a surprise.
    if (seg.until.type === "time" && seg.until.seconds > 30 && !pingedRef.current) {
      if (seg.until.seconds - elapsedSec <= 10) {
        pingedRef.current = true;
        cue("Ten seconds.", "info");
      }
    }

    const hit =
      seg.until.type === "distance"
        ? elapsedMi >= seg.until.miles - 1e-4
        : elapsedSec >= seg.until.seconds;
    if (!hit) return;

    const repPaceSec = elapsedMi > 0 ? elapsedSec / elapsedMi : 0;
    const last = idxRef.current >= segments.length - 1;
    if (last) {
      doneRef.current = true;
      const close = doneLine(seg, repPaceSec);
      cue(`${close} Workout complete. Nice session.`.trim(), "alert");
      setIdx(idxRef.current); // no advance, but settle state
      return;
    }

    // Advance: close out this segment + introduce the next in one utterance.
    idxRef.current += 1;
    startMiRef.current = miles;
    startSecRef.current = movingSec;
    pingedRef.current = false;
    const next = segments[idxRef.current];
    const close = doneLine(seg, repPaceSec);
    cue(`${close} ${startLine(next)}`.trim(), next.kind === "work" ? "alert" : "info");
    setIdx(idxRef.current);
  }, [segments, miles, movingSec, running, cue, resume]);

  // ── Derived display state (recomputed each render from refs + live totals) ──
  const active = !!segments && segments.length > 0 && running;
  const seg = segments && segments.length > 0 ? segments[idx] : null;
  const workSegs = segments?.filter((s) => s.kind === "work") ?? [];
  const repTotal = workSegs.length || null;
  const repCurrent =
    seg?.kind === "work" && segments
      ? segments.slice(0, idx + 1).filter((s) => s.kind === "work").length
      : null;
  const elapsedMi = Math.max(0, miles - startMiRef.current);
  const elapsedSec = Math.max(0, movingSec - startSecRef.current);
  const isTimed = seg?.until.type === "time";

  return {
    active,
    done: doneRef.current,
    index: idx,
    segment: seg,
    total: segments?.length ?? 0,
    repCurrent,
    repTotal,
    paceKey: seg?.paceKey,
    isTimed,
    elapsedMi,
    elapsedSec,
    targetMi: seg && seg.until.type === "distance" ? seg.until.miles : null,
    remainingSec: seg && seg.until.type === "time" ? Math.max(0, seg.until.seconds - elapsedSec) : null,
    checkpoint: () =>
      active && !doneRef.current
        ? { index: idxRef.current, startMi: startMiRef.current, startSec: startSecRef.current }
        : null
  };
}

// Static preview rows for the pre-run screen (no live state).
export function segmentPreview(segments: Segment[]): { label: string; sub: string; kind: Segment["kind"] }[] {
  return segments.map((s) => ({
    label: s.label,
    kind: s.kind,
    sub:
      (s.until.type === "distance" ? miWord(s.until.miles) : timeWord(s.until.seconds)) +
      (s.paceKey ? ` · ${PACES[s.paceKey].replace("/mi", "").trim()}` : s.effort ? ` · ${s.effort}` : "")
  }));
}
