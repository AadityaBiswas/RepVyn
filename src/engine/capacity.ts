import { ladderExercises, ladderNeighbour, stepRatio } from "./catalog";
import { byLevel, ladderLevel, level, normAt } from "./level";
import { noveltyMult, priorExposures, setLoad } from "./load";
import { advanceTo, fatigueOf, MS_PER_HOUR, toleranceScale } from "./recovery";
import { canLoad, ownedWeights, referenceWeight, repsAt, sameWeight, strengthOf } from "./strength";
import { clamp, REGIONS, type EngineState, type Exercise, type Params, type Region, type RegionMap } from "./types";

/** Only regions with c >= 0.5 count toward effective fatigue (section 5.5). */
const MIN_EFFECTIVE_C = 0.5;

export type FirstSetMode = "technical_failure" | null;

/** A weighted prescription that could not reach the rep range with the owned dumbbells. */
export type LoadFlag = "too_heavy" | "too_light" | null;

export interface PrescribedSet {
  reps?: number;
  seconds?: number;
  weightKg?: number;
  targetRir: number;
  isAmrap: boolean;
}

export interface Prescription {
  exerciseId: string;
  sets: PrescribedSet[];
  firstSetMode: FirstSetMode;
  loadFlag: LoadFlag;
  reasons: string[];
}


function exercise(s: EngineState, id: string): Exercise {
  const ex = s.catalog.byId[id];
  if (!ex) throw new Error(`unknown exercise ${id}`);
  return ex;
}

/** Init order: defaultM at the user's level on this ladder -> nearest known ladder neighbour M × stepRatio^Δlevel -> fallbackM. */
export function initialM(s: EngineState, ex: Exercise): number {
  if (ex.defaultM) return normAt(ex.defaultM, ladderLevel(s, ex.ladderId));
  const known = ladderExercises(s.catalog, ex.ladderId)
    .filter((o) => s.capacity[o.id])
    .sort((a, b) => Math.abs(a.level - ex.level) - Math.abs(b.level - ex.level) || a.level - b.level)[0];
  if (known) return s.capacity[known.id]!.M * stepRatio(s.catalog, ex.ladderId) ** (ex.level - known.level);
  return s.params.capacity.fallbackM;
}

/**
 * Fresh capacity M_e to use at `now`, and whether the next set should go to technical failure.
 * Weighted exercises: reps to failure at `weightKg` (default: referenceWeight) from the estimated 1RM.
 */
export function capacityOf(s: EngineState, exerciseId: string, now: number, weightKg?: number): { M: number; firstSetMode: FirstSetMode } {
  const ex = exercise(s, exerciseId);
  if (ex.weighted) {
    const st = strengthOf(s, ex, now);
    return { M: repsAt(st.oneRm, weightKg ?? referenceWeight(s, ex, now)), firstSetMode: st.firstSetMode };
  }
  const entry = s.capacity[ex.id];
  if (!entry) return { M: initialM(s, ex), firstSetMode: "technical_failure" };
  const staleMs = s.params.capacity.staleDays * 24 * MS_PER_HOUR;
  if (entry.lastPerformed !== null && now - entry.lastPerformed > staleMs) {
    return { M: entry.M * s.params.capacity.staleFactor, firstSetMode: "technical_failure" };
  }
  return { M: entry.M, firstSetMode: null };
}

/** Fatigue added per region in the open session (null when none is open). */
function sessionAdded(s: EngineState): RegionMap | null {
  return s.sessions.find((x) => x.id === s.openSessionId)?.addedFatigue ?? null;
}

const effectiveRegions = (ex: Exercise): [Region, number][] =>
  REGIONS.flatMap((m) => {
    const c = ex.contributions[m];
    return c !== undefined && c >= MIN_EFFECTIVE_C ? [[m, c] as [Region, number]] : [];
  });

/** Contribution-weighted prior (carried) and in-session fatigue for exercise e at now, and the weighted tolerance scale. */
export function effectiveFatigue(s: EngineState, exerciseId: string, now: number): { F_prior_eff: number; F_sess_eff: number; scale_eff: number } {
  const regions = advanceTo(s, now).regions;
  const added = sessionAdded(s);
  let w = 0;
  let prior = 0;
  let sess = 0;
  let scale = 0;
  for (const [m, c] of effectiveRegions(exercise(s, exerciseId))) {
    const a = added?.[m] ?? 0;
    w += c;
    prior += c * Math.max(0, fatigueOf(regions[m]) - a);
    sess += c * a;
    scale += c * toleranceScale(s, m);
  }
  return { F_prior_eff: prior / w, F_sess_eff: sess / w, scale_eff: scale / w };
}

