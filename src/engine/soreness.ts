import { byLevel, level } from "./level";
import { REGIONS, type EngineState, type Params, type Region } from "./types";

/**
 * Muscle soreness (DOMS): what a person feels, separate from performance fatigue.
 * A set's damage goes into a pending pool that feeds soreness over riseH; soreness clears over decayH × rhoS.
 * Soreness therefore peaks a day or more after training (about 33 h at the defaults), unlike fatigue, which only falls.
 * Damage = set work × soreness novelty (the repeated-bout effect is much stronger for soreness) × level factor.
 *
 * Learning (joint MAP on a grid): how sore this user gets (sigma, scales felt soreness) and how long it lasts
 * (rhoS, scales decayH) both explain the same "sore / not sore" answers, so they are fitted together.
 * The fold keeps one compartment set per candidate rhoS, and a log-posterior over every (rhoS, sigma) pair:
 * a log-normal prior, plus, per body-map answer, log P(answer) with P(sore) = logistic((ln(sigma·S) − ln mild) / width),
 * floored to allow for mistaken answers. The estimate is the argmax.
 */
export interface SorenessCompartments {
  pending: number;
  sore: number;
}

export interface SorenessState {
  /** Time the compartments were advanced to (ms). */
  t: number;
  /** grid[i]: compartments per region under candidate rhoS = grids.rho[i]. */
  grid: Record<Region, SorenessCompartments>[];
  /** Time of the last damage deposit per region. */
  lastTs: Record<Region, number | null>;
  /** Log-posterior, row-major: logPost[i * nSigma + j] for (rho[i], sigma[j]). */
  logPost: number[];
  /** Learning check-ins in which the user marked at least one trained muscle sore (how long soreness lasts needs some). */
  soreReports: number;
}

export type SorenessLevel = 0 | 1 | 2 | 3;
export const SORENESS_NAMES = ["none", "mild", "sore", "very sore"] as const;

const MS_PER_HOUR = 3_600_000;
const MAX_H = 168;

const geom = ([lo, hi, n]: readonly [number, number, number]) =>
  Array.from({ length: n }, (_, i) => (n === 1 ? lo : lo * (hi / lo) ** (i / (n - 1))));

/** Candidate values of rhoS and sigma. */
export const grids = (params: Params) => ({ rho: geom(params.soreness.learn.rho), sigma: geom(params.soreness.learn.sigma) });

export function initSoreness(params: Params): SorenessState {
  const { rho, sigma } = grids(params);
  const sd = params.soreness.learn.priorSd;
  const zero = () => Object.fromEntries(REGIONS.map((m) => [m, { pending: 0, sore: 0 }])) as Record<Region, SorenessCompartments>;
  return {
    t: 0,
    grid: rho.map(zero),
    lastTs: Object.fromEntries(REGIONS.map((m) => [m, null])) as Record<Region, number | null>,
    logPost: rho.flatMap((r) => sigma.map((g) => -0.5 * ((Math.log(r) / sd.rho) ** 2 + (Math.log(g) / sd.sigma) ** 2))),
    soreReports: 0,
  };
}

/** Soreness novelty: 1 + noveltyAmp × level novelty multiplier × exp(−k / novelty.decay). */
export function sorenessNovelty(k: number, params: Params, noveltyMult: number): number {
  return 1 + params.soreness.noveltyAmp * noveltyMult * Math.exp(-k / params.novelty.decay);
}

/** Closed-form two-step decay over dh hours: pending → sore (riseH), sore → gone (decayH × rhoS). */
export function decaySoreness(c: SorenessCompartments, dh: number, rhoS: number, params: Params): SorenessCompartments {
  const r = params.soreness.riseH;
  const d = params.soreness.decayH * rhoS;
  const er = Math.exp(-dh / r);
  const ed = Math.exp(-dh / d);
  return { pending: c.pending * er, sore: c.sore * ed + (c.pending * d * (ed - er)) / (d - r) };
}

/** Advance every candidate's compartments to t. Mutates; no-op if t <= current time. */
export function advanceSoreness(s: EngineState, t: number): void {
  const so = s.soreness;
  if (t <= so.t) return;
  const dh = (t - so.t) / MS_PER_HOUR;
  const { rho } = grids(s.params);
  so.grid = so.grid.map((g, i) => Object.fromEntries(REGIONS.map((m) => [m, decaySoreness(g[m], dh, rho[i]!, s.params)])) as Record<Region, SorenessCompartments>);
  so.t = t;
}

