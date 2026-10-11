import { describe, expect, it } from "vitest";
import raw from "../catalog/library";
import { EQUIPMENT, PATTERNS, TEMPLATES, loadCatalog, ladderExercises, ladderNeighbour, stepRatio } from "../src/engine";
import { findExercises, groupByEquipment, loadLibrary } from "../src/library";

const ex = (o: Record<string, unknown>) => ({
  id: "x", name: "X", pattern: "squat", ladderId: "L", level: 1, equipment: [],
  contributions: { quads: 1 }, difficulty: { beginner: 3, intermediate: 2, advanced: 1 },
  unilateral: false, lengthened: false, isHold: false, rationale: "r", ...o,
});
const mini = (exercises: unknown[], ladders: unknown[] = [{ id: "L" }]) => ({ ladders, exercises });

describe("exercise library", () => {
  const lib = loadLibrary(raw);
  const cat = loadCatalog(raw);

  it("validates; the planner catalog holds every library exercise", () => {
    expect(lib.exercises.length).toBeGreaterThanOrEqual(120);
    expect(cat.exercises.map((e) => e.id)).toEqual(lib.exercises.map((e) => e.id));
    expect(cat.library.exercises.length).toBe(lib.exercises.length);
    for (const e of lib.exercises) expect(e.weighted, e.id).toBe(e.equipment.includes("dumbbell"));
  });

  it("covers every pattern; the planner covers every template slot", () => {
    for (const p of PATTERNS) expect(lib.exercises.some((e) => e.pattern === p), p).toBe(true);
    for (const p of TEMPLATES.flatMap((t) => t.slots)) expect(cat.exercises.some((e) => e.pattern === p), p).toBe(true);
  });

  it("uses only known equipment; every plannable exercise has defaultM", () => {
    for (const e of lib.exercises) for (const t of e.equipment) expect(EQUIPMENT).toContain(t);
    for (const e of cat.exercises) if (!e.weighted) expect(e.defaultM, e.id).toBeDefined();
  });

  it("every weighted exercise has a load norm and a dumbbell count; demands are tagged", () => {
    for (const e of lib.exercises) {
      expect(e.loadNorm !== undefined, e.id).toBe(e.weighted);
      expect(e.dumbbells !== undefined, e.id).toBe(e.weighted);
    }
    expect(lib.byId.pistol_squat!.demands).toEqual(["balance", "mobility", "coordination"]);
    expect(lib.byId.db_curl!.loadNorm).toEqual({ beginner: 0.08, intermediate: 0.15, advanced: 0.23 });
  });

  it("derives muscle tags from contributions plus alsoUses", () => {
    const e = lib.byId.db_rdl!;
    expect(e.targets).toEqual(["glutes", "hamstrings"]);
    expect(e.secondary).toEqual(["lower_back"]);
    expect(e.muscles).toEqual(["glutes", "hamstrings", "lower_back", "forearms", "traps"]);
  });

  it("findExercises filters by equipment, target, muscle, pattern, weight and difficulty", () => {
    const ids = (q: Parameters<typeof findExercises>[1]) => findExercises(lib, q).map((e) => e.id);
    expect(findExercises(lib, { equipment: [] }).every((e) => e.equipment.length === 0)).toBe(true);
    expect(ids({ equipment: ["dumbbell", "bench"], targets: ["chest"], weighted: true })).toEqual(["db_bench_press", "db_floor_press", "db_fly", "db_incline_press"]);
    expect(ids({ uses: ["obliques"], pattern: "core", equipment: [] })).toContain("bicycle_crunch");
    expect(ids({ experience: "beginner", maxDifficulty: 2, pattern: "vertical_pull" })).not.toContain("pull_up");
    expect(ids({ experience: "advanced", maxDifficulty: 2, pattern: "vertical_pull" })).toContain("pull_up");
  });

  it("groups by the exact equipment needed", () => {
    const g = groupByEquipment(lib);
    expect(Object.keys(g)).toContain("bodyweight");
    expect(g["bench + dumbbell"]!.map((e) => e.id)).toContain("db_bench_press");
    expect(Object.values(g).flat().length).toBe(lib.exercises.length);
  });

  it("push_up ladder has the spec order", () => {
    expect(ladderExercises(cat, "push_up").map((e) => e.id)).toEqual([
      "push_up_wall", "push_up_high_incline", "push_up_knee", "push_up_low_incline", "push_up_standard",
      "push_up_decline", "push_up_deficit", "push_up_archer", "push_up_pseudo_planche",
    ]);
  });

  it("ladder helpers", () => {
    expect(ladderNeighbour(cat, "push_up_standard", 1)?.id).toBe("push_up_decline");
    expect(ladderNeighbour(cat, "push_up_standard", -1)?.id).toBe("push_up_low_incline");
    expect(ladderNeighbour(cat, "push_up_wall", -1)).toBeUndefined();
    expect(ladderNeighbour(cat, "push_up_pseudo_planche", 1)).toBeUndefined();
    expect(stepRatio(cat, "push_up")).toBe(0.75);
    expect(stepRatio(cat, "pike")).toBe(0.6);
    expect(stepRatio(cat, "crunch")).toBe(0.6); // stand-alone exercise = its own one-rung ladder
  });
});