/**
 * Fraction of reps lost to carried fatigue: maxDrop · (1 − exp(−beta·F / (maxDrop·scale))).
 * Slope beta at F = 0 for scale 1; never exceeds maxDrop however much fatigue piles up.
 */
export function priorDrop(F_prior_eff: number, scale: number, params: Params): number {
  const { beta, maxDrop } = params.capacity;
  return maxDrop * (1 - Math.exp((-beta * F_prior_eff) / (maxDrop * scale)));
}

/** M_pred = M * (1 - priorDrop(F_prior_eff, scale)) * (1 - d) ^ F_sess_eff, floored at 0. */
export function predictedMax(s: EngineState, M: number, F_prior_eff: number, F_sess_eff: number, scale = 1): number {
  return Math.max(0, M * (1 - priorDrop(F_prior_eff, scale, s.params)) * (1 - s.d.value) ** F_sess_eff);
}

export function predictSet(s: EngineState, exerciseId: string, now: number, weightKg?: number): { M_pred: number; F_prior_eff: number; F_sess_eff: number; scale_eff: number } {
  const f = effectiveFatigue(s, exerciseId, now);
  return { M_pred: predictedMax(s, capacityOf(s, exerciseId, now, weightKg).M, f.F_prior_eff, f.F_sess_eff, f.scale_eff), ...f };
}

/** M_obs = repsEq + rir + b; AMRAP sets: M_obs = repsEq. */
export function observedMax(repsEq: number, rir: number, b: number, isAmrap: boolean): number {
  return isAmrap ? repsEq : repsEq + rir + b;
}

/** Deload is active from `since` for at most calibration.deload.maxDays. */
export function deloadActiveAt(s: EngineState, now: number): boolean {
  const maxMs = s.params.calibration.deload.maxDays * 24 * MS_PER_HOUR;
  return s.deload.active && s.deload.since !== null && now - s.deload.since <= maxMs;
}

/** How hard the user asked today's workout to be. */
export type DayIntensity = "easy" | "normal" | "hard";

export function targetRir(s: EngineState, now: number, intensity: DayIntensity = "normal"): number {
  const base = Math.round(byLevel(s.params.capacity.targetRir, level(s).score)) + (deloadActiveAt(s, now) ? s.params.planner.deloadRirAdd : 0);
  return intensity === "normal" ? base : clamp(base + s.params.planner.intensityRirAdd[intensity], 0, s.params.effort.fatigue.length - 1);
}

/** Reps left on a set logged without a rating: what the prediction says it was. Used only to size the set's fatigue. */
export function impliedRir(s: EngineState, exerciseId: string, repsEq: number, now: number, weightKg?: number): number {
  return clamp(Math.round(predictSet(s, exerciseId, now, weightKg).M_pred - repsEq - s.b.value), 0, s.params.effort.fatigue.length - 1);
}

export interface PrescribeOptions {
  /** Which ladder neighbours a move may pick. Default: profile equipment and not excluded. */
  canUse?: (e: Exercise) => boolean;
  /** Fatigue per region already planned earlier in this session (the planner's earlier picks). */
  plannedAdded?: Partial<RegionMap>;
  intensity?: DayIntensity;
}

/** A ladder neighbour the user can do. */
function usableNeighbour(s: EngineState, exerciseId: string, dir: 1 | -1, canUse?: (e: Exercise) => boolean): Exercise | undefined {
  const n = ladderNeighbour(s.catalog, exerciseId, dir);
  if (!n) return undefined;
  if (canUse) return canUse(n) ? n : undefined;
  if (!s.profile) return n;
  const { equipment, excludeExercises } = s.profile;
  return n.equipment.every((t) => equipment.includes(t)) && !excludeExercises.includes(n.id) && canLoad(s, n) ? n : undefined;
}

/** F_sess_eff added by fatigue planned (not yet logged) in this session. */
function plannedSessEff(ex: Exercise, planned?: Partial<RegionMap>): number {
  if (!planned) return 0;
  const eff = effectiveRegions(ex);
  return eff.reduce((a, [m, c]) => a + c * (planned[m] ?? 0), 0) / eff.reduce((a, [, c]) => a + c, 0);
}

/**
 * Prediction with a likely range: M_pred and the quantile band of this user's own recent relative errors
 * (range.window sets, exact observations only). Until range.minObs errors exist, ±range.defaultRel.
 * The band is at least ±range.minRel and always contains M_pred.
 */
