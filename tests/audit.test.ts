// Calculation audit: every formula re-derived independently (numerical ODE integration, brute-force scans,
// round trips) and checked against the engine, plus regression tests for the problems the audit found.
import { describe, expect, it } from "vitest";
import {
  advanceSoreness, capacityOf, decay, decaySoreness, grids, hoursToReady, level, normAt, planSession, predictSet, prescribe, readiness,
  replay, saturate, scoreObservation, soreness, toleranceOf, weeklyNeed, REGIONS, type EngineEvent, type Region,
} from "../src/engine";
import { catalog, ev, H, params, profile, session, set, T0 } from "./helpers";

const p = params();
const D = 24 * H;
const PUSH: [string, number, number][] = [["push_up_standard", 15, 2], ["push_up_standard", 13, 2], ["push_up_standard", 11, 2]];
const run = (events: EngineEvent[], over = {}) => replay([profile(T0 - D, over), ...events], catalog, p);

/** Classic RK4 for y' = f(y), n steps over h hours. */
function rk4(y: number[], f: (y: number[]) => number[], h: number, n = 4000): number[] {
  const dt = h / n;
  for (let i = 0; i < n; i++) {
    const k1 = f(y);
    const k2 = f(y.map((v, j) => v + (dt / 2) * k1[j]!));
    const k3 = f(y.map((v, j) => v + (dt / 2) * k2[j]!));
    const k4 = f(y.map((v, j) => v + dt * k3[j]!));
    y = y.map((v, j) => v + (dt / 6) * (k1[j]! + 2 * k2[j]! + 2 * k3[j]! + k4[j]!));
  }
  return y;
}

describe("audit 1: fatigue recovery equals its differential equation", () => {
  it.each([[1, 0.6], [30, 1], [90, 1.8]])("after %i h at rho %f, closed form = numerical integration", (h, rho) => {
    const c = decay({ fast: 3, slow: 5 }, "chest", h, rho, p);
    const kf = Math.LN2 / p.recovery.fastHalfLifeH;
    const ks = Math.LN2 / (p.recovery.slowHalfLifeH.chest * rho);
    const [fast, slow] = rk4([3, 5], ([a, b]) => [-kf * a!, -ks * b!], h);
    expect(c.fast).toBeCloseTo(fast!, 9);
    expect(c.slow).toBeCloseTo(slow!, 9);
  });

  it("half-life means half: slow chest fatigue halves in exactly 22 h at rho 1", () => {
    expect(decay({ fast: 0, slow: 8 }, "chest", 22, 1, p).slow).toBeCloseTo(4, 12);
  });

  it("time can be advanced in pieces or at once (the fold advances event by event)", () => {
    const base = session(T0, "a", PUSH);
    const ticks = Array.from({ length: 9 }, (_, i) => ev(T0 + (i + 1) * 3.7 * H, { type: "checkin", payload: { feel: "normal", soreRegions: [] } }));
    const once = readiness(run(base), T0 + 40 * H);
    const pieces = readiness(run([...base, ...ticks]), T0 + 40 * H);
    for (const m of REGIONS) expect(pieces[m].fatigue).toBeCloseTo(once[m].fatigue, 12);
  });

  it("hoursToReady matches a brute-force scan", () => {
    const s = run(session(T0, "a", PUSH));
    const h = hoursToReady(s, "chest", T0);
    let scan = 0;
    while (readiness(s, T0 + scan * H).chest.state !== "ready") scan += 0.01;
    expect(Math.abs(h - scan)).toBeLessThan(0.06); // bisection tolerance 0.05 h + scan step
  });
});

