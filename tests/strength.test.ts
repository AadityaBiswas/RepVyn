import { describe, expect, it } from "vitest";
import { canLoad, initialOneRm, oneRmFrom, ownedWeights, referenceWeight, repsAt, replay, sameWeight, strengthOf, type EngineEvent } from "../src/engine";
import { catalog, H, params, profile, T0 } from "./helpers";

const p = params();
const D = 24 * H;
const db = catalog.byId.db_curl!;
const run = (events: EngineEvent[], over: Parameters<typeof profile>[1] = {}) =>
  replay([profile(T0 - D, { equipment: ["dumbbell", "bench"], bodyMassKg: 70, dumbbells: { kind: "fixed", kg: [5, 7.5, 10, 12.5, 15] }, ...over }), ...events], catalog, p);

describe("rep-weight curve (Epley)", () => {
  it("repsAt and oneRmFrom are inverses above 1 rep, and reps fall as weight rises", () => {
    for (const [R, w] of [[20, 10], [14, 7.5], [50, 30]] as const) expect(oneRmFrom(w, repsAt(R, w))).toBeCloseTo(R, 9);
    expect(repsAt(14, 10)).toBeCloseTo(12, 9);
    expect(repsAt(14, 10)).toBeGreaterThan(repsAt(14, 12.5));
    expect(repsAt(14, 14)).toBe(1);
    expect(repsAt(14, 20)).toBe(1);
    expect(oneRmFrom(10, -3)).toBe(10);
  });
});

describe("ownedWeights", () => {
  it("sorts fixed pairs and expands adjustable sets exactly", () => {
    expect(ownedWeights(null)).toEqual([]);
    expect(ownedWeights({ ...run([]).profile!, dumbbells: { kind: "fixed", kg: [10, 5, 7.5] } })).toEqual([5, 7.5, 10]);
    expect(ownedWeights({ ...run([]).profile!, dumbbells: { kind: "adjustable", minKg: 2.5, maxKg: 10, stepKg: 2.5 } })).toEqual([2.5, 5, 7.5, 10]);
    expect(ownedWeights({ ...run([]).profile!, dumbbells: { kind: "adjustable", minKg: 1, maxKg: 1.3, stepKg: 0.1 } })).toEqual([1, 1.1, 1.2, 1.3]);
    expect(ownedWeights({ ...run([]).profile!, dumbbells: undefined })).toEqual([]);
  });

  it("covers boundaries: one weight, exactly 100 weights, and never a 0 kg or duplicate weight", () => {
    const owned = (minKg: number, maxKg: number, stepKg: number) =>
      ownedWeights({ ...run([]).profile!, dumbbells: { kind: "adjustable", minKg, maxKg, stepKg } });
    expect(owned(5, 5, 1)).toEqual([5]);
    expect(owned(1, 100, 1)).toHaveLength(100);
    expect(owned(0.001, 0.1, 0.001)).toHaveLength(100);
    // A hand-built (schema-invalid) profile still yields a positive, distinct, bounded list.
    for (const w of [owned(0.0004, 0.04, 0.0004), owned(1, 1.0099, 0.0001), owned(0.0004, 500, 0.5)]) {
      expect(w.length).toBeLessThanOrEqual(100);
      expect(w.every((x) => x > 0)).toBe(true);
      expect(new Set(w).size).toBe(w.length);
    }
  });

  it("sameWeight tolerates unit-conversion noise but not a real step", () => {
    expect(sameWeight(42.5 * 0.45359237, 19.278)).toBe(true);
    expect(sameWeight(19.277, 19.278)).toBe(false);
    expect(sameWeight(null, null)).toBe(true);
    expect(sameWeight(null, 5)).toBe(false);
  });
});

describe("initial strength", () => {
  it("uses the usual weight first (reps + usualRir + b), else body mass × loadNorm × initFactor", () => {
    const s = run([]);
    expect(initialOneRm(s, db)).toBeCloseTo(70 * 0.15 * 0.85, 9);
    expect(initialOneRm(run([], { bodyMassKg: 80 }), db)).toBeCloseTo(80 * 0.15 * 0.85, 9);
    expect(initialOneRm(run([], { bodyMassKg: undefined }), db)).toBeCloseTo(70 * 0.15 * 0.85, 9); // fallback 70 kg
    s.usualWeights.db_curl = { weightKg: 10, reps: 10 };
    expect(initialOneRm(s, db)).toBeCloseTo(10 * (1 + 12 / 30), 9);
  });

  it("strengthOf: technical failure until performed, stale after staleDays", () => {
    const s = run([]);
    expect(strengthOf(s, db, T0)).toEqual({ oneRm: initialOneRm(s, db), firstSetMode: "technical_failure" });
    s.strength.db_curl = { oneRm: 15, obs: 2, lastPerformed: T0, lastWeightKg: 10 };
    expect(strengthOf(s, db, T0 + D)).toEqual({ oneRm: 15, firstSetMode: null });
    expect(strengthOf(s, db, T0 + 29 * D)).toEqual({ oneRm: 15 * 0.93, firstSetMode: "technical_failure" });
  });

  it("referenceWeight: the last weight, else the weight for mid-range reps", () => {
    const s = run([]);
    s.strength.db_curl = { oneRm: 14, obs: 1, lastPerformed: T0, lastWeightKg: null };
    expect(referenceWeight(s, db, T0)).toBeCloseTo(14 / (1 + 10.5 / 30), 9);
    s.strength.db_curl.lastWeightKg = 10;
    expect(referenceWeight(s, db, T0)).toBe(10);
  });
});

describe("canLoad", () => {
  it("weighted exercises need owned dumbbells; others always load", () => {
    expect(canLoad(run([]), db)).toBe(true);
    expect(canLoad(run([], { dumbbells: undefined }), db)).toBe(false);
    expect(canLoad(run([], { dumbbells: undefined }), catalog.byId.push_up_standard!)).toBe(true);
  });
});

it("fresh state has empty strength, ratings and zero demand offsets", () => {
  const s = run([]);
  expect(s.strength).toEqual({});
  expect(s.usualWeights).toEqual({});
  expect(s.ratings).toEqual({});
  expect(s.demandOffsets).toEqual({ balance: 0, coordination: 0, mobility: 0, grip: 0 });
});