export function predictRange(s: EngineState, exerciseId: string, now: number, weightKg?: number): { M_pred: number; low: number; high: number } {
  const { M_pred } = predictSet(s, exerciseId, now, weightKg);
  const R = s.params.range;
  const errs = s.predictionLog
    .filter((x) => !x.censored && x.M_pred > 0)
    .slice(-R.window)
    .map((x) => (x.M_obs - x.M_pred) / x.M_pred)
    .sort((a, b) => a - b);
  const q = (p: number) => errs[Math.min(errs.length - 1, Math.max(0, Math.round(p * (errs.length - 1))))]!;
  const [lo, hi] = errs.length < R.minObs ? [-R.defaultRel, R.defaultRel] : [Math.min(-R.minRel, q(1 - R.quantile)), Math.max(R.minRel, q(R.quantile))];
  return { M_pred, low: Math.max(0, M_pred * (1 + lo)), high: M_pred * (1 + hi) };
}

/** repsTarget of the next set: round(M_pred - targetRir), before any ladder move. Weighted: at `weightKg`. */
export function repsTarget(s: EngineState, exerciseId: string, now: number, planned?: Partial<RegionMap>, weightKg?: number, intensity?: DayIntensity): number {
  const f = effectiveFatigue(s, exerciseId, now);
  const M = capacityOf(s, exerciseId, now, weightKg).M;
  return Math.round(predictedMax(s, M, f.F_prior_eff, f.F_sess_eff + plannedSessEff(exercise(s, exerciseId), planned), f.scale_eff) - targetRir(s, now, intensity));
}

/**
 * The owned dumbbell weight for the next set of a weighted exercise (spec section 2, "Weight choice"):
 * keep last time's weight while its target reps stay in strength.repRange; else the in-range weight nearest
 * mid-range (tie: heavier); else too_heavy (lightest) / too_light (heaviest); else the weight nearest the range
 * (tie: lighter). Null when the exercise is unweighted or the user owns no dumbbells.
 */
export function chooseWeight(s: EngineState, exerciseId: string, now: number, planned?: Partial<RegionMap>, intensity?: DayIntensity): { weightKg: number; loadFlag: LoadFlag } | null {
  const ex = exercise(s, exerciseId);
  const W = ownedWeights(s.profile);
  if (!ex.weighted || W.length === 0) return null;
  const [lo, hi] = s.params.strength.repRange;
  const mid = (lo + hi) / 2;
  const reps = W.map((w) => repsTarget(s, ex.id, now, planned, w, intensity));
  const last = s.strength[ex.id]?.lastWeightKg ?? null;
  const li = last === null ? -1 : W.findIndex((w) => sameWeight(w, last));
  if (li >= 0 && reps[li]! >= lo && reps[li]! <= hi) return { weightKg: W[li]!, loadFlag: null };
  let best = -1;
  W.forEach((_, i) => {
    const r = reps[i]!;
    if (r < lo || r > hi) return;
    if (best < 0 || Math.abs(r - mid) <= Math.abs(reps[best]! - mid)) best = i; // ascending W: "<=" keeps the heavier on a tie
  });
  if (best >= 0) return { weightKg: W[best]!, loadFlag: null };
  if (reps.every((r) => r < lo)) return { weightKg: W[0]!, loadFlag: "too_heavy" };
  if (reps.every((r) => r > hi)) return { weightKg: W[W.length - 1]!, loadFlag: "too_light" };
  const dist = (r: number) => Math.max(lo - r, r - hi, 0);
  let near = 0;
  W.forEach((_, i) => {
    if (dist(reps[i]!) < dist(reps[near]!)) near = i; // strict "<" keeps the lighter on a tie
  });
  return { weightKg: W[near]!, loadFlag: null };
}

/**
 * Project `sets` sets of `ex`: fatigue setup shared by every prescription, then one pick per set.
 * `target(M)` is round(M_pred(M) - targetRir) at the fatigue projected so far (before this set); `pick` returns that set's
 * reps (floored at 1 here) and weight. Each set then adds its own fatigue to the projection.
 * `pick` is called exactly once per set, in order (prescribeWeighted's step-down relies on that).
 */
