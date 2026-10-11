import { byLevel, level } from "./level";
import { MS_PER_HOUR } from "./recovery";
import { clamp, type EngineState, type Exercise, type Params } from "./types";

/** Reps-equivalent of a logged set: holds convert via hold.secondsPerRep. */
export function repsEq(set: { reps?: number; holdSeconds?: number }, params: Params): number {
  return set.holdSeconds !== undefined ? set.holdSeconds / params.hold.secondsPerRep : (set.reps ?? 0);
}

/**
 * k: distinct prior sessions containing any exercise on e's ladder (its movement family) within the novelty window
 * before ts (the given session excluded). A new variation of a familiar movement is not novel.
 */
export function priorExposures(s: EngineState, exerciseId: string, sessionId: string | null, ts: number): number {
  const from = ts - s.params.novelty.windowDays * 24 * MS_PER_HOUR;
  const ladder = s.catalog.byId[exerciseId]?.ladderId;
  const sessions = new Set<string>();
  for (const e of s.catalog.exercises) {
    if (e.ladderId !== ladder) continue;
    for (const x of s.exposures[e.id] ?? []) if (x.sessionId !== sessionId && x.ts >= from && x.ts <= ts) sessions.add(x.sessionId);
  }
  return sessions.size;
}

/** Novelty amplitude multiplier at the user's level (trained lifters take less damage from new movements). */
export const noveltyMult = (s: EngineState): number => byLevel(s.params.novelty.experience, level(s).score);

/** N = 1 + amp * mult * exp(-k / decay), k = distinct prior sessions with e's ladder inside the novelty window. */
export function noveltyFactor(k: number, params: Params, mult = 1): number {
  return 1 + params.novelty.amp * mult * Math.exp(-k / params.novelty.decay);
}

/** Per-set stimulus and fatigue (section 5.1), before splitting across regions by contribution. */
export function setLoad(
  ex: Pick<Exercise, "lengthened">,
  reps: number,
  rir: number,
  k: number,
  params: Params,
  noveltyMult = 1,
): { stimulus: number; fatigue: number } {
  const r = Math.min(rir, params.effort.fatigue.length - 1);
  const x = clamp(reps, params.reps.min, params.reps.max);
  const g = (x / params.reps.ref) ** params.reps.exponent;
  const L = ex.lengthened ? params.lengthenedFactor : 1;
  return {
    stimulus: params.effort.stimulus[r]!,
    fatigue: params.effort.fatigue[r]! * g * noveltyFactor(k, params, noveltyMult) * L,
  };
}

/** sessionStimulus = sessionMax * (1 - exp(-raw / sessionMax)). */
export function saturate(raw: number, params: Params): number {
  const max = params.stimulus.sessionMax;
  return max * (1 - Math.exp(-raw / max));
}