describe("library tag rules", () => {
  const lib = (exercises: unknown[], ladders: unknown[] = [{ id: "L" }]) => () => loadLibrary(mini(exercises, ladders));
  it("validates demands, loadNorm and dumbbells", () => {
    const w = { equipment: ["dumbbell"], weighted: true, dumbbells: 2, loadNorm: { beginner: 0.1, intermediate: 0.2, advanced: 0.3 } };
    expect(lib([ex({ ...w })])).not.toThrow();
    expect(lib([ex({ demands: ["balance", "balance"] })])).toThrow(/duplicate demand/);
    expect(lib([ex({ demands: ["strength"] })])).toThrow();
    expect(lib([ex({ ...w, loadNorm: undefined })])).toThrow(/loadNorm is required exactly/);
    expect(lib([ex({ ...w, dumbbells: undefined })])).toThrow(/dumbbells is required exactly/);
    expect(lib([ex({ loadNorm: w.loadNorm })])).toThrow(/loadNorm is required exactly/);
    expect(lib([ex({ ...w, loadNorm: { beginner: 0.2, intermediate: 0.2, advanced: 0.3 } })])).toThrow(/loadNorm must ascend/);
  });
  it("rejects difficulty that rises with experience", () => {
    expect(lib([ex({ difficulty: { beginner: 2, intermediate: 3, advanced: 1 } })])).toThrow(/must not rise with experience/);
  });
  it("rejects a rung rated easier than the one below it", () => {
    expect(lib([ex({ id: "a" }), ex({ id: "b", level: 2, difficulty: { beginner: 2, intermediate: 2, advanced: 1 } })])).toThrow(/easier for beginner/);
  });
  it("rejects a muscle listed in both contributions and alsoUses, and unknown muscles", () => {
    expect(lib([ex({ alsoUses: ["quads"] })])).toThrow(/both contributions and alsoUses/);
    expect(lib([ex({ alsoUses: ["neck"] })])).toThrow();
  });
  it("dumbbell exercises are weighted, have no defaultM, and keep off unweighted ladders", () => {
    expect(lib([ex({ equipment: ["dumbbell"] })])).toThrow(/weighted must be true/);
    expect(lib([ex({ weighted: true })])).toThrow(/weighted must be true/);
    expect(lib([ex({ equipment: ["dumbbell"], weighted: true, defaultM: { beginner: 1, intermediate: 1, advanced: 1 } })])).toThrow(/no defaultM/);
    expect(lib([ex({ id: "a" }), ex({ id: "b", level: 2, equipment: ["dumbbell"], weighted: true })])).toThrow(/mixes weighted/);
  });
  it("a stand-alone exercise gets its own ladder; ladderId and level go together", () => {
    const { ladderId, level, ...free } = ex({ id: "solo" });
    void ladderId; void level;
    const l = loadLibrary(mini([free], []));
    expect(l.byId.solo).toMatchObject({ ladderId: "solo", level: 1 });
    expect(lib([{ ...free, level: 2 }], [])).toThrow(/go together/);
  });
});