export function depositDamage(s: EngineState, m: Region, damage: number, ts: number): void {
  const D = damage * byLevel(s.params.soreness.level, level(s).score);
  for (const g of s.soreness.grid) g[m] = { pending: g[m].pending + D, sore: g[m].sore };
  s.soreness.lastTs[m] = ts;
}

export const levelOf = (felt: number, params: Params): SorenessLevel => {
  const [mild, sore, very] = params.soreness.thresholds;
  return felt >= very ? 3 : felt >= sore ? 2 : felt >= mild ? 1 : 0;
};

/** P(user reports region sore | raw soreness S, sigma), floored to [floor, 1 − floor]. */
export function pSore(S: number, sigma: number, params: Params): number {
  const { width, floor } = params.soreness.learn;
  const p = S <= 0 ? 0 : 1 / (1 + Math.exp(-(Math.log(sigma * S) - Math.log(params.soreness.thresholds[0])) / width));
  return floor + (1 - 2 * floor) * p;
}

/** Index of the MAP (rhoS, sigma) pair. */
function argmax(s: EngineState): { i: number; j: number } {
  const n = grids(s.params).sigma.length;
  let best = 0;
  s.soreness.logPost.forEach((v, k) => {
    if (v > s.soreness.logPost[best]!) best = k;
  });
  return { i: Math.floor(best / n), j: best % n };
}

/**
 * Learn from a body-map check-in (marked = sore, unmarked = not sore), s advanced to ts. Only regions trained
 * within learn.windowH count, the same regions for every candidate, so all candidates are scored on the same data.
 */
export function learnFromSoreness(s: EngineState, ts: number, soreRegions: readonly Region[]): void {
  const { rho, sigma } = grids(s.params);
  const windowMs = s.params.soreness.learn.windowH * MS_PER_HOUR;
  const regions = REGIONS.filter((m) => {
    const last = s.soreness.lastTs[m];
    return last !== null && ts - last <= windowMs;
  });
  if (!regions.length) return;
  if (regions.some((m) => soreRegions.includes(m))) s.soreness.soreReports += 1;
  rho.forEach((_, i) => {
    sigma.forEach((g, j) => {
      let ll = 0;
      for (const m of regions) {
        const p = pSore(s.soreness.grid[i]![m].sore, g, s.params);
        ll += Math.log(soreRegions.includes(m) ? p : 1 - p);
      }
      s.soreness.logPost[i * sigma.length + j]! += ll;
    });
  });
  const { i, j } = argmax(s);
  s.rhoS = { value: rho[i]!, obs: s.rhoS.obs + 1 };
  s.sigma = { value: sigma[j]!, obs: s.sigma.obs + 1 };
}

/**
 * Predicted soreness per region at now: felt value (sigma × sore under the fitted rhoS), level,
 * hours until the peak (0 if already falling), the peak's level, and hours until it is below mild for good (0 if never mild).
 */
export function sorenessAt(s: EngineState, now: number): Record<Region, { felt: number; level: SorenessLevel; peakInH: number; peakLevel: SorenessLevel; clearInH: number }> {
  const P = s.params;
  const { rho } = grids(P);
  const i = rho.indexOf(s.rhoS.value);
  const sigma = s.sigma.value;
  const dh0 = Math.max(0, (now - s.soreness.t) / MS_PER_HOUR);
  return Object.fromEntries(
    REGIONS.map((m) => {
      let c = decaySoreness(s.soreness.grid[i]![m], dh0, s.rhoS.value, P);
      const mild = P.soreness.thresholds[0];
      const felt = sigma * c.sore;
      let peak = felt;
      let peakInH = 0;
      let lastAbove = felt >= mild ? 0 : -1;
      // Hourly until nothing is left to rise and it is below mild (or the horizon).
      for (let h = 1; h <= MAX_H; h++) {
        c = decaySoreness(c, 1, s.rhoS.value, P);
        const f = sigma * c.sore;
        if (f > peak) [peak, peakInH] = [f, h];
        if (f >= mild) lastAbove = h;
        else if (h > peakInH && sigma * c.pending < mild * 0.01) break;
      }
      const clearInH = lastAbove < 0 ? 0 : lastAbove + 1;
      return [m, { felt, level: levelOf(felt, P), peakInH, peakLevel: levelOf(peak, P), clearInH }];
    }),
  ) as ReturnType<typeof sorenessAt>;
}
