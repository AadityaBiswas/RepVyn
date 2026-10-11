import { ladderExercises } from "./catalog";
import { capacityOf, chooseWeight, targetRir, type LoadFlag } from "./capacity";
import { byLevel, ladderLevel } from "./level";
import { repsAt, strengthOf } from "./strength";
import { clamp, type EngineState, type Exercise, type Rating } from "./types";

export type DifficultyLabel = "too_easy" | "easy" | "right_challenge" | "hard" | "too_hard";

export interface PersonalDifficulty {
  /** 1 (too easy to be useful) .. 5 (too hard), one decimal. */
  score: number;
  label: DifficultyLabel;
  /** "predicted" = the library rating at the user's level only; "personal" = the user's data moved it. */
  source: "predicted" | "personal";
  /** Up to two demand tags that are hard for this user, plus strength reasons once measured. */
  reasons: string[];
}

const RATING_VALUE: Record<Rating, number> = { too_easy: -1, just_right: 0, too_hard: 1 };

export function difficultyLabel(score: number): DifficultyLabel {
  return score < 1.5 ? "too_easy" : score < 2.5 ? "easy" : score < 3.5 ? "right_challenge" : score < 4.5 ? "hard" : "too_hard";
}

/** Fold step for a one-tap rating: updates this exercise's rating average and the offset of each of its demand tags. */
export function applyRating(s: EngineState, exerciseId: string, rating: Rating): void {
  const ex = s.catalog.byId[exerciseId];
  if (!ex) return;
  const P = s.params.difficulty;
  const r = RATING_VALUE[rating];
  const prev = s.ratings[ex.id] ?? 0;
  s.ratings[ex.id] = prev + P.ratingAlpha * (r - prev);
  for (const k of ex.demands) {
    s.demandOffsets[k] = clamp(s.demandOffsets[k] + P.demandAlpha * (r - s.demandOffsets[k]), -P.demandMax, P.demandMax);
  }
}

/**
 * Planner preference for the right challenge: f = 1 − preferWeight·|difficulty − 3| / 2 (in [0.7, 1] by default).
 * A negative score is divided by f instead, so a poor fit always counts against the candidate.
 */
export function applyFit(score: number, difficulty: number, preferWeight: number): number {
  const f = 1 - (preferWeight * Math.abs(difficulty - 3)) / 2;
  return score >= 0 ? score * f : score / f;
}

/** S: 3 at mid-range target reps, 1 at twice that, 5 at half. */
const fitScore = (targetReps: number, mid: number) => clamp(3 - 2 * Math.log2(Math.max(targetReps, 1e-9) / mid), 1, 5);

/** Strength fit S, clean observations n, and the load flag; null when a weighted exercise has no owned dumbbells. */
function strengthFit(s: EngineState, ex: Exercise, now: number): { S: number; n: number; flag: LoadFlag } | null {
  const rir = targetRir(s, now);
  if (ex.weighted) {
    const choice = chooseWeight(s, ex.id, now);
    if (!choice) return null;
    const [lo, hi] = s.params.strength.repRange;
    const target = repsAt(strengthOf(s, ex, now).oneRm, choice.weightKg) - rir;
    const S = choice.loadFlag === "too_heavy" ? 5 : choice.loadFlag === "too_light" ? 1 : fitScore(target, (lo + hi) / 2);
    return { S, n: s.strength[ex.id]?.obs ?? 0, flag: choice.loadFlag };
  }
  const [lo, hi] = s.params.capacity.repRange;
  return { S: fitScore(capacityOf(s, ex.id, now).M - rir, (lo + hi) / 2), n: s.capacity[ex.id]?.obs ?? 0, flag: null };
}

/** Another rung of this exercise's ladder has been measured. */
const ladderMeasured = (s: EngineState, ex: Exercise) =>
  ladderExercises(s.catalog, ex.ladderId).some((o) => o.id !== ex.id && ((s.capacity[o.id]?.obs ?? 0) > 0 || (s.strength[o.id]?.obs ?? 0) > 0));

/**
 * Personal difficulty (spec §3), derived on every read so it never drifts from the state:
 * clamp((1 − w)·P + w·S + R + D, 1, 5), with P the library rating at the user's level, S the strength fit,
 * w = n / (n + trustK) (or neighbourTrust for an unmeasured rung beside a measured one), R the rating average
 * and D the mean demand offset.
 */
export function difficultyOf(s: EngineState, exerciseId: string, now: number): PersonalDifficulty {
  const ex = s.catalog.byId[exerciseId];
  if (!ex) throw new Error(`unknown exercise ${exerciseId}`);
  const P = s.params.difficulty;
  const predicted = byLevel(ex.difficulty, ladderLevel(s, ex.ladderId));
  const fit = strengthFit(s, ex, now);
  const w = !fit ? 0 : fit.n > 0 ? fit.n / (fit.n + P.trustK) : ladderMeasured(s, ex) ? P.neighbourTrust : 0;
  const R = s.ratings[ex.id] ?? 0;
  const D = ex.demands.length ? ex.demands.reduce((a, k) => a + s.demandOffsets[k], 0) / ex.demands.length : 0;
  const score = Math.round(clamp((1 - w) * predicted + w * (fit?.S ?? 0) + R + D, 1, 5) * 10) / 10;

  const reasons = [...ex.demands]
    .filter((k) => s.demandOffsets[k] > 0.25)
    .sort((a, b) => s.demandOffsets[b] - s.demandOffsets[a])
    .slice(0, 2) as string[];
  if (fit && w > 0) {
    if (fit.flag === "too_light") reasons.push("dumbbells too light");
    else if (fit.flag === "too_heavy") reasons.push("dumbbells too heavy");
    else if (fit.S >= 4) reasons.push("not enough reps");
  }
  return { score, label: difficultyLabel(score), source: w === 0 && R === 0 && D === 0 ? "predicted" : "personal", reasons };
}
