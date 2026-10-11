import { describe, expect, it } from "vitest";
import { aboutYou, EventSchema, goodSets, insights, planSession, predictionAccuracy, replay, strengthTrend, type EngineEvent } from "../src/engine";
import rawCatalog from "../catalog/library";
import rawPrograms from "../catalog/programs.json";
import { loadCatalog } from "../src/engine";
import { catalog, ev, H, params, profile, session, T0 } from "./helpers";

const withPrograms = loadCatalog(rawCatalog, rawPrograms);

const p = params();
const D = 24 * H;
const run = (events: EngineEvent[], over = {}) => replay([profile(T0 - D, over), ...events], catalog, p);
const feedback = (ts: number, exerciseId: string, f: { liked?: boolean; pain?: boolean }) => ev(ts, { type: "exercise_feedback", payload: { exerciseId, ...f } });
// Full-body routine, every other day.
const FULL: [string, number, number][] = [["squat_bodyweight", 20, 2], ["push_up_standard", 15, 2], ["glute_bridge", 20, 2], ["prone_y_t_raise", 12, 2]];
const weighted = (ts: number, sid: string, reps: number, rir: number, weightKg: number) =>
  ev(ts, { type: "set_logged", payload: { sessionId: sid, exerciseId: "db_curl", reps, rir, isWarmup: false, isAmrap: false, weightKg } });
const weeks = (n: number, sets = FULL) => Array.from({ length: n * 3 }, (_, i) => session(T0 + i * 2 * D, `s${i}`, sets)).flat();

describe("good sets in you today", () => {
  it("predicts falling reps per set and stops where the engine would stop you", () => {
    const s = run(weeks(2));
    const g = goodSets(s, "push_up_standard", T0 + 14 * D);
    expect(g.reps.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < g.reps.length; i++) expect(g.reps[i]!).toBeLessThanOrEqual(g.reps[i - 1]!);
    expect(g.reps.at(-1)!).toBeGreaterThanOrEqual((1 - p.autoreg.dropFraction) * g.reps[0]!);
  });

  it("holds are in seconds", () => {
    expect(goodSets(run([]), "plank", T0).seconds).toBe(true);
  });

  it("a weighted exercise with no dumbbells in the profile has no good sets, and does not throw", () => {
    const s = run([weighted(T0, "a", 12, 2, 10)]); // logged db_curl, then no dumbbells owned
    expect(s.profile!.dumbbells).toBeUndefined();
    expect(goodSets(s, "db_curl", T0 + D)).toMatchObject({ reps: [], seconds: false });
  });
});

describe("exercise feedback", () => {
  it("is a valid event", () => {
    expect(() => EventSchema.parse({ ...feedback(T0, "split_squat", { pain: true }) })).not.toThrow();
  });

  it("an exercise that hurt is left out for painAvoidDays, then allowed again", () => {
    const base = weeks(1, [["split_squat", 12, 2], ["push_up_standard", 15, 2]]);
    const hurt = [...base, feedback(T0 + 4 * D + H, "split_squat", { pain: true })];
    const used = (now: number) => planSession(run(hurt, { equipment: ["chair"] }), { now }).exercises.map((e) => e.exerciseId);
    expect(used(T0 + 6 * D)).not.toContain("split_squat");
    // With a legs program the plan trains legs, so it says what it left out and when it comes back.
    const legs = (events: EngineEvent[], now: number) => planSession(replay([profile(T0 - D, { equipment: ["chair"], programId: "legs_glutes" }), ...events], withPrograms, p), { now });
    const plan = legs(hurt, T0 + 6 * D);
    expect(plan.template).not.toBe("upper");
    // The note appears on a day whose template has a squat slot; a glutes and hamstrings day never had the exercise on its menu.
    expect(plan.exercises.map((e) => e.exerciseId)).not.toContain("split_squat");
    if (plan.template !== "glutes_hams") expect(plan.reasons).toContain("Split squat left out: you said it hurt (back on the menu in 13 days)");
    expect(legs(hurt, T0 + 4 * D + H + 14 * D).reasons.join(" ")).not.toMatch(/left out/);
    // pain: false clears it early
    expect(legs([...hurt, feedback(T0 + 5 * D, "split_squat", { pain: false })], T0 + 6 * D).reasons.join(" ")).not.toMatch(/left out/);
  });

  it("a disliked exercise loses to an alternative, but is still used when it is the only option", () => {
    const now = T0 + 2 * D;
    const pull = (equipment: string[], f: EngineEvent[]) =>
      planSession(run(f, { equipment }), { now }).exercises.map((e) => e.exerciseId).find((id) => catalog.byId[id]!.pattern === "horizontal_pull");
    const withTable = ["resistance_band", "table"];
    const neutral = pull(withTable, []);
    expect(neutral).toBeDefined();
    const disliked = pull(withTable, [feedback(T0, neutral!, { liked: false })]);
    expect(disliked).toBeDefined();
    expect(disliked).not.toBe(neutral);
    // Only band rows possible: still planned.
    expect(pull(["resistance_band"], [feedback(T0, "band_row", { liked: false })])).toBe("band_row");
  });

  it("says what it did about the feedback", () => {
    const before = run([]);
    const after = run([feedback(T0, "split_squat", { pain: true }), feedback(T0, "band_row", { liked: true })]);
    const kinds = insights(before, after).map((x) => x.kind);
    expect(kinds).toEqual(expect.arrayContaining(["pain", "liked"]));
    expect(insights(after, after)).toEqual([]);
  });
});

describe("what the engine knows about you", () => {
  it("prediction accuracy is reported once there is enough data, and improves as it learns", () => {
    expect(predictionAccuracy(run(weeks(1))).recent).toBeNull();
    const a = predictionAccuracy(run(weeks(4)));
    expect(a.recent).not.toBeNull();
    expect(a.recent!).toBeGreaterThanOrEqual(a.start!);
  });

  it("strength trend lists clean measurements in time order", () => {
    const t = strengthTrend(run(weeks(2)), "push_up_standard");
    expect(t.length).toBeGreaterThan(1);
    for (let i = 1; i < t.length; i++) expect(t[i]!.ts).toBeGreaterThan(t[i - 1]!.ts);
  });

  it("strength trend for a weighted exercise reports the one-rep max, so a heavier weight is not a fall in reps", () => {
    const s = run([weighted(T0, "a", 12, 2, 10), weighted(T0 + 3 * D, "b", 4, 2, 15)], { equipment: ["dumbbell"], dumbbells: { kind: "fixed", kg: [10, 15] } });
    const t = strengthTrend(s, "db_curl");
    expect(t.map((x) => x.max)).toEqual([10 * (1 + 14 / 30), 15 * (1 + 6 / 30)]); // reps to failure fell 14 -> 6; the 1RM rose
  });

  it("about-you lists only traits with data, each with a confidence", () => {
    const fresh = aboutYou(run([]));
    expect(fresh.map((x) => x.label)).toEqual(["Level"]);
    expect(fresh[0]!.confidence).toBe("calibrating");
    const s = run([...weeks(3), feedback(T0 + 20 * D, "band_row", { liked: true })]);
    const labels = aboutYou(s).map((x) => x.label);
    expect(labels).toContain("Favourites");
    for (const t of aboutYou(s)) expect(t.text.length).toBeGreaterThan(10);
  });
});
