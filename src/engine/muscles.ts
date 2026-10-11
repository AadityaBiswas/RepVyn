import { checkinFor } from "./calibrate";
import { noveltyMult, priorExposures, saturate, setLoad } from "./load";
import { REGION_NAMES, REGION_PLURAL } from "./planner";
import { advanceTo, deposit, effectiveRho, fatigueOf, MS_PER_HOUR, toleranceOf, toleranceScale } from "./recovery";
import { emphasisOf, hoursFrom, readinessState, sessionStimulus, weeklyNeed } from "./state";
import { REGIONS, type EngineState, type Muscle, type ReadinessState, type Region } from "./types";

/**
 * The muscle-effects engine: what a set, an exercise or a workout does to each muscle, and which muscles have had the least
 * work. Pure read-only views. "What if" effects run the same per-set maths as the fold (load.ts, recovery.ts) on a copy of the
 * state, so they match what logging those sets would do.
 */

const DAY_MS = 24 * MS_PER_HOUR;

/** Every muscle by name, the 12 tracked regions and the ones only listed as helping. */
export const MUSCLE_NAMES: Record<Muscle, string> = {
  ...REGION_NAMES, forearms: "Forearms", traps: "Traps", obliques: "Obliques", adductors: "Inner thighs", hip_flexors: "Hip flexors",
};

export interface MuscleEffect {
  region: Region;
  name: string;
  /** "target": the exercise is built for it (catalog share 1); "secondary": it helps (0.5 or 0.25). */
  role: "target" | "secondary";
  /** The largest catalog share any of the exercises gives it: 1, 0.5 or 0.25. */
  share: number;
  /** Hard-set equivalents toward this week's target (saturated like a session). */
  hardSets: number;
  /** Fatigue added, as a share of a full normal session for this muscle (the user's tolerance). */
  load: number;
  /** Fatigue ÷ tolerance just before and right after the work. */
  loadBefore: number;
  loadAfter: number;
  /** Hours from now until the muscle is ready again after this work; 0 when it stays ready. */
  readyInH: number;
}

/** A set as planned (targetRir) or done (rir). Reps left default to 2. */
export interface EffectSet {
  reps?: number;
  seconds?: number;
  rir?: number;
  targetRir?: number;
}

/** What doing these sets now would do to each muscle they load, most-worked first. Unknown exercise ids are ignored. */
export function workEffects(s: EngineState, work: readonly { exerciseId: string; sets: readonly EffectSet[] }[], now: number): MuscleEffect[] {
  const P = s.params;
  const at = advanceTo(s, now);
  const comps = { ...at.regions };
  const raw: Partial<Record<Region, number>> = {};
  const added: Partial<Record<Region, number>> = {};
  const share: Partial<Record<Region, number>> = {};
  for (const item of work) {
    const ex = s.catalog.byId[item.exerciseId];
    if (!ex) continue;
    const k = priorExposures(s, ex.id, null, now);
    for (const set of item.sets) {
      const x = set.seconds !== undefined ? set.seconds / P.hold.secondsPerRep : (set.reps ?? 0);
      const { stimulus, fatigue } = setLoad(ex, x, set.rir ?? set.targetRir ?? 2, k, P, noveltyMult(s));
      for (const m of REGIONS) {
        const c = ex.contributions[m];
        if (!c) continue;
        raw[m] = (raw[m] ?? 0) + stimulus * c;
        added[m] = (added[m] ?? 0) + fatigue * c;
        share[m] = Math.max(share[m] ?? 0, c);
        comps[m] = deposit(comps[m], fatigue * c, P);
      }
    }
  }
  const rho = effectiveRho(s, now);
  return REGIONS.filter((m) => share[m] !== undefined)
    .map((m): MuscleEffect => {
      const T = toleranceOf(s, m);
      return {
        region: m,
        name: REGION_NAMES[m],
        role: share[m] === 1 ? "target" : "secondary",
        share: share[m]!,
        hardSets: saturate(raw[m]!, P),
        load: added[m]! / T,
        loadBefore: fatigueOf(at.regions[m]) / T,
        loadAfter: fatigueOf(comps[m]) / T,
        readyInH: hoursFrom(comps[m], m, rho, P, toleranceScale(s, m)),
      };
    })
    .sort((a, b) => b.share - a.share || b.hardSets - a.hardSets || REGIONS.indexOf(a.region) - REGIONS.indexOf(b.region));
}

export interface ExerciseEffects {
  exerciseId: string;
  regions: MuscleEffect[];
  /** Muscles that help but are not stress-tracked (stabilisers, grip). */
  alsoUses: Muscle[];
  /** "Works chest hard; triceps and front shoulders moderately. Also uses abs." */
  summary: string;
}

