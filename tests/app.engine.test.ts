// The app's use of the new engine output: chosen muscles, swaps, muscle words, calories, and dumbbells picked for one workout.
import { describe, expect, it } from "vitest";
import { leastTrainedLine, makePlan, planRows, planTitle } from "../shared/model";
import { DEFAULT_SETTINGS, caloriesWith, engineState, fresh, withProfile, type Saved } from "../shared/store";
import { fromPlan, setDone, start, toEvents, type Run } from "../shared/workout";

const MON = new Date(2026, 9, 5, 18).getTime();
const user = (equipment: Saved["settings"]["equipment"] = []): Saved => {
  const s = fresh(MON);
  return withProfile({ ...s, onboarded: true, programStart: MON, settings: { ...DEFAULT_SETTINGS, equipment } }, MON);
};

describe("app and engine", () => {
  it("picking dumbbells for one workout plans dumbbell exercises, even when settings have none", () => {
    const s = engineState(user([]));
    const plan = makePlan(s, MON, { minutes: 30, intensity: "normal", equipment: ["dumbbell"] });
    expect(plan.exercises.some((x) => s.catalog.byId[x.exerciseId]!.weighted)).toBe(true);
    expect(makePlan(s, MON, { minutes: 30, intensity: "normal", equipment: [] }).exercises.some((x) => s.catalog.byId[x.exerciseId]!.weighted)).toBe(false);
  });

  it("titles a chosen-muscle day by its muscles and rows carry muscles, reasons and calories", () => {
    const s = engineState(user(["dumbbell"]));
    const plan = makePlan(s, MON, { minutes: 30, intensity: "normal", equipment: ["dumbbell"], focus: ["biceps", "triceps"] });
    expect(planTitle(plan)).toBe("Arms");
    for (const r of planRows(s, plan)) {
      expect(r.muscles).toMatch(/^Works /);
      expect(r.why.length).toBeGreaterThan(0);
      expect(r.kcal).toBeGreaterThanOrEqual(0);
    }
  });

  it("a swap removes the exercise and the plan refills", () => {
    const s = engineState(user(["dumbbell"]));
    const c = { minutes: 30, intensity: "normal" as const, equipment: ["dumbbell" as const] };
    const first = makePlan(s, MON, c).exercises[0]!.exerciseId;
    const plan = makePlan(s, MON, { ...c, skip: [first] });
    expect(plan.exercises.map((x) => x.exerciseId)).not.toContain(first);
    expect(plan.exercises.length).toBeGreaterThan(1);
  });

  it("the done screen's calories match what is saved", () => {
    const saved = user(["dumbbell"]);
    const s = engineState(saved);
    let r: Run = start(fromPlan(s, makePlan(s, MON, { minutes: 20, intensity: "normal", equipment: ["dumbbell"] })), MON);
    for (let i = 0, t = MON; i < 4 && r.phase !== "done"; i++) { t += 60_000; r = setDone(r, t); if (r.phase === "rest") r = { ...r, phase: "work" }; }
    const evs = toEvents(r, "x", MON + 600_000);
    const kc = caloriesWith(saved, evs)!;
    expect(kc.kcal).toBeGreaterThan(0);
    expect(kc.low).toBeLessThanOrEqual(kc.kcal);
    expect(kc.high).toBeGreaterThanOrEqual(kc.kcal);
  });

  it("names the least trained muscles", () => {
    expect(leastTrainedLine(engineState(user()), MON)).toMatch(/^Least trained lately: /);
  });
});
