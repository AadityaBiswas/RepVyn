import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { noveltyFactor, repsEq, saturate, setLoad } from "../src/engine";
import { params } from "./helpers";

const p = params();
const plain = { lengthened: false };

describe("setLoad", () => {
  it("RIR 5 (5+) uses the last effort entry", () => {
    const l = setLoad(plain, 10, 5, 100, p);
    expect(l.stimulus).toBe(0.3);
    expect(l.fatigue).toBeCloseTo(0.4, 6);
  });

  it("clamps reps to [reps.min, reps.max]", () => {
    expect(setLoad(plain, 1, 2, 100, p).fatigue).toBeCloseTo(setLoad(plain, 5, 2, 100, p).fatigue, 9);
    expect(setLoad(plain, 80, 2, 100, p).fatigue).toBeCloseTo(setLoad(plain, 40, 2, 100, p).fatigue, 9);
    expect(setLoad(plain, 40, 2, 100, p).fatigue).toBeCloseTo(4 ** 0.25, 3);
  });

  it("lengthened multiplies fatigue by lengthenedFactor, not stimulus", () => {
    const a = setLoad(plain, 10, 2, 100, p);
    const b = setLoad({ lengthened: true }, 10, 2, 100, p);
    expect(b.fatigue / a.fatigue).toBeCloseTo(1.25, 9);
    expect(b.stimulus).toBe(a.stimulus);
  });

  it("novelty: N = 1.6 at k=0 and decays toward 1", () => {
    expect(noveltyFactor(0, p)).toBeCloseTo(1.6, 9);
    expect(noveltyFactor(2, p)).toBeCloseTo(1 + 0.6 * Math.exp(-1), 9);
    expect(noveltyFactor(50, p)).toBeCloseTo(1, 6);
  });

  it("lower RIR never gives less fatigue; more reps never give less fatigue", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 60 }), fc.integer({ min: 0, max: 60 }), fc.integer({ min: 0, max: 5 }), fc.integer({ min: 0, max: 5 }), fc.nat(10), (r1, r2, a, b, k) => {
        const [lo, hi] = r1 <= r2 ? [r1, r2] : [r2, r1];
        const [easy, hard] = a >= b ? [a, b] : [b, a];
        expect(setLoad(plain, hi, easy, k, p).fatigue).toBeGreaterThanOrEqual(setLoad(plain, lo, easy, k, p).fatigue);
        expect(setLoad(plain, lo, hard, k, p).fatigue).toBeGreaterThanOrEqual(setLoad(plain, lo, easy, k, p).fatigue);
      }),
    );
  });
});

describe("repsEq", () => {
  it("holds convert by secondsPerRep", () => {
    expect(repsEq({ holdSeconds: 45 }, p)).toBe(15);
    expect(repsEq({ reps: 12 }, p)).toBe(12);
  });
});

describe("saturate", () => {
  it("is bounded by sessionMax and ~identity when small", () => {
    expect(saturate(0, p)).toBe(0);
    expect(saturate(1000, p)).toBeCloseTo(6, 6);
    expect(saturate(0.01, p)).toBeCloseTo(0.01, 4);
  });
});