describe("audit 2: soreness equals its differential equation", () => {
  it.each([[5, 1], [33, 0.6], [80, 1.6667]])("after %i h at rhoS %f, closed form = numerical integration", (h, rho) => {
    const r = p.soreness.riseH;
    const d = p.soreness.decayH * rho;
    const c = decaySoreness({ pending: 7, sore: 2 }, h, rho, p);
    const [P, S] = rk4([7, 2], ([a, b]) => [-a! / r, a! / r - b! / d], h);
    expect(c.pending).toBeCloseTo(P!, 9);
    expect(c.sore).toBeCloseTo(S!, 9);
  });

  it("peaks when calculus says it should: t* = ln(d/r)·r·d/(d−r) ≈ 33.3 h", () => {
    const r = p.soreness.riseH;
    const d = p.soreness.decayH;
    const tStar = (Math.log(d / r) * r * d) / (d - r);
    expect(tStar).toBeCloseTo(33.27, 2);
    const s = run(session(T0, "a", PUSH));
    expect(Math.abs(soreness(s, T0).chest.peakInH - tStar)).toBeLessThanOrEqual(1); // reported to the hour
  });

  it("soreness time can be advanced in pieces or at once", () => {
    const one = run(session(T0, "a", PUSH));
    const many = run(session(T0, "a", PUSH));
    advanceSoreness(one, T0 + 50 * H);
    for (let t = 1; t <= 50; t += 1) advanceSoreness(many, T0 + t * H);
    for (let i = 0; i < one.soreness.grid.length; i++) {
      for (const m of REGIONS) expect(many.soreness.grid[i]![m].sore).toBeCloseTo(one.soreness.grid[i]![m].sore, 10);
    }
  });

  it("every candidate recovery time stays clear of the rise time (no division by zero)", () => {
    for (const rho of grids(p).rho) expect(p.soreness.decayH * rho - p.soreness.riseH).toBeGreaterThan(1);
  });
});

describe("audit 3: level scale, stimulus, units", () => {
  it("scoring an observation inverts the norm curve for every catalog exercise", () => {
    for (const e of catalog.exercises) {
      if (e.weighted) continue; // weighted exercises have loadNorm, not a rep norm
      const n = e.defaultM!;
      if (!(n.beginner < n.intermediate && n.intermediate < n.advanced)) continue; // flat norms carry no level information
      for (const x of [0.1, 0.5, 0.9, 1.2, 1.8]) expect(scoreObservation(n, normAt(n, x)).score).toBeCloseTo(x, 9);
    }
  });

  it("session stimulus saturation: ≤ sessionMax, increasing, slope 1 at zero", () => {
    let prev = -1;
    for (const x of [0, 0.5, 2, 6, 20, 200]) {
      const y = saturate(x, p);
      expect(y).toBeLessThanOrEqual(p.stimulus.sessionMax);
      expect(y).toBeGreaterThan(prev);
      prev = y;
    }
    expect(saturate(1e-6, p) / 1e-6).toBeCloseTo(1, 5);
  });

  it("holds are counted in seconds / secondsPerRep everywhere", () => {
    const s = run([
      ev(T0, { type: "session_started", payload: { sessionId: "a" } }),
      set(T0, "a", "plank", 60, 2, { hold: true }),
      ev(T0, { type: "session_ended", payload: { sessionId: "a" } }),
    ]);
    expect(s.predictionLog[0]!.M_obs).toBe(60 / p.hold.secondsPerRep + 2);
    const pr = prescribe(s, "plank", 3, T0 + 3 * D);
    for (const x of pr.sets) expect(x.seconds! % p.hold.secondsPerRep).toBe(0);
  });

  it("weekly volume counts sessions inside the last 7 days only", () => {
    const s = run(session(T0, "a", PUSH));
    expect(weeklyNeed(s, T0 + 7 * D - 1).chest.done).toBeGreaterThan(0);
    expect(weeklyNeed(s, T0 + 7 * D).chest.done).toBe(0);
  });

  it("results do not depend on the order events arrive in", () => {
    const evs = [profile(T0 - D), ...session(T0, "a", PUSH), ...session(T0 + 2 * D, "b", PUSH)];
    const shuffled = [...evs].reverse();
    expect(replay(shuffled, catalog, p)).toEqual(replay(evs, catalog, p));
  });

  it("tolerance is never below the default for the user's level, and soreness learning stays finite", () => {
    const events = [0, 3, 6, 9].flatMap((d) => [...session(T0 + d * D, `s${d}`, PUSH), ev(T0 + (d + 1.5) * D, { type: "checkin", payload: { feel: "normal", soreRegions: ["chest"], sorenessChecked: true } })]);
    const s = run(events);
    for (const m of REGIONS) expect(toleranceOf(s, m)).toBeGreaterThanOrEqual(p.tolerance.init.beginner);
    expect(s.soreness.logPost.every(Number.isFinite)).toBe(true);
    expect(grids(p).sigma).toContain(s.sigma.value);
  });
});

