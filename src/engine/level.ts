import { clamp, type DefaultM, type EngineState, type Experience, type Region } from "./types";

/**
 * Training level as a continuous score: 0 = beginner, 1 = intermediate, 2 = advanced.
 * Inferred from clean max-effort sets (reps + RIR) against each exercise's catalog norms (defaultM).
 * While calibrating, the effective level is the prior (self-reported experience, else intermediate).
 */
export const LEVEL_SCORE: Record<Experience, number> = { beginner: 0, intermediate: 1, advanced: 2 };

export const levelName = (score: number): Experience => (score < 0.5 ? "beginner" : score < 1.5 ? "intermediate" : "advanced");

/** Piecewise-linear value of a per-experience record at a level score (clamped to [0, 2]). */
export function byLevel(rec: Record<Experience, number>, score: number): number {
  const x = clamp(score, 0, 2);
  return x <= 1 ? rec.beginner + x * (rec.intermediate - rec.beginner) : rec.intermediate + (x - 1) * (rec.advanced - rec.intermediate);
}

/** An exercise's expected max reps at a level score (defaultM interpolated in log space). */
export function normAt(norm: DefaultM, score: number): number {
  const x = clamp(score, 0, 2);
  if (Number.isInteger(x)) return norm[levelName(x)];
  const ln = { beginner: Math.log(norm.beginner), intermediate: Math.log(norm.intermediate), advanced: Math.log(norm.advanced) };
  return Math.exp(byLevel(ln, score));
}

/**
 * Where an observed max sits on the exercise's norms, and how much it tells: weight = ln(advanced / beginner),
 * so an exercise whose norms barely differ by level (e.g. wall push-ups) counts little. Clamped to [0, 2].
 */
export function scoreObservation(norm: DefaultM, M_obs: number): { score: number; weight: number } {
  const [b, i, a] = [norm.beginner, norm.intermediate, norm.advanced].map(Math.log) as [number, number, number];
  const weight = a - b;
  if (weight <= 0 || M_obs <= 0) return { score: 1, weight: 0 };
  const x = Math.log(M_obs);
  const score = x <= b ? 0 : x >= a ? 2 : x < i ? (x - b) / (i - b) : 1 + (x - i) / (a - i);
  return { score, weight };
}

/**
 * Called by calibration for each clean max-effort (capacity) observation. `norm` is the exercise's defaultM (value = reps)
 * or, for weighted exercises, its loadNorm (value = 1RM ÷ body mass). Keeps the last level.window per ladder.
 */
export function recordLevelObservation(s: EngineState, ladderId: string, norm: DefaultM | undefined, value: number): void {
  if (!norm) return;
  const o = scoreObservation(norm, value);
  if (o.weight === 0) return;
  const list = (s.levelObs[ladderId] ??= []);
  list.push(o);
  if (list.length > s.params.level.window) list.shift();
}

export interface LevelEstimate {
  /** Level the engine uses now: the prior while calibrating, the estimate after. */
  score: number;
  experience: Experience;
  /** Data-driven estimate so far (shown during calibration too). */
  estimate: number;
  prior: number;
  /** Share of the estimate that comes from data rather than the prior, 0..1. */
  confidence: number;
  calibrated: boolean;
  /** Per movement family (ladder), shrunk toward the overall estimate. */
  byLadder: Record<string, { score: number; n: number }>;
}

/**
 * Shrinkage estimator: overall = (priorWeight·prior + Σ w·score) / (priorWeight + Σ w) over all ladders' recent
 * observations; each ladder = (ladderPriorWeight·overall + Σ w·score) / (ladderPriorWeight + Σ w).
 */
export function level(s: EngineState): LevelEstimate {
  const { priorWeight, ladderPriorWeight } = s.params.level;
  const prior = s.profile?.experience ? LEVEL_SCORE[s.profile.experience] : 1;
  const ladders = Object.entries(s.levelObs).map(([id, xs]) => {
    const w = xs.reduce((a, x) => a + x.weight, 0);
    return { id, w, sum: xs.reduce((a, x) => a + x.score * x.weight, 0), n: xs.length };
  });
  const W = ladders.reduce((a, l) => a + l.w, 0);
  const estimate = (priorWeight * prior + ladders.reduce((a, l) => a + l.sum, 0)) / (priorWeight + W);
  const byLadder = Object.fromEntries(ladders.map((l) => [l.id, { score: (ladderPriorWeight * estimate + l.sum) / (ladderPriorWeight + l.w), n: l.n }]));
  const calibrated = s.calibratedAt !== null;
  const score = calibrated ? estimate : prior;
  return { score, experience: levelName(score), estimate, prior, confidence: W / (priorWeight + W), calibrated, byLadder };
}

/** Effective level for one movement family. */
export function ladderLevel(s: EngineState, ladderId: string): number {
  const l = level(s);
  return l.calibrated ? (l.byLadder[ladderId]?.score ?? l.score) : l.score;
}

/** Effective level for a muscle: mean of the measured ladders that train it as a primary mover (c = 1), else overall. */
export function regionLevel(s: EngineState, m: Region): number {
  const l = level(s);
  if (!l.calibrated) return l.score;
  const ids = new Set(s.catalog.exercises.filter((e) => e.contributions[m] === 1).map((e) => e.ladderId));
  const measured = [...ids].flatMap((id) => (l.byLadder[id] ? [l.byLadder[id]!] : []));
  if (!measured.length) return l.score;
  return measured.reduce((a, x) => a + x.score * x.n, 0) / measured.reduce((a, x) => a + x.n, 0);
}
