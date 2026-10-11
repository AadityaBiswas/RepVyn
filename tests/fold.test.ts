import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fatigueOf, replay } from "../src/engine";
import { catalog, ev, H, params, profile, session, set, T0 } from "./helpers";

const p = params();
const D = 24 * H;

describe("fold", () => {
  it("ignores warm-up sets entirely", () => {
    const s = replay([
      profile(),
      ev(T0, { type: "session_started", payload: { sessionId: "s1" } }),
      set(T0, "s1", "push_up_standard", 10, 3, { isWarmup: true }),
    ], catalog, p);
    expect(fatigueOf(s.regions.chest)).toBe(0);
    expect(s.G).toBe(0);
    expect(s.exposures).toEqual({});
  });

  it("holds use repsEq; unilateral counts as one set", () => {
    const hold = replay([profile(), ev(T0, { type: "session_started", payload: { sessionId: "s1" } }), set(T0, "s1", "plank", 30, 2, { hold: true })], catalog, p);
    const reps = replay([profile(), ...session(T0, "s1", [["dead_bug", 10, 2]])], catalog, p);
    expect(fatigueOf(hold.regions.abs)).toBeCloseTo(fatigueOf(reps.regions.abs), 9);

    const uni = replay([profile(), ...session(T0, "s1", [["split_squat", 10, 2]])], catalog, p);
    const bi = replay([profile(), ...session(T0, "s1", [["squat_bodyweight", 10, 2]])], catalog, p);
    expect(fatigueOf(uni.regions.quads)).toBeCloseTo(fatigueOf(bi.regions.quads), 9);
  });

  it("novelty: k counts distinct prior sessions in the window; constant within a session", () => {
    const sets: [string, number, number][] = [["push_up_standard", 10, 2]];
    const s = replay([profile(), ...session(T0, "a", sets), ...session(T0 + 2 * D, "b", [...sets, ...sets])], catalog, p);
    const f = s.sessions[1]!.addedFatigue.chest;
    expect(f).toBeCloseTo(2 * (1 + 0.6 * Math.exp(-1 / 2)), 9); // k = 1 for both sets
    expect(s.exposures.push_up_standard).toHaveLength(2);

    const old = replay([profile(), ...session(T0, "a", sets), ...session(T0 + 57 * D, "b", sets)], catalog, p);
    expect(old.sessions[1]!.addedFatigue.chest).toBeCloseTo(1.6, 9); // outside 56-day window
  });

  it("a set for an unknown session starts it; a new start ends the open session", () => {
    const s = replay([
      profile(),
      set(T0, "s1", "push_up_standard", 10, 2),
      ev(T0 + H, { type: "session_started", payload: { sessionId: "s2" } }),
    ], catalog, p);
    expect(s.sessions.map((x) => [x.id, x.start, x.end])).toEqual([["s1", T0, T0 + H], ["s2", T0 + H, null]]);
    expect(s.sessions[0]!.stimulus.chest).toBeGreaterThan(0);
    expect(s.openSessionId).toBe("s2");
  });

  it("unknown exercises are ignored", () => {
    const s = replay([profile(), ...session(T0, "s1", [["no_such_exercise", 10, 2]])], catalog, p);
    expect(s.G).toBe(0);
  });

  it("decay is piecewise across events", () => {
    const sets: [string, number, number][] = [["push_up_standard", 10, 2]];
    const s = replay([profile(), ...session(T0, "a", sets), ...session(T0 + 10 * H, "b", sets)], catalog, p);
    expect(s.t).toBe(T0 + 10 * H);
    const first = 1.6 * (0.4 * 0.5 ** (10 / 4) + 0.6 * 0.5 ** (10 / 22));
    expect(fatigueOf(s.regions.chest)).toBeCloseTo(first + s.sessions[1]!.addedFatigue.chest, 9);
  });

  it("property: replay is deterministic and independent of input order", () => {
    const base = [
      profile(),
      ...session(T0, "a", [["push_up_standard", 12, 2], ["squat_bodyweight", 20, 1], ["plank", 40, 2]]),
      ...session(T0 + D, "b", [["pike_push_up", 8, 1], ["glute_bridge", 25, 3]]),
      ...session(T0 + 3 * D, "c", [["push_up_standard", 11, 1], ["reverse_lunge", 12, 2]]),
    ].map((e, i) => ({ ...e, seq: i }));
    const expected = replay(base, catalog, p);
    fc.assert(
      fc.property(fc.shuffledSubarray(base, { minLength: base.length, maxLength: base.length }), (shuffled) => {
        expect(replay(shuffled, catalog, p)).toEqual(expected);
      }),
    );
  });
});
