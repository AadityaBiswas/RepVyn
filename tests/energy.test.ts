import { describe, expect, it } from "vitest";
import { replay, restingKcalPerMin, sessionCalories, type EngineEvent } from "../src/engine";
import { catalog, ev, H, params, profile, set, T0 } from "./helpers";

const p = params();
const MIN = 60_000;
const body = { bodyMassKg: 70 };
/** A session with sets logged at the given minutes after T0: [exerciseId, reps or seconds, rir, warmup?]. */
function workout(sets: [string, number, number, boolean?][], at: number[], over = {}): ReturnType<typeof sessionCalories> {
  const events: EngineEvent[] = [
    profile(T0 - H, over),
    ev(T0, { type: "session_started", payload: { sessionId: "a" } }),
    ...sets.map(([e, n, rir, w], i) => set(T0 + at[i]! * MIN, "a", e, n, rir, { hold: catalog.byId[e]!.isHold, isWarmup: !!w })),
    ev(T0 + (at.at(-1)! + 1) * MIN, { type: "session_ended", payload: { sessionId: "a" } }),
  ];
  const s = replay(events, catalog, p);
  return sessionCalories(s, s.sessions[0]!);
}

describe("calories (2024 Compendium, ACSM kcal formula)", () => {
  it("matches a hand calculation", () => {
    // 2 × 12 push-ups at 2 reps left, 2 min apart, 70 kg:
    // kcal/MET-min = 3.5 × 70 / 200 = 1.225; set = 36 s = 0.6 min at 6.5 MET → 5.5 × 1.225 × 0.6 = 4.0425 each.
    // rest before set 2 = 2 − 0.6 = 1.4 min at 1.3 MET → 0.3 × 1.225 × 1.4 = 0.5145. Recovery = 10% of sets.
    const c = workout([["push_up_standard", 12, 2], ["push_up_standard", 12, 2]], [2, 4], body)!;
    const sets = 2 * 5.5 * 1.225 * 0.6;
    expect(c.activeKcal).toBeCloseTo(sets * 1.1 + 0.3 * 1.225 * 1.4, 9);
    expect(c.minutes).toBeCloseTo(1.2 + 1.4, 9);
    expect(c.totalKcal).toBeCloseTo(c.activeKcal + 1.225 * c.minutes, 9); // standard 1 MET resting burn without height/age
    expect([c.low, c.high]).toEqual([c.activeKcal * 0.7, c.activeKcal * 1.3]);
  });

  it("Mifflin–St Jeor resting burn when height and age are known", () => {
    expect(restingKcalPerMin({ bodyMassKg: 70, heightCm: 175, ageYears: 30, sex: "male" }).kcal).toBeCloseTo((700 + 1093.75 - 150 + 5) / 1440, 12);
    expect(restingKcalPerMin({ bodyMassKg: 60, heightCm: 165, ageYears: 30, sex: "female" }).kcal).toBeCloseTo((600 + 1031.25 - 150 - 161) / 1440, 12);
    const c = workout([["push_up_standard", 12, 2]], [2], { bodyMassKg: 70, heightCm: 175, ageYears: 30, sex: "male" })!;
    expect(c.restingMethod).toBe("mifflin_st_jeor");
    expect(c.high / c.activeKcal).toBeCloseTo(1.25, 12);
  });

  it("no weight, no calories", () => {
    expect(workout([["push_up_standard", 12, 2]], [2])).toBeNull();
  });

  it("harder sets, heavier people and more reps burn more", () => {
    const at = [2, 4, 6];
    const k = (rir: number, kg = 70, reps = 12) => workout([["squat_bodyweight", reps, rir], ["squat_bodyweight", reps, rir], ["squat_bodyweight", reps, rir]], at, { bodyMassKg: kg })!.activeKcal;
    expect(k(0)).toBeGreaterThan(k(2));
    expect(k(2)).toBeGreaterThan(k(5));
    expect(k(2, 90)).toBeGreaterThan(k(2, 70));
    expect(k(2, 70, 20)).toBeGreaterThan(k(2, 70, 12));
  });

  it("holds use their seconds; one-side-at-a-time exercises count both sides", () => {
    const plank = workout([["plank", 60, 2]], [2], body)!;
    expect(plank.activeMinutes).toBeCloseTo(1, 12);
    const split = workout([["split_squat", 10, 2]], [2], body)!;
    expect(split.activeMinutes).toBeCloseTo((2 * 10 * 3) / 60, 12);
  });

  it("rest is capped (a phone left open is not exercise); identical timestamps get a default rest", () => {
    const idle = workout([["push_up_standard", 12, 2], ["push_up_standard", 12, 2]], [2, 60], body)!;
    expect(idle.minutes).toBeCloseTo(1.2 + p.energy.maxRestMin, 9);
    const same = workout([["push_up_standard", 12, 2], ["push_up_standard", 12, 2]], [2, 2], body)!;
    expect(same.minutes).toBeCloseTo(1.2 + p.energy.defaultRestMin, 9);
  });

  it("warm-ups count toward calories (but not toward fatigue)", () => {
    const withWarmup = workout([["push_up_standard", 8, 5, true], ["push_up_standard", 12, 2]], [2, 4], body)!;
    const without = workout([["push_up_standard", 12, 2]], [4], body)!;
    expect(withWarmup.activeKcal).toBeGreaterThan(without.activeKcal);
  });

  it("a typical session lands inside the Compendium's whole-session range", () => {
    // 15 hard sets of 12 over ~40 min: gross kcal/min must sit between light calisthenics (2.8) and vigorous (7.5).
    const ex = ["push_up_standard", "squat_bodyweight", "pull_up", "glute_bridge", "split_squat"];
    const sets = ex.flatMap((e) => [0, 1, 2].map(() => [e, 12, 2] as [string, number, number]));
    const c = workout(sets, sets.map((_, i) => 2 + i * 2.7), body)!;
    const perMetMin = (3.5 * 70) / 200;
    const grossMet = c.totalKcal / c.minutes / perMetMin;
    expect(grossMet).toBeGreaterThan(2.8);
    expect(grossMet).toBeLessThan(7.5);
    expect(c.byExercise.reduce((a, x) => a + x.kcal, 0)).toBeCloseTo(c.activeKcal, 9);
  });
});
