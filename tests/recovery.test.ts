import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { advanceTo, decay, deposit, fatigueOf, REGIONS, replay } from "../src/engine";
import { catalog, H, params, profile, session, T0 } from "./helpers";

const p = params();

describe("recovery", () => {
  it("deposit splits by fastShare", () => {
    expect(deposit({ fast: 0, slow: 0 }, 10, p)).toEqual({ fast: 4, slow: 6 });
  });

  it("rho scales only the slow half-life", () => {
    const c = { fast: 1, slow: 1 };
    const a = decay(c, "chest", 22, 1, p);
    const b = decay(c, "chest", 22, 2, p);
    expect(a.fast).toBeCloseTo(b.fast, 12);
    expect(a.slow).toBeCloseTo(0.5, 12);
    expect(b.slow).toBeCloseTo(Math.SQRT1_2, 12);
  });

  it("advanceTo is pure and never goes backwards", () => {
    const s = replay([profile(), ...session(T0, "s1", [["push_up_standard", 10, 2]])], catalog, p);
    const before = structuredClone(s.regions);
    const later = advanceTo(s, T0 + 5 * H);
    expect(s.regions).toEqual(before);
    expect(later.t).toBe(T0 + 5 * H);
    expect(advanceTo(later, T0).regions).toEqual(later.regions);
  });

  it("systemic G decays with its own half-life, independent of rho", () => {
    const s = replay([profile(), ...session(T0, "s1", [["push_up_standard", 10, 2]])], catalog, p);
    s.rho.value = 1.5;
    expect(advanceTo(s, T0 + 24 * H).G).toBeCloseTo(s.G / 2, 9);
  });

  it("property: fatigue is >= 0 and non-increasing with no events", () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 50, noNaN: true }), fc.float({ min: 0, max: 50, noNaN: true }),
        fc.constantFrom(...REGIONS), fc.float({ min: Math.fround(0.6), max: Math.fround(1.8), noNaN: true }),
        fc.float({ min: 0, max: 500, noNaN: true }), fc.float({ min: 0, max: 500, noNaN: true }),
        (fast, slow, r, rho, h1, h2) => {
          const [a, b] = h1 <= h2 ? [h1, h2] : [h2, h1];
          const fa = fatigueOf(decay({ fast, slow }, r, a, rho, p));
          const fb = fatigueOf(decay({ fast, slow }, r, b, rho, p));
          expect(fb).toBeGreaterThanOrEqual(0);
          expect(fb).toBeLessThanOrEqual(fa);
        },
      ),
    );
  });
});
