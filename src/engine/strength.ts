import type { FirstSetMode } from "./capacity";
import { byLevel, ladderLevel } from "./level";
import { MS_PER_HOUR } from "./recovery";
import type { EngineState, Exercise, Profile } from "./types";

/** Epley's constant: reps to failure at weight w ≈ EPLEY · (1RM / w − 1). */
export const EPLEY = 30;

/** Reps to failure with one dumbbell of `w` kg when fresh, at least 1. */
export function repsAt(oneRm: number, w: number): number {
  return Math.max(1, EPLEY * (oneRm / w - 1));
}

/** One-rep max implied by `M` reps to failure at `w` kg (M below 0 counts as 0). */
export function oneRmFrom(w: number, M: number): number {
  return w * (1 + Math.max(0, M) / EPLEY);
}

/** The dumbbell weights a user owns, ascending. Adjustable steps are rounded to grams so 1 + 3·0.1 is exactly 1.3. */
export function ownedWeights(profile: Profile | null): number[] {
  const d = profile?.dumbbells;
  if (!d) return [];
  if (d.kind === "fixed") return [...d.kg].sort((a, b) => a - b);
  const out: number[] = [];
  // The schema guarantees stepKg >= 1 g and at most 100 weights; the guards keep a hand-built profile positive, distinct and bounded.
  for (let i = 0; i < 100; i++) {
    const raw = d.minKg + i * d.stepKg;
    if (raw > d.maxKg + 1e-9) break;
    const w = Math.round(raw * 1000) / 1000;
    if (w > 0 && w !== out[out.length - 1]) out.push(w);
  }
  return out;
}

/** Two logged/owned weights count as the same load within half a gram (lb conversions are not exact: 42.5 lb = 19.277675725 kg). */
const SAME_WEIGHT_KG = 5e-4;
export const sameWeight = (a: number | null, b: number | null): boolean =>
  a === null || b === null ? a === b : Math.abs(a - b) < SAME_WEIGHT_KG;

/** Weighted exercises need owned dumbbells; every other exercise can always be loaded. */
export const canLoad = (s: EngineState, ex: Exercise): boolean => !ex.weighted || ownedWeights(s.profile).length > 0;

/**
 * Starting 1RM before any measurement: the user's "usual weight" (they stop about usualRir short of failure),
 * else body mass × loadNorm at their level × initFactor (cautious).
 */
export function initialOneRm(s: EngineState, ex: Exercise): number {
  const P = s.params.strength;
  const usual = s.usualWeights[ex.id];
  if (usual) return oneRmFrom(usual.weightKg, usual.reps + P.usualRir + s.b.value);
  if (!ex.loadNorm) throw new Error(`${ex.id}: not a weighted exercise`);
  const mass = s.profile?.bodyMassKg ?? P.fallbackBodyMassKg;
  return mass * byLevel(ex.loadNorm, ladderLevel(s, ex.ladderId)) * P.initFactor;
}

/** 1RM to use at `now` and whether the next set should be a technical-failure test (mirrors capacityOf). */
export function strengthOf(s: EngineState, ex: Exercise, now: number): { oneRm: number; firstSetMode: FirstSetMode } {
  const entry = s.strength[ex.id];
  if (!entry) return { oneRm: initialOneRm(s, ex), firstSetMode: "technical_failure" };
  const staleMs = s.params.capacity.staleDays * 24 * MS_PER_HOUR;
  if (entry.lastPerformed !== null && now - entry.lastPerformed > staleMs) {
    return { oneRm: entry.oneRm * s.params.capacity.staleFactor, firstSetMode: "technical_failure" };
  }
  return { oneRm: entry.oneRm, firstSetMode: null };
}

/** A weight to evaluate the exercise at when none is given: the last weight used, else the one for mid-range reps. */
export function referenceWeight(s: EngineState, ex: Exercise, now: number): number {
  const last = s.strength[ex.id]?.lastWeightKg;
  if (last !== null && last !== undefined) return last;
  const [lo, hi] = s.params.strength.repRange;
  return strengthOf(s, ex, now).oneRm / (1 + (lo + hi) / 2 / EPLEY);
}
