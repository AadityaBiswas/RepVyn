import { describe, expect, it } from "vitest";
import { planSession, replay, withinDifficulty, type EngineEvent } from "../src/engine";
import { planReport } from "../src/cli/report";
import rawCatalog from "../catalog/library";
import { loadCatalog } from "../src/engine";
import { catalog, ev, H, params, profile, session, T0 } from "./helpers";

const D = 24 * H;
const pistol = catalog.byId.pistol_squat!;
const squat = catalog.byId.squat_bodyweight!;

describe("difficulty in planning", () => {
  it("drops too-hard candidates unless every candidate is too hard", () => {
    const s = replay([profile(T0 - D)] as EngineEvent[], catalog, params((p) => { p.difficulty.excludeAbove = 3.5; }));
    expect(withinDifficulty(s, [pistol, squat], T0)).toEqual([squat]); // pistol 4 >= 3.5, squat 1
    expect(withinDifficulty(s, [pistol], T0)).toEqual([pistol]);
  });

  it("every planned exercise carries its personal difficulty", () => {
    const plan = planSession(replay([profile(T0 - D)] as EngineEvent[], catalog, params()), { now: T0 });
    expect(plan.exercises.length).toBeGreaterThan(0);
    for (const x of plan.exercises) {
      expect(x.difficulty.score).toBeGreaterThanOrEqual(1);
      expect(x.difficulty.score).toBeLessThanOrEqual(5);
    }
  });

  it("says why an exercise is hard for this user, and the report shows weights and difficulty", () => {
    const hard = (id: string) => [1, 2].map((i) => ev(T0 - D + i, { type: "exercise_feedback", payload: { exerciseId: id, rating: "too_hard" } }));
    const s = replay([profile(T0 - D), ...hard("push_up_deficit")] as EngineEvent[], catalog, params());
    const plan = planSession(s, { now: T0 });
    const x = plan.exercises.find((e) => e.exerciseId === "push_up_deficit")!;
    expect(x.difficulty).toMatchObject({ source: "personal", label: "hard" });
    expect(x.reasons).toContain("Hard for you: mobility");
    for (const e of plan.exercises.filter((e) => e !== x)) expect(e.reasons.join(" ")).not.toMatch(/Hard for you/);
    expect(planReport(plan, s)).toContain(`difficulty for you: ${x.difficulty.score} (hard, personal)`);
  });

  it("a no-dumbbell profile plans exactly what it would if the catalog had no weighted exercises", () => {
    const unweighted = loadCatalog({ ...rawCatalog, exercises: rawCatalog.exercises.filter((e: { weighted?: boolean }) => !e.weighted) });
    expect(unweighted.exercises.length).toBeLessThan(catalog.exercises.length);
    const done = [0, 2, 4].flatMap((d) => session(T0 + d * D, `s${d}`, [["push_up_standard", 15, 2], ["squat_bodyweight", 20, 2]]));
    const profiles: Parameters<typeof profile>[1][] = [{}, { equipment: ["dumbbell", "bench", "chair"] }, { equipment: ["dumbbell"] }];
    for (const over of profiles) {
      for (const events of [[], done]) {
        const evs = [profile(T0 - D, over), ...events] as EngineEvent[];
        const a = planSession(replay(evs, catalog, params()), { now: T0 + 6 * D });
        const b = planSession(replay(evs, unweighted, params()), { now: T0 + 6 * D });
        expect(a).toEqual(b);
        for (const e of a.exercises) for (const st of e.sets) expect(st.weightKg).toBeUndefined();
      }
    }
  });
});
