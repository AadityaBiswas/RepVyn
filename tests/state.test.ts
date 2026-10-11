import { describe, expect, it } from "vitest";
import { readiness, readinessState, replay, systemic, typicalSessionLoad, weeklyNeed, weeklyTarget } from "../src/engine";
import { catalog, ev, H, params, profile, session, set, T0 } from "./helpers";

const p = params();
const D = 24 * H;
const FULL: [string, number, number][] = [
  ["squat_bodyweight", 15, 2], ["squat_bodyweight", 15, 2],
  ["push_up_standard", 12, 2], ["push_up_standard", 12, 2],
  ["glute_bridge", 20, 2], ["glute_bridge", 20, 2],
  ["prone_y_t_raise", 12, 2], ["prone_y_t_raise", 12, 2],
];

describe("readiness", () => {
  it("classifies by thresholds (ready < 1.5, fatigued > 3.5)", () => {
    expect(readinessState(1.49, p)).toBe("ready");
    expect(readinessState(1.5, p)).toBe("recovering");
    expect(readinessState(3.5, p)).toBe("recovering");
    expect(readinessState(3.51, p)).toBe("fatigued");
  });

  it("reports fatigue, state and hoursToReady for every region", () => {
    const s = replay([profile(), ...session(T0, "s1", [["push_up_standard", 12, 2], ["push_up_standard", 10, 2], ["push_up_standard", 8, 1]])], catalog, p);
    const r = readiness(s, T0);
    expect(r.chest.state).toBe("fatigued"); // 4.94 with novelty
    expect(r.chest.hoursToReady).toBeGreaterThan(0);
    expect(r.quads).toEqual({ fatigue: 0, tolerance: 5, load: 0, state: "ready", hoursToReady: 0 });
    expect(readiness(s, T0 + 3 * D).chest.state).toBe("ready");
  });
});

describe("weekly need", () => {
  it("targets scale by goal and experience", () => {
    const s = replay([profile(T0, { goal: "general_fitness", experience: "beginner" })], catalog, p);
    expect(weeklyTarget(s, "chest")).toBeCloseTo(10 * 0.7 * 0.7, 9);
  });

  it("only counts sessions that started within the last 7 days", () => {
    const sets: [string, number, number][] = [["push_up_standard", 10, 2]];
    const s = replay([profile(), ...session(T0, "a", sets)], catalog, p);
    const done = s.sessions[0]!.stimulus.chest;
    expect(weeklyNeed(s, T0 + 6 * D).chest.done).toBeCloseTo(done, 9);
    expect(weeklyNeed(s, T0 + 7 * D).chest.done).toBe(0);
    expect(weeklyNeed(s, T0 - 1).chest.done).toBe(0);
  });

  it("need is clamped at 0 when the target is exceeded", () => {
    const many: [string, number, number][] = Array.from({ length: 12 }, () => ["push_up_standard", 10, 0] as [string, number, number]);
    const s = replay([profile(T0, { goal: "general_fitness", experience: "beginner" }), ...session(T0, "a", many), ...session(T0 + D, "b", many)], catalog, p);
    expect(weeklyNeed(s, T0 + D).chest.need).toBe(0);
  });

  it("an open session counts, saturated at query time", () => {
    const s = replay([profile(), ev(T0, { type: "session_started", payload: { sessionId: "s1" } }), set(T0, "s1", "push_up_standard", 10, 2)], catalog, p);
    expect(weeklyNeed(s, T0).chest.done).toBeCloseTo(6 * (1 - Math.exp(-0.95 / 6)), 9);
  });
});

describe("systemic and rest rule", () => {
  it("typical session load: default below minSessionsForTypical, then median of completed sessions", () => {
    const one = replay([profile(), ...session(T0, "a", FULL)], catalog, p);
    expect(typicalSessionLoad(one, T0 + D)).toBe(12);
    const three = replay([profile(), ...session(T0, "a", FULL), ...session(T0 + D, "b", FULL), ...session(T0 + 2 * D, "c", FULL)], catalog, p);
    const totals = three.sessions.map((x) => x.fatigueTotal).sort((a, b) => a - b);
    expect(typicalSessionLoad(three, T0 + 3 * D)).toBeCloseTo(totals[1]!, 9);
  });

  it("1 session does not trigger rest the next day", () => {
    const s = replay([profile(), ...session(T0, "a", FULL)], catalog, p);
    const sys = systemic(s, T0 + D);
    expect(sys.restRecommended).toBe(false);
    expect(sys.reasons).toEqual([]);
    expect(sys.G).toBeCloseTo(s.G / 2, 9);
  });

  it("3 consecutive daily sessions trigger rest on day 4", () => {
    const s = replay([profile(), ...session(T0, "a", FULL), ...session(T0 + D, "b", FULL), ...session(T0 + 2 * D, "c", FULL)], catalog, p);
    const sys = systemic(s, T0 + 3 * D);
    expect(sys.restRecommended).toBe(true);
    expect(sys.reasons[0]).toMatch(/Systemic fatigue high/);
  });

  it("rest when no major region is ready", () => {
    const heavy: [string, number, number][] = Array.from({ length: 10 }, (_, i) =>
      [["squat_bodyweight", "push_up_standard", "glute_bridge", "prone_y_t_raise", "band_leg_curl"][i % 5]!, 15, 0] as [string, number, number]);
    const s = replay([profile(), ...session(T0, "a", [...heavy, ...heavy])], catalog, params((x) => (x.systemic.restRatio = 100)));
    const sys = systemic(s, T0 + 2 * H);
    expect(sys.reasons).toEqual(["No major muscle group ready"]);
    expect(sys.restRecommended).toBe(true);
  });
});
