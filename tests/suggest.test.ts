import { describe, expect, it } from "vitest";
import {
  REGIONS, estimateCalories, exerciseEffects, leastUsedMuscles, muscleSummary, muscleUsage, planCalories, planEffects, planSession, readiness, replay,
  sessionCalories, suggestExercises, type EngineEvent,
} from "../src/engine";
import { catalog, ev, H, params, profile, session, T0 } from "./helpers";

const p = params();
const D = 24 * H;
const DB = { equipment: ["dumbbell", "bench"] as ("dumbbell" | "bench")[], bodyMassKg: 75, dumbbells: { kind: "fixed" as const, kg: [5, 7.5, 10, 12.5, 15, 20] } };
const run = (over: Parameters<typeof profile>[1] = {}, evs: EngineEvent[] = []) => replay([profile(T0 - 10 * D, over), ...evs] as EngineEvent[], catalog, p);
const weighted = (id: string) => catalog.byId[id]!.weighted;
const wset = (ts: number, sid: string, id: string, reps: number, kg: number, rir = 2) =>
  ev(ts, { type: "set_logged", payload: { sessionId: sid, exerciseId: id, reps, rir, weightKg: kg, isWarmup: false, isAmrap: false } });

describe("planSession with chosen muscles (focus)", () => {
  it("builds the day around the chosen muscles", () => {
    const plan = planSession(run(DB), { now: T0, focus: ["biceps", "calves"] });
    expect(plan.kind).toBe("workout");
    expect(plan.template).toBe("focus");
    expect(plan.focus).toEqual(["biceps", "calves"]);
    for (const x of plan.exercises) {
      const c = catalog.byId[x.exerciseId]!.contributions;
      expect((c.biceps ?? 0) === 1 || (c.calves ?? 0) === 1).toBe(true);
    }
    const targeted = new Set(plan.exercises.flatMap((x) => REGIONS.filter((m) => catalog.byId[x.exerciseId]!.contributions[m] === 1)));
    expect(targeted.has("biceps") && targeted.has("calves")).toBe(true);
    expect(plan.reasons[0]).toMatch(/muscles you chose: biceps, calves/);
  });

  it("uses dumbbells for the chosen muscles when they are owned", () => {
    const plan = planSession(run(DB), { now: T0, focus: ["biceps"] });
    expect(plan.exercises.some((x) => weighted(x.exerciseId))).toBe(true);
  });

  it("never repeats a movement family when two chosen muscles share it", () => {
    const plan = planSession(run(), { now: T0, focus: ["chest", "triceps"], minutes: 60 });
    const ladders = plan.exercises.map((x) => catalog.byId[x.exerciseId]!.ladderId);
    expect(new Set(ladders).size).toBe(ladders.length);
  });

  it("trains a chosen muscle even when this week's target is met", () => {
    const evs = [0, 1, 2].flatMap((d) => session(T0 - (3 + d) * D, `c${d}`, [["db_curl", 10, 1], ["db_curl", 9, 1], ["db_curl", 8, 1], ["db_curl", 8, 1]]));
    const s = run(DB, evs.map((e) => (e.type === "set_logged" ? { ...e, payload: { ...e.payload, weightKg: 10 } } : e)) as EngineEvent[]);
    expect(planSession(s, { now: T0 }).exercises.some((x) => catalog.byId[x.exerciseId]!.contributions.biceps === 1)).toBe(false);
    const plan = planSession(s, { now: T0, focus: ["biceps"] });
    expect(plan.kind).toBe("workout");
    expect(plan.exercises.some((x) => catalog.byId[x.exerciseId]!.contributions.biceps === 1)).toBe(true);
  });

  it("skips a sore chosen muscle with a reason, and rests if it was the only one", () => {
    const s = run({}, [ev(T0 - H, { type: "checkin", payload: { feel: "normal", soreRegions: ["quads"] } })]);
    const only = planSession(s, { now: T0, focus: ["quads"] });
    expect(only.kind).toBe("rest");
    expect(only.reasons[0]).toMatch(/Quads: you said they're sore/);
    const two = planSession(s, { now: T0, focus: ["quads", "chest"] });
    expect(two.kind).toBe("workout");
    expect(two.exercises.every((x) => !catalog.byId[x.exerciseId]!.contributions.quads || catalog.byId[x.exerciseId]!.contributions.quads! < 1)).toBe(true);
  });

  it("an excluded muscle cannot be chosen; an empty focus is the usual plan", () => {
    const s = run({ excludeRegions: ["lower_back"] });
    expect(planSession(s, { now: T0, focus: [] })).toEqual(planSession(s, { now: T0 }));
    expect(planSession(s, { now: T0, focus: ["lower_back"] }).focus).toBeNull();
  });
});

describe("planSession swaps (excludeExercises)", () => {
  it("leaves the swapped exercise out and fills its place", () => {
    const s = run(DB);
    const plan = planSession(s, { now: T0 });
    const first = plan.exercises[0]!.exerciseId;
    const swapped = planSession(s, { now: T0, excludeExercises: [first] });
    expect(swapped.exercises.map((x) => x.exerciseId)).not.toContain(first);
    expect(swapped.exercises.length).toBeGreaterThan(0);
  });
});

describe("suggestExercises", () => {
  it("suggests for chosen muscles with sets, muscle effects and calories", () => {
    const s = run(DB);
    const r = suggestExercises(s, { now: T0, muscles: ["side_rear_delt"] });
    expect(r.basis).toBe("chosen");
    expect(r.suggestions.length).toBeGreaterThan(1);
    for (const x of r.suggestions) {
      expect(x.targets).toContain("side_rear_delt");
      expect(x.sets.length).toBe(p.planner.sets.base);
      expect(x.effects.find((e) => e.region === "side_rear_delt")!.role).toBe("target");
      expect(x.kcal).toBeGreaterThan(0);
      expect(x.reasons[0]).toMatch(/which you chose/);
    }
    // One per movement family.
    const ladders = r.suggestions.map((x) => catalog.byId[x.exerciseId]!.ladderId);
    expect(new Set(ladders).size).toBe(ladders.length);
  });

  it("dumbbell suggestions carry an owned weight and reps in range", () => {
    const s = run(DB);
    const r = suggestExercises(s, { now: T0, muscles: ["biceps"] });
    const db = r.suggestions.filter((x) => weighted(x.exerciseId));
    expect(db.length).toBeGreaterThan(0);
    for (const x of db) for (const set of x.sets) {
      expect(DB.dumbbells.kg).toContain(set.weightKg);
      expect(set.reps).toBeGreaterThan(0);
    }
  });

  it("without dumbbells it never suggests a weighted exercise", () => {
    const r = suggestExercises(run({ equipment: ["dumbbell"] }), { now: T0, muscles: ["chest", "quads"] });
    expect(r.suggestions.some((x) => weighted(x.exerciseId))).toBe(false);
  });

  it("with no muscles chosen, suggests for the least-used ones", () => {
    // Legs and push trained this week: arms and back are behind.
    const evs = [
      ...session(T0 - 2 * D, "a", [["squat_bodyweight", 20, 2], ["squat_bodyweight", 18, 2], ["squat_bodyweight", 16, 2], ["push_up_standard", 12, 2], ["push_up_standard", 10, 2], ["push_up_standard", 9, 2]]),
    ];
    const s = run({}, evs);
    const least = leastUsedMuscles(s, T0, 3);
    expect(least).not.toContain("quads");
    expect(least).not.toContain("chest");
    const r = suggestExercises(s, { now: T0 });
    expect(r.basis).toBe("least_used");
    expect(r.muscles).toEqual(least);
    expect(r.suggestions.every((x) => x.targets.some((m) => least.includes(m)))).toBe(true);
  });

  it("explains a chosen muscle that is still recovering", () => {
    const s = run({}, [ev(T0 - H, { type: "checkin", payload: { feel: "normal", soreRegions: ["chest"] } })]);
    const r = suggestExercises(s, { now: T0, muscles: ["chest"] });
    expect(r.suggestions).toHaveLength(0);
    expect(r.unavailable[0]!.reason).toMatch(/Chest is still recovering/);
  });

  it("respects exclude", () => {
    const s = run(DB);
    const a = suggestExercises(s, { now: T0, muscles: ["chest"], limit: 1 }).suggestions[0]!.exerciseId;
    expect(suggestExercises(s, { now: T0, muscles: ["chest"], exclude: [a] }).suggestions.map((x) => x.exerciseId)).not.toContain(a);
  });
});

describe("muscle effects", () => {
  it("summarises the muscles an exercise works", () => {
    expect(muscleSummary(run(), "db_rdl")).toBe("Works glutes and hamstrings hard; lower back moderately. Also uses forearms and traps.");
  });

  it("a dumbbell exercise adds fatigue and recovery time to its muscles", () => {
    const s = run(DB);
    const fx = exerciseEffects(s, "goblet_squat", [{ reps: 10, targetRir: 1 }, { reps: 10, targetRir: 1 }, { reps: 9, targetRir: 1 }], T0);
    const quads = fx.regions.find((e) => e.region === "quads")!;
    expect(quads.role).toBe("target");
    expect(quads.loadAfter).toBeGreaterThan(quads.loadBefore);
    expect(quads.readyInH).toBeGreaterThan(0);
    expect(quads.hardSets).toBeGreaterThan(2);
    const glutes = fx.regions.find((e) => e.region === "glutes")!;
    expect(glutes.hardSets).toBeLessThan(quads.hardSets);
  });

  it("matches what logging the same dumbbell sets does to recovery", () => {
    const s = run(DB);
    const sets: [number, number][] = [[10, 2], [9, 2], [8, 2]];
    const fx = exerciseEffects(s, "db_bench_press", sets.map(([reps, rir]) => ({ reps, rir })), T0);
    const after = run(DB, [
      ev(T0, { type: "session_started", payload: { sessionId: "x" } }),
      ...sets.map(([reps, rir]) => wset(T0, "x", "db_bench_press", reps, 12.5, rir)),
    ]);
    const r = readiness(after, T0);
    const chest = fx.regions.find((e) => e.region === "chest")!;
    expect(chest.loadAfter).toBeCloseTo(r.chest.load, 6);
    expect(chest.readyInH).toBeCloseTo(r.chest.hoursToReady, 1);
  });

  it("plan effects cover every muscle the plan targets", () => {
    const s = run(DB);
    const plan = planSession(s, { now: T0 });
    const fx = planEffects(s, plan, T0);
    for (const x of plan.exercises) for (const m of REGIONS) {
      if (catalog.byId[x.exerciseId]!.contributions[m] === 1) expect(fx.find((e) => e.region === m)?.role).toBe("target");
    }
  });
});

describe("muscle usage", () => {
  it("ranks untouched muscles first and counts dumbbell work", () => {
    const s = run(DB, [
      ev(T0 - D, { type: "session_started", payload: { sessionId: "d" } }),
      ...[0, 1, 2].map(() => wset(T0 - D, "d", "db_curl", 10, 10)),
      ev(T0 - D, { type: "session_ended", payload: { sessionId: "d" } }),
    ]);
    const u = muscleUsage(s, T0);
    const biceps = u.find((x) => x.region === "biceps")!;
    expect(biceps.done).toBeGreaterThan(2);
    expect(biceps.daysSince).toBe(1);
    expect(u.at(-1)!.region).toBe("biceps");
    expect(leastUsedMuscles(s, T0, 3)).not.toContain("biceps");
  });
});

describe("calorie estimates", () => {
  it("estimates a planned workout and each suggestion", () => {
    const s = run(DB);
    const plan = planSession(s, { now: T0 });
    const c = planCalories(s, plan)!;
    expect(c.activeKcal).toBeGreaterThan(10);
    expect(c.byExercise.length).toBe(plan.exercises.length);
    expect(c.low).toBeLessThan(c.activeKcal);
    expect(planCalories(run(), plan)).toBeNull(); // no body mass
  });

  it("done-but-unlogged sets with times give the same answer as the logged session", () => {
    const sets: [string, number, number, number][] = [["db_bench_press", 10, 2, 0], ["db_bench_press", 9, 1, 120_000], ["goblet_squat", 12, 2, 300_000]];
    const logged = run(DB, [
      ev(T0, { type: "session_started", payload: { sessionId: "k" } }),
      ...sets.map(([id, reps, rir, dt]) => wset(T0 + dt, "k", id, reps, 10, rir)),
      ev(T0 + 400_000, { type: "session_ended", payload: { sessionId: "k" } }),
    ]);
    const a = sessionCalories(logged, logged.sessions[0]!)!;
    const b = estimateCalories(run(DB), sets.map(([exerciseId, reps, rir, dt]) => ({ exerciseId, reps, rir, ts: T0 + dt })))!;
    expect(b.activeKcal).toBeCloseTo(a.activeKcal, 9);
    expect(b.byExercise).toEqual(a.byExercise);
  });
});

describe("plan length", () => {
  it("a new user's long session says why it is shorter than the time given", () => {
    const s = run({ experience: undefined });
    const long = planSession(s, { now: T0, minutes: 90 });
    expect(long.short).toBe("learning");
    expect(long.reasons.at(-1)).toMatch(/of your 90 minutes: RepVyn is still learning/);
    expect(planSession(s, { now: T0, minutes: 20 }).short).toBeNull();
  });

  it("a day built around one muscle gives it more than one exercise when time allows", () => {
    const plan = planSession(run(DB), { now: T0, focus: ["quads", "glutes"], minutes: 45 });
    expect(plan.exercises.length).toBeGreaterThanOrEqual(3);
  });
});
