import { describe, expect, it } from "vitest";
import { capacityOf, chooseWeight, prescribe, replay, type EngineEvent } from "../src/engine";
import { catalog, H, params, profile, T0 } from "./helpers";

const p = params();
const D = 24 * H;
type Dumbbells = NonNullable<Parameters<typeof profile>[1]>["dumbbells"];
/** A user who owns `dumbbells`, with db_curl's 1RM set to `oneRm` (measured once, last weight `last`). */
function state(dumbbells: Dumbbells, oneRm: number, last: number | null = null) {
  const s = replay([profile(T0 - D, { equipment: ["dumbbell", "bench"], bodyMassKg: 70, dumbbells })] as EngineEvent[], catalog, p);
  s.strength.db_curl = { oneRm, obs: 1, lastPerformed: T0, lastWeightKg: last };
  return s;
}
const NOW = T0 + 2 * D;

describe("chooseWeight", () => {
  it("picks the owned weight whose target reps sit nearest mid-range (target = reps to failure − targetRir 2)", () => {
    // 1RM 14: 10 kg → 12 reps to failure → 10 target, in [6, 15].
    expect(chooseWeight(state({ kind: "fixed", kg: [5, 7.5, 10, 12.5, 15] }, 14), "db_curl", NOW)).toEqual({ weightKg: 10, loadFlag: null });
  });

  it("keeps last time's weight while it is still in range", () => {
    const W = { kind: "adjustable", minKg: 10, maxKg: 15, stepKg: 1 } as const;
    expect(chooseWeight(state(W, 16), "db_curl", NOW)!.weightKg).toBe(11); // 11 kg → 12 target (nearest 10.5)
    expect(chooseWeight(state(W, 16, 12), "db_curl", NOW)!.weightKg).toBe(12); // 12 kg → 8 target, still in range
  });

  it("breaks a mid-range tie toward the heavier weight", () => {
    // 1RM 22: 15 kg → 12 target, 16.1 kg → 9 target; both 1.5 from 10.5.
    expect(chooseWeight(state({ kind: "fixed", kg: [15, 16.1] }, 22), "db_curl", NOW)!.weightKg).toBe(16.1);
  });

  it("when the range falls between two owned weights, takes the one nearest the range (no flag)", () => {
    // 1RM 8.925: 5 kg → 22 target (7 above), 7.5 kg → 4 target (2 below).
    expect(chooseWeight(state({ kind: "fixed", kg: [5, 7.5] }, 8.925), "db_curl", NOW)).toEqual({ weightKg: 7.5, loadFlag: null });
  });

  it("flags too_heavy and too_light, and returns null without dumbbells", () => {
    expect(chooseWeight(state({ kind: "fixed", kg: [12.5, 15] }, 14), "db_curl", NOW)).toEqual({ weightKg: 12.5, loadFlag: "too_heavy" });
    expect(chooseWeight(state({ kind: "fixed", kg: [2, 3] }, 14), "db_curl", NOW)).toEqual({ weightKg: 3, loadFlag: "too_light" });
    expect(chooseWeight(state(undefined, 14), "db_curl", NOW)).toBeNull();
    expect(chooseWeight(state({ kind: "fixed", kg: [5] }, 14), "push_up_standard", NOW)).toBeNull();
  });
});

describe("weighted prescription", () => {
  it("every set carries an owned weight and at least 1 rep", () => {
    const pr = prescribe(state({ kind: "fixed", kg: [12.5, 15] }, 14), "db_curl", 3, NOW);
    expect(pr.loadFlag).toBe("too_heavy");
    for (const x of pr.sets) {
      expect([12.5, 15]).toContain(x.weightKg);
      expect(x.reps).toBeGreaterThanOrEqual(1);
    }
  });

  it("caps reps at the range top when the dumbbells are too light", () => {
    const pr = prescribe(state({ kind: "fixed", kg: [2, 3] }, 14), "db_curl", 2, NOW);
    expect(pr.loadFlag).toBe("too_light");
    expect(pr.sets.map((x) => x.reps)).toEqual([15, 15]);
  });

  it("steps down one weight when fatigue drops a later set below the rep floor", () => {
    // 10 kg: targets 10, 8, 6, then 5 < 6, so the fourth set moves to 7.5 kg.
    const pr = prescribe(state({ kind: "fixed", kg: [7.5, 10] }, 14), "db_curl", 4, NOW);
    expect(pr.sets.map((x) => x.weightKg)).toEqual([10, 10, 10, 7.5]);
    expect(pr.sets.map((x) => x.reps)).toEqual([10, 8, 6, 13]);
  });

  it("throws a clear error without dumbbells; bodyweight prescriptions carry no weight", () => {
    expect(() => prescribe(state(undefined, 14), "db_curl", 3, NOW)).toThrow(/no dumbbell weights/);
    const bw = prescribe(state(undefined, 14), "push_up_standard", 2, NOW);
    expect(bw.loadFlag).toBeNull();
    expect(bw.sets.every((x) => x.weightKg === undefined)).toBe(true);
  });

  it("capacityOf at a weight is reps to failure from the 1RM", () => {
    expect(capacityOf(state({ kind: "fixed", kg: [10] }, 14), "db_curl", NOW, 10).M).toBeCloseTo(12, 9);
  });
});
