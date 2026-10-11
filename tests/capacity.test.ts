import { describe, expect, it } from "vitest";
import {
  capacityOf, effectiveFatigue, initialM, loadCatalog, observedMax, predictSet, prescribe, replay, shouldStopExercise,
  type EngineEvent, type EngineState,
} from "../src/engine";
import { catalog, ev, H, params, profile, session, set, T0 } from "./helpers";

const p = params();
const D = 24 * H;
const withM = (s: EngineState, id: string, M: number, lastPerformed: number | null = T0) => {
  s.capacity[id] = { M, obs: 1, lastPerformed };
  return s;
};
const fresh = (events: EngineEvent[] = [], over = {}) => replay([profile(T0, over), ...events], catalog, p);

describe("capacity init", () => {
  it("uses defaultM for the profile's experience", () => {
    expect(capacityOf(fresh([], { experience: "beginner" }), "push_up_standard", T0).M).toBe(8);
    expect(capacityOf(fresh([], { experience: "advanced" }), "push_up_standard", T0).M).toBe(35);
  });

  it("falls back to a known ladder neighbour, then to fallbackM", () => {
    const mini = loadCatalog({
      ladders: [{ id: "L", stepRatio: 0.5 }],
      exercises: [1, 2, 3].map((level) => ({
        id: `e${level}`, name: `E${level}`, pattern: "squat", ladderId: "L", level, equipment: [],
        contributions: { quads: 1 }, difficulty: { beginner: 3, intermediate: 2, advanced: 1 }, unilateral: false, lengthened: false, isHold: false, rationale: "r",
      })),
    });
    const s = replay([profile()], mini, p);
    expect(initialM(s, mini.byId.e2!)).toBe(10);
    s.capacity.e1 = { M: 16, obs: 3, lastPerformed: T0 };
    expect(initialM(s, mini.byId.e2!)).toBe(8);
    expect(initialM(s, mini.byId.e3!)).toBe(4);
  });

  it("first use is technical failure; after a set it is not", () => {
    expect(capacityOf(fresh(), "push_up_standard", T0).firstSetMode).toBe("technical_failure");
    const s = fresh(session(T0, "a", [["push_up_standard", 15, 2]]));
    expect(s.capacity.push_up_standard).toEqual({ M: 17, obs: 1, lastPerformed: T0 }); // measured: 15 @ RIR2
    expect(capacityOf(s, "push_up_standard", T0 + D).firstSetMode).toBeNull();
  });
});

describe("stale capacity", () => {
  it("after staleDays: M × staleFactor and technical failure", () => {
    const s = withM(fresh(), "push_up_standard", 20, T0);
    expect(capacityOf(s, "push_up_standard", T0 + 28 * D)).toEqual({ M: 20, firstSetMode: null });
    expect(capacityOf(s, "push_up_standard", T0 + 29 * D)).toEqual({ M: 20 * 0.93, firstSetMode: "technical_failure" });
  });

  it("the fold bakes the stale factor in once, on the first set back", () => {
    const s = fresh([...session(T0, "a", [["push_up_standard", 15, 2]]), ...session(T0 + 40 * D, "b", [["push_up_standard", 12, 2], ["push_up_standard", 10, 2]])]);
    const before = 17; // after session a: the first measurement replaces the guess
    const firstBack = s.predictionLog.filter((x) => x.ts === T0 + 40 * D)[0]!;
    expect(firstBack.M_pred).toBeCloseTo(before * 0.93, 6); // fresh after 40 days: M_pred = baked M
    expect(firstBack.type).toBe("capacity");
    expect(s.capacity.push_up_standard!.M).toBeCloseTo(before * 0.93 + 0.3 * (14 - before * 0.93), 9);
    expect(s.capacity.push_up_standard!.lastPerformed).toBe(T0 + 40 * D);
  });
});

