import { byLevel, level } from "./level";
import { saturate } from "./load";
import { sorenessAt } from "./soreness";
import { advanceTo, decay, effectiveRho, fatigueOf, MS_PER_HOUR, toleranceOf, toleranceScale } from "./recovery";
import {
  MAJOR_REGIONS, REGIONS,
  type Compartments, type EngineState, type Params, type Program, type ReadinessState, type Region, type RegionMap, type SessionRecord,
} from "./types";

const MAX_H = 240;
const TOL_H = 0.05;
const WEEK_MS = 7 * 24 * MS_PER_HOUR;

export function regionFatigue(s: EngineState, region: Region, now: number): number {
  return fatigueOf(advanceTo(s, now).regions[region]);
}

/** Thresholds are for tolerance.ref; `scale` = T_m / ref moves them with the user's tolerance for that region. */
export function readinessState(F: number, params: Params, scale = 1): ReadinessState {
  if (F < params.readiness.readyBelow * scale) return "ready";
  if (F > params.readiness.fatiguedAbove * scale) return "fatigued";
  return "recovering";
}

/** R_m: the readiness weight for a state. */
export function readinessWeight(state: ReadinessState, params: Params): number {
  return params.readiness.weights[state];
}

/** Bisection on F(h) = readyBelow × scale over [0, 240] h, starting from compartments c. Exported for "what if" views (muscles.ts). */
export function hoursFrom(c: Compartments, region: Region, rho: number, params: Params, scale: number): number {
  const target = params.readiness.readyBelow * scale;
  const F = (h: number) => fatigueOf(decay(c, region, h, rho, params));
  if (F(0) < target) return 0;
  let lo = 0;
  let hi = MAX_H;
  if (F(hi) >= target) return hi;
  while (hi - lo > TOL_H) {
    const mid = (lo + hi) / 2;
    if (F(mid) < target) hi = mid;
    else lo = mid;
  }
  return hi;
}

export function hoursToReady(s: EngineState, region: Region, now: number): number {
  return hoursFrom(advanceTo(s, now).regions[region], region, effectiveRho(s, now), s.params, toleranceScale(s, region));
}

/** `load` = fatigue / tolerance: 1.0 is what a full, normal session leaves in that muscle for this user. */
export function readiness(
  s: EngineState,
  now: number,
): Record<Region, { fatigue: number; tolerance: number; load: number; state: ReadinessState; hoursToReady: number }> {
  const a = advanceTo(s, now);
  return Object.fromEntries(
    REGIONS.map((r) => {
      const fatigue = fatigueOf(a.regions[r]);
      const tolerance = toleranceOf(s, r);
      const scale = toleranceScale(s, r);
      return [r, {
        fatigue, tolerance, load: fatigue / tolerance,
        state: readinessState(fatigue, s.params, scale),
        hoursToReady: hoursFrom(a.regions[r], r, effectiveRho(s, now), s.params, scale),
      }];
    }),
  ) as ReturnType<typeof readiness>;
}

/** Predicted soreness per region at now (see soreness.ts). */
export const soreness = (s: EngineState, now: number) => sorenessAt(s, now);

/** Saturated stimulus of a session; an open session is saturated at query time. */
export function sessionStimulus(sess: SessionRecord, params: Params): RegionMap {
  if (sess.end !== null) return sess.stimulus;
  return Object.fromEntries(REGIONS.map((r) => [r, saturate(sess.rawStimulus[r], params)])) as RegionMap;
}

/** The profile's program (default: the catalog's first). Throws on an unknown programId. */
export function programOf(s: EngineState): Program {
  const id = s.profile?.programId;
  if (id === undefined) return s.catalog.programs[0]!;
  const p = s.catalog.programs.find((x) => x.id === id);
  if (!p) throw new Error(`unknown program ${id}; one of: ${s.catalog.programs.map((x) => x.id).join(", ")}`);
  return p;
}

/** Program emphasis of a region (default 1). */
export const emphasisOf = (s: EngineState, region: Region): number => programOf(s).emphasis[region] ?? 1;

/** T_m = weeklyTargets[m] * goalMult * levelMult * emphasis. Without a profile: muscle / intermediate / balanced. */
export function weeklyTarget(s: EngineState, region: Region): number {
  const m = s.params.targetMultipliers;
  return s.params.weeklyTargets[region] * m.goal[s.profile?.goal ?? "muscle"] * byLevel(m.experience, level(s).score) * emphasisOf(s, region);
}

export function weeklyNeed(s: EngineState, now: number): Record<Region, { target: number; done: number; need: number }> {
  const recent = s.sessions.filter((x) => x.start > now - WEEK_MS && x.start <= now).map((x) => sessionStimulus(x, s.params));
  return Object.fromEntries(
    REGIONS.map((r) => {
      const target = weeklyTarget(s, r);
      const done = recent.reduce((sum, st) => sum + st[r], 0);
      return [r, { target, done, need: Math.max(0, target - done) / target }];
    }),
  ) as ReturnType<typeof weeklyNeed>;
}

/** G_typical: median total set fatigue of the last typicalWindow completed sessions (default × level tolerance scale if too few). */
export function typicalSessionLoad(s: EngineState, now: number): number {
  const { typicalWindow, minSessionsForTypical, defaultTypicalSession } = s.params.systemic;
  const totals = s.sessions
    .filter((x) => x.end !== null && x.start <= now)
    .slice(-typicalWindow)
    .map((x) => x.fatigueTotal)
    .sort((a, b) => a - b);
  const t = s.params.tolerance;
  if (totals.length < minSessionsForTypical) return (defaultTypicalSession * byLevel(t.init, level(s).score)) / t.ref;
  const mid = totals.length >> 1;
  return totals.length % 2 ? totals[mid]! : (totals[mid - 1]! + totals[mid]!) / 2;
}

export function systemic(s: EngineState, now: number): { G: number; typical: number; restRecommended: boolean; reasons: string[] } {
  const G = advanceTo(s, now).G;
  const typical = typicalSessionLoad(s, now);
  const ready = readiness(s, now);
  const reasons: string[] = [];
  if (G > s.params.systemic.restRatio * typical) {
    reasons.push(`Systemic fatigue high: ${G.toFixed(1)} vs typical session ${typical.toFixed(1)}`);
  }
  if (!MAJOR_REGIONS.some((r) => ready[r].state === "ready")) reasons.push("No major muscle group ready");
  return { G, typical, restRecommended: reasons.length > 0, reasons };
}
