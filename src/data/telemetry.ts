/**
 * Local telemetry log for comparing the primary (MediaPipe + heuristic)
 * mood prediction against the shadow FER2013 model's prediction.
 *
 * There's no analytics backend in this project yet, so this intentionally
 * stores a small, capped log in localStorage rather than sending anything
 * over the network. It never stores raw frames or images - only the
 * derived labels/confidences from both systems, which is all that's
 * needed to later evaluate agreement/disagreement.
 *
 * When a real backend endpoint exists, the natural next step is to flush
 * `getMoodTelemetryLog()` there periodically (or on an interval) and clear
 * it locally - nothing else in this file needs to change for that.
 */

import type { MoodName } from "../types";

const STORAGE_KEY = "kiku-mood-telemetry";
const MAX_ENTRIES = 200;

export interface MoodTelemetryEntry {
  timestamp: number;
  primaryMood: MoodName;
  primaryConfidence: number;
  shadowMood: MoodName | null;
  shadowConfidence: number | null;
  agreement: boolean | null; // null when the shadow model had no reading
}

export function logMoodComparison(entry: Omit<MoodTelemetryEntry, "agreement">): void {
  try {
    const agreement =
      entry.shadowMood === null ? null : entry.shadowMood === entry.primaryMood;
    const full: MoodTelemetryEntry = { ...entry, agreement };

    const existing = getMoodTelemetryLog();
    const updated = [...existing, full].slice(-MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    // Telemetry is best-effort only - never let a logging failure affect
    // the actual mood-scan feature.
    console.warn("Kiku mood telemetry log failed (non-fatal):", error);
  }
}

export function getMoodTelemetryLog(): MoodTelemetryEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MoodTelemetryEntry[]) : [];
  } catch {
    return [];
  }
}

export function clearMoodTelemetryLog(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
}
