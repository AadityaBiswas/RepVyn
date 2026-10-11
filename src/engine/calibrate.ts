import { deloadActiveAt, effectiveFatigue, observedMax, predictSet } from "./capacity";
import { recordLevelObservation } from "./level";
import { MS_PER_HOUR, sameLocalDay } from "./recovery";
import { canLoad, oneRmFrom, repsAt, sameWeight } from "./strength";
import {
  clamp, REGIONS,
  type Confidence, type EngineState, type ObservationType, type Params, type PredictionLogEntry, type Region, type SessionRecord,
} from "./types";

const DAY_MS = 24 * MS_PER_HOUR;
const WHOLE_UNIT_MIDPOINT = 0.5;

const isClean = (t: ObservationType) => t === "capacity" || t === "recovery";

/** Relative prediction error, clamped to ±errorClamp. 0 when nothing was predicted. */
export function predictionError(M_pred: number, M_obs: number, params: Params): number {
  if (M_pred <= 0) return 0;
  const c = params.calibration.errorClamp;
  return clamp((M_obs - M_pred) / M_pred, -c, c);
}

/** d_obs = 1 - (M_obs_k / M_obs_{k-1}) ^ (1 / ΔF). */
export function observedD(prevM: number, M: number, dF: number): number {
  // M can be negative (0 reps at RIR 0 with a negative RIR bias b); a negative base to a fractional power is NaN.
  return 1 - (Math.max(0, M) / prevM) ** (1 / dF);
}

/** d += rate * (clamp(d_obs) - d). */
export function acuteUpdate(d: number, prevM: number, M: number, dF: number, params: Params): number {
  const a = params.calibration.acute;
  return d + a.rate * (clamp(observedD(prevM, M, dF), a.min, a.max) - d);
}

export function confidence(obs: number, params: Params): Confidence {
  const c = params.calibration.confidence;
  if (obs < c.calibrating) return "calibrating";
  if (obs < c.low) return "low";
  if (obs < c.medium) return "medium";
  return "high";
}

/** Ends an expired deload. Called by the fold at every event. */
export function expireDeload(s: EngineState, now: number): void {
  if (s.deload.active && !deloadActiveAt(s, now)) s.deload = { active: false, since: null, endedAt: s.deload.since! + s.params.calibration.deload.maxDays * DAY_MS };
}

/** Rolling mean err over the last `window` capacity/recovery observations since the last deload ended. */
function rollingCleanErr(s: EngineState): { n: number; mean: number } {
  const from = s.deload.endedAt ?? -Infinity;
  // Until an exercise has been measured once its prediction is the catalog's guess, so a miss there says nothing about the user's form.
  const measured = new Set<string>();
  const all: number[] = [];
  for (const x of s.predictionLog) {
    if (!isClean(x.type)) continue;
    if (measured.has(x.exerciseId) && x.ts > from) all.push(x.err);
    if (x.type === "capacity") measured.add(x.exerciseId);
  }
  const errs = all.slice(-s.params.calibration.deload.window);
  return { n: errs.length, mean: errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : 0 };
}

function updateDeload(s: EngineState, ts: number): void {
  const p = s.params.calibration.deload;
  if (s.deload.active) {
    const { mean } = rollingCleanErr(s);
    if (mean > p.clearAbove) s.deload = { active: false, since: null, endedAt: ts };
    return;
  }
  const { n, mean } = rollingCleanErr(s);
  if (n >= p.minObs && mean < p.triggerBelow) s.deload = { active: true, since: ts, endedAt: s.deload.endedAt };
}

export interface LoggedSet {
  exerciseId: string;
  repsEq: number;
  /** Logged as holdSeconds (whole seconds) rather than whole reps. */
  isHold: boolean;
  /** Null: logged without reps left (the app asks only after an exercise's last set). */
  rir: number | null;
  isAmrap: boolean;
  weightKg: number | null;
}

/**
 * Called by the fold for each non-warm-up set, before its fatigue is deposited.
 * Predicts, logs, classifies the observation and updates only the matching parameter (section 5.6).
 */