function projectSets(
  s: EngineState,
  ex: Exercise,
  sets: number,
  now: number,
  plannedAdded: Partial<RegionMap> | undefined,
  intensity: DayIntensity | undefined,
  pick: (i: number, target: (M: number) => number) => { reps: number; weightKg?: number },
): PrescribedSet[] {
  const rir = targetRir(s, now, intensity);
  const { F_prior_eff, F_sess_eff: F_sess_now, scale_eff } = effectiveFatigue(s, ex.id, now);
  let F_sess_eff = F_sess_now + plannedSessEff(ex, plannedAdded);
  const k = priorExposures(s, ex.id, s.openSessionId, now);
  const eff = effectiveRegions(ex);
  const sessPerFatigue = eff.reduce((a, [, c]) => a + c * c, 0) / eff.reduce((a, [, c]) => a + c, 0);
  const target = (M: number) => Math.round(predictedMax(s, M, F_prior_eff, F_sess_eff, scale_eff) - rir);

  const out: PrescribedSet[] = [];
  for (let i = 0; i < sets; i++) {
    const p = pick(i, target);
    const reps = Math.max(1, p.reps);
    const w = p.weightKg === undefined ? {} : { weightKg: p.weightKg };
    out.push(ex.isHold ? { seconds: reps * s.params.hold.secondsPerRep, targetRir: rir, isAmrap: false, ...w } : { reps, targetRir: rir, isAmrap: false, ...w });
    F_sess_eff += setLoad(ex, reps, rir, k, s.params, noveltyMult(s)).fatigue * sessPerFatigue;
  }
  return out;
}

/** Weighted prescription: one owned weight for all sets, stepping down one weight if fatigue pushes a set below lo. */
function prescribeWeighted(s: EngineState, ex: Exercise, sets: number, now: number, opts: PrescribeOptions): Prescription {
  // Weighted exercises have no ladder moves, so opts.canUse does not apply.
  const choice = chooseWeight(s, ex.id, now, opts.plannedAdded, opts.intensity);
  if (!choice) throw new Error(`${ex.id}: no dumbbell weights in the profile`);
  const [lo, hi] = s.params.strength.repRange;
  const W = ownedWeights(s.profile);
  const { oneRm, firstSetMode } = strengthOf(s, ex, now);
  const reasons: string[] = [];
  if (choice.loadFlag === "too_heavy") reasons.push(`Even your lightest dumbbells (${choice.weightKg} kg) are heavy for this: do what you can with good form`);
  if (choice.loadFlag === "too_light") reasons.push(`Your heaviest dumbbells (${choice.weightKg} kg) are light for this: stop at ${hi} reps`);

  let w = choice.weightKg;
  const out = projectSets(s, ex, sets, now, opts.plannedAdded, opts.intensity, (i, target) => {
    let reps = target(repsAt(oneRm, w));
    const lighter = W.filter((x) => x < w).pop();
    if (i > 0 && reps < lo && lighter !== undefined) {
      w = lighter;
      reps = target(repsAt(oneRm, w));
      reasons.push(`Drops to ${w} kg from set ${i + 1} as fatigue builds`);
    }
    return { reps: choice.loadFlag === "too_light" ? Math.min(reps, hi) : reps, weightKg: w };
  });
  return { exerciseId: ex.id, sets: out, firstSetMode, reasons, loadFlag: choice.loadFlag };
}

/**
 * Prescribe `sets` sets of an exercise at `now`. Moves one ladder level up/down if the first set's
 * repsTarget falls outside repRange. Later sets project F_sess_eff forward with the planned sets' fatigue.
 */
export function prescribe(s: EngineState, exerciseId: string, sets: number, now: number, opts: PrescribeOptions = {}): Prescription {
  const { repRange: [lo, hi] } = s.params.capacity;
  const reasons: string[] = [];
  let ex = exercise(s, exerciseId);
  if (ex.weighted) return prescribeWeighted(s, ex, sets, now, opts);
  const first = repsTarget(s, ex.id, now, opts.plannedAdded, undefined, opts.intensity);
  const move = first > hi ? usableNeighbour(s, ex.id, 1, opts.canUse) : first < lo ? usableNeighbour(s, ex.id, -1, opts.canUse) : undefined;
  if (move) {
    reasons.push(first > hi ? `Moved up to ${move.name}: you're past ${hi} reps, so this makes it hard enough again` : `Moved down to ${move.name}: fewer than ${lo} reps is too heavy to build on`);
    ex = move;
  }

  const { M, firstSetMode } = capacityOf(s, ex.id, now);
  const out = projectSets(s, ex, sets, now, opts.plannedAdded, opts.intensity, (_, target) => ({ reps: target(M) }));
  return { exerciseId: ex.id, sets: out, firstSetMode, reasons, loadFlag: null };
}

/** Autoregulation: stop the exercise when actual reps fall below (1 - dropFraction) × prescribed. */
export function shouldStopExercise(prescribedReps: number, actualReps: number, params: EngineState["params"]): boolean {
  return actualReps < (1 - params.autoreg.dropFraction) * prescribedReps;
}
