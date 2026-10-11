import { describe, expect, it } from "vitest";
import { equipmentGaps, ownedWeights, planSession, replay, type EngineEvent } from "../src/engine";
import { catalog, H, params, profile, T0 } from "./helpers";

const p = params();
const D = 24 * H;
const run = (over: Parameters<typeof profile>[1]) => replay([profile(T0 - D, over)] as EngineEvent[], catalog, p);

describe("planning with dumbbells", () => {
  it("never plans a weighted exercise without owned dumbbells, even with the 'dumbbell' tag", () => {
    const plan = planSession(run({ equipment: ["dumbbell", "bench"] }), { now: T0 });
    expect(plan.exercises.some((x) => catalog.byId[x.exerciseId]!.weighted)).toBe(false);
  });

  it("with dumbbells, plans weighted exercises at owned weights", () => {
    const s = run({ equipment: ["dumbbell", "bench"], bodyMassKg: 70, dumbbells: { kind: "adjustable", minKg: 2.5, maxKg: 30, stepKg: 2.5 } });
    const plan = planSession(s, { now: T0 });
    const weighted = plan.exercises.filter((x) => catalog.byId[x.exerciseId]!.weighted);
    expect(weighted.length).toBeGreaterThan(0); // rows need a table or band otherwise, so the pull slot is weighted
    const owned = ownedWeights(s.profile);
    for (const x of weighted) for (const set of x.sets) expect(owned).toContain(set.weightKg);
  });

  it("equipment gaps ignore weighted exercises the user cannot load", () => {
    expect(equipmentGaps(run({ equipment: ["dumbbell"] })).map((g) => g.region)).toContain("biceps");
    expect(equipmentGaps(run({ equipment: ["dumbbell"], dumbbells: { kind: "fixed", kg: [10] } })).map((g) => g.region)).not.toContain("biceps");
  });
});

describe("the 'New to you' bonus for weighted exercises", () => {
  it("stops once the exercise is measured, even without body mass (no level observation is recorded then)", () => {
    const weightedReasons = (obs: number) => {
      const s = run({ equipment: ["dumbbell", "bench"], dumbbells: { kind: "fixed", kg: [5, 7.5, 10, 12.5, 15] } });
      for (const e of catalog.exercises.filter((x) => x.weighted)) s.strength[e.id] = { oneRm: 14, obs, lastPerformed: T0 - D, lastWeightKg: null };
      const plan = planSession(s, { now: T0 });
      return plan.exercises.filter((x) => catalog.byId[x.exerciseId]!.weighted).flatMap((x) => x.reasons);
    };
    expect(weightedReasons(0).some((r) => r.startsWith("New to you"))).toBe(true);
    const measured = weightedReasons(2);
    expect(measured.length).toBeGreaterThan(0);
    expect(measured.some((r) => r.startsWith("New to you"))).toBe(false);
  });
});

describe("the planner's AMRAP set", () => {
  const WEIGHTED = catalog.exercises.filter((e) => e.weighted);
  /** A dumbbell owner whose every weighted exercise has a measured 1RM of `oneRm` kg. */
  const owner = (oneRm: number) => {
    const s = run({ equipment: ["dumbbell", "bench"], bodyMassKg: 70, dumbbells: { kind: "fixed", kg: [5, 7.5, 10, 12.5, 15, 20, 25] } });
    for (const e of WEIGHTED) s.strength[e.id] = { oneRm, obs: 3, lastPerformed: T0 - D, lastWeightKg: null };
    return s;
  };
  const steppedDown = (sets: { weightKg?: number }[]) => sets.some((x, i) => i > 0 && x.weightKg !== sets[i - 1]!.weightKg);

  it("is never placed on a set whose weight differs from the set before it (a step-down)", () => {
    let sawStepDown = false;
    for (let oneRm = 8; oneRm <= 40; oneRm += 1) {
      const plan = planSession(owner(oneRm), { now: T0 });
      if (plan.kind !== "workout") continue;
      for (const x of plan.exercises) {
        sawStepDown ||= steppedDown(x.sets);
        const i = x.sets.findIndex((st) => st.isAmrap);
        if (i > 0) expect(x.sets[i]!.weightKg).toBe(x.sets[i - 1]!.weightKg);
      }
    }
    expect(sawStepDown).toBe(true); // otherwise this test would pass without checking anything
  });

  it("skips a stepped-down weighted exercise and uses the next exercise that has two sets at one weight", () => {
    for (let oneRm = 8; oneRm <= 40; oneRm += 1) {
      const plan = planSession(owner(oneRm), { now: T0 });
      if (plan.kind !== "workout") continue;
      const firstStepped = plan.exercises.findIndex((x) => steppedDown(x.sets.slice(-2)) && x.sets.length >= 2);
      if (firstStepped < 0) continue;
      const amrapAt = plan.exercises.findIndex((x) => x.sets.some((st) => st.isAmrap));
      expect(amrapAt).not.toBe(firstStepped);
      return;
    }
    throw new Error("no stepped-down plan found in the sweep");
  });

  it("is not placed on a 'too light' exercise, whose reps are capped below failure", () => {
    const s = owner(60); // 25 kg is the heaviest pair: every weighted exercise is too light
    const plan = planSession(s, { now: T0 });
    const light = (plan.kind === "workout" ? plan.exercises : []).filter((x) => x.loadFlag === "too_light");
    expect(light.length).toBeGreaterThan(0);
    for (const x of light) expect(x.sets.some((st) => st.isAmrap)).toBe(false);
  });
});
