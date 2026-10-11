import { describe, expect, it } from "vitest";
import { fatigueOf, hoursToReady, regionFatigue, replay, advanceTo, setLoad, weeklyNeed, predictSet, observedD, acuteUpdate } from "../src/engine";
import { catalog, H, params, profile, session, T0 } from "./helpers";

const TOL = 3; // toBeCloseTo digits: |diff| < 5e-4, within the spec's 1e-3
const G1_SETS: [string, number, number][] = [
  ["push_up_standard", 12, 2],
  ["push_up_standard", 10, 2],
  ["push_up_standard", 8, 1],
];
const familiar = params((p) => (p.novelty.amp = 0));
const g1 = () => replay([profile(), ...session(T0, "s1", G1_SETS)], catalog, familiar);

describe("G1: familiar push-ups", () => {
  it("set fatigues", () => {
    const f = G1_SETS.map(([, r, rir]) => setLoad({ lengthened: false }, r, rir, 0, familiar).fatigue);
    expect(f[0]).toBeCloseTo(1.0466, TOL);
    expect(f[1]).toBeCloseTo(1.0, TOL);
    expect(f[2]).toBeCloseTo(1.0403, TOL);
    expect(f[0]! + f[1]! + f[2]!).toBeCloseTo(3.087, TOL);
  });

  it("region fatigue, raw and saturated stimulus", () => {
    const s = g1();
    expect(fatigueOf(s.regions.chest)).toBeCloseTo(3.087, TOL);
    expect(fatigueOf(s.regions.triceps)).toBeCloseTo(1.5435, TOL);
    expect(fatigueOf(s.regions.front_delt)).toBeCloseTo(1.5435, TOL);
    expect(s.G).toBeCloseTo(3.087, TOL);
    const sess = s.sessions[0]!;
    expect(sess.rawStimulus.chest).toBeCloseTo(2.9, TOL);
    expect(sess.rawStimulus.triceps).toBeCloseTo(1.45, TOL);
    expect(sess.stimulus.chest).toBeCloseTo(2.2998, TOL);
    expect(sess.stimulus.triceps).toBeCloseTo(1.288, TOL);
    expect(sess.fatigueTotal).toBeCloseTo(3.087, TOL);
  });
});

describe("G2: novel exercise", () => {
  it("chest fatigue is G1 x 1.6", () => {
    const s = replay([profile(), ...session(T0, "s1", G1_SETS)], catalog, params());
    expect(fatigueOf(s.regions.chest)).toBeCloseTo(4.9391, TOL);
  });
});

describe("G3: decay of G1 chest", () => {
  it("at +12h", () => {
    const c = advanceTo(g1(), T0 + 12 * H).regions.chest;
    expect(c.fast).toBeCloseTo(0.1543, TOL);
    expect(c.slow).toBeCloseTo(1.2691, TOL);
    expect(fatigueOf(c)).toBeCloseTo(1.4235, TOL);
  });
  it("at +24h", () => {
    expect(regionFatigue(g1(), "chest", T0 + 24 * H)).toBeCloseTo(0.8889, TOL);
  });
  it("hoursToReady in (10, 12)", () => {
    const h = hoursToReady(g1(), "chest", T0);
    expect(h).toBeGreaterThan(10);
    expect(h).toBeLessThan(12);
    expect(regionFatigue(g1(), "chest", T0 + h * H)).toBeLessThan(1.5);
  });
});

describe("G5: prediction next day", () => {
  it("M_e = 14, +12h after G1, no in-session fatigue", () => {
    const s = g1();
    s.capacity.push_up_standard = { M: 14, obs: 1, lastPerformed: T0 };
    const r = predictSet(s, "push_up_standard", T0 + 12 * H);
    expect(r.F_sess_eff).toBe(0);
    expect(r.F_prior_eff).toBeCloseTo(1.0257, TOL);
    expect(r.M_pred).toBeCloseTo(12.950, TOL); // 14 × (1 − 0.45·(1 − e^(−0.08·1.0257/0.45))); was 12.851 with the linear drop
  });
});

describe("G6: weekly need", () => {
  it("chest need after G1 only (target 10, muscle/intermediate)", () => {
    const w = weeklyNeed(g1(), T0 + H).chest;
    expect(w.target).toBe(10);
    expect(w.need).toBeCloseTo(0.77, TOL);
  });
});

describe("G7: acute update", () => {
  it("M_obs 14 -> 12 over ΔF 0.785: d_obs ≈ 0.178, d 0.12 -> ≈ 0.1316", () => {
    expect(observedD(14, 12, 0.785)).toBeCloseTo(0.178, TOL);
    expect(observedD(10, -2, 0.8)).toBe(1); // negative M (negative RIR bias) is a total drop, not NaN
    expect(acuteUpdate(0.12, 14, 12, 0.785, familiar)).toBeCloseTo(0.1316, TOL);
  });

  it("through the fold: G1's first two sets (12 @ RIR2, 10 @ RIR2)", () => {
    const s = replay([profile(), ...session(T0, "s1", G1_SETS.slice(0, 2))], catalog, familiar);
    const [a, b] = s.sessions[0]!.sets;
    expect(a!.M_obs).toBe(14);
    expect(b!.M_obs).toBe(12);
    expect(b!.F_sess_eff - a!.F_sess_eff).toBeCloseTo(0.785, TOL);
    expect(s.predictionLog[1]!.type).toBe("acute");
    expect(s.d.value).toBeCloseTo(0.1316, TOL);
    expect(s.d.obs).toBe(1);
  });
});

describe("G4: triceps at +12h", () => {
  it("decays with the 16h slow half-life", () => {
    expect(regionFatigue(g1(), "triceps", T0 + 12 * H)).toBeCloseTo(0.6278, TOL);
  });
});