describe("catalog validation", () => {
  it("rejects a contribution outside {1, 0.5, 0.25}", () => {
    expect(() => loadCatalog(mini([ex({ contributions: { quads: 1, glutes: 0.3 } })]))).toThrow();
  });
  it("rejects an unknown region", () => {
    expect(() => loadCatalog(mini([ex({ contributions: { quads: 1, neck: 0.5 } })]))).toThrow();
  });
  it("rejects zero or three regions at 1", () => {
    expect(() => loadCatalog(mini([ex({ contributions: { quads: 0.5 } })]))).toThrow(/1 or 2 regions/);
    expect(() => loadCatalog(mini([ex({ contributions: { quads: 1, glutes: 1, calves: 1 } })]))).toThrow(/1 or 2 regions/);
  });
  it("accepts two regions at 1", () => {
    expect(() => loadCatalog(mini([ex({ contributions: { quads: 1, glutes: 1 } })]))).not.toThrow();
  });
  it("rejects duplicate or non-contiguous levels", () => {
    expect(() => loadCatalog(mini([ex({ id: "a" }), ex({ id: "b" })]))).toThrow(/contiguous/);
    expect(() => loadCatalog(mini([ex({ id: "a" }), ex({ id: "b", level: 3 })]))).toThrow(/contiguous/);
  });
  it("rejects missing rationale, unknown ladder, unknown equipment, duplicate id", () => {
    const { rationale: _, ...noRationale } = ex({});
    expect(() => loadCatalog(mini([noRationale]))).toThrow();
    expect(() => loadCatalog(mini([ex({ ladderId: "nope" })]))).toThrow(/unknown ladder/);
    expect(() => loadCatalog(mini([ex({ equipment: ["kettlebell"] })]))).toThrow();
    expect(() => loadCatalog(mini([ex({ id: "a" }), ex({ id: "a", level: 2 })]))).toThrow(/duplicate exercise/);
  });
  it("rejects a ladder with no exercises", () => {
    expect(() => loadCatalog(mini([ex({})], [{ id: "L" }, { id: "empty" }]))).toThrow(/no exercises/);
  });

  it("derives defaultM from the nearest neighbour via stepRatio", () => {
    const cat = loadCatalog(mini([
      ex({ id: "a", level: 1, defaultM: { beginner: 10, intermediate: 20, advanced: 30 } }),
      ex({ id: "b", level: 2 }),
      ex({ id: "c", level: 3 }),
    ], [{ id: "L", stepRatio: 0.5 }]));
    expect(cat.byId.b!.defaultM).toEqual({ beginner: 5, intermediate: 10, advanced: 15 });
    expect(cat.byId.c!.defaultM).toEqual({ beginner: 2.5, intermediate: 5, advanced: 7.5 });
  });
  it("derives upward and prefers the lower level on distance ties", () => {
    const tie = loadCatalog(mini([
      ex({ id: "a", level: 1, defaultM: { beginner: 10, intermediate: 10, advanced: 10 } }),
      ex({ id: "b", level: 2 }),
      ex({ id: "c", level: 3, defaultM: { beginner: 4, intermediate: 4, advanced: 4 } }),
    ]));
    expect(tie.byId.b!.defaultM!.beginner).toBeCloseTo(6); // from a: 10 * 0.6
    const up = loadCatalog(mini([ex({ id: "a", level: 1 }), ex({ id: "b", level: 2, defaultM: { beginner: 6, intermediate: 6, advanced: 6 } })]));
    expect(up.byId.a!.defaultM!.beginner).toBeCloseTo(10); // 6 / 0.6
  });
  it("leaves defaultM undefined when no ladder neighbour has one", () => {
    expect(loadCatalog(mini([ex({})])).byId.x!.defaultM).toBeUndefined();
  });
});
