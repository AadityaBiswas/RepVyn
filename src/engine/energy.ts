import type { EngineState, SessionRecord } from "./types";

/**
 * Calories for a workout, from the 2024 Adult Compendium of Physical Activities (Herrmann et al., 2024).
 *
 * - Each set: active time (reps × energy.secondsPerRep, ×2 for one-side-at-a-time exercises; holds use their seconds)
 *   at a MET chosen by exercise class and effort (reps left). Compendium anchors: 02020 vigorous calisthenics 7.5,
 *   02057 high-intensity body-weight resistance 6.5, 02022 moderate calisthenics 3.8, 02024 light calisthenics
 *   (crunches, plank) 2.8. Warm-up sets use the "5+ left" value.
 * - Rest between sets: 07040 standing quietly, 1.3 MET, from the real gaps between sets, capped at maxRestMin
 *   (a phone left open is not exercise); unusable gaps (≤ 0) count as defaultRestMin.
 * - Recovery oxygen after hard work (EPOC): recoveryFraction × the sets' net energy.
 * - kcal/min per MET = 3.5 mL/kg/min × kg / 200 (ACSM). "Active" calories are net of resting burn (what watches show).
 *   Resting burn for "total" is Mifflin–St Jeor when height, age and sex are known, else the standard 1 MET.
 * - Estimates, not measurements: returned with a ± range (Compendium values do not reflect an individual's exact cost).
 */
export interface WorkoutCalories {
  minutes: number;
  activeMinutes: number;
  activeKcal: number;
  totalKcal: number;
  /** Likely range of active kcal. */
  low: number;
  high: number;
  byExercise: { exerciseId: string; kcal: number }[];
  restingMethod: "mifflin_st_jeor" | "standard_met";
}

/** kcal/min burned at rest: Mifflin–St Jeor when height and age are known (sex-neutral constant if sex is unknown), else 1 MET. */
export function restingKcalPerMin(body: { bodyMassKg: number; heightCm?: number; ageYears?: number; sex?: "female" | "male" }): { kcal: number; method: WorkoutCalories["restingMethod"] } {
  const { bodyMassKg: kg, heightCm, ageYears, sex } = body;
  if (heightCm === undefined || ageYears === undefined) return { kcal: (3.5 * kg) / 200, method: "standard_met" };
  const s = sex === "male" ? 5 : sex === "female" ? -161 : -78;
  return { kcal: (10 * kg + 6.25 * heightCm - 5 * ageYears + s) / 1440, method: "mifflin_st_jeor" };
}

type LogEntry = SessionRecord["log"][number];

/** The calorie maths over a set log (sorted by ts; ts is when each set ended). Shared by finished sessions and estimates. */
function logCalories(s: EngineState, log: readonly LogEntry[]): WorkoutCalories | null {
  const kg = s.profile?.bodyMassKg;
  if (kg === undefined || !log.length) return null;
  const E = s.params.energy;
  const perMetMin = (3.5 * kg) / 200;
  const byExercise = new Map<string, number>();
  let setsNet = 0;
  let restNet = 0;
  let activeMin = 0;
  let restMin = 0;
  log.forEach((x, i) => {
    const ex = s.catalog.byId[x.exerciseId]!;
    const mets = E.lightPatterns.includes(ex.pattern) ? E.met.light : E.met.compound;
    const met = mets[x.isWarmup ? 5 : Math.min(5, x.rir)]!;
    const setMin = x.activeSeconds / 60;
    const setKcal = (met - 1) * perMetMin * setMin;
    let rest = 0;
    if (i > 0) {
      const gap = (x.ts - log[i - 1]!.ts) / 60_000 - setMin;
      rest = gap > 0 ? Math.min(gap, E.maxRestMin) : E.defaultRestMin;
    }
    const restKcal = (E.met.rest - 1) * perMetMin * rest;
    setsNet += setKcal;
    restNet += restKcal;
    activeMin += setMin;
    restMin += rest;
    byExercise.set(x.exerciseId, (byExercise.get(x.exerciseId) ?? 0) + setKcal * (1 + E.recoveryFraction) + restKcal);
  });
  const activeKcal = setsNet * (1 + E.recoveryFraction) + restNet;
  const minutes = activeMin + restMin;
  const resting = restingKcalPerMin({ ...s.profile!, bodyMassKg: kg });
  const u = resting.method === "mifflin_st_jeor" ? E.uncertainty.withBody : E.uncertainty.massOnly;
  return {
    minutes,
    activeMinutes: activeMin,
    activeKcal,
    totalKcal: activeKcal + resting.kcal * minutes,
    low: activeKcal * (1 - u),
    high: activeKcal * (1 + u),
    byExercise: [...byExercise].map(([exerciseId, kcal]) => ({ exerciseId, kcal })).sort((a, b) => b.kcal - a.kcal),
    restingMethod: resting.method,
  };
}

/** Calories of a logged session. Null without body mass or sets. */
export function sessionCalories(s: EngineState, session: SessionRecord): WorkoutCalories | null {
  return logCalories(s, [...session.log].sort((a, b) => a.ts - b.ts));
}

/** A set for a calorie estimate: planned (targetRir) or done but not yet logged (rir, ts). */
export interface CalorieSet {
  exerciseId: string;
  reps?: number;
  seconds?: number;
  /** Reps left; default the plan's targetRir, else 2. */
  rir?: number;
  targetRir?: number;
  isWarmup?: boolean;
  /** When the set ended. Without it, sets are spaced by energy.defaultRestMin of rest. */
  ts?: number;
}

/**
 * Calories for sets that are planned, or done and not yet logged (the end-of-workout screen): the same maths as
 * sessionCalories. Active time follows the fold (reps × secondsPerRep, ×2 for one side at a time). Dumbbell sets use the
 * same effort-based METs as body-weight sets: the Compendium rates resistance work by effort, not by the weight moved.
 * Null without body mass or sets.
 */
export function estimateCalories(s: EngineState, sets: readonly CalorieSet[]): WorkoutCalories | null {
  const E = s.params.energy;
  const timed = sets.every((x) => x.ts !== undefined);
  let t = 0;
  const log: LogEntry[] = [];
  for (const x of sets) {
    const ex = s.catalog.byId[x.exerciseId];
    if (!ex) continue;
    const activeSeconds = (x.seconds ?? (x.reps ?? 0) * E.secondsPerRep) * (ex.unilateral ? 2 : 1);
    t += (log.length ? E.defaultRestMin * 60_000 : 0) + activeSeconds * 1000;
    log.push({ exerciseId: ex.id, ts: timed ? x.ts! : t, activeSeconds, rir: Math.max(0, Math.min(5, x.rir ?? x.targetRir ?? 2)), isWarmup: x.isWarmup ?? false });
  }
  return logCalories(s, timed ? log.sort((a, b) => a.ts - b.ts) : log);
}

/** Expected calories of a planned workout (its sets at their target effort, typical rests). */
export function planCalories(s: EngineState, plan: { exercises: readonly { exerciseId: string; sets: readonly { reps?: number; seconds?: number; targetRir: number }[] }[] }): WorkoutCalories | null {
  return estimateCalories(s, plan.exercises.flatMap((x) => x.sets.map((y) => ({ exerciseId: x.exerciseId, reps: y.reps, seconds: y.seconds, targetRir: y.targetRir }))));
}
