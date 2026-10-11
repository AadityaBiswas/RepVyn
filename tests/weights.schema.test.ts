import { describe, expect, it } from "vitest";
import { EventSchema } from "../src/engine";
import { ev, params, profile, T0 } from "./helpers";

const ok = (e: unknown) => EventSchema.safeParse(e).success;

describe("weights and ratings: event schema", () => {
  it("accepts fixed and adjustable dumbbell sets", () => {
    expect(ok(profile(T0, { dumbbells: { kind: "fixed", kg: [5, 7.5, 10] } }))).toBe(true);
    expect(ok(profile(T0, { dumbbells: { kind: "adjustable", minKg: 2.5, maxKg: 24, stepKg: 2.5 } }))).toBe(true);
  });

  it("rejects invalid dumbbell sets", () => {
    expect(ok(profile(T0, { dumbbells: { kind: "fixed", kg: [] } }))).toBe(false);
    expect(ok(profile(T0, { dumbbells: { kind: "fixed", kg: [5, 5] } }))).toBe(false);
    expect(ok(profile(T0, { dumbbells: { kind: "fixed", kg: [0] } }))).toBe(false);
    expect(ok(profile(T0, { dumbbells: { kind: "fixed", kg: [250] } }))).toBe(false);
    expect(ok(profile(T0, { dumbbells: { kind: "adjustable", minKg: 10, maxKg: 5, stepKg: 1 } }))).toBe(false);
    expect(ok(profile(T0, { dumbbells: { kind: "adjustable", minKg: 1, maxKg: 200, stepKg: 1 } }))).toBe(false); // 200 weights
  });

  it("adjustable sets start and step at 1 g or more, and hold at most 100 weights (100 ok, 101 not)", () => {
    const adj = (minKg: number, maxKg: number, stepKg: number) => ok(profile(T0, { dumbbells: { kind: "adjustable", minKg, maxKg, stepKg } }));
    expect(adj(0.0004, 0.04, 0.0004)).toBe(false); // would round to a 0 kg weight and duplicates
    expect(adj(1, 1.0099, 0.0001)).toBe(false); // sub-gram steps
    expect(adj(0.0004, 5, 1)).toBe(false);
    expect(adj(0.001, 0.1, 0.001)).toBe(true); // 100 weights
    expect(adj(0.001, 0.101, 0.001)).toBe(false); // 101
    expect(adj(1, 100, 1)).toBe(true);
    expect(adj(1, 101, 1)).toBe(false);
    expect(adj(5, 5, 1)).toBe(true); // a single weight
  });

  it("a set's weightKg must be in (0, 200]", () => {
    const set = (weightKg: number) =>
      ev(T0, { type: "set_logged", payload: { sessionId: "a", exerciseId: "db_curl", reps: 10, rir: 2, isWarmup: false, isAmrap: false, weightKg } });
    expect(ok(set(12.5))).toBe(true);
    expect(ok(set(0))).toBe(false);
    expect(ok(set(250))).toBe(false);
    expect(ok(set(Number.NaN))).toBe(false);
  });

  it("usual_weight defaults reps to 10; ratings take exactly three values", () => {
    const parsed = EventSchema.parse(ev(T0, { type: "usual_weight", payload: { exerciseId: "db_curl", weightKg: 10 } as any }));
    expect(parsed.type === "usual_weight" && parsed.payload.reps).toBe(10);
    expect(ok(ev(T0, { type: "usual_weight", payload: { exerciseId: "db_curl", weightKg: 10, reps: 0 } }))).toBe(false);
    const fb = (rating: string) => ok(ev(T0, { type: "exercise_feedback", payload: { exerciseId: "db_curl", rating } as any }));
    expect(fb("too_easy")).toBe(true);
    expect(fb("just_right")).toBe(true);
    expect(fb("too_hard")).toBe(true);
    expect(fb("impossible")).toBe(false);
  });
});

describe("weights and difficulty params", () => {
  it("validates the strength and difficulty blocks", () => {
    expect(() => params()).not.toThrow();
    expect(() => params((p) => { p.strength.repRange = [15, 6]; })).toThrow();
    expect(() => params((p) => { p.strength.repRange = [6, 40]; })).toThrow();
    expect(() => params((p) => { p.strength.initFactor = 1.5; })).toThrow();
    expect(() => params((p) => { p.difficulty.excludeAbove = 6; })).toThrow();
    expect(() => params((p) => { p.difficulty.preferWeight = 1; })).toThrow();
    expect(() => params((p) => { delete p.difficulty; })).toThrow();
  });
});