// ---------------- problems found by the audit (red before the fix) ----------------

describe("audit finding A: an easy '5+ reps left' set is a lower bound, not a measurement", () => {
  const established = () => [0, 3, 6].flatMap((d) => session(T0 + d * D, `s${d}`, [["push_up_standard", 18, 2]])); // M = 20
  it("does not lower capacity, level or recovery estimates", () => {
    const before = run(established());
    const after = run([...established(), ...session(T0 + 9 * D, "easy", [["push_up_standard", 8, 5]])]);
    expect(after.capacity.push_up_standard!.M).toBeCloseTo(before.capacity.push_up_standard!.M, 9);
    expect(after.levelObs.push_up).toEqual(before.levelObs.push_up);
    expect(after.rho).toEqual(before.rho);
  });
  it("still raises capacity when even the lower bound beats it", () => {
    const after = run([...established(), ...session(T0 + 9 * D, "easy", [["push_up_standard", 30, 5]])]);
    expect(after.capacity.push_up_standard!.M).toBeGreaterThan(20);
  });
});

describe("audit finding B: a typo must not produce a dangerous prescription", () => {
  it("a first measurement is capped at 1.5 × the advanced norm", () => {
    const s = run(session(T0, "a", [["push_up_standard", 300, 0]]));
    expect(capacityOf(s, "push_up_standard", T0 + D).M).toBeLessThanOrEqual(1.5 * catalog.byId.push_up_standard!.defaultM!.advanced);
  });
});

describe("audit finding C: 'today' is the user's local day, not the UTC day", () => {
  it("a New York user's 6 pm check-in counts for their 8 pm workout (different UTC days)", () => {
    const checkinAt = Date.UTC(2026, 0, 6, 23); // 18:00 in New York (UTC−5)
    const planAt = Date.UTC(2026, 0, 7, 1); // 20:00 the same local evening
    const s = replay([
      profile(T0 - D, { utcOffsetMinutes: -300 }),
      ev(checkinAt, { type: "checkin", payload: { feel: "normal", soreRegions: ["quads"] } }),
    ], catalog, p);
    expect(planSession(s, { now: planAt }).reasons).toContain("Quads skipped: you said they're sore");
  });
});

// Suspected (the posterior never forgets), but this passes without any change: soreness novelty already models adaptation.
describe("audit 4: soreness learning follows a user who adapts", () => {
  it("someone very sore for a month, then adapted and never sore for a month, is fitted as not sore-prone now", () => {
    const events: EngineEvent[] = [];
    for (let d = 0; d < 56; d += 2) {
      events.push(...session(T0 + d * D, `s${d}`, PUSH));
      const sore: Region[] = d < 28 ? ["chest", "triceps", "front_delt"] : [];
      events.push(ev(T0 + (d + 1.4) * D, { type: "checkin", payload: { feel: "normal", soreRegions: sore, sorenessChecked: true } }));
    }
    const month1 = run(events.filter((e) => e.ts < T0 + 28 * D));
    const now = run(events);
    expect(month1.sigma.value).toBeGreaterThan(1.3);
    expect(now.sigma.value).toBeLessThan(1);
  });
});

describe("audit: level is exactly intermediate when every measurement sits on the intermediate norm", () => {
  it("scores 1", () => {
    const ex = ["push_up_standard", "squat_bodyweight", "glute_bridge", "dead_bug", "calf_raise_double", "prone_superman"];
    const at = (e: string) => catalog.byId[e]!.defaultM!.intermediate - 2; // reps + RIR 2 = the norm
    const s = run([0, 4, 8].flatMap((d) => ex.flatMap((e, i) => session(T0 + d * D + i * H, `s${d}${e}`, [[e, at(e), 2]])))); // calibration needs 7+ days
    expect(level(s).calibrated).toBe(true);
    expect(level(s).score).toBeCloseTo(1, 9);
    expect(predictSet(s, "push_up_standard", T0 + 20 * D).M_pred).toBeCloseTo(20, 3); // a trace of fatigue remains after 12 days
  });
});