export function calibrateSet(s: EngineState, sess: SessionRecord, set: LoggedSet, ts: number): void {
  const cal = s.params.calibration;
  const ex = s.catalog.byId[set.exerciseId]!;
  const w = ex.weighted ? set.weightKg : null;
  if (set.rir === null) {
    // No reps left: nothing is observed. Kept so the exercise's rated last set knows how tired it started (below).
    sess.sets.push({ exerciseId: set.exerciseId, M_obs: 0, F_sess_eff: effectiveFatigue(s, set.exerciseId, ts).F_sess_eff, isAmrap: false, censored: true, weightKg: w, unrated: true });
    return;
  }
  const rir = set.rir;
  if (ex.weighted && w === null) {
    // No weight logged: M_obs depends on the load, so nothing can be learned. The set is kept (censored) so it still
    // counts as "the previous set" without ever being compared against.
    sess.sets.push({ exerciseId: set.exerciseId, M_obs: 0, F_sess_eff: effectiveFatigue(s, set.exerciseId, ts).F_sess_eff, isAmrap: set.isAmrap, censored: true, weightKg: null });
    return;
  }
  const { M_pred, F_prior_eff, F_sess_eff } = predictSet(s, set.exerciseId, ts, w ?? undefined);
  // Typo protection: reps-based exercises cap at maxObsFactor × the advanced norm; weighted sets at maxObsReps.
  const cap = ex.weighted ? s.params.strength.maxObsReps : ex.defaultM ? s.params.capacity.maxObsFactor * ex.defaultM.advanced : Infinity;
  const M_obs = Math.min(cap, observedMax(set.repsEq, rir, s.b.value, set.isAmrap));
  const err = predictionError(M_pred, M_obs, s.params);
  // "5+ reps left" (the top of the RIR scale) is open-ended: M_obs is only a lower bound. It may raise capacity,
  // and is never used where an exact value is needed (rho, d, b, or lowering anything).
  const censored = !set.isAmrap && rir >= s.params.effort.fatigue.length - 1;

  const mine = sess.sets.filter((x) => x.exerciseId === set.exerciseId);
  const last = sess.sets[sess.sets.length - 1];
  // Rated only on its last set: the earlier sets of this exercise were unrated. The set is then the exercise's one
  // observation. Its max is taken back to how tired the exercise started: M_first = M_obs / (1 - d)^(fatigue its own sets added).
  // ponytail: this leans on d, which is only learned when two sets in a row are rated; otherwise d stays at its default.
  const lastOnly = mine.length > 0 && mine.every((x) => x.unrated);
  const F_start = lastOnly ? mine[0]!.F_sess_eff : F_sess_eff;
  const M_first = lastOnly ? Math.min(cap, M_obs / (1 - s.d.value) ** (F_sess_eff - F_start)) : M_obs;
  const clean = F_start < s.params.capacity.sessionCleanBelow;
  let type: ObservationType = "log_only";

  if (set.isAmrap) {
    const prev = mine.filter((x) => !x.isAmrap && sameWeight(x.weightKg, w)).pop();
    if (prev && !prev.censored) {
      type = "amrap";
      const predicted = prev.M_obs * (1 - s.d.value) ** (F_sess_eff - prev.F_sess_eff);
      // An AMRAP logs whole reps (or whole seconds): the true max lies in [logged, logged + 1 unit), so compare
      // its midpoint with the continuous prediction. Without this, every update is biased ~0.5 rep low (DECISIONS.md, M8).
      const unit = set.isHold ? 1 / s.params.hold.secondsPerRep : 1;
      const amrapMax = set.repsEq + WHOLE_UNIT_MIDPOINT * unit;
      s.b = { value: clamp(s.b.value + cal.rirBias.rate * (amrapMax - predicted), cal.rirBias.min, cal.rirBias.max), obs: s.b.obs + 1 };
    }
  } else if ((mine.length === 0 || lastOnly) && clean) {
    const currentM = ex.weighted ? repsAt(s.strength[ex.id]!.oneRm, w!) : s.capacity[ex.id]!.M;
    if (F_prior_eff < s.params.capacity.freshBelow && (!censored || M_first > currentM)) {
      type = "capacity";
      const step = s.params.capacity.maxStep;
      const alpha = s.params.capacity.emaAlpha;
      if (ex.weighted) {
        // Same rule as reps capacity, in 1RM space: the first measurement replaces the guess, later ones are
        // smoothed with the observation held within 1RM × (1 ± maxStep).
        const entry = s.strength[ex.id]!;
        const R_obs = oneRmFrom(w!, M_first);
        const oneRm = entry.obs === 0 ? R_obs : entry.oneRm + alpha * (clamp(R_obs, entry.oneRm * (1 - step), entry.oneRm * (1 + step)) - entry.oneRm);
        s.strength[ex.id] = { ...entry, oneRm, obs: entry.obs + 1 };
        const mass = s.profile?.bodyMassKg;
        if (mass !== undefined) recordLevelObservation(s, ex.ladderId, ex.loadNorm, R_obs / mass);
      } else {
        // The first clean measurement replaces the catalog guess (floored at 1 rep); later ones are smoothed (EMA),
        // with the observation held within M × (1 ± maxStep) so one outlier set cannot swing capacity.
        const entry = s.capacity[ex.id]!;
        const M = entry.obs === 0 ? Math.max(1, M_first) : entry.M + alpha * (clamp(M_first, entry.M * (1 - step), entry.M * (1 + step)) - entry.M);
        s.capacity[ex.id] = { ...entry, M, obs: entry.obs + 1 };
        recordLevelObservation(s, ex.ladderId, ex.defaultM, M_first);
      }
    } else if (!censored && F_prior_eff >= s.params.capacity.freshBelow) {
      type = "recovery";
      const rho = Math.abs(err) > cal.noiseBand ? clamp(s.rho.value * (1 - cal.rho.rate * err), cal.rho.min, cal.rho.max) : s.rho.value;
      s.rho = { value: rho, obs: s.rho.obs + 1 };
    }
  } else if (last && last.exerciseId === set.exerciseId && sameWeight(last.weightKg, w) && !last.isAmrap && !last.censored && !censored) {
    const dF = F_sess_eff - last.F_sess_eff;
    if (dF >= cal.acute.minDeltaF && last.M_obs >= cal.acute.minPrevM) {
      type = "acute";
      s.d = { value: acuteUpdate(s.d.value, last.M_obs, M_obs, dF, s.params), obs: s.d.obs + 1 };
    }
  }

  if (set.isAmrap) s.lastAmrapTs = ts;
  sess.sets.push({ exerciseId: set.exerciseId, M_obs, F_sess_eff, isAmrap: set.isAmrap, censored, weightKg: w });
  s.predictionLog.push({ ts, censored, exerciseId: set.exerciseId, type, M_pred, M_obs, err, ...(w === null ? {} : { weightKg: w }) });
  if (isClean(type)) updateDeload(s, ts);
}

