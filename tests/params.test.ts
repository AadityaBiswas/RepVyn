import { describe, expect, it } from "vitest";
import raw from "../params/default.params.json";
import { parseParams } from "../src/engine";

const clone = () => structuredClone(raw) as any;

describe("params", () => {
  it("default params validate", () => {
    const p = parseParams(raw);
    expect(p.version).toBe(1);
    expect(p.recovery.slowHalfLifeH.chest).toBe(22);
  });

  it("rejects unknown keys", () => {
    const p = clone();
    p.effort.typo = 1;
    expect(() => parseParams(p)).toThrow();
  });

  it("rejects a missing region", () => {
    const p = clone();
    delete p.weeklyTargets.abs;
    expect(() => parseParams(p)).toThrow();
  });

  it("rejects effort arrays of wrong length", () => {
    const p = clone();
    p.effort.fatigue.pop();
    expect(() => parseParams(p)).toThrow();
  });

  it("rejects init outside clamps", () => {
    const p = clone();
    p.calibration.rho.init = 2;
    expect(() => parseParams(p)).toThrow();
  });

  it("rejects inverted thresholds", () => {
    const p = clone();
    p.readiness.readyBelow = 4;
    expect(() => parseParams(p)).toThrow();
  });
});
