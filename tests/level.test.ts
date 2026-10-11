import { describe, expect, it } from "vitest";
import rawCatalog from "../catalog/library";
import rawPrograms from "../catalog/programs.json";
import {
  byLevel, capacityOf, ladderLevel, level, loadCatalog, normAt, planSession, programOf, replay, scoreObservation, weeklyTarget,
  type EngineEvent,
} from "../src/engine";
import { catalog, H, params, profile, session, T0 } from "./helpers";

const p = params();
const D = 24 * H;
const withPrograms = loadCatalog(rawCatalog, rawPrograms);
const PUSH = { beginner: 8, intermediate: 20, advanced: 35 }; // push_up_standard norms

/** n sessions two days apart, each: [exerciseId, reps, rir] once (a clean max-effort-style set per exercise). */
const days = (n: number, sets: [string, number, number][]) =>
  Array.from({ length: n }, (_, i) => session(T0 + 2 * i * D, `d${i}`, sets)).flat();
const run = (events: EngineEvent[], over = {}, cat = catalog) => replay([profile(T0 - D, over), ...events], cat, p);

describe("scoring an observation against catalog norms", () => {
  it("maps the norms to 0 / 1 / 2 and clamps outside them", () => {
    expect(scoreObservation(PUSH, 8).score).toBe(0);
    expect(scoreObservation(PUSH, 20).score).toBe(1);
    expect(scoreObservation(PUSH, 35).score).toBe(2);
    expect(scoreObservation(PUSH, 3).score).toBe(0);
    expect(scoreObservation(PUSH, 60).score).toBe(2);
    expect(scoreObservation(PUSH, Math.sqrt(8 * 20)).score).toBeCloseTo(0.5, 9); // log scale
  });

  it("weights by how well the exercise separates levels; flat norms tell nothing", () => {
    expect(scoreObservation(PUSH, 20).weight).toBeCloseTo(Math.log(35 / 8), 9);
    expect(scoreObservation({ beginner: 20, intermediate: 20, advanced: 20 }, 30).weight).toBe(0);
  });

  it("byLevel and normAt interpolate and hit the table exactly at whole levels", () => {
    expect(byLevel({ beginner: 3, intermediate: 2, advanced: 1 }, 0.5)).toBe(2.5);
    expect(byLevel({ beginner: 3, intermediate: 2, advanced: 1 }, 9)).toBe(1);
    expect(normAt(PUSH, 1)).toBe(20);
    expect(normAt(PUSH, 1.5)).toBeCloseTo(Math.sqrt(20 * 35), 9);
  });
});

describe("level inference", () => {
  const ADV: [string, number, number][] = [["push_up_standard", 33, 2], ["squat_bodyweight", 38, 2], ["pull_up", 10, 2]];
  const BEG: [string, number, number][] = [["push_up_standard", 6, 2], ["squat_bodyweight", 13, 2], ["pull_up", 1, 0]];

  it("holds the prior (intermediate without a self-report) during calibration, then uses the estimate", () => {
    const during = run(days(3, ADV)); // 5 days, 9 clean observations: still calibrating
    expect(level(during).calibrated).toBe(false);
    expect(level(during).score).toBe(1);
    expect(level(during).estimate).toBeGreaterThan(1.5);
    const after = run(days(5, ADV)); // day 8
    expect(level(after).calibrated).toBe(true);
    expect(level(after).experience).toBe("advanced");
    expect(level(run(days(5, BEG))).experience).toBe("beginner");
  });

  it("a self-report is only the starting guess: a strong 'beginner' is re-rated by their reps", () => {
    const l = level(run(days(5, ADV), { experience: "beginner" }));
    expect(l.prior).toBe(0);
    expect(l.score).toBeGreaterThan(1.3);
  });

  it("is per movement family: strong push-ups, weak squats", () => {
    const s = run(days(5, [["push_up_standard", 33, 2], ["squat_bodyweight", 13, 2]]));
    expect(ladderLevel(s, "push_up")).toBeGreaterThan(ladderLevel(s, "squat") + 1);
    // An untried push-up variation starts from the push-up level, not the overall one.
    expect(capacityOf(s, "push_up_decline", T0 + 20 * D).M).toBeGreaterThan(normAt(catalog.byId.push_up_decline!.defaultM!, level(s).score));
  });

  it("changes as the user gets stronger (recent observations only)", () => {
    const early = run(days(5, BEG));
    const later = run([...days(5, BEG), ...Array.from({ length: 6 }, (_, i) => session(T0 + (12 + 2 * i) * D, `x${i}`, ADV)).flat()]);
    expect(level(later).score).toBeGreaterThan(level(early).score + 1);
  });
});

describe("programs", () => {
  it("loads programs and rejects templates that no exercise can fill", () => {
    expect(withPrograms.programs.map((x) => x.id)).toEqual(["balanced", "upper_body", "legs_glutes"]);
    const bad = { programs: [{ id: "x", name: "X", emphasis: {}, templates: [{ id: "t", slots: ["squat"] }] }] };
    const noSquat = { ladders: rawCatalog.ladders.filter((l) => l.id !== "squat"), exercises: rawCatalog.exercises.filter((e) => e.pattern !== "squat") } as unknown;
    expect(() => loadCatalog(noSquat, bad)).toThrow(/no exercise for pattern squat/);
  });

  it("emphasis scales weekly targets; unknown program ids are rejected at query time", () => {
    const s = run([], { programId: "legs_glutes" }, withPrograms);
    expect(programOf(s).id).toBe("legs_glutes");
    expect(weeklyTarget(s, "glutes")).toBeCloseTo(8 * 1.4, 9);
    expect(weeklyTarget(s, "chest")).toBeCloseTo(10 * 0.5, 9);
    expect(() => weeklyTarget(run([], { programId: "nope" }, withPrograms), "chest")).toThrow(/unknown program nope/);
  });

  it("the plan follows the program: leg program trains legs, upper program trains upper body", () => {
    const now = T0 + 2 * D;
    const legs = planSession(run([], { programId: "legs_glutes", equipment: ["chair"] }, withPrograms), { now });
    const upper = planSession(run([], { programId: "upper_body", equipment: ["pullup_bar", "resistance_band"] }, withPrograms), { now });
    expect(legs.program).toBe("legs_glutes");
    expect(["lower", "glutes_hams", "legs"]).toContain(legs.template);
    expect(["upper", "push", "pull"]).toContain(upper.template);
  });
});

describe("calibration week planning", () => {
  it("prefers movements not yet measured and says so", () => {
    const s = run(session(T0, "a", [["push_up_standard", 15, 2], ["squat_bodyweight", 20, 2]]));
    const plan = planSession(s, { now: T0 + 2 * D });
    expect(plan.calibrating).toBe(true);
    expect(plan.exercises.some((e) => e.reasons.includes("New to you: the first set measures your level"))).toBe(true);
  });
});
