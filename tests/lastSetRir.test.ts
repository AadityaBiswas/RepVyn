import { describe, expect, it } from "vitest";
import { planSession, replay, type EngineEvent } from "../src/engine";
import { catalog, ev, H, params, profile, set, T0 } from "./helpers";

const unrated = (ts: number, exerciseId: string, reps: number) =>
  ev(ts, { type: "set_logged", payload: { sessionId: "a", exerciseId, reps, isWarmup: false, isAmrap: false } });
const MIN = 60_000;

describe("reps left asked only after the last set of an exercise", () => {
  const events: EngineEvent[] = [profile(), unrated(T0, "push_up_standard", 12), unrated(T0 + 2 * MIN, "push_up_standard", 11), set(T0 + 4 * MIN, "a", "push_up_standard", 10, 2)];
  const s = replay(events, catalog, params());

  it("accepts sets without a rating and still counts their work", () => {
    expect(s.rejected).toEqual([]);
    expect(s.sessions[0]!.log).toHaveLength(3);
    const oneSet = replay([profile(), set(T0, "a", "push_up_standard", 10, 2)], catalog, params());
    expect(s.sessions[0]!.addedFatigue.chest).toBeGreaterThan(oneSet.sessions[0]!.addedFatigue.chest);
  });

  it("learns fresh capacity from the rated last set, undoing the fatigue of the sets before it", () => {
    const c = s.capacity.push_up_standard!;
    expect(c.obs).toBe(1);
    expect(c.M).toBeGreaterThan(12); // 10 reps + 2 left = 12 when tired, so more than 12 when fresh
    expect(c.M).toBeLessThan(20);
    expect(s.predictionLog.filter((x) => x.type === "capacity")).toHaveLength(1);
  });

  it("a set rated on every set behaves exactly as before", () => {
    const rated = replay([profile(), set(T0, "a", "push_up_standard", 12, 2)], catalog, params());
    expect(rated.capacity.push_up_standard!.M).toBe(14);
  });
});

describe("planner intensity", () => {
  const s = replay([profile(), set(T0, "a", "push_up_standard", 12, 2), set(T0, "a", "squat_bodyweight", 15, 2)], catalog, params());
  const rirs = (intensity?: "easy" | "normal" | "hard") =>
    planSession(s, { now: T0 + 72 * H, ...(intensity ? { intensity } : {}) }).exercises.map((e) => e.sets[0]!.targetRir);

  it("easy leaves more reps in the tank, hard fewer, normal is the default", () => {
    const normal = rirs();
    expect(rirs("normal")).toEqual(normal);
    expect(normal.length).toBeGreaterThan(0);
    expect(rirs("easy").every((r) => r === normal[0]! + 2)).toBe(true);
    expect(rirs("hard").every((r) => r === normal[0]! - 1)).toBe(true);
  });
});
