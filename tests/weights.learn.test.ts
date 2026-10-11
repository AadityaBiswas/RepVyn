import { describe, expect, it } from "vitest";
import { readiness, replay, strengthOf, type EngineEvent } from "../src/engine";
import { catalog, ev, H, params, profile, T0 } from "./helpers";

const p = params();
const D = 24 * H;
const db = catalog.byId.db_curl!;
const PROFILE: Parameters<typeof profile>[1] = { equipment: ["dumbbell", "bench"], bodyMassKg: 70, dumbbells: { kind: "fixed", kg: [5, 7.5, 10, 12.5, 15] } };
const run = (events: EngineEvent[], over: Parameters<typeof profile>[1] = {}) =>
  replay([profile(T0 - D, { ...PROFILE, ...over }), ...events], catalog, p);
const usual = (ts: number, exerciseId: string, weightKg: number, reps = 10) => ev(ts, { type: "usual_weight", payload: { exerciseId, weightKg, reps } });
const wset = (ts: number, sid: string, exerciseId: string, reps: number, rir: number, weightKg?: number) =>
  ev(ts, { type: "set_logged", payload: { sessionId: sid, exerciseId, reps, rir, isWarmup: false, isAmrap: false, ...(weightKg === undefined ? {} : { weightKg }) } });
const sess = (ts: number, id: string, sets: [string, number, number, number?][]) => [
  ev(ts, { type: "session_started", payload: { sessionId: id } }),
  ...sets.map(([e, r, rir, w]) => wset(ts, id, e, r, rir, w)),
  ev(ts, { type: "session_ended", payload: { sessionId: id } }),
];

describe("golden: usual weight, first measurement, EMA update", () => {
  it("10 kg × 10 usual → 1RM 14; 12 @ RIR 2 at 10 kg → 14.6667; 13 @ RIR 2 three days later → 14.7667", () => {
    const u = usual(T0 - H, "db_curl", 10);
    expect(strengthOf(run([u]), db, T0)).toEqual({ oneRm: 14, firstSetMode: "technical_failure" });
    const s1 = run([u, ...sess(T0, "a", [["db_curl", 12, 2, 10]])]);
    expect(s1.predictionLog[0]!.type).toBe("capacity");
    expect(s1.predictionLog[0]!.M_pred).toBeCloseTo(12, 9);
    expect(s1.predictionLog[0]!.M_obs).toBeCloseTo(14, 9);
    expect(s1.strength.db_curl).toEqual({ oneRm: 10 * (1 + 14 / 30), obs: 1, lastPerformed: T0, lastWeightKg: 10 });
    const s2 = run([u, ...sess(T0, "a", [["db_curl", 12, 2, 10]]), ...sess(T0 + 3 * D, "b", [["db_curl", 13, 2, 10]])]);
    expect(s2.strength.db_curl!.oneRm).toBeCloseTo(14.666667 + 0.3 * (15 - 14.666667), 5);
  });
});

describe("weights and the fold", () => {
  it("a weighted set without a weight deposits fatigue but teaches nothing", () => {
    const s = run(sess(T0, "a", [["db_curl", 12, 2]]));
    expect(s.strength.db_curl).toBeUndefined();
    expect(s.predictionLog).toHaveLength(0);
    expect(readiness(s, T0 + H).biceps.fatigue).toBeGreaterThan(0);
  });

  it("a weight on a bodyweight exercise is ignored", () => {
    const a = run(sess(T0, "a", [["push_up_standard", 15, 2, 20]]));
    const b = run(sess(T0, "a", [["push_up_standard", 15, 2]]));
    expect(a.capacity).toEqual(b.capacity);
    expect(a.predictionLog).toEqual(b.predictionLog);
    expect(a.strength).toEqual({});
  });

  it("usual_weight is ignored for unweighted exercises and once the exercise is measured", () => {
    expect(run([usual(T0, "push_up_standard", 10)]).usualWeights).toEqual({});
    const s = run([...sess(T0, "a", [["db_curl", 12, 2, 10]]), usual(T0 + D, "db_curl", 30)]);
    expect(s.strength.db_curl!.oneRm).toBeCloseTo(14.666667, 5);
  });

  it("a censored set (RIR 5+) that beats the estimate still measures the exercise", () => {
    const s = run(sess(T0, "a", [["db_curl", 12, 5, 10]])); // estimate 8.925 kg gives 1 rep at 10 kg; 17 > 1
    expect(s.strength.db_curl!.obs).toBe(1);
    expect(s.strength.db_curl!.oneRm).toBeCloseTo(10 * (1 + 17 / 30), 9);
  });

  it("a weight the user does not own still teaches the estimate", () => {
    const s = run(sess(T0, "a", [["db_curl", 10, 2, 11]])); // owns 5–15 in 2.5 steps, logs 11 kg
    expect(s.strength.db_curl!.oneRm).toBeCloseTo(11 * (1 + 12 / 30), 9);
  });

  it("acute fatigue is learned only between sets at the same weight", () => {
    const same = run(sess(T0, "a", [["db_curl", 12, 2, 10], ["db_curl", 9, 2, 10]]));
    expect(same.predictionLog[1]!.type).toBe("acute");
    const diff = run(sess(T0, "a", [["db_curl", 12, 2, 10], ["db_curl", 20, 2, 7.5]]));
    expect(diff.predictionLog[1]!.type).toBe("log_only");
  });

  it("one outlier set moves an established 1RM by at most emaAlpha × maxStep", () => {
    const s = run([...sess(T0, "a", [["db_curl", 12, 2, 10]]), ...sess(T0 + 3 * D, "b", [["db_curl", 40, 2, 10]])]);
    expect(s.strength.db_curl!.oneRm).toBeCloseTo(14.666667 * (1 + 0.3 * 0.5), 5);
  });

  it("level observations from weighted sets need body mass", () => {
    expect(run(sess(T0, "a", [["db_curl", 12, 2, 10]])).levelObs.db_curl).toHaveLength(1);
    expect(run(sess(T0, "a", [["db_curl", 12, 2, 10]]), { bodyMassKg: undefined }).levelObs.db_curl).toBeUndefined();
  });
});