const lower = (m: Muscle) => MUSCLE_NAMES[m].toLowerCase();
const join = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** The muscles an exercise works, in words, from the catalog alone (no sets needed). */
export function muscleSummary(s: EngineState, exerciseId: string): string {
  const ex = s.catalog.byId[exerciseId];
  if (!ex) return "";
  const at = (c: number) => REGIONS.filter((m) => ex.contributions[m] === c).map(lower);
  const parts = [
    at(1).length ? `Works ${join(at(1))} hard` : "",
    at(0.5).length ? `${join(at(0.5))} moderately` : "",
    at(0.25).length ? `${join(at(0.25))} lightly` : "",
  ].filter(Boolean);
  const also = ex.alsoUses.length ? ` Also uses ${join(ex.alsoUses.map(lower))}.` : "";
  return `${parts.join("; ")}.${also}`;
}

/** One exercise's effect on each muscle for the given sets, done now. */
export function exerciseEffects(s: EngineState, exerciseId: string, sets: readonly EffectSet[], now: number): ExerciseEffects {
  const ex = s.catalog.byId[exerciseId];
  return { exerciseId, regions: workEffects(s, [{ exerciseId, sets }], now), alsoUses: ex?.alsoUses ?? [], summary: muscleSummary(s, exerciseId) };
}

/** A whole planned workout's effect on each muscle (a Plan's exercises, or any list of exercises with sets). */
export function planEffects(s: EngineState, plan: { exercises: readonly { exerciseId: string; sets: readonly EffectSet[] }[] }, now: number): MuscleEffect[] {
  return workEffects(s, plan.exercises, now);
}

export interface MuscleUsage {
  region: Region;
  name: string;
  /** Hard sets in the last 7 days, and this week's target. */
  done: number;
  target: number;
  /** done ÷ target (0 = untouched this week). */
  fraction: number;
  /** Average hard sets a week over the last 28 days, ÷ target. */
  fraction28: number;
  /** Start of the last session that worked it (≥ a quarter of a hard set), or null if never. */
  lastTrained: number | null;
  daysSince: number | null;
  /** Readiness now; a muscle reported sore today counts as fatigued, as in the planner. */
  state: ReadinessState;
  hoursToReady: number;
  /** In the profile's excludeRegions: never suggested. */
  excluded: boolean;
}

/** Every muscle's recent work, least used first (this week, then the last four weeks, then the longest since trained). */
export function muscleUsage(s: EngineState, now: number): MuscleUsage[] {
  const P = s.params;
  const need = weeklyNeed(s, now);
  const at = advanceTo(s, now);
  const rho = effectiveRho(s, now);
  const sore = new Set<Region>(checkinFor(s, now)?.soreRegions ?? []);
  const excluded = new Set<Region>(s.profile?.excludeRegions ?? []);
  const past = s.sessions.filter((x) => x.start <= now).map((x) => ({ start: x.start, stim: sessionStimulus(x, P) }));
  return REGIONS.map((m): MuscleUsage => {
    const scale = toleranceScale(s, m);
    const F = fatigueOf(at.regions[m]);
    const month = past.filter((x) => x.start > now - 28 * DAY_MS).reduce((a, x) => a + x.stim[m], 0) / 4;
    const last = past.filter((x) => x.stim[m] >= 0.25).reduce<number | null>((a, x) => (a === null || x.start > a ? x.start : a), null);
    return {
      region: m,
      name: REGION_NAMES[m],
      done: need[m].done,
      target: need[m].target,
      fraction: need[m].done / need[m].target,
      fraction28: month / need[m].target,
      lastTrained: last,
      daysSince: last === null ? null : Math.floor((now - last) / DAY_MS),
      state: sore.has(m) ? "fatigued" : readinessState(F, P, scale),
      hoursToReady: hoursFrom(at.regions[m], m, rho, P, scale),
      excluded: excluded.has(m),
    };
  }).sort((a, b) =>
    Number(a.excluded) - Number(b.excluded) ||
    a.fraction - b.fraction ||
    a.fraction28 - b.fraction28 ||
    (b.daysSince ?? Infinity) - (a.daysSince ?? Infinity) ||
    REGIONS.indexOf(a.region) - REGIONS.indexOf(b.region));
}

/**
 * The muscles most behind: not excluded, not fatigued, short of this week's target, least used first. Muscles the program
 * only maintains (emphasis below 1) come after the rest.
 */
export function leastUsedMuscles(s: EngineState, now: number, n = 3): Region[] {
  const u = muscleUsage(s, now).filter((x) => !x.excluded && x.state !== "fatigued" && x.fraction < 1);
  const main = u.filter((x) => emphasisOf(s, x.region) >= 1);
  return [...main, ...u.filter((x) => emphasisOf(s, x.region) < 1)].slice(0, n).map((x) => x.region);
}

/** "Biceps: 0 of 8 hard sets this week" / "Chest: not trained in 9 days". */
export function usageWords(u: MuscleUsage): string {
  const v = REGION_PLURAL[u.region] ? "have" : "has";
  if (u.lastTrained === null) return `${u.name} ${v} not been trained yet`;
  if (u.done < 0.5 && u.daysSince !== null && u.daysSince >= 7) return `${u.name}: not trained in ${u.daysSince} days`;
  return `${u.name}: ${Math.round(u.done)} of ${Math.round(u.target)} hard sets this week`;
}
