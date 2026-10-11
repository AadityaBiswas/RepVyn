import {
  applyEvent, effectiveFatigue, initialState, advanceSoreness, priorDrop, pSore, REGIONS, systemic, toleranceOf,
  type Catalog, type Experience, type Region, type EngineEvent, type EngineState, type Params, type PrescribedSet,
} from "../engine";
import type { Rng } from "./rng";
import type { Scenario } from "./scenarios";

const DAY_MS = 24 * 3_600_000;
/** M_true grows 0.5% per week while trained (spec), and decays once untrained for 4+ weeks. */
const WEEKLY_GROWTH = 1.005;
const WEEKLY_DETRAIN = 0.98; // ponytail: detraining rate is not in the spec; 2%/week after 4 weeks off.
const DETRAIN_AFTER_DAYS = 28;
const TRAINED_WITHIN_DAYS = 7;
const DAILY_NOISE = 0.06;
const RIR_NOISE_SD = 0.7;
const LADDER_SPREAD = 0.2; // true capacity = defaultM × U(0.8, 1.2) per ladder

/**
 * A simulated person with hidden rho_true, b_true, d_true, T_true and M_true per exercise.
 * True fatigue uses the engine's own load/recovery equations: the same events folded with rho pinned to rho_true
 * and tolerance pinned to T_true (experience default × toleranceTrue, never learned).
 */
export class SyntheticUser {
  readonly truth: EngineState;
  readonly M = new Map<string, number>();
  private readonly lastTrained = new Map<string, number>();
  private readonly ladderFactor = new Map<string, number>();
  private noise = 1;

  constructor(readonly sc: Scenario, readonly catalog: Catalog, readonly params: Params, private readonly rng: Rng) {
    const pinned = structuredClone(params);
    pinned.calibration.rho = { ...pinned.calibration.rho, init: sc.rhoTrue, min: sc.rhoTrue, max: sc.rhoTrue };
    // Truth does not infer its level: pin every per-level param to the true level's value.
    const at = <T extends Record<Experience, number>>(rec: T, v = rec[sc.trueLevel]) => ({ beginner: v, intermediate: v, advanced: v });
    pinned.tolerance = { ...pinned.tolerance, init: at(pinned.tolerance.init, pinned.tolerance.init[sc.trueLevel] * (sc.toleranceTrue ?? 1)), learnRate: 0 };
    pinned.novelty = { ...pinned.novelty, experience: at(pinned.novelty.experience) };
    pinned.soreness = { ...pinned.soreness, level: at(pinned.soreness.level) };
    const st = sc.sorenessTrue ?? { sigma: 1, rho: 1 };
    pinned.soreness.learn = { ...pinned.soreness.learn, sigma: [st.sigma, st.sigma, 1], rho: [st.rho, st.rho, 1] };
    this.truth = initialState(catalog, pinned);
  }

  observe(e: EngineEvent): void {
    applyEvent(this.truth, e);
    if (e.type === "set_logged" && !e.payload.isWarmup) this.lastTrained.set(e.payload.exerciseId, e.ts);
  }

  /** Called once per simulated day: new daily noise, then capacity growth / detraining. */
  newDay(dayStart: number): void {
    this.noise = this.rng.uniform(1 - DAILY_NOISE, 1 + DAILY_NOISE);
    for (const [id, m] of this.M) {
      const last = this.lastTrained.get(id);
      if (last === undefined) continue;
      const days = (dayStart - last) / DAY_MS;
      if (days <= TRAINED_WITHIN_DAYS) this.M.set(id, m * WEEKLY_GROWTH ** (1 / 7));
      else if (days > DETRAIN_AFTER_DAYS) this.M.set(id, m * WEEKLY_DETRAIN ** (1 / 7));
    }
  }

  trueM(exerciseId: string): number {
    let m = this.M.get(exerciseId);
    if (m === undefined) {
      const ex = this.catalog.byId[exerciseId]!;
      let f = this.ladderFactor.get(ex.ladderId);
      if (f === undefined) this.ladderFactor.set(ex.ladderId, (f = this.rng.uniform(1 - LADDER_SPREAD, 1 + LADDER_SPREAD)));
      m = (ex.defaultM?.[this.sc.trueLevel] ?? this.params.capacity.fallbackM) * f;
      this.M.set(exerciseId, m);
    }
    return m;
  }

  /** trueMax = M_true (1 - priorDrop(F_prior_true, T_true)) (1 - d_true)^F_sess_true × daily noise, in repsEq. */
  trueMax(exerciseId: string, now: number): number {
    const f = effectiveFatigue(this.truth, exerciseId, now);
    return this.trueM(exerciseId) * (1 - priorDrop(f.F_prior_eff, f.scale_eff, this.truth.params)) * (1 - this.sc.dTrue) ** f.F_sess_eff * this.noise;
  }

  /** Muscles the user marks sore now: fuzzy near the threshold, like a person (the engine's own answer model at the true sigma). */
  soreRegions(now: number): Region[] {
    advanceSoreness(this.truth, now);
    const sigma = this.truth.sigma.value;
    return REGIONS.filter((m) => this.rng.next() < pSore(this.truth.soreness.grid[0]![m].sore, sigma, this.truth.params));
  }

  /** Hidden true tolerance of a region. */
  trueTolerance(m: Region): number {
    return toleranceOf(this.truth, m);
  }

  /** Perform a prescribed set; returns what gets logged. */
  perform(exerciseId: string, set: PrescribedSet, now: number): { reps?: number; holdSeconds?: number; rir: number; repsEq: number } {
    const spr = this.params.hold.secondsPerRep;
    const max = Math.max(0, this.trueMax(exerciseId, now));
    const isHold = set.seconds !== undefined;
    const prescribed = isHold ? set.seconds! / spr : set.reps!;
    // Reps are whole reps; holds are whole seconds.
    const done = isHold
      ? Math.floor((set.isAmrap ? max : Math.min(prescribed, max)) * spr) / spr
      : Math.floor(set.isAmrap ? max : Math.min(prescribed, max));
    const trueRir = max - done;
    const rir = Math.min(5, Math.max(0, Math.round(trueRir - this.sc.bTrue + this.rng.normal(0, RIR_NOISE_SD))));
    return { ...(isHold ? { holdSeconds: Math.round(done * spr) } : { reps: done }), rir, repsEq: done };
  }

  /** True systemic fatigue relative to the true typical session. */
  systemicRatio(now: number): number {
    const s = systemic(this.truth, now);
    return s.G / s.typical;
  }
}