/**
 * Check-in: stored for its UTC day. beat_up slows recovery that day (effectiveRho) and costs a set in the planner;
 * sore regions count as fatigued in the planner. Nothing here changes a learned parameter.
 */
export function applyCheckin(s: EngineState, ts: number, feel: "fresh" | "normal" | "beat_up", soreRegions: Region[]): void {
  s.checkin = { ts, feel, soreRegions };
}

/** Today's check-in (same local calendar day as now), if any. */
export function checkinFor(s: EngineState, now: number): EngineState["checkin"] {
  return s.checkin && sameLocalDay(s, s.checkin.ts, now) ? s.checkin : null;
}

/** Clean observations = capacity + recovery types. */
export function cleanObservationCount(s: EngineState): number {
  return s.predictionLog.filter((x) => isClean(x.type)).length;
}

/** Overall calibrating: too few clean observations, or too soon after the first session. */
export function isCalibrating(s: EngineState, now: number): boolean {
  const c = s.params.calibration;
  const first = s.sessions[0]?.start;
  return cleanObservationCount(s) < c.calibratingMinObs || first === undefined || now - first < c.calibratingMinDays * DAY_MS;
}

/** Rep MAE: mean |M_obs − M_pred|, which equals |actual reps − predicted reps at the reported RIR|. */
export function repMae(entries: readonly PredictionLogEntry[]): number | null {
  return entries.length ? entries.reduce((a, x) => a + Math.abs(x.M_obs - x.M_pred), 0) / entries.length : null;
}

/** Regions whose best exercise available with the profile's equipment (and not excluded) has contribution below 1. */
export function equipmentGaps(s: EngineState, equipment = s.profile?.equipment ?? []): { region: Region; best: number }[] {
  const excluded = s.profile?.excludeExercises ?? [];
  const usable = s.catalog.exercises.filter((e) => e.equipment.every((t) => equipment.includes(t)) && !excluded.includes(e.id) && canLoad(s, e));
  return REGIONS.map((region) => ({ region, best: Math.max(0, ...usable.map((e) => e.contributions[region] ?? 0)) }))
    .filter((g) => g.best < 1 && !(s.profile?.excludeRegions ?? []).includes(g.region));
}

const MAE_TAIL = 20;
const LOG_TAIL = 10;

export function diagnostics(s: EngineState, now: number) {
  const log = s.predictionLog.filter((x) => x.ts <= now);
  const start = log[0]?.ts;
  const weeks = new Map<number, PredictionLogEntry[]>();
  for (const x of log) {
    const w = Math.floor((x.ts - start!) / (7 * DAY_MS)) + 1;
    weeks.set(w, [...(weeks.get(w) ?? []), x]);
  }
  return {
    rho: s.rho.value,
    b: s.b.value,
    d: s.d.value,
    confidences: { rho: confidence(s.rho.obs, s.params), b: confidence(s.b.obs, s.params), d: confidence(s.d.obs, s.params) },
    calibrating: isCalibrating(s, now),
    deloadActive: deloadActiveAt(s, now),
    maeLast20: repMae(log.slice(-MAE_TAIL)),
    /** Week 1 starts at the first logged set. */
    maeByWeek: [...weeks].map(([week, xs]) => ({ week, mae: repMae(xs)!, n: xs.length })),
    equipmentGaps: equipmentGaps(s),
    predictionLogTail: log.slice(-LOG_TAIL),
  };
}