describe("prediction", () => {
  it("no fatigue: M_pred = M", () => {
    expect(predictSet(withM(fresh(), "push_up_standard", 15), "push_up_standard", T0)).toEqual({ M_pred: 15, F_prior_eff: 0, F_sess_eff: 0, scale_eff: 1 });
  });

  it("in-session fatigue goes to F_sess_eff, carried fatigue to F_prior_eff", () => {
    const s = fresh([ev(T0, { type: "session_started", payload: { sessionId: "s" } }), set(T0, "s", "push_up_standard", 10, 2)]);
    const f = effectiveFatigue(s, "push_up_standard", T0);
    expect(f.F_prior_eff).toBeCloseTo(0, 9);
    expect(f.F_sess_eff).toBeCloseTo(1.6 * (1 + 0.5 * 0.5 + 0.5 * 0.5) / 2, 9); // Σc·added / Σc
    const M_pred = predictSet(s, "push_up_standard", T0).M_pred;
    expect(M_pred).toBeCloseTo(s.capacity.push_up_standard!.M * 0.88 ** f.F_sess_eff, 9);
  });

  it("regions with c < 0.5 are ignored", () => {
    // pike push-up: front_delt 1, triceps 0.5, chest 0.25 -> chest fatigue must not count
    const s = fresh(session(T0, "a", [["dead_bug", 10, 2]]));
    s.regions.chest = { fast: 5, slow: 5 };
    expect(effectiveFatigue(s, "pike_push_up", T0 + H).F_prior_eff).toBe(0);
  });

  it("observedMax: rir + b added, AMRAP uses reps only", () => {
    expect(observedMax(10, 2, 0.5, false)).toBe(12.5);
    expect(observedMax(10, 2, 0.5, true)).toBe(10);
  });
});

describe("prescription", () => {
  it("repsTarget = round(M_pred - targetRir[experience])", () => {
    const pr = prescribe(withM(fresh(), "push_up_standard", 15), "push_up_standard", 1, T0);
    expect(pr).toEqual({ exerciseId: "push_up_standard", sets: [{ reps: 13, targetRir: 2, isAmrap: false }], firstSetMode: null, reasons: [], loadFlag: null });
    const beg = prescribe(withM(fresh([], { experience: "beginner" }), "push_up_standard", 15), "push_up_standard", 1, T0);
    expect(beg.sets[0]!.reps).toBe(12);
  });

  it("deload adds deloadRirAdd", () => {
    const s = withM(fresh(), "push_up_standard", 15);
    s.deload = { active: true, since: T0, endedAt: null };
    expect(prescribe(s, "push_up_standard", 1, T0).sets[0]).toEqual({ reps: 11, targetRir: 4, isAmrap: false });
  });

  it("moves up a level when repsTarget > repRange max", () => {
    const pr = prescribe(withM(fresh(), "push_up_standard", 30), "push_up_standard", 1, T0);
    expect(pr.exerciseId).toBe("push_up_decline");
    expect(pr.reasons).toEqual(["Moved up to Decline push-up: you're past 20 reps, so this makes it hard enough again"]);
    expect(pr.firstSetMode).toBe("technical_failure"); // never done decline yet
  });

  it("moves down a level when repsTarget < repRange min", () => {
    const pr = prescribe(withM(fresh(), "push_up_standard", 6), "push_up_standard", 1, T0);
    expect(pr.exerciseId).toBe("push_up_low_incline");
    expect(pr.reasons[0]).toMatch(/^Moved down to Low incline push-up/);
  });

  it("does not move to a neighbour needing missing equipment, or at the ends of a ladder", () => {
    const s = withM(fresh(), "table_row_straight_leg", 40); // next level needs a chair
    expect(prescribe(s, "table_row_straight_leg", 1, T0).exerciseId).toBe("table_row_straight_leg");
    expect(prescribe(withM(fresh(), "push_up_wall", 2), "push_up_wall", 1, T0).exerciseId).toBe("push_up_wall");
  });

  it("holds are prescribed in seconds", () => {
    const pr = prescribe(withM(fresh(), "plank", 20), "plank", 1, T0);
    expect(pr.sets[0]).toEqual({ seconds: 18 * 3, targetRir: 2, isAmrap: false });
  });

  it("multi-set: later sets project in-session fatigue, so reps never increase", () => {
    const pr = prescribe(withM(fresh(), "push_up_standard", 18), "push_up_standard", 4, T0);
    const reps = pr.sets.map((x) => x.reps!);
    expect(reps[0]).toBe(16);
    for (let i = 1; i < reps.length; i++) expect(reps[i]).toBeLessThanOrEqual(reps[i - 1]!);
    expect(reps[3]).toBeLessThan(reps[0]!);
  });

  it("unknown exercise throws", () => {
    expect(() => prescribe(fresh(), "nope", 1, T0)).toThrow(/unknown exercise/);
  });
});

describe("shouldStopExercise", () => {
  it("true when actual < (1 - dropFraction) × prescribed", () => {
    expect(shouldStopExercise(10, 7, p)).toBe(false);
    expect(shouldStopExercise(10, 6, p)).toBe(true);
  });
});