const amrapSet = (ts: number, sid: string, exerciseId: string, reps: number, rir: number, weightKg: number) =>
  ev(ts, { type: "set_logged", payload: { sessionId: sid, exerciseId, reps, rir, isWarmup: false, isAmrap: true, weightKg } });
const open = (ts: number, id: string) => ev(ts, { type: "session_started", payload: { sessionId: id } });

describe("same-weight rules in calibration", () => {
  it("an AMRAP set teaches the RIR bias only against an earlier set at its own weight", () => {
    const same = run([open(T0, "a"), wset(T0, "a", "db_curl", 12, 2, 10), amrapSet(T0, "a", "db_curl", 8, 0, 10)]);
    expect(same.predictionLog[1]!.type).toBe("amrap");
    expect(same.b.obs).toBe(1);
    const stepped = run([open(T0, "a"), wset(T0, "a", "db_curl", 12, 2, 10), amrapSet(T0, "a", "db_curl", 20, 0, 7.5)]);
    expect(stepped.predictionLog[1]!.type).toBe("log_only");
    expect(stepped.b.obs).toBe(0);
    expect(stepped.lastAmrapTs).toBe(T0); // still counts as the AMRAP of the interval
  });

  it("weights that differ only by unit conversion count as the same weight", () => {
    const LB = 0.45359237;
    const s = run([open(T0, "a"), wset(T0, "a", "db_curl", 12, 2, 42.5 * LB), wset(T0, "a", "db_curl", 9, 2, 19.278)]);
    expect(s.predictionLog[1]!.type).toBe("acute");
    const a = run([open(T0, "a"), wset(T0, "a", "db_curl", 12, 2, 42.5 * LB), amrapSet(T0, "a", "db_curl", 8, 0, 19.278)]);
    expect(a.predictionLog[1]!.type).toBe("amrap");
  });
});

describe("weighted exercise bookkeeping", () => {
  it("usual_weight re-initialises a logged but still unmeasured 1RM", () => {
    // 5 reps at RIR 5 with 5 kg is below what the estimate predicts (23 reps): censored, so nothing is measured.
    const logged = wset(T0, "a", "db_curl", 5, 5, 5);
    const before = run([open(T0, "a"), logged]);
    expect(before.strength.db_curl).toMatchObject({ obs: 0, lastWeightKg: 5 });
    expect(before.strength.db_curl!.oneRm).toBeCloseTo(70 * 0.15 * 0.85, 9);
    const after = run([open(T0, "a"), logged, usual(T0 + H, "db_curl", 10)]);
    expect(after.strength.db_curl!.oneRm).toBeCloseTo(14, 9);
    expect(after.strength.db_curl).toMatchObject({ obs: 0, lastWeightKg: 5 });
  });

  it("a stale 1RM is decayed by staleFactor once, on the first set back, not on every set of the session", () => {
    const back = T0 + 40 * D; // staleDays = 28
    const measured = sess(T0, "a", [["db_curl", 12, 2, 10]]);
    const one = run([...measured, open(back, "b"), wset(back, "b", "db_curl", 12, 2, 10)]);
    const two = run([...measured, open(back, "b"), wset(back, "b", "db_curl", 12, 2, 10), wset(back, "b", "db_curl", 9, 2, 10)]);
    const R = 10 * (1 + 14 / 30);
    const baked = R * p.capacity.staleFactor;
    expect(one.predictionLog[1]!.M_pred).toBeCloseTo(30 * (baked / 10 - 1), 2); // predicted from the decayed value
    expect(one.strength.db_curl!.oneRm).toBeCloseTo(baked + p.capacity.emaAlpha * (R - baked), 6); // then smoothed toward the new observation
    expect(two.predictionLog[2]!.type).toBe("acute");
    expect(two.strength.db_curl!.oneRm).toBeCloseTo(one.strength.db_curl!.oneRm, 12); // the second set does not decay it again
  });
});
