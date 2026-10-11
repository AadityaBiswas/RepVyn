import { byLevel, regionLevel } from "./level";
import { clamp, REGIONS, type Compartments, type EngineState, type Params, type Region } from "./types";

export const MS_PER_HOUR = 3_600_000;
const DAY_MS = 24 * MS_PER_HOUR;

/** Same calendar day in the user's time zone (profile.utcOffsetMinutes; UTC without a profile). */
export function sameLocalDay(s: EngineState, a: number, b: number): boolean {
  const o = (s.profile?.utcOffsetMinutes ?? 0) * 60_000;
  return Math.floor((a + o) / DAY_MS) === Math.floor((b + o) / DAY_MS);
}

/**
 * rho used for recovery up to time t: the learned rho, × beatUpNudge (clamped) on the UTC day of a beat_up
 * check-in. That day only — a check-in never changes the learned rho (DECISIONS.md, M8 follow-up).
 */
export function effectiveRho(s: EngineState, t: number): number {
  const beatUp = s.checkin?.feel === "beat_up" && sameLocalDay(s, s.checkin.ts, t);
  const r = s.params.calibration.rho;
  return beatUp ? clamp(s.rho.value * r.beatUpNudge, r.min, r.max) : s.rho.value;
}

const halve = (dh: number, halfLifeH: number) => 0.5 ** (dh / halfLifeH);

export function deposit(c: Compartments, D: number, params: Params): Compartments {
  const f = params.recovery.fastShare;
  return { fast: c.fast + f * D, slow: c.slow + (1 - f) * D };
}

export function decay(c: Compartments, region: Region, dh: number, rho: number, params: Params): Compartments {
  return {
    fast: c.fast * halve(dh, params.recovery.fastHalfLifeH),
    slow: c.slow * halve(dh, params.recovery.slowHalfLifeH[region] * rho),
  };
}

export const fatigueOf = (c: Compartments): number => c.fast + c.slow;

/** T_m: fatigue units that make a full, normal session for this muscle. The default at the user's level for it, raised by what they have handled. */
export function toleranceOf(s: EngineState, m: Region): number {
  return Math.max(byLevel(s.params.tolerance.init, regionLevel(s, m)), s.tolerance[m]);
}

/** T_m / tolerance.ref: readiness thresholds and the performance-drop curve are defined at scale 1. */
export const toleranceScale = (s: EngineState, m: Region): number => toleranceOf(s, m) / s.params.tolerance.ref;

/**
 * Repeated-bout effect: a session whose work (fatigue without novelty) in a region exceeds T_m raises T_m toward
 * that work (capped at tolerance.max). Called when a session ends.
 * ponytail: never lowered; add slow decay toward the default after a long layoff if detraining matters.
 */
export function learnTolerance(s: EngineState, work: Record<Region, number>): void {
  const { learnRate, max } = s.params.tolerance;
  for (const m of REGIONS) {
    const T = toleranceOf(s, m);
    const D = Math.min(work[m], max);
    if (D > T) s.tolerance[m] = T + learnRate * (D - T);
  }
}

/** Decay all regions and G from state.t to t with the effective rho at t. Mutates; used inside the fold. No-op if t <= state.t. */
export function advanceInPlace(s: EngineState, t: number): void {
  if (t <= s.t) return;
  const dh = (t - s.t) / MS_PER_HOUR;
  const rho = effectiveRho(s, t);
  for (const r of REGIONS) s.regions[r] = decay(s.regions[r], r, dh, rho, s.params);
  s.G *= halve(dh, s.params.systemic.halfLifeH);
  s.t = t;
}

/** Pure: a copy of the state advanced to t. */
export function advanceTo(s: EngineState, t: number): EngineState {
  const c = { ...s, regions: { ...s.regions } };
  advanceInPlace(c, t);
  return c;
}
