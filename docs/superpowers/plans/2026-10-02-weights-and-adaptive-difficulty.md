# Weights and Adaptive Difficulty Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the engine prescribe and learn dumbbell exercises (weight + reps), and give every exercise a per-user difficulty that starts from the library and adapts from the user's numbers and one-tap ratings.

**Architecture:** A new pure `strength.ts` holds the rep-weight curve and strength state; weighted exercises flow through the existing prediction, prescription and calibration code, which gain an optional weight. A new pure `difficulty.ts` derives difficulty on every read from replayed state (never stored). The planner admits weighted exercises only for users who own dumbbells and scores candidates by difficulty fit.

**Tech Stack:** TypeScript (strict), zod 4, vitest, fast-check, tsx. Spec: `docs/superpowers/specs/2026-10-02-weights-and-adaptive-difficulty-design.md`.

## Global Constraints

- `src/engine/**` and `src/library/**` stay pure: no `node:*` imports, no `Date.now()`, no `Math.random()`, no imports from `storage`/`sim`/`cli` (enforced by `tests/purity.test.ts`).
- Every numeric constant lives in `params/default.params.json`, validated by zod. No magic numbers in engine code except the Epley constant 30.
- The engine works in kg. Prescribed weights are always members of `ownedWeights(profile)`.
- Events stay `schemaVersion: 1`; every new field is optional, so old histories replay unchanged.
- Users with no `"dumbbell"` equipment never get a weighted exercise.
- Determinism: the same events, catalog and params give deep-equal state and plans.
- This project is **not a git repository**. Wherever a task says "Checkpoint", run `npx tsc --noEmit && npx vitest run` and expect zero type errors and all tests passing. (If the project is put under git, commit at each checkpoint.)
- Test commands run from the project root: `C:\Users\biswa\Documents\Apps\Excercise App`.

## File map

| File | Change | Responsibility |
|---|---|---|
| `src/library/schema.ts` | modify | `DEMANDS`, `demands`, `loadNorm`, `dumbbells` on records |
| `src/library/index.ts` | modify | validation of the new fields |
| `catalog/library/*.json` | modify | demand tags (all), load norms and dumbbell counts (weighted) |
| `src/engine/types.ts` | modify | dumbbell profile, `weightKg`, `rating`, `usual_weight`, params blocks, new state fields |
| `params/default.params.json` | modify | `strength` and `difficulty` blocks |
| `src/engine/strength.ts` | create | curve, owned weights, initial / current strength, `canLoad` |
| `src/engine/capacity.ts` | modify | weight-aware prediction, `chooseWeight`, weighted prescription |
| `src/engine/calibrate.ts` | modify | learning from weighted sets, gaps respect `canLoad` |
| `src/engine/level.ts` | modify | `recordLevelObservation(s, ladderId, norm, value)` |
| `src/engine/fold.ts` | modify | strength entries, `usual_weight`, ratings |
| `src/engine/catalog.ts` | modify | catalog keeps weighted exercises |
| `src/engine/difficulty.ts` | create | ratings, demand offsets, `difficultyOf`, `withinDifficulty` |
| `src/engine/planner.ts` | modify | dumbbell gating, difficulty filter and scoring, plan output |
| `src/engine/index.ts` | modify | export the two new modules |
| `src/cli/report.ts`, `src/cli/library.ts` | modify | show weights, difficulty, demands |
| `tests/*.test.ts` | create / modify | per task below |
| `SPEC.md`, `DECISIONS.md` | modify | record the design |

---

### Task 1: Library: demand tags, load norms, dumbbell counts

**Files:**
- Modify: `src/library/schema.ts`, `src/library/index.ts`
- Modify: `catalog/library/push.json`, `pull.json`, `legs.json`, `core.json`, `arms.json` (via a one-off script)
- Test: `tests/catalog.test.ts`

**Interfaces:**
- Produces: `DEMANDS`, `DemandSchema`, `type Demand`, `type LoadNorm` from `src/library`; `LibraryExercise.demands: Demand[]`, `.loadNorm?: LoadNorm`, `.dumbbells?: 1 | 2`.

- [ ] **Step 1: Write the failing test.** Append inside `describe("library tag rules", ...)` in `tests/catalog.test.ts`:

```ts
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
```

And inside `describe("exercise library", ...)`:

```ts
  it("every weighted exercise has a load norm and a dumbbell count; demands are tagged", () => {
    for (const e of lib.exercises) {
      expect(e.loadNorm !== undefined, e.id).toBe(e.weighted);
      expect(e.dumbbells !== undefined, e.id).toBe(e.weighted);
    }
    expect(lib.byId.pistol_squat!.demands).toEqual(["balance", "mobility", "coordination"]);
    expect(lib.byId.db_curl!.loadNorm).toEqual({ beginner: 0.08, intermediate: 0.15, advanced: 0.23 });
  });
```

- [ ] **Step 2: Run to verify it fails.** Run: `npx vitest run tests/catalog.test.ts`. Expected: FAIL (unknown keys `demands` / `loadNorm` / `dumbbells` are rejected by the strict schema).

- [ ] **Step 3: Add the schema fields.** In `src/library/schema.ts`, after the `EXPERIENCES` block add:

```ts
/** What makes an exercise hard beyond strength. Ratings teach a per-user offset per demand. */
export const DEMANDS = ["balance", "coordination", "mobility", "grip"] as const;
export const DemandSchema = z.enum(DEMANDS);
export type Demand = z.infer<typeof DemandSchema>;

/** Typical one-rep max of one dumbbell as a multiple of body mass, per experience. */
export const LoadNormSchema = z.strictObject({
  beginner: z.number().positive(),
  intermediate: z.number().positive(),
  advanced: z.number().positive(),
});
export type LoadNorm = z.infer<typeof LoadNormSchema>;
```

In `ExerciseRecordSchema`, add after `weighted`:

```ts
  /** Weighted only: dumbbells in use (1 = goblet-style, 2 = a pair). */
  dumbbells: z.union([z.literal(1), z.literal(2)]).optional(),
  /** Weighted only: typical one-dumbbell 1RM ÷ body mass. Starting estimate and level scoring. */
  loadNorm: LoadNormSchema.optional(),
```

and after `alsoUses`:

```ts
  /** What makes it hard beyond strength. */
  demands: z.array(DemandSchema).default([]),
```

- [ ] **Step 4: Add the validation.** In `src/library/index.ts`, inside the `file.exercises.map((e) => { ... })` callback, after the `difficulty must not rise` check add:

```ts
    if (new Set(e.demands).size !== e.demands.length) errors.push(`${e.id}: duplicate demand tag`);
    if ((e.loadNorm !== undefined) !== e.weighted) errors.push(`${e.id}: loadNorm is required exactly for weighted exercises`);
    if ((e.dumbbells !== undefined) !== e.weighted) errors.push(`${e.id}: dumbbells is required exactly for weighted exercises`);
    if (e.loadNorm && !(e.loadNorm.beginner < e.loadNorm.intermediate && e.loadNorm.intermediate < e.loadNorm.advanced)) {
      errors.push(`${e.id}: loadNorm must ascend from beginner to advanced`);
    }
```

- [ ] **Step 5: Tag the data.** Create `tmp-annotate.cjs` in the project root with exactly this content, run `node tmp-annotate.cjs`, expect output `annotated 129 exercises, 42 weighted`, then delete the file.

```js
// One-off: add demands (all exercises) and dumbbells + loadNorm (weighted) to catalog/library/*.json.
const fs = require('fs');
const DEMANDS = {
  push_up_archer: ['coordination'], push_up_pseudo_planche: ['mobility'], push_up_deficit: ['mobility'],
  pike_push_up: ['mobility'], pike_push_up_elevated: ['mobility'], wall_handstand_hold: ['balance', 'mobility'],
  wall_hspu_partial: ['balance', 'mobility'], wall_hspu: ['balance', 'mobility'], arnold_press: ['coordination'],
  table_row_feet_elevated: ['grip'], scapular_pull_up: ['grip'], pull_up_negative: ['grip'], pull_up_band_assisted: ['grip'],
  chin_up: ['grip'], pull_up: ['grip'], pull_up_archer: ['grip', 'coordination'], renegade_row: ['coordination', 'balance'],
  db_pullover: ['mobility'], db_shrug: ['grip'],
  split_squat: ['balance'], rfe_split_squat: ['balance', 'mobility'], shrimp_squat_assisted: ['balance', 'mobility'],
  pistol_squat_assisted: ['balance', 'mobility'], pistol_squat: ['balance', 'mobility', 'coordination'],
  reverse_lunge: ['balance'], walking_lunge: ['balance'], chair_step_up: ['balance'], forward_lunge: ['balance'],
  lateral_lunge: ['mobility'], curtsy_lunge: ['balance', 'coordination'], single_leg_rdl: ['balance'],
  hip_thrust_single_leg: ['balance'], calf_raise_single: ['balance'], goblet_squat: ['mobility'], db_sumo_squat: ['mobility'],
  db_rdl: ['mobility', 'grip'], db_single_leg_rdl: ['balance', 'grip'], db_deadlift: ['grip'],
  db_reverse_lunge: ['balance', 'grip'], db_walking_lunge: ['balance', 'grip'], db_split_squat: ['balance'],
  db_bulgarian_split_squat: ['balance', 'mobility'], db_step_up: ['balance', 'grip'], db_swing: ['coordination', 'grip'],
  db_calf_raise: ['grip'],
  dead_bug: ['coordination'], side_plank: ['balance'], hanging_knee_raise: ['grip'], v_up: ['coordination'],
  bird_dog: ['balance', 'coordination'], hanging_leg_raise: ['grip'], toes_to_bar: ['grip', 'coordination'],
  band_woodchop: ['coordination'], db_farmers_carry: ['grip'], db_thruster: ['coordination', 'mobility'],
  bench_dip: ['mobility'], chair_dip: ['mobility'], band_overhead_triceps_extension: ['mobility'],
  db_overhead_triceps_extension: ['mobility'],
};
// id: [beginner, intermediate, advanced] one-dumbbell 1RM ÷ body mass, dumbbells used
const LOAD = {
  db_bench_press: [0.18, 0.32, 0.5, 2], db_incline_press: [0.15, 0.28, 0.44, 2], db_floor_press: [0.17, 0.3, 0.46, 2],
  db_fly: [0.08, 0.15, 0.24, 2], db_shoulder_press: [0.12, 0.22, 0.34, 2], db_seated_shoulder_press: [0.13, 0.24, 0.36, 2],
  arnold_press: [0.1, 0.19, 0.3, 2], db_lateral_raise: [0.04, 0.08, 0.13, 2], db_front_raise: [0.05, 0.09, 0.14, 2],
  db_upright_row: [0.08, 0.15, 0.24, 2], db_bent_over_row: [0.16, 0.28, 0.44, 2], db_single_arm_row: [0.2, 0.36, 0.56, 1],
  db_chest_supported_row: [0.14, 0.25, 0.4, 2], renegade_row: [0.1, 0.18, 0.28, 2], db_pullover: [0.12, 0.22, 0.35, 1],
  db_reverse_fly: [0.04, 0.08, 0.13, 2], db_shrug: [0.25, 0.45, 0.7, 2], goblet_squat: [0.3, 0.5, 0.75, 1],
  db_sumo_squat: [0.3, 0.5, 0.75, 1], db_rdl: [0.2, 0.38, 0.6, 2], db_single_leg_rdl: [0.12, 0.24, 0.38, 2],
  db_deadlift: [0.25, 0.45, 0.7, 2], db_reverse_lunge: [0.12, 0.22, 0.36, 2], db_walking_lunge: [0.11, 0.2, 0.33, 2],
  db_split_squat: [0.13, 0.24, 0.38, 2], db_bulgarian_split_squat: [0.1, 0.2, 0.33, 2], db_step_up: [0.1, 0.2, 0.32, 2],
  db_hip_thrust: [0.4, 0.7, 1.1, 1], db_glute_bridge: [0.35, 0.6, 0.95, 1], db_swing: [0.25, 0.4, 0.6, 1],
  db_calf_raise: [0.2, 0.38, 0.6, 2], db_side_bend: [0.2, 0.32, 0.48, 1], db_russian_twist: [0.08, 0.15, 0.24, 1],
  db_farmers_carry: [0.3, 0.5, 0.75, 2], db_thruster: [0.1, 0.18, 0.28, 2], db_curl: [0.08, 0.15, 0.23, 2],
  db_hammer_curl: [0.09, 0.16, 0.25, 2], db_concentration_curl: [0.08, 0.14, 0.22, 1], db_incline_curl: [0.06, 0.12, 0.19, 2],
  db_overhead_triceps_extension: [0.12, 0.22, 0.34, 1], db_skull_crusher: [0.06, 0.11, 0.18, 2], db_kickback: [0.04, 0.08, 0.13, 1],
};
const seen = new Set();
let count = 0, weighted = 0;
for (const f of ['push', 'pull', 'legs', 'core', 'arms']) {
  const p = `catalog/library/${f}.json`;
  const { exercises } = JSON.parse(fs.readFileSync(p, 'utf8'));
  const out = exercises.map((e) => {
    seen.add(e.id);
    count++;
    if (e.weighted && !LOAD[e.id]) throw new Error('weighted exercise without a load norm: ' + e.id);
    const r = {};
    for (const [k, v] of Object.entries(e)) {
      r[k] = v;
      if (k === 'weighted' && LOAD[e.id]) {
        const [b, i, a, n] = LOAD[e.id];
        r.dumbbells = n;
        r.loadNorm = { beginner: b, intermediate: i, advanced: a };
        weighted++;
      }
      if (k === 'difficulty' && DEMANDS[e.id]) r.demands = DEMANDS[e.id];
    }
    return r;
  });
  fs.writeFileSync(p, `{\n  "exercises": [\n${out.map((x) => '    ' + JSON.stringify(x)).join(',\n')}\n  ]\n}\n`);
}
for (const id of [...Object.keys(DEMANDS), ...Object.keys(LOAD)]) if (!seen.has(id)) throw new Error('unknown id ' + id);
console.log(`annotated ${count} exercises, ${weighted} weighted`);
```

- [ ] **Step 6: Run to verify it passes.** Run: `npx vitest run tests/catalog.test.ts`. Expected: PASS.

- [ ] **Step 7: Checkpoint.** Run: `npx tsc --noEmit && npx vitest run`. Expected: no type errors; all tests pass.

---

### Task 2: Params and event schemas

**Files:**
- Modify: `src/engine/types.ts`, `params/default.params.json`
- Test: `tests/weights.schema.test.ts` (create)

**Interfaces:**
- Produces: `DumbbellsSchema`, `type Dumbbells`, `RatingSchema`, `type Rating` from `src/engine`; `Profile.dumbbells?`; `set_logged.payload.weightKg?: number`; `exercise_feedback.payload.rating?: Rating`; event `usual_weight` with payload `{ exerciseId: string; weightKg: number; reps: number }`; `Params.strength = { repRange: [number, number]; usualRir; initFactor; fallbackBodyMassKg; maxObsReps }`; `Params.difficulty = { ratingAlpha; demandAlpha; demandMax; trustK; neighbourTrust; excludeAbove; preferWeight }`.

- [ ] **Step 1: Write the failing test.** Create `tests/weights.schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EventSchema } from "../src/engine";
import { ev, params, profile, T0 } from "./helpers";

const ok = (e: unknown) => EventSchema.safeParse(e).success;

describe("weights and ratings: event schema", () => {
  it("accepts fixed and adjustable dumbbell sets", () => {
    expect(ok(profile(T0, { dumbbells: { kind: "fixed", kg: [5, 7.5, 10] } }))).toBe(true);
    expect(ok(profile(T0, { dumbbells: { kind: "adjustable", minKg: 2.5, maxKg: 24, stepKg: 2.5 } }))).toBe(true);
  });

  it("rejects invalid dumbbell sets", () => {
    expect(ok(profile(T0, { dumbbells: { kind: "fixed", kg: [] } }))).toBe(false);
    expect(ok(profile(T0, { dumbbells: { kind: "fixed", kg: [5, 5] } }))).toBe(false);
    expect(ok(profile(T0, { dumbbells: { kind: "fixed", kg: [0] } }))).toBe(false);
    expect(ok(profile(T0, { dumbbells: { kind: "fixed", kg: [250] } }))).toBe(false);
    expect(ok(profile(T0, { dumbbells: { kind: "adjustable", minKg: 10, maxKg: 5, stepKg: 1 } }))).toBe(false);
    expect(ok(profile(T0, { dumbbells: { kind: "adjustable", minKg: 1, maxKg: 200, stepKg: 1 } }))).toBe(false); // 200 weights
  });

  it("a set's weightKg must be in (0, 200]", () => {
    const set = (weightKg: number) =>
      ev(T0, { type: "set_logged", payload: { sessionId: "a", exerciseId: "db_curl", reps: 10, rir: 2, isWarmup: false, isAmrap: false, weightKg } });
    expect(ok(set(12.5))).toBe(true);
    expect(ok(set(0))).toBe(false);
    expect(ok(set(250))).toBe(false);
    expect(ok(set(Number.NaN))).toBe(false);
  });

  it("usual_weight defaults reps to 10; ratings take exactly three values", () => {
    const parsed = EventSchema.parse(ev(T0, { type: "usual_weight", payload: { exerciseId: "db_curl", weightKg: 10 } as any }));
    expect(parsed.type === "usual_weight" && parsed.payload.reps).toBe(10);
    expect(ok(ev(T0, { type: "usual_weight", payload: { exerciseId: "db_curl", weightKg: 10, reps: 0 } }))).toBe(false);
    const fb = (rating: string) => ok(ev(T0, { type: "exercise_feedback", payload: { exerciseId: "db_curl", rating } as any }));
    expect(fb("too_easy")).toBe(true);
    expect(fb("just_right")).toBe(true);
    expect(fb("too_hard")).toBe(true);
    expect(fb("impossible")).toBe(false);
  });
});

describe("weights and difficulty params", () => {
  it("validates the strength and difficulty blocks", () => {
    expect(() => params()).not.toThrow();
    expect(() => params((p) => { p.strength.repRange = [15, 6]; })).toThrow();
    expect(() => params((p) => { p.strength.repRange = [6, 40]; })).toThrow();
    expect(() => params((p) => { p.strength.initFactor = 1.5; })).toThrow();
    expect(() => params((p) => { p.difficulty.excludeAbove = 6; })).toThrow();
    expect(() => params((p) => { p.difficulty.preferWeight = 1; })).toThrow();
    expect(() => params((p) => { delete p.difficulty; })).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `npx vitest run tests/weights.schema.test.ts`. Expected: FAIL (type errors / unknown keys).

- [ ] **Step 3: Add the schemas.** In `src/engine/types.ts`, directly above `export const ProfileSchema`:

```ts
const Kg = z.number().gt(0).max(200);

/** The dumbbells a user owns: a list of fixed pairs, or an adjustable set's range. */
export const DumbbellsSchema = z.union([
  z.strictObject({ kind: z.literal("fixed"), kg: z.array(Kg).min(1).max(100) })
    .refine((d) => new Set(d.kg).size === d.kg.length, { message: "dumbbell weights must be distinct" }),
  z.strictObject({ kind: z.literal("adjustable"), minKg: Kg, maxKg: Kg, stepKg: Kg })
    .refine((d) => d.minKg <= d.maxKg, { message: "minKg must not exceed maxKg" })
    .refine((d) => Math.floor((d.maxKg - d.minKg) / d.stepKg + 1e-9) + 1 <= 100, { message: "at most 100 dumbbell weights" }),
]);
export type Dumbbells = z.infer<typeof DumbbellsSchema>;

export const RatingSchema = z.enum(["too_easy", "just_right", "too_hard"]);
export type Rating = z.infer<typeof RatingSchema>;
```

In `ProfileSchema`, after `equipment`:

```ts
  /** Dumbbells owned; required for weighted exercises to be planned. */
  dumbbells: DumbbellsSchema.optional(),
```

In the `set_logged` payload strictObject, after `isAmrap`:

```ts
        /** Weight of one dumbbell, kg. Weighted exercises only (ignored elsewhere). */
        weightKg: Kg.optional(),
```

Replace the `exercise_feedback` payload with:

```ts
    payload: z.strictObject({
      exerciseId: z.string().min(1),
      liked: z.boolean().optional(),
      pain: z.boolean().optional(),
      /** One-tap difficulty rating after the exercise. */
      rating: RatingSchema.optional(),
    }),
```

Add a new member to `EventSchema`'s union, after `exercise_feedback`:

```ts
  z.strictObject({
    ...eventBase,
    type: z.literal("usual_weight"),
    /** "What weight do you usually use for this?" Seeds the strength estimate until the exercise is first measured. */
    payload: z.strictObject({ exerciseId: z.string().min(1), weightKg: Kg, reps: z.number().int().min(1).max(50).default(10) }),
  }),
```

In `ParamsSchema`, after `planner`:

```ts
  strength: z.strictObject({
    repRange: z.tuple([pos, pos]).refine(([lo, hi]) => lo < hi && hi <= 30, { message: "strength.repRange must ascend and stay within 30 reps" }),
    /** Reps a user leaves in reserve at their "usual weight". */
    usualRir: z.number().min(0).max(5),
    /** Caution on the body-mass estimate. */
    initFactor: z.number().gt(0).max(1),
    fallbackBodyMassKg: z.number().min(25).max(350),
    /** Typo cap on a weighted set's observed max (reps). */
    maxObsReps: pos,
  }),
  difficulty: z.strictObject({
    ratingAlpha: z.number().gt(0).max(1),
    demandAlpha: z.number().gt(0).max(1),
    demandMax: pos,
    trustK: pos,
    neighbourTrust: z.number().min(0).max(1),
    excludeAbove: z.number().min(1).max(5),
    preferWeight: z.number().min(0).lt(1),
  }),
```

- [ ] **Step 4: Add the defaults.** In `params/default.params.json`, after the `"planner": { ... }` block (add a comma after its closing brace):

```json
  "strength": { "repRange": [6, 15], "usualRir": 2, "initFactor": 0.85, "fallbackBodyMassKg": 70, "maxObsReps": 50 },
  "difficulty": { "ratingAlpha": 0.5, "demandAlpha": 0.25, "demandMax": 1.5, "trustK": 2, "neighbourTrust": 0.3, "excludeAbove": 4.5, "preferWeight": 0.3 }
```

- [ ] **Step 5: Make the fold compile.** In `src/engine/fold.ts` `applyEvent`'s switch, add (real handling arrives in Task 5):

```ts
    case "usual_weight":
      break;
```

- [ ] **Step 6: Run to verify it passes.** Run: `npx vitest run tests/weights.schema.test.ts`. Expected: PASS.

- [ ] **Step 7: Checkpoint.** Run: `npx tsc --noEmit && npx vitest run`. Expected: all pass.

---

### Task 3: Strength core (`strength.ts`) and new state fields

**Files:**
- Create: `src/engine/strength.ts`
- Modify: `src/engine/types.ts` (state), `src/engine/fold.ts` (`initialState`), `src/engine/index.ts`
- Test: `tests/strength.test.ts` (create)

**Interfaces:**
- Consumes: `Params.strength`, `Profile.dumbbells`, `Exercise.loadNorm` (Tasks 1–2); `byLevel`, `ladderLevel` (`level.ts`); `MS_PER_HOUR` (`recovery.ts`).
- Produces:
  - `EPLEY = 30`
  - `repsAt(oneRm: number, w: number): number`
  - `oneRmFrom(w: number, M: number): number`
  - `ownedWeights(profile: Profile | null): number[]` (sorted ascending)
  - `initialOneRm(s: EngineState, ex: Exercise): number`
  - `strengthOf(s: EngineState, ex: Exercise, now: number): { oneRm: number; firstSetMode: FirstSetMode }`
  - `referenceWeight(s: EngineState, ex: Exercise, now: number): number`
  - `canLoad(s: EngineState, ex: Exercise): boolean`
  - `interface StrengthEntry { oneRm: number; obs: number; lastPerformed: number | null; lastWeightKg: number | null }`
  - `EngineState.strength: Record<string, StrengthEntry>`, `.usualWeights: Record<string, { weightKg: number; reps: number }>`, `.ratings: Record<string, number>`, `.demandOffsets: Record<Demand, number>`

- [ ] **Step 1: Write the failing test.** Create `tests/strength.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canLoad, initialOneRm, oneRmFrom, ownedWeights, referenceWeight, repsAt, replay, strengthOf, type EngineEvent } from "../src/engine";
import { catalog, H, params, profile, T0 } from "./helpers";

const p = params();
const D = 24 * H;
const db = catalog.byId.db_curl!;
const run = (events: EngineEvent[], over: Parameters<typeof profile>[1] = {}) =>
  replay([profile(T0 - D, { equipment: ["dumbbell", "bench"], bodyMassKg: 70, dumbbells: { kind: "fixed", kg: [5, 7.5, 10, 12.5, 15] }, ...over }), ...events], catalog, p);

describe("rep-weight curve (Epley)", () => {
  it("repsAt and oneRmFrom are inverses above 1 rep, and reps fall as weight rises", () => {
    for (const [R, w] of [[20, 10], [14, 7.5], [50, 30]] as const) expect(oneRmFrom(w, repsAt(R, w))).toBeCloseTo(R, 9);
    expect(repsAt(14, 10)).toBeCloseTo(12, 9);
    expect(repsAt(14, 10)).toBeGreaterThan(repsAt(14, 12.5));
    expect(repsAt(14, 14)).toBe(1);
    expect(repsAt(14, 20)).toBe(1);
    expect(oneRmFrom(10, -3)).toBe(10);
  });
});

describe("ownedWeights", () => {
  it("sorts fixed pairs and expands adjustable sets exactly", () => {
    expect(ownedWeights(null)).toEqual([]);
    expect(ownedWeights({ ...run([]).profile!, dumbbells: { kind: "fixed", kg: [10, 5, 7.5] } })).toEqual([5, 7.5, 10]);
    expect(ownedWeights({ ...run([]).profile!, dumbbells: { kind: "adjustable", minKg: 2.5, maxKg: 10, stepKg: 2.5 } })).toEqual([2.5, 5, 7.5, 10]);
    expect(ownedWeights({ ...run([]).profile!, dumbbells: { kind: "adjustable", minKg: 1, maxKg: 1.3, stepKg: 0.1 } })).toEqual([1, 1.1, 1.2, 1.3]);
    expect(ownedWeights({ ...run([]).profile!, dumbbells: undefined })).toEqual([]);
  });
});

describe("initial strength", () => {
  it("uses the usual weight first (reps + usualRir + b), else body mass × loadNorm × initFactor", () => {
    const s = run([]);
    expect(initialOneRm(s, db)).toBeCloseTo(70 * 0.15 * 0.85, 9);
    expect(initialOneRm(run([], { bodyMassKg: 80 }), db)).toBeCloseTo(80 * 0.15 * 0.85, 9);
    expect(initialOneRm(run([], { bodyMassKg: undefined }), db)).toBeCloseTo(70 * 0.15 * 0.85, 9); // fallback 70 kg
    s.usualWeights.db_curl = { weightKg: 10, reps: 10 };
    expect(initialOneRm(s, db)).toBeCloseTo(10 * (1 + 12 / 30), 9);
  });

  it("strengthOf: technical failure until performed, stale after staleDays", () => {
    const s = run([]);
    expect(strengthOf(s, db, T0)).toEqual({ oneRm: initialOneRm(s, db), firstSetMode: "technical_failure" });
    s.strength.db_curl = { oneRm: 15, obs: 2, lastPerformed: T0, lastWeightKg: 10 };
    expect(strengthOf(s, db, T0 + D)).toEqual({ oneRm: 15, firstSetMode: null });
    expect(strengthOf(s, db, T0 + 29 * D)).toEqual({ oneRm: 15 * 0.93, firstSetMode: "technical_failure" });
  });

  it("referenceWeight: the last weight, else the weight for mid-range reps", () => {
    const s = run([]);
    s.strength.db_curl = { oneRm: 14, obs: 1, lastPerformed: T0, lastWeightKg: null };
    expect(referenceWeight(s, db, T0)).toBeCloseTo(14 / (1 + 10.5 / 30), 9);
    s.strength.db_curl.lastWeightKg = 10;
    expect(referenceWeight(s, db, T0)).toBe(10);
  });
});

describe("canLoad", () => {
  it("weighted exercises need owned dumbbells; others always load", () => {
    expect(canLoad(run([]), db)).toBe(true);
    expect(canLoad(run([], { dumbbells: undefined }), db)).toBe(false);
    expect(canLoad(run([], { dumbbells: undefined }), catalog.byId.push_up_standard!)).toBe(true);
  });
});

it("fresh state has empty strength, ratings and zero demand offsets", () => {
  const s = run([]);
  expect(s.strength).toEqual({});
  expect(s.usualWeights).toEqual({});
  expect(s.ratings).toEqual({});
  expect(s.demandOffsets).toEqual({ balance: 0, coordination: 0, mobility: 0, grip: 0 });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `npx vitest run tests/strength.test.ts`. Expected: FAIL (`strength.ts` exports missing).

- [ ] **Step 3: Add the state fields.** In `src/engine/types.ts`, add `type Demand` to the type import from `"../library"`, and above `export interface EngineState` add:

```ts
/** Strength of one weighted exercise: estimated one-rep max of one dumbbell (kg). */
export interface StrengthEntry {
  oneRm: number;
  /** Clean max-effort observations (like CapacityEntry.obs). */
  obs: number;
  lastPerformed: number | null;
  /** Weight of the last set logged with a weight; the next plan keeps it while it still fits. */
  lastWeightKg: number | null;
}
```

Inside `EngineState`, after `capacity`:

```ts
  /** Weighted exercises only (strength.ts). */
  strength: Record<string, StrengthEntry>;
  /** Answers to "what weight do you usually use?"; used only until the exercise is first measured. */
  usualWeights: Record<string, { weightKg: number; reps: number }>;
  /** Exponential average of one-tap ratings per exercise: too_easy −1, just_right 0, too_hard +1. */
  ratings: Record<string, number>;
  /** Personal offset per demand tag, learned from ratings (difficulty.ts). */
  demandOffsets: Record<Demand, number>;
```

In `src/engine/fold.ts` `initialState`, after `capacity: {},`:

```ts
    strength: {},
    usualWeights: {},
    ratings: {},
    demandOffsets: { balance: 0, coordination: 0, mobility: 0, grip: 0 },
```

- [ ] **Step 4: Create `src/engine/strength.ts`:**

```ts
import type { FirstSetMode } from "./capacity";
import { byLevel, ladderLevel } from "./level";
import { MS_PER_HOUR } from "./recovery";
import type { EngineState, Exercise, Profile } from "./types";

/** Epley's constant: reps to failure at weight w ≈ EPLEY · (1RM / w − 1). */
export const EPLEY = 30;

/** Reps to failure with one dumbbell of `w` kg when fresh, at least 1. */
export function repsAt(oneRm: number, w: number): number {
  return Math.max(1, EPLEY * (oneRm / w - 1));
}

/** One-rep max implied by `M` reps to failure at `w` kg (M below 0 counts as 0). */
export function oneRmFrom(w: number, M: number): number {
  return w * (1 + Math.max(0, M) / EPLEY);
}

/** The dumbbell weights a user owns, ascending. Adjustable steps are rounded to grams so 1 + 3·0.1 is exactly 1.3. */
export function ownedWeights(profile: Profile | null): number[] {
  const d = profile?.dumbbells;
  if (!d) return [];
  if (d.kind === "fixed") return [...d.kg].sort((a, b) => a - b);
  const out: number[] = [];
  for (let i = 0; ; i++) {
    const w = Math.round((d.minKg + i * d.stepKg) * 1000) / 1000;
    if (w > d.maxKg + 1e-9) break;
    out.push(w);
  }
  return out;
}

/** Weighted exercises need owned dumbbells; every other exercise can always be loaded. */
export const canLoad = (s: EngineState, ex: Exercise): boolean => !ex.weighted || ownedWeights(s.profile).length > 0;

/**
 * Starting 1RM before any measurement: the user's "usual weight" (they stop about usualRir short of failure),
 * else body mass × loadNorm at their level × initFactor (cautious).
 */
export function initialOneRm(s: EngineState, ex: Exercise): number {
  const P = s.params.strength;
  const usual = s.usualWeights[ex.id];
  if (usual) return oneRmFrom(usual.weightKg, usual.reps + P.usualRir + s.b.value);
  if (!ex.loadNorm) throw new Error(`${ex.id}: not a weighted exercise`);
  const mass = s.profile?.bodyMassKg ?? P.fallbackBodyMassKg;
  return mass * byLevel(ex.loadNorm, ladderLevel(s, ex.ladderId)) * P.initFactor;
}

/** 1RM to use at `now` and whether the next set should be a technical-failure test (mirrors capacityOf). */
export function strengthOf(s: EngineState, ex: Exercise, now: number): { oneRm: number; firstSetMode: FirstSetMode } {
  const entry = s.strength[ex.id];
  if (!entry) return { oneRm: initialOneRm(s, ex), firstSetMode: "technical_failure" };
  const staleMs = s.params.capacity.staleDays * 24 * MS_PER_HOUR;
  if (entry.lastPerformed !== null && now - entry.lastPerformed > staleMs) {
    return { oneRm: entry.oneRm * s.params.capacity.staleFactor, firstSetMode: "technical_failure" };
  }
  return { oneRm: entry.oneRm, firstSetMode: null };
}

/** A weight to evaluate the exercise at when none is given: the last weight used, else the one for mid-range reps. */
export function referenceWeight(s: EngineState, ex: Exercise, now: number): number {
  const last = s.strength[ex.id]?.lastWeightKg;
  if (last !== null && last !== undefined) return last;
  const [lo, hi] = s.params.strength.repRange;
  return strengthOf(s, ex, now).oneRm / (1 + (lo + hi) / 2 / EPLEY);
}
```

- [ ] **Step 5: Export it.** In `src/engine/index.ts` add `export * from "./strength";`.

- [ ] **Step 6: Run to verify it passes.** Run: `npx vitest run tests/strength.test.ts`. Expected: PASS.

- [ ] **Step 7: Checkpoint.** Run: `npx tsc --noEmit && npx vitest run`. Expected: all pass.

---

### Task 4: Weight-aware prediction and prescription

**Files:**
- Modify: `src/engine/capacity.ts`
- Test: `tests/weights.prescribe.test.ts` (create); `tests/capacity.test.ts` (one expectation)

**Interfaces:**
- Consumes: everything from Task 3.
- Produces:
  - `type LoadFlag = "too_heavy" | "too_light" | null`
  - `capacityOf(s, exerciseId, now, weightKg?: number)`
  - `predictSet(s, exerciseId, now, weightKg?: number)`
  - `predictRange(s, exerciseId, now, weightKg?: number)`
  - `repsTarget(s, exerciseId, now, planned?, weightKg?: number)`
  - `chooseWeight(s, exerciseId, now, planned?): { weightKg: number; loadFlag: LoadFlag } | null`
  - `PrescribedSet.weightKg?: number`
  - `Prescription.loadFlag: LoadFlag`

- [ ] **Step 1: Write the failing test.** Create `tests/weights.prescribe.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { capacityOf, chooseWeight, prescribe, replay, type EngineEvent } from "../src/engine";
import { catalog, H, params, profile, T0 } from "./helpers";

const p = params();
const D = 24 * H;
type Dumbbells = NonNullable<Parameters<typeof profile>[1]>["dumbbells"];
/** A user who owns `dumbbells`, with db_curl's 1RM set to `oneRm` (measured once, last weight `last`). */
function state(dumbbells: Dumbbells, oneRm: number, last: number | null = null) {
  const s = replay([profile(T0 - D, { equipment: ["dumbbell", "bench"], bodyMassKg: 70, dumbbells })] as EngineEvent[], catalog, p);
  s.strength.db_curl = { oneRm, obs: 1, lastPerformed: T0, lastWeightKg: last };
  return s;
}
const NOW = T0 + 2 * D;

describe("chooseWeight", () => {
  it("picks the owned weight whose target reps sit nearest mid-range (target = reps to failure − targetRir 2)", () => {
    // 1RM 14: 10 kg → 12 reps to failure → 10 target, in [6, 15].
    expect(chooseWeight(state({ kind: "fixed", kg: [5, 7.5, 10, 12.5, 15] }, 14), "db_curl", NOW)).toEqual({ weightKg: 10, loadFlag: null });
  });

  it("keeps last time's weight while it is still in range", () => {
    const W = { kind: "adjustable", minKg: 10, maxKg: 15, stepKg: 1 } as const;
    expect(chooseWeight(state(W, 16), "db_curl", NOW)!.weightKg).toBe(11); // 11 kg → 12 target (nearest 10.5)
    expect(chooseWeight(state(W, 16, 12), "db_curl", NOW)!.weightKg).toBe(12); // 12 kg → 8 target, still in range
  });

  it("breaks a mid-range tie toward the heavier weight", () => {
    // 1RM 22: 15 kg → 12 target, 16.1 kg → 9 target; both 1.5 from 10.5.
    expect(chooseWeight(state({ kind: "fixed", kg: [15, 16.1] }, 22), "db_curl", NOW)!.weightKg).toBe(16.1);
  });

  it("when the range falls between two owned weights, takes the one nearest the range (no flag)", () => {
    // 1RM 8.925: 5 kg → 22 target (7 above), 7.5 kg → 4 target (2 below).
    expect(chooseWeight(state({ kind: "fixed", kg: [5, 7.5] }, 8.925), "db_curl", NOW)).toEqual({ weightKg: 7.5, loadFlag: null });
  });

  it("flags too_heavy and too_light, and returns null without dumbbells", () => {
    expect(chooseWeight(state({ kind: "fixed", kg: [12.5, 15] }, 14), "db_curl", NOW)).toEqual({ weightKg: 12.5, loadFlag: "too_heavy" });
    expect(chooseWeight(state({ kind: "fixed", kg: [2, 3] }, 14), "db_curl", NOW)).toEqual({ weightKg: 3, loadFlag: "too_light" });
    expect(chooseWeight(state(undefined, 14), "db_curl", NOW)).toBeNull();
    expect(chooseWeight(state({ kind: "fixed", kg: [5] }, 14), "push_up_standard", NOW)).toBeNull();
  });
});

describe("weighted prescription", () => {
  it("every set carries an owned weight and at least 1 rep", () => {
    const pr = prescribe(state({ kind: "fixed", kg: [12.5, 15] }, 14), "db_curl", 3, NOW);
    expect(pr.loadFlag).toBe("too_heavy");
    for (const x of pr.sets) {
      expect([12.5, 15]).toContain(x.weightKg);
      expect(x.reps).toBeGreaterThanOrEqual(1);
    }
  });

  it("caps reps at the range top when the dumbbells are too light", () => {
    const pr = prescribe(state({ kind: "fixed", kg: [2, 3] }, 14), "db_curl", 2, NOW);
    expect(pr.loadFlag).toBe("too_light");
    expect(pr.sets.map((x) => x.reps)).toEqual([15, 15]);
  });

  it("steps down one weight when fatigue drops a later set below the rep floor", () => {
    // 10 kg: targets 10, 8, 6, then 5 < 6, so the fourth set moves to 7.5 kg.
    const pr = prescribe(state({ kind: "fixed", kg: [7.5, 10] }, 14), "db_curl", 4, NOW);
    expect(pr.sets.map((x) => x.weightKg)).toEqual([10, 10, 10, 7.5]);
  });

  it("throws a clear error without dumbbells; bodyweight prescriptions carry no weight", () => {
    expect(() => prescribe(state(undefined, 14), "db_curl", 3, NOW)).toThrow(/no dumbbell weights/);
    const bw = prescribe(state(undefined, 14), "push_up_standard", 2, NOW);
    expect(bw.loadFlag).toBeNull();
    expect(bw.sets.every((x) => x.weightKg === undefined)).toBe(true);
  });

  it("capacityOf at a weight is reps to failure from the 1RM", () => {
    expect(capacityOf(state({ kind: "fixed", kg: [10] }, 14), "db_curl", NOW, 10).M).toBeCloseTo(12, 9);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `npx vitest run tests/weights.prescribe.test.ts`. Expected: FAIL (`chooseWeight` missing).

- [ ] **Step 3: Implement.** In `src/engine/capacity.ts`:

Add to the imports:

```ts
import { canLoad, ownedWeights, referenceWeight, repsAt, strengthOf } from "./strength";
```

Below `export type FirstSetMode = ...` add:

```ts
/** A weighted prescription that could not reach the rep range with the owned dumbbells. */
export type LoadFlag = "too_heavy" | "too_light" | null;
```

Add `weightKg?: number;` to `PrescribedSet` (after `seconds?`), and `loadFlag: LoadFlag;` to `Prescription` (after `firstSetMode`).

Replace `capacityOf` with:

```ts
/**
 * Fresh capacity M_e to use at `now`, and whether the next set should go to technical failure.
 * Weighted exercises: reps to failure at `weightKg` (default: referenceWeight) from the estimated 1RM.
 */
export function capacityOf(s: EngineState, exerciseId: string, now: number, weightKg?: number): { M: number; firstSetMode: FirstSetMode } {
  const ex = exercise(s, exerciseId);
  if (ex.weighted) {
    const st = strengthOf(s, ex, now);
    return { M: repsAt(st.oneRm, weightKg ?? referenceWeight(s, ex, now)), firstSetMode: st.firstSetMode };
  }
  const entry = s.capacity[ex.id];
  if (!entry) return { M: initialM(s, ex), firstSetMode: "technical_failure" };
  const staleMs = s.params.capacity.staleDays * 24 * MS_PER_HOUR;
  if (entry.lastPerformed !== null && now - entry.lastPerformed > staleMs) {
    return { M: entry.M * s.params.capacity.staleFactor, firstSetMode: "technical_failure" };
  }
  return { M: entry.M, firstSetMode: null };
}
```

Replace `predictSet` with:

```ts
export function predictSet(s: EngineState, exerciseId: string, now: number, weightKg?: number): { M_pred: number; F_prior_eff: number; F_sess_eff: number; scale_eff: number } {
  const f = effectiveFatigue(s, exerciseId, now);
  return { M_pred: predictedMax(s, capacityOf(s, exerciseId, now, weightKg).M, f.F_prior_eff, f.F_sess_eff, f.scale_eff), ...f };
}
```

In `predictRange`, change the signature to `(s: EngineState, exerciseId: string, now: number, weightKg?: number)` and its first line to `const { M_pred } = predictSet(s, exerciseId, now, weightKg);`.

In `usableNeighbour`, change the last line to:

```ts
  return n.equipment.every((t) => equipment.includes(t)) && !excludeExercises.includes(n.id) && canLoad(s, n) ? n : undefined;
```

Replace `repsTarget` with:

```ts
/** repsTarget of the next set: round(M_pred - targetRir), before any ladder move. Weighted: at `weightKg`. */
export function repsTarget(s: EngineState, exerciseId: string, now: number, planned?: Partial<RegionMap>, weightKg?: number): number {
  const f = effectiveFatigue(s, exerciseId, now);
  const M = capacityOf(s, exerciseId, now, weightKg).M;
  return Math.round(predictedMax(s, M, f.F_prior_eff, f.F_sess_eff + plannedSessEff(exercise(s, exerciseId), planned), f.scale_eff) - targetRir(s, now));
}

/**
 * The owned dumbbell weight for the next set of a weighted exercise (spec §2, "Weight choice"):
 * keep last time's weight while its target reps stay in strength.repRange; else the in-range weight nearest
 * mid-range (tie: heavier); else too_heavy (lightest) / too_light (heaviest); else the weight nearest the range
 * (tie: lighter). Null when the exercise is unweighted or the user owns no dumbbells.
 */
export function chooseWeight(s: EngineState, exerciseId: string, now: number, planned?: Partial<RegionMap>): { weightKg: number; loadFlag: LoadFlag } | null {
  const ex = exercise(s, exerciseId);
  const W = ownedWeights(s.profile);
  if (!ex.weighted || W.length === 0) return null;
  const [lo, hi] = s.params.strength.repRange;
  const mid = (lo + hi) / 2;
  const reps = W.map((w) => repsTarget(s, ex.id, now, planned, w));
  const last = s.strength[ex.id]?.lastWeightKg ?? null;
  const li = last === null ? -1 : W.indexOf(last);
  if (li >= 0 && reps[li]! >= lo && reps[li]! <= hi) return { weightKg: last!, loadFlag: null };
  let best = -1;
  W.forEach((_, i) => {
    const r = reps[i]!;
    if (r < lo || r > hi) return;
    if (best < 0 || Math.abs(r - mid) <= Math.abs(reps[best]! - mid)) best = i; // ascending W: "<=" keeps the heavier on a tie
  });
  if (best >= 0) return { weightKg: W[best]!, loadFlag: null };
  if (reps.every((r) => r < lo)) return { weightKg: W[0]!, loadFlag: "too_heavy" };
  if (reps.every((r) => r > hi)) return { weightKg: W[W.length - 1]!, loadFlag: "too_light" };
  const dist = (r: number) => Math.max(lo - r, r - hi, 0);
  let near = 0;
  W.forEach((_, i) => {
    if (dist(reps[i]!) < dist(reps[near]!)) near = i; // strict "<" keeps the lighter on a tie
  });
  return { weightKg: W[near]!, loadFlag: null };
}

/** Weighted prescription: one owned weight for all sets, stepping down one weight if fatigue pushes a set below lo. */
function prescribeWeighted(s: EngineState, ex: Exercise, sets: number, now: number, opts: PrescribeOptions): Prescription {
  const choice = chooseWeight(s, ex.id, now, opts.plannedAdded);
  if (!choice) throw new Error(`${ex.id}: no dumbbell weights in the profile`);
  const [lo, hi] = s.params.strength.repRange;
  const W = ownedWeights(s.profile);
  const rir = targetRir(s, now);
  const { oneRm, firstSetMode } = strengthOf(s, ex, now);
  const { F_prior_eff, F_sess_eff: F_sess_now, scale_eff } = effectiveFatigue(s, ex.id, now);
  let F_sess_eff = F_sess_now + plannedSessEff(ex, opts.plannedAdded);
  const k = priorExposures(s, ex.id, s.openSessionId, now);
  const eff = effectiveRegions(ex);
  const sessPerFatigue = eff.reduce((a, [, c]) => a + c * c, 0) / eff.reduce((a, [, c]) => a + c, 0);
  const reasons: string[] = [];
  if (choice.loadFlag === "too_heavy") reasons.push(`Even your lightest dumbbells (${choice.weightKg} kg) are heavy for this: do what you can with good form`);
  if (choice.loadFlag === "too_light") reasons.push(`Your heaviest dumbbells (${choice.weightKg} kg) are light for this: stop at ${hi} reps`);

  let w = choice.weightKg;
  const target = (kg: number) => Math.round(predictedMax(s, repsAt(oneRm, kg), F_prior_eff, F_sess_eff, scale_eff) - rir);
  const out: PrescribedSet[] = [];
  for (let i = 0; i < sets; i++) {
    let reps = target(w);
    const lighter = W.filter((x) => x < w).pop();
    if (i > 0 && reps < lo && lighter !== undefined) {
      w = lighter;
      reps = target(w);
      reasons.push(`Drops to ${w} kg from set ${i + 1} as fatigue builds`);
    }
    reps = Math.max(1, choice.loadFlag === "too_light" ? Math.min(reps, hi) : reps);
    out.push(ex.isHold
      ? { seconds: reps * s.params.hold.secondsPerRep, targetRir: rir, isAmrap: false, weightKg: w }
      : { reps, targetRir: rir, isAmrap: false, weightKg: w });
    F_sess_eff += setLoad(ex, reps, rir, k, s.params, noveltyMult(s)).fatigue * sessPerFatigue;
  }
  return { exerciseId: ex.id, sets: out, firstSetMode, reasons, loadFlag: choice.loadFlag };
}
```

In `prescribe`, right after `let ex = exercise(s, exerciseId);` insert:

```ts
  if (ex.weighted) return prescribeWeighted(s, ex, sets, now, opts);
```

and change its final `return` to:

```ts
  return { exerciseId: ex.id, sets: out, firstSetMode, reasons, loadFlag: null };
```

- [ ] **Step 4: Update the one exact-object expectation.** In `tests/capacity.test.ts` line 93, change the expected object to end with `firstSetMode: null, reasons: [], loadFlag: null });`.

- [ ] **Step 5: Run to verify it passes.** Run: `npx vitest run tests/weights.prescribe.test.ts tests/capacity.test.ts`. Expected: PASS.

- [ ] **Step 6: Checkpoint.** Run: `npx tsc --noEmit && npx vitest run`. Expected: all pass.

---

### Task 5: Learning from weighted sets, usual weight (fold + calibration + level)

**Files:**
- Modify: `src/engine/types.ts` (`SessionRecord.sets`), `src/engine/calibrate.ts`, `src/engine/level.ts`, `src/engine/fold.ts`
- Test: `tests/weights.learn.test.ts` (create)

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces:
  - `LoggedSet.weightKg: number | null`
  - `SessionRecord.sets[i].weightKg: number | null`
  - `recordLevelObservation(s: EngineState, ladderId: string, norm: DefaultM | undefined, value: number): void`
  - fold handling of `usual_weight`

- [ ] **Step 1: Write the failing test.** Create `tests/weights.learn.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readiness, replay, strengthOf, type EngineEvent } from "../src/engine";
import { catalog, ev, H, params, profile, T0 } from "./helpers";

const p = params();
const D = 24 * H;
const db = catalog.byId.db_curl!;
const PROFILE = { equipment: ["dumbbell", "bench"] as const, bodyMassKg: 70, dumbbells: { kind: "fixed", kg: [5, 7.5, 10, 12.5, 15] } } as const;
const run = (events: EngineEvent[], over: Parameters<typeof profile>[1] = {}) =>
  replay([profile(T0 - D, { ...PROFILE, equipment: [...PROFILE.equipment], ...over }), ...events], catalog, p);
const usual = (ts: number, exerciseId: string, weightKg: number, reps = 10) => ev(ts, { type: "usual_weight", payload: { exerciseId, weightKg, reps } });
const wset = (ts: number, sid: string, exerciseId: string, reps: number, rir: number, weightKg?: number) =>
  ev(ts, { type: "set_logged", payload: { sessionId: sid, exerciseId, reps, rir, isWarmup: false, isAmrap: false, ...(weightKg === undefined ? {} : { weightKg }) } });
const sess = (ts: number, id: string, sets: [string, number, number, number?][]) => [
  ev(ts, { type: "session_started", payload: { sessionId: id } }),
  ...sets.map(([e, r, rir, w]) => wset(ts, id, e, r, rir, w)),
  ev(ts, { type: "session_ended", payload: { sessionId: id } }),
];

describe("golden: usual weight, first measurement, EMA update", () => {
  it("10 kg × 10 usual → 1RM 14; 12 @ RIR 2 at 10 kg → 14.6667; 13 @ RIR 2 three days later → 14.7667", () => {
    const u = usual(T0 - H, "db_curl", 10);
    expect(strengthOf(run([u]), db, T0)).toEqual({ oneRm: 14, firstSetMode: "technical_failure" });
    const s1 = run([u, ...sess(T0, "a", [["db_curl", 12, 2, 10]])]);
    expect(s1.predictionLog[0]).toMatchObject({ type: "capacity", M_pred: 12, M_obs: 14 });
    expect(s1.strength.db_curl).toEqual({ oneRm: 10 * (1 + 14 / 30), obs: 1, lastPerformed: T0, lastWeightKg: 10 });
    const s2 = run([u, ...sess(T0, "a", [["db_curl", 12, 2, 10]]), ...sess(T0 + 3 * D, "b", [["db_curl", 13, 2, 10]])]);
    expect(s2.strength.db_curl!.oneRm).toBeCloseTo(14.666667 + 0.3 * (15 - 14.666667), 5);
  });
});

describe("weights and the fold", () => {
  it("a weighted set without a weight deposits fatigue but teaches nothing", () => {
    const s = run(sess(T0, "a", [["db_curl", 12, 2]]));
    expect(s.strength.db_curl).toBeUndefined();
    expect(s.predictionLog).toHaveLength(0);
    expect(readiness(s, T0 + H).biceps.fatigue).toBeGreaterThan(0);
  });

  it("a weight on a bodyweight exercise is ignored", () => {
    const a = run(sess(T0, "a", [["push_up_standard", 15, 2, 20]]));
    const b = run(sess(T0, "a", [["push_up_standard", 15, 2]]));
    expect(a.capacity).toEqual(b.capacity);
    expect(a.predictionLog).toEqual(b.predictionLog);
    expect(a.strength).toEqual({});
  });

  it("usual_weight is ignored for unweighted exercises and once the exercise is measured", () => {
    expect(run([usual(T0, "push_up_standard", 10)]).usualWeights).toEqual({});
    const s = run([...sess(T0, "a", [["db_curl", 12, 2, 10]]), usual(T0 + D, "db_curl", 30)]);
    expect(s.strength.db_curl!.oneRm).toBeCloseTo(14.666667, 5);
  });

  it("a censored set (RIR 5+) that beats the estimate still measures the exercise", () => {
    const s = run(sess(T0, "a", [["db_curl", 12, 5, 10]])); // estimate 8.925 kg gives 1 rep at 10 kg; 17 > 1
    expect(s.strength.db_curl!.obs).toBe(1);
    expect(s.strength.db_curl!.oneRm).toBeCloseTo(10 * (1 + 17 / 30), 9);
  });

  it("a weight the user does not own still teaches the estimate", () => {
    const s = run(sess(T0, "a", [["db_curl", 10, 2, 11]])); // owns 5–15 in 2.5 steps, logs 11 kg
    expect(s.strength.db_curl!.oneRm).toBeCloseTo(11 * (1 + 12 / 30), 9);
  });

  it("acute fatigue is learned only between sets at the same weight", () => {
    const same = run(sess(T0, "a", [["db_curl", 12, 2, 10], ["db_curl", 9, 2, 10]]));
    expect(same.predictionLog[1]!.type).toBe("acute");
    const diff = run(sess(T0, "a", [["db_curl", 12, 2, 10], ["db_curl", 20, 2, 7.5]]));
    expect(diff.predictionLog[1]!.type).toBe("log_only");
  });

  it("one outlier set moves an established 1RM by at most emaAlpha × maxStep", () => {
    const s = run([...sess(T0, "a", [["db_curl", 12, 2, 10]]), ...sess(T0 + 3 * D, "b", [["db_curl", 40, 2, 10]])]);
    expect(s.strength.db_curl!.oneRm).toBeCloseTo(14.666667 * (1 + 0.3 * 0.5), 5);
  });

  it("level observations from weighted sets need body mass", () => {
    expect(run(sess(T0, "a", [["db_curl", 12, 2, 10]])).levelObs.db_curl).toHaveLength(1);
    expect(run(sess(T0, "a", [["db_curl", 12, 2, 10]]), { bodyMassKg: undefined }).levelObs.db_curl).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `npx vitest run tests/weights.learn.test.ts`. Expected: FAIL.

- [ ] **Step 3: Session sets carry the weight.** In `src/engine/types.ts`, `SessionRecord.sets` element type becomes:

```ts
  sets: { exerciseId: string; M_obs: number; F_sess_eff: number; isAmrap: boolean; censored: boolean; weightKg: number | null }[];
```

- [ ] **Step 4: Level observation takes the norm.** In `src/engine/level.ts`, replace `recordLevelObservation` with:

```ts
/**
 * Called by calibration for each clean max-effort (capacity) observation. `norm` is the exercise's defaultM (value = reps)
 * or, for weighted exercises, its loadNorm (value = 1RM ÷ body mass). Keeps the last level.window per ladder.
 */
export function recordLevelObservation(s: EngineState, ladderId: string, norm: DefaultM | undefined, value: number): void {
  if (!norm) return;
  const o = scoreObservation(norm, value);
  if (o.weight === 0) return;
  const list = (s.levelObs[ladderId] ??= []);
  list.push(o);
  if (list.length > s.params.level.window) list.shift();
}
```

Its only caller is `calibrate.ts` (updated in the next step); no test calls it.

- [ ] **Step 5: Calibration learns from weights.** In `src/engine/calibrate.ts`:

Add imports: `effectiveFatigue` to the `./capacity` import, and `import { oneRmFrom, repsAt } from "./strength";`.

Add `weightKg: number | null;` to `LoggedSet` (after `isAmrap`).

Replace the start of `calibrateSet` up to and including the `const M_obs = ...` line with:

```ts
export function calibrateSet(s: EngineState, sess: SessionRecord, set: LoggedSet, ts: number): void {
  const cal = s.params.calibration;
  const ex = s.catalog.byId[set.exerciseId]!;
  const w = ex.weighted ? set.weightKg : null;
  if (ex.weighted && w === null) {
    // No weight logged: M_obs depends on the load, so nothing can be learned. The set is kept (censored) so it still
    // counts as "the previous set" without ever being compared against.
    sess.sets.push({ exerciseId: set.exerciseId, M_obs: 0, F_sess_eff: effectiveFatigue(s, set.exerciseId, ts).F_sess_eff, isAmrap: set.isAmrap, censored: true, weightKg: null });
    return;
  }
  const { M_pred, F_prior_eff, F_sess_eff } = predictSet(s, set.exerciseId, ts, w ?? undefined);
  // Typo protection: reps-based exercises cap at maxObsFactor × the advanced norm; weighted sets at maxObsReps.
  const cap = ex.weighted ? s.params.strength.maxObsReps : ex.defaultM ? s.params.capacity.maxObsFactor * ex.defaultM.advanced : Infinity;
  const M_obs = Math.min(cap, observedMax(set.repsEq, set.rir, s.b.value, set.isAmrap));
```

In the AMRAP branch, change `const prev = mine.filter((x) => !x.isAmrap).pop();` to:

```ts
    const prev = mine.filter((x) => !x.isAmrap && x.weightKg === w).pop();
```

Replace the capacity branch (from `if (F_prior_eff < s.params.capacity.freshBelow && ...` through `recordLevelObservation(...)`) with:

```ts
    const currentM = ex.weighted ? repsAt(s.strength[ex.id]!.oneRm, w!) : s.capacity[ex.id]!.M;
    if (F_prior_eff < s.params.capacity.freshBelow && (!censored || M_obs > currentM)) {
      type = "capacity";
      const step = s.params.capacity.maxStep;
      const alpha = s.params.capacity.emaAlpha;
      if (ex.weighted) {
        // Same rule as reps capacity, in 1RM space: the first measurement replaces the guess, later ones are
        // smoothed with the observation held within 1RM × (1 ± maxStep).
        const entry = s.strength[ex.id]!;
        const R_obs = oneRmFrom(w!, M_obs);
        const oneRm = entry.obs === 0 ? R_obs : entry.oneRm + alpha * (clamp(R_obs, entry.oneRm * (1 - step), entry.oneRm * (1 + step)) - entry.oneRm);
        s.strength[ex.id] = { ...entry, oneRm, obs: entry.obs + 1 };
        const mass = s.profile?.bodyMassKg;
        if (mass !== undefined) recordLevelObservation(s, ex.ladderId, ex.loadNorm, R_obs / mass);
      } else {
        // The first clean measurement replaces the catalog guess (floored at 1 rep); later ones are smoothed (EMA),
        // with the observation held within M × (1 ± maxStep) so one outlier set cannot swing capacity.
        const entry = s.capacity[ex.id]!;
        const M = entry.obs === 0 ? Math.max(1, M_obs) : entry.M + alpha * (clamp(M_obs, entry.M * (1 - step), entry.M * (1 + step)) - entry.M);
        s.capacity[ex.id] = { ...entry, M, obs: entry.obs + 1 };
        recordLevelObservation(s, ex.ladderId, ex.defaultM, M_obs);
      }
```

(The following `} else if (!censored && F_prior_eff >= ...` recovery branch stays as it is.)

In the acute branch condition, add the same-weight requirement:

```ts
  } else if (last && last.exerciseId === set.exerciseId && last.weightKg === w && !last.isAmrap && !last.censored && !censored) {
```

In the `sess.sets.push(...)` near the end, add `weightKg: w`:

```ts
  sess.sets.push({ exerciseId: set.exerciseId, M_obs, F_sess_eff, isAmrap: set.isAmrap, censored, weightKg: w });
```

- [ ] **Step 6: Fold creates strength entries and handles usual weight.** In `src/engine/fold.ts`:

Add `import { initialOneRm, strengthOf } from "./strength";`.

In the `set_logged` case, replace the line `s.capacity[ex.id] = { M: capacityOf(s, ex.id, e.ts).M, ... };` with:

```ts
      const weightKg = ex.weighted ? (p.weightKg ?? null) : null;
      if (ex.weighted) {
        // Initialise on first use; a stale 1RM is decayed by staleFactor once, here. Only sets with a weight count.
        if (weightKg !== null) {
          const prev = s.strength[ex.id];
          s.strength[ex.id] = { oneRm: strengthOf(s, ex, e.ts).oneRm, obs: prev?.obs ?? 0, lastPerformed: e.ts, lastWeightKg: weightKg };
        }
      } else {
        // Initialise capacity on first use; a stale capacity is decayed by staleFactor once, here.
        s.capacity[ex.id] = { M: capacityOf(s, ex.id, e.ts).M, obs: s.capacity[ex.id]?.obs ?? 0, lastPerformed: e.ts };
      }
```

and change the `calibrateSet(...)` call's set argument to include `weightKg`:

```ts
      calibrateSet(s, sess, { exerciseId: ex.id, repsEq: x, isHold: p.holdSeconds !== undefined, rir: p.rir, isAmrap: p.isAmrap, weightKg }, e.ts);
```

Replace the placeholder `case "usual_weight": break;` from Task 2 with:

```ts
    case "usual_weight": {
      const ex = s.catalog.byId[e.payload.exerciseId];
      if (!ex?.weighted) break;
      const entry = s.strength[ex.id];
      if (entry && entry.obs > 0) break; // measured: the usual weight no longer matters
      s.usualWeights[ex.id] = { weightKg: e.payload.weightKg, reps: e.payload.reps };
      if (entry) s.strength[ex.id] = { ...entry, oneRm: initialOneRm(s, ex) };
      break;
    }
```

- [ ] **Step 7: Run to verify it passes.** Run: `npx vitest run tests/weights.learn.test.ts`. Expected: PASS.

- [ ] **Step 8: Checkpoint.** Run: `npx tsc --noEmit && npx vitest run`. Expected: all pass.

---

### Task 6: Catalog keeps weighted exercises; planner and gaps gate on dumbbells

**Files:**
- Modify: `src/engine/catalog.ts`, `src/engine/calibrate.ts` (`equipmentGaps`), `src/engine/planner.ts`, `src/cli/report.ts`
- Test: `tests/catalog.test.ts`, `tests/weights.plan.test.ts` (create)

**Interfaces:**
- Consumes: `canLoad`, `ownedWeights` (Task 3); `Prescription.loadFlag` (Task 4).
- Produces: `Catalog.exercises` includes weighted exercises; `PlannedExercise.loadFlag: LoadFlag`.

- [ ] **Step 1: Write the failing tests.** In `tests/catalog.test.ts`, replace the test `"validates; the planner catalog keeps exactly the unweighted exercises"` with:

```ts
  it("validates; the planner catalog holds every library exercise", () => {
    expect(lib.exercises.length).toBeGreaterThanOrEqual(120);
    expect(cat.exercises.map((e) => e.id)).toEqual(lib.exercises.map((e) => e.id));
    expect(cat.library.exercises.length).toBe(lib.exercises.length);
    for (const e of lib.exercises) expect(e.weighted, e.id).toBe(e.equipment.includes("dumbbell"));
  });
```

and in `"uses only known equipment; every plannable exercise has defaultM"` change the second loop to:

```ts
    for (const e of cat.exercises) if (!e.weighted) expect(e.defaultM, e.id).toBeDefined();
```

Create `tests/weights.plan.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { equipmentGaps, ownedWeights, planSession, replay, type EngineEvent } from "../src/engine";
import { catalog, H, params, profile, T0 } from "./helpers";

const p = params();
const D = 24 * H;
const run = (over: Parameters<typeof profile>[1]) => replay([profile(T0 - D, over)] as EngineEvent[], catalog, p);

describe("planning with dumbbells", () => {
  it("never plans a weighted exercise without owned dumbbells, even with the 'dumbbell' tag", () => {
    const plan = planSession(run({ equipment: ["dumbbell", "bench"] }), { now: T0 });
    expect(plan.exercises.some((x) => catalog.byId[x.exerciseId]!.weighted)).toBe(false);
  });

  it("with dumbbells, plans weighted exercises at owned weights", () => {
    const s = run({ equipment: ["dumbbell", "bench"], bodyMassKg: 70, dumbbells: { kind: "adjustable", minKg: 2.5, maxKg: 30, stepKg: 2.5 } });
    const plan = planSession(s, { now: T0 });
    const weighted = plan.exercises.filter((x) => catalog.byId[x.exerciseId]!.weighted);
    expect(weighted.length).toBeGreaterThan(0); // rows need a table or band otherwise, so the pull slot is weighted
    const owned = ownedWeights(s.profile);
    for (const x of weighted) for (const set of x.sets) expect(owned).toContain(set.weightKg);
  });

  it("equipment gaps ignore weighted exercises the user cannot load", () => {
    expect(equipmentGaps(run({ equipment: ["dumbbell"] })).map((g) => g.region)).toContain("biceps");
    expect(equipmentGaps(run({ equipment: ["dumbbell"], dumbbells: { kind: "fixed", kg: [10] } })).map((g) => g.region)).not.toContain("biceps");
  });
});
```

- [ ] **Step 2: Run to verify they fail.** Run: `npx vitest run tests/catalog.test.ts tests/weights.plan.test.ts`. Expected: FAIL.

- [ ] **Step 3: Catalog keeps everything.** In `src/engine/catalog.ts` `loadCatalog`, keep `plannable` for the program check only, and replace the last three statements with:

```ts
  // Weighted exercises stay in the catalog: the planner admits them only for users who own dumbbells (canLoad).
  const ladderIds = new Set(library.exercises.map((e) => e.ladderId));
  const ladders = library.ladders.filter((l) => ladderIds.has(l.id));
  const exercises = library.exercises.map((e) => (e.weighted || e.defaultM ? e : { ...e, defaultM: deriveDefaultM(e, plannable, ladders) }));
  return { ladders, exercises, byId: Object.fromEntries(exercises.map((e) => [e.id, e])), programs, library };
```

Also update the `Catalog.exercises` doc comment to: `/** Every library exercise, sorted by id. Weighted ones need owned dumbbells (strength.canLoad). */`.

- [ ] **Step 4: Gaps respect dumbbells.** In `src/engine/calibrate.ts`, add `canLoad` to the `./strength` import and change `equipmentGaps`'s `usable` line to:

```ts
  const usable = s.catalog.exercises.filter((e) => e.equipment.every((t) => equipment.includes(t)) && !excluded.includes(e.id) && canLoad(s, e));
```

- [ ] **Step 5: Planner gating and output.** In `src/engine/planner.ts`:

Add imports: `type LoadFlag` to the `./capacity` import, and `import { canLoad } from "./strength";`.

Add `loadFlag: LoadFlag;` to `PlannedExercise` (after `firstSetMode`).

In `canUse`, add `canLoad(s, e) &&` as the first condition:

```ts
  const canUse = (e: Exercise) =>
    canLoad(s, e) &&
    e.equipment.every((t) => equipment.includes(t)) &&
```

In `evaluate`'s return statement, change the `pr:` object to:

```ts
pr: { exerciseId: ex.id, sets, firstSetMode: pr.firstSetMode, reasons, loadFlag: pr.loadFlag }
```

- [ ] **Step 6: Report shows weights.** In `src/cli/report.ts`, change the `const sets = e.sets.map(...)` line to:

```ts
    const sets = e.sets.map((x) => (x.weightKg !== undefined ? `${x.weightKg} kg × ` : "") + (x.seconds !== undefined ? `${x.seconds}s` : `${x.reps}`) + ` @RIR${x.targetRir}` + (x.isAmrap ? " AMRAP" : "")).join(", ");
```

- [ ] **Step 7: Run to verify they pass.** Run: `npx vitest run tests/catalog.test.ts tests/weights.plan.test.ts`. Expected: PASS.

- [ ] **Step 8: Checkpoint.** Run: `npx tsc --noEmit && npx vitest run`. Expected: all pass. Plans for profiles without owned dumbbells are unchanged: every pre-existing planner, level, sim and golden test passes unmodified.

---

### Task 7: Adaptive difficulty (`difficulty.ts`)

**Files:**
- Create: `src/engine/difficulty.ts`
- Modify: `src/engine/fold.ts` (ratings), `src/engine/index.ts`
- Test: `tests/difficulty.test.ts` (create)

**Interfaces:**
- Consumes: `chooseWeight`, `capacityOf`, `targetRir` (`capacity.ts`); `strengthOf`, `repsAt` (`strength.ts`); `byLevel`, `ladderLevel` (`level.ts`); `ladderExercises` (`catalog.ts`); `Rating` (`types.ts`).
- Produces:
  - `type DifficultyLabel = "too_easy" | "easy" | "right_challenge" | "hard" | "too_hard"`
  - `interface PersonalDifficulty { score: number; label: DifficultyLabel; source: "predicted" | "personal"; reasons: string[] }`
  - `applyRating(s: EngineState, exerciseId: string, rating: Rating): void`
  - `difficultyOf(s: EngineState, exerciseId: string, now: number): PersonalDifficulty`
  - `difficultyLabel(score: number): DifficultyLabel`

- [ ] **Step 1: Write the failing test.** Create `tests/difficulty.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { difficultyLabel, difficultyOf, replay, type EngineEvent, type Rating } from "../src/engine";
import { catalog, ev, H, params, profile, T0 } from "./helpers";

const p = params();
const D = 24 * H;
const rate = (ts: number, exerciseId: string, rating: Rating) => ev(ts, { type: "exercise_feedback", payload: { exerciseId, rating } });
const run = (events: EngineEvent[], over: Parameters<typeof profile>[1] = {}) => replay([profile(T0 - D, over), ...events], catalog, p);

describe("difficulty labels", () => {
  it("bands at 1.5 / 2.5 / 3.5 / 4.5", () => {
    expect([1, 1.4, 1.5, 2.4, 2.5, 3.4, 3.5, 4.4, 4.5, 5].map(difficultyLabel)).toEqual([
      "too_easy", "too_easy", "easy", "easy", "right_challenge", "right_challenge", "hard", "hard", "too_hard", "too_hard",
    ]);
  });
});

describe("predicted difficulty", () => {
  it("is the library rating at the user's level before any data", () => {
    const s = run([]);
    expect(difficultyOf(s, "pistol_squat", T0)).toEqual({ score: 4, label: "hard", source: "predicted", reasons: [] });
    expect(difficultyOf(run([], { experience: "beginner" }), "pistol_squat", T0).score).toBe(5);
  });
});

describe("ratings", () => {
  it("move this exercise and, through demand tags, related exercises never rated", () => {
    const s = run([rate(T0, "pistol_squat", "too_hard")]);
    // R = 0.5; balance, mobility, coordination each 0.25, so D = 0.25: 4 + 0.5 + 0.25.
    expect(difficultyOf(s, "pistol_squat", T0 + H)).toMatchObject({ score: 4.8, label: "too_hard", source: "personal" });
    // reverse_lunge (balance) was never rated: 1 + 0.25.
    expect(difficultyOf(s, "reverse_lunge", T0 + H).score).toBe(1.3);
    // squat_bodyweight has no demands: unchanged.
    expect(difficultyOf(s, "squat_bodyweight", T0 + H).source).toBe("predicted");
  });

  it("too_easy pulls down; repeated ratings converge; demand offsets stay within ±demandMax", () => {
    const easy = run([rate(T0, "pull_up", "too_easy"), rate(T0 + 1, "pull_up", "too_easy")]);
    expect(difficultyOf(easy, "pull_up", T0 + H).score).toBeLessThan(difficultyOf(run([]), "pull_up", T0 + H).score);
    const many = run(Array.from({ length: 40 }, (_, i) => rate(T0 + i, "pistol_squat", "too_hard")));
    for (const v of Object.values(many.demandOffsets)) expect(Math.abs(v)).toBeLessThanOrEqual(p.difficulty.demandMax);
    expect(difficultyOf(many, "pistol_squat", T0 + H).score).toBe(5);
  });

  it("ratings for unknown exercises are ignored", () => {
    expect(run([rate(T0, "not_an_exercise", "too_hard")]).ratings).toEqual({});
  });
});

describe("strength fit", () => {
  it("a measured exercise far above the rep range becomes easy for this user", () => {
    const s = run([]);
    s.capacity.push_up_standard = { M: 40, obs: 3, lastPerformed: T0 };
    // m = 40 − 2 = 38; S = 3 − 2·log2(38/13) → clamps to 1; w = 3/5; P = 2: 0.4·2 + 0.6·1 = 1.4.
    expect(difficultyOf(s, "push_up_standard", T0 + D)).toMatchObject({ score: 1.4, label: "too_easy", source: "personal" });
  });

  it("weighted: dumbbells too light reads as too easy, with the reason, once measured", () => {
    const s = run([], { equipment: ["dumbbell"], dumbbells: { kind: "fixed", kg: [2, 3] } });
    s.strength.db_curl = { oneRm: 14, obs: 4, lastPerformed: T0, lastWeightKg: 3 };
    const d = difficultyOf(s, "db_curl", T0 + D);
    expect(d.reasons).toContain("dumbbells too light");
    expect(d.score).toBeLessThan(1.5);
  });

  it("an unmeasured rung next to a measured one gets neighbourTrust", () => {
    const s = run([]);
    s.capacity.push_up_standard = { M: 40, obs: 3, lastPerformed: T0 };
    expect(difficultyOf(s, "push_up_decline", T0 + D).source).toBe("personal");
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `npx vitest run tests/difficulty.test.ts`. Expected: FAIL.

- [ ] **Step 3: Create `src/engine/difficulty.ts`:**

```ts
import { ladderExercises } from "./catalog";
import { capacityOf, chooseWeight, targetRir, type LoadFlag } from "./capacity";
import { byLevel, ladderLevel } from "./level";
import { repsAt, strengthOf } from "./strength";
import { clamp, type EngineState, type Exercise, type Rating } from "./types";

export type DifficultyLabel = "too_easy" | "easy" | "right_challenge" | "hard" | "too_hard";

export interface PersonalDifficulty {
  /** 1 (too easy to be useful) .. 5 (too hard), one decimal. */
  score: number;
  label: DifficultyLabel;
  /** "predicted" = the library rating at the user's level only; "personal" = the user's data moved it. */
  source: "predicted" | "personal";
  /** Up to two demand tags that are hard for this user, plus strength reasons once measured. */
  reasons: string[];
}

const RATING_VALUE: Record<Rating, number> = { too_easy: -1, just_right: 0, too_hard: 1 };

export function difficultyLabel(score: number): DifficultyLabel {
  return score < 1.5 ? "too_easy" : score < 2.5 ? "easy" : score < 3.5 ? "right_challenge" : score < 4.5 ? "hard" : "too_hard";
}

/** Fold step for a one-tap rating: updates this exercise's rating average and the offset of each of its demand tags. */
export function applyRating(s: EngineState, exerciseId: string, rating: Rating): void {
  const ex = s.catalog.byId[exerciseId];
  if (!ex) return;
  const P = s.params.difficulty;
  const r = RATING_VALUE[rating];
  const prev = s.ratings[ex.id] ?? 0;
  s.ratings[ex.id] = prev + P.ratingAlpha * (r - prev);
  for (const k of ex.demands) {
    s.demandOffsets[k] = clamp(s.demandOffsets[k] + P.demandAlpha * (r - s.demandOffsets[k]), -P.demandMax, P.demandMax);
  }
}

/** S: 3 at mid-range target reps, 1 at twice that, 5 at half. */
const fitScore = (targetReps: number, mid: number) => clamp(3 - 2 * Math.log2(Math.max(targetReps, 1e-9) / mid), 1, 5);

/** Strength fit S, clean observations n, and the load flag; null when a weighted exercise has no owned dumbbells. */
function strengthFit(s: EngineState, ex: Exercise, now: number): { S: number; n: number; flag: LoadFlag } | null {
  const rir = targetRir(s, now);
  if (ex.weighted) {
    const choice = chooseWeight(s, ex.id, now);
    if (!choice) return null;
    const [lo, hi] = s.params.strength.repRange;
    const target = repsAt(strengthOf(s, ex, now).oneRm, choice.weightKg) - rir;
    const S = choice.loadFlag === "too_heavy" ? 5 : choice.loadFlag === "too_light" ? 1 : fitScore(target, (lo + hi) / 2);
    return { S, n: s.strength[ex.id]?.obs ?? 0, flag: choice.loadFlag };
  }
  const [lo, hi] = s.params.capacity.repRange;
  return { S: fitScore(capacityOf(s, ex.id, now).M - rir, (lo + hi) / 2), n: s.capacity[ex.id]?.obs ?? 0, flag: null };
}

/** Another rung of this exercise's ladder has been measured. */
const ladderMeasured = (s: EngineState, ex: Exercise) =>
  ladderExercises(s.catalog, ex.ladderId).some((o) => o.id !== ex.id && ((s.capacity[o.id]?.obs ?? 0) > 0 || (s.strength[o.id]?.obs ?? 0) > 0));

/**
 * Personal difficulty (spec §3), derived on every read so it never drifts from the state:
 * clamp((1 − w)·P + w·S + R + D, 1, 5), with P the library rating at the user's level, S the strength fit,
 * w = n / (n + trustK) (or neighbourTrust for an unmeasured rung beside a measured one), R the rating average
 * and D the mean demand offset.
 */
export function difficultyOf(s: EngineState, exerciseId: string, now: number): PersonalDifficulty {
  const ex = s.catalog.byId[exerciseId];
  if (!ex) throw new Error(`unknown exercise ${exerciseId}`);
  const P = s.params.difficulty;
  const predicted = byLevel(ex.difficulty, ladderLevel(s, ex.ladderId));
  const fit = strengthFit(s, ex, now);
  const w = !fit ? 0 : fit.n > 0 ? fit.n / (fit.n + P.trustK) : ladderMeasured(s, ex) ? P.neighbourTrust : 0;
  const R = s.ratings[ex.id] ?? 0;
  const D = ex.demands.length ? ex.demands.reduce((a, k) => a + s.demandOffsets[k], 0) / ex.demands.length : 0;
  const score = Math.round(clamp((1 - w) * predicted + w * (fit?.S ?? 0) + R + D, 1, 5) * 10) / 10;

  const reasons = [...ex.demands]
    .filter((k) => s.demandOffsets[k] > 0.25)
    .sort((a, b) => s.demandOffsets[b] - s.demandOffsets[a])
    .slice(0, 2) as string[];
  if (fit && w > 0) {
    if (fit.flag === "too_light") reasons.push("dumbbells too light");
    else if (fit.flag === "too_heavy") reasons.push("dumbbells too heavy");
    else if (fit.S >= 4) reasons.push("not enough reps");
  }
  return { score, label: difficultyLabel(score), source: w === 0 && R === 0 && D === 0 ? "predicted" : "personal", reasons };
}
```

- [ ] **Step 4: Fold applies ratings.** In `src/engine/fold.ts`, add `import { applyRating } from "./difficulty";` and in the `exercise_feedback` case, destructure `rating` too and apply it:

```ts
    case "exercise_feedback": {
      const { exerciseId, liked, pain, rating } = e.payload;
      const f = (s.feedback[exerciseId] ??= { liked: null, painTs: null });
      if (liked !== undefined) f.liked = liked;
      if (pain !== undefined) f.painTs = pain ? e.ts : null;
      if (rating !== undefined) applyRating(s, exerciseId, rating);
      break;
    }
```

- [ ] **Step 5: Export it.** In `src/engine/index.ts` add `export * from "./difficulty";`.

- [ ] **Step 6: Run to verify it passes.** Run: `npx vitest run tests/difficulty.test.ts`. Expected: PASS.

- [ ] **Step 7: Checkpoint.** Run: `npx tsc --noEmit && npx vitest run`. Expected: all pass.

---

### Task 8: Planner uses difficulty

**Files:**
- Modify: `src/engine/planner.ts`, `src/cli/report.ts`
- Test: `tests/difficulty.plan.test.ts` (create)

**Interfaces:**
- Consumes: `difficultyOf`, `PersonalDifficulty` (Task 7).
- Produces:
  - `withinDifficulty(s: EngineState, cands: Exercise[], now: number): Exercise[]`
  - `PlannedExercise.difficulty: PersonalDifficulty`

- [ ] **Step 1: Write the failing test.** Create `tests/difficulty.plan.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { planSession, replay, withinDifficulty, type EngineEvent } from "../src/engine";
import { catalog, H, params, profile, T0 } from "./helpers";

const D = 24 * H;
const pistol = catalog.byId.pistol_squat!;
const squat = catalog.byId.squat_bodyweight!;

describe("difficulty in planning", () => {
  it("drops too-hard candidates unless every candidate is too hard", () => {
    const s = replay([profile(T0 - D)] as EngineEvent[], catalog, params((p) => { p.difficulty.excludeAbove = 3.5; }));
    expect(withinDifficulty(s, [pistol, squat], T0)).toEqual([squat]); // pistol 4 ≥ 3.5, squat 1
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
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `npx vitest run tests/difficulty.plan.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.** In `src/engine/planner.ts`:

Add `import { difficultyOf, type PersonalDifficulty } from "./difficulty";`.

Add `difficulty: PersonalDifficulty;` to `PlannedExercise` (after `loadFlag`).

Add this exported helper above `currentLevels`:

```ts
/** Candidates below difficulty.excludeAbove; if none are, all of them (a too-hard option beats an empty slot). */
export function withinDifficulty(s: EngineState, cands: Exercise[], now: number): Exercise[] {
  const ok = cands.filter((e) => difficultyOf(s, e.id, now).score < s.params.difficulty.excludeAbove);
  return ok.length ? ok : cands;
}
```

Replace the `const slots = ...` line with:

```ts
  const slots = best.t.slots.map((pattern) =>
    withinDifficulty(s, currentLevels(s, s.catalog.exercises.filter((e) => e.pattern === pattern && canUse(e)), now), now),
  );
```

In `evaluate`, directly after the `const score = gain.reduce(...) + (liked === true ? ... : 0);` statement, add:

```ts
    // Prefer exercises that are the right challenge: f = 1 − preferWeight·|difficulty − 3| / 2 (in [0.7, 1]).
    // A negative score is divided instead, so a poor fit always counts against the candidate.
    const difficulty = difficultyOf(s, ex.id, now);
    const fit = 1 - (P.difficulty.preferWeight * Math.abs(difficulty.score - 3)) / 2;
    const fitted = score >= 0 ? score * fit : score / fit;
```

and in that function's `return`, replace `score,` with `score: fitted,` and add `difficulty` to the `pr` object:

```ts
pr: { exerciseId: ex.id, sets, firstSetMode: pr.firstSetMode, reasons, loadFlag: pr.loadFlag, difficulty }
```

Also add after the `if (liked === true) reasons.push(...)` line:

```ts
    if (difficulty.source === "personal" && difficulty.score >= 3.5) {
      reasons.push(`Hard for you${difficulty.reasons.length ? `: ${difficulty.reasons.join(", ")}` : ""}`);
    }
```

- [ ] **Step 4: Report shows difficulty.** In `src/cli/report.ts`, after the line that pushes ``   ${e.sets.length} sets: ${sets}``, add:

```ts
    out.push(`   difficulty for you: ${e.difficulty.score} (${e.difficulty.label.replace("_", " ")}, ${e.difficulty.source})`);
```

- [ ] **Step 5: Run to verify it passes.** Run: `npx vitest run tests/difficulty.plan.test.ts`. Expected: PASS.

- [ ] **Step 6: Run the full suite and review planner changes.** Run: `npx tsc --noEmit && npx vitest run`. Expected: all pass. If a pre-existing planner, level, sim or CLI test fails, it is because difficulty scoring now ranks candidates differently. For each failure, print the old and new pick with `npx tsx src/cli/plan.ts --file fixtures/events.sample.json` (or the test's own events) and confirm the new pick has a difficulty nearer 3. Update only that assertion. Leave a one-line comment naming the difficulty reason. Record every such change in DECISIONS (Task 10).

- [ ] **Step 7: Checkpoint.** Run: `npx tsc --noEmit && npx vitest run`. Expected: all pass.

---

### Task 9: Invariants, fuzz and simulation

**Files:**
- Test: `tests/weights.properties.test.ts` (create), `tests/weights.sim.test.ts` (create)

**Interfaces:**
- Consumes: all previous tasks; `Rng` from `src/sim/rng.ts` (tests may import `sim`; only engine code may not).

- [ ] **Step 1: Write the property and fuzz tests.** Create `tests/weights.properties.test.ts`:

```ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { difficultyOf, planSession, prescribe, replay, type EngineEvent, type Rating } from "../src/engine";
import { catalog, ev, H, params, profile, session, T0 } from "./helpers";

const p = params();
const D = 24 * H;
const WEIGHTED = catalog.exercises.filter((e) => e.weighted).map((e) => e.id);
const ALL = catalog.exercises.map((e) => e.id);
const owner = (kg: number[]) => profile(T0 - D, { equipment: ["dumbbell", "bench"], bodyMassKg: 70, dumbbells: { kind: "fixed", kg } });

describe("invariants", () => {
  it("prescriptions only use owned weights, with at least 1 rep or second per set", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 160 }).map((x) => x / 4), { minLength: 1, maxLength: 12 }),
        fc.double({ min: 2, max: 120, noNaN: true }),
        fc.integer({ min: 1, max: 6 }),
        fc.constantFrom(...WEIGHTED),
        (kg, oneRm, sets, id) => {
          const s = replay([owner(kg)], catalog, p);
          s.strength[id] = { oneRm, obs: 1, lastPerformed: T0, lastWeightKg: null };
          const pr = prescribe(s, id, sets, T0 + D);
          return pr.sets.length === sets && pr.sets.every((x) => x.weightKg !== undefined && kg.includes(x.weightKg) && (x.reps ?? x.seconds!) >= 1);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("difficulty always lies in [1, 5] and is finite", () => {
    const RATINGS: Rating[] = ["too_easy", "just_right", "too_hard"];
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.constantFrom(...ALL), fc.constantFrom(...RATINGS)), { maxLength: 30 }),
        fc.double({ min: 0.5, max: 200, noNaN: true }),
        (ratings, M) => {
          const s = replay([owner([5, 10, 15]), ...ratings.map(([id, rating], i) => ev(T0 + i, { type: "exercise_feedback", payload: { exerciseId: id, rating } }))], catalog, p);
          s.capacity.push_up_standard = { M, obs: 2, lastPerformed: T0 };
          return ALL.every((id) => {
            const d = difficultyOf(s, id, T0 + D).score;
            return Number.isFinite(d) && d >= 1 && d <= 5;
          });
        },
      ),
      { numRuns: 60 },
    );
  });

  it("replaying the same weighted history twice gives deep-equal state", () => {
    const events: EngineEvent[] = [
      owner([5, 7.5, 10, 12.5]),
      ev(T0 - H, { type: "usual_weight", payload: { exerciseId: "db_curl", weightKg: 10, reps: 10 } }),
      ...session(T0, "a", [["push_up_standard", 15, 2]]),
      ev(T0 + H, { type: "exercise_feedback", payload: { exerciseId: "db_curl", rating: "too_hard" } }),
    ];
    expect(replay(events, catalog, p)).toEqual(replay(events, catalog, p));
  });

  it("garbage weights are rejected and never corrupt state", () => {
    const bad = [Number.NaN, -1, 0, 1e9, Number.POSITIVE_INFINITY].map((weightKg, i) =>
      ev(T0 + i, { type: "set_logged", payload: { sessionId: "x", exerciseId: "db_curl", reps: 10, rir: 2, isWarmup: false, isAmrap: false, weightKg } }),
    );
    const s = replay([owner([5, 10]), ...bad], catalog, p);
    expect(s.rejected).toHaveLength(bad.length);
    expect(s.strength).toEqual({});
    const plan = planSession(s, { now: T0 + D });
    for (const x of plan.exercises) for (const set of x.sets) expect(Number.isFinite(set.reps ?? set.seconds!)).toBe(true);
  });
});
```

- [ ] **Step 2: Write the simulation test.** Create `tests/weights.sim.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { difficultyOf, prescribe, replay, type EngineEvent } from "../src/engine";
import { Rng } from "../src/sim/rng";
import { catalog, ev, H, params, profile, T0 } from "./helpers";

const p = params();
const D = 24 * H;

/**
 * A synthetic lifter on db_curl with a true 1RM of 11 kg rising 1.5% per session. They take the engine's weight.
 * On a technical-failure set they stop 1 rep short of failure and say so. Otherwise they do the target reps
 * (±1, never past failure) and under-report reps left by about 1 (Steele et al. 2017).
 */
describe("simulation: a dumbbell lifter", () => {
  it("learns their strength within 10% by session 6, progresses the weight, and ratings raise difficulty", () => {
    const rng = new Rng(7);
    const events: EngineEvent[] = [profile(T0 - D, { equipment: ["dumbbell"], bodyMassKg: 70, dumbbells: { kind: "adjustable", minKg: 2, maxKg: 30, stepKg: 1 } })];
    let trueOneRm = 11;
    const chosen: number[] = [];
    let s = replay(events, catalog, p);
    for (let i = 0; i < 8; i++) {
      const now = T0 + i * 3 * D;
      const pr = prescribe(s, "db_curl", 1, now);
      const w = pr.sets[0]!.weightKg!;
      chosen.push(w);
      const trueM = Math.max(1, 30 * (trueOneRm / w - 1));
      let reps: number;
      let rir: number;
      if (pr.firstSetMode === "technical_failure") {
        reps = Math.max(1, Math.floor(trueM) - 1);
        rir = 1;
      } else {
        reps = Math.max(1, Math.min(Math.floor(trueM), Math.round(pr.sets[0]!.reps! + rng.normal(0, 1))));
        rir = Math.max(0, Math.min(5, Math.round(trueM - reps - 1 + rng.normal(0, 0.5))));
      }
      events.push(
        ev(now, { type: "session_started", payload: { sessionId: `s${i}` } }),
        ev(now, { type: "set_logged", payload: { sessionId: `s${i}`, exerciseId: "db_curl", reps, rir, isWarmup: false, isAmrap: false, weightKg: w } }),
        ev(now, { type: "session_ended", payload: { sessionId: `s${i}` } }),
      );
      s = replay(events, catalog, p);
      if (i === 5) expect(Math.abs(s.strength.db_curl!.oneRm - trueOneRm) / trueOneRm).toBeLessThan(0.1);
      trueOneRm *= 1.015;
    }
    expect(chosen.at(-1)!).toBeGreaterThan(chosen[0]!);

    const end = T0 + 30 * D;
    const before = difficultyOf(s, "db_curl", end).score;
    for (let k = 0; k < 3; k++) events.push(ev(end + k, { type: "exercise_feedback", payload: { exerciseId: "db_curl", rating: "too_hard" } }));
    expect(difficultyOf(replay(events, catalog, p), "db_curl", end + H).score).toBeGreaterThan(before);
  });
});
```

- [ ] **Step 3: Run them.** Run: `npx vitest run tests/weights.properties.test.ts tests/weights.sim.test.ts`. Expected: PASS. If the simulation's 10% check fails, print `s.strength.db_curl` and `trueOneRm` per session to see where it lags. Fix the cause in the engine, not the threshold: the threshold is a spec requirement.

- [ ] **Step 4: Checkpoint.** Run: `npx tsc --noEmit && npx vitest run`. Expected: all pass.

---

### Task 10: CLI and documentation

**Files:**
- Modify: `src/cli/library.ts`, `SPEC.md`, `DECISIONS.md`

- [ ] **Step 1: Library browser shows demands and load norms.** In `src/cli/library.ts`, change the per-exercise `console.log(...)` to append demands and, for weighted exercises, the intermediate load norm:

```ts
      console.log(
        `  ${e.name.padEnd(36)} targets ${e.targets.join(", ").padEnd(22)} difficulty ${d.beginner}/${d.intermediate}/${d.advanced}` +
          (e.secondary.length ? `  also ${[...e.secondary, ...also].join(", ")}` : also.length ? `  also ${also.join(", ")}` : "") +
          (e.demands.length ? `  hard: ${e.demands.join(", ")}` : "") +
          (e.weighted ? `  [${e.dumbbells} × dumbbell, typical 1RM ${e.loadNorm!.intermediate} × body mass]` : ""),
      );
```

Run: `npm run -s library -- --target biceps --equipment dumbbell,bench`. Expected: a list including `Dumbbell curl ... [2 × dumbbell, typical 1RM 0.15 × body mass]`.

- [ ] **Step 2: SPEC.** In `SPEC.md`:
- Under `### 5.5 Capacity, prediction, prescription`, add a final paragraph: `**Weighted exercises** (dumbbells) store a one-dumbbell 1RM instead of M and are predicted, prescribed and calibrated at a weight: see docs/superpowers/specs/2026-10-02-weights-and-adaptive-difficulty-design.md §2.`
- Under `### 5.8 Planner`, add: `**Difficulty**: candidates at or above difficulty.excludeAbove are dropped unless all are; scores are scaled by the difficulty fit (design doc §3).`

- [ ] **Step 3: DECISIONS.** Append to `DECISIONS.md`:

```markdown
## Weights and adaptive difficulty (user-approved)

Design: `docs/superpowers/specs/2026-10-02-weights-and-adaptive-difficulty-design.md`; plan: `docs/superpowers/plans/2026-10-02-weights-and-adaptive-difficulty.md`.
- **Strength model:** one-dumbbell 1RM per weighted exercise, Epley curve `reps = 30·(1RM/w − 1)`. The existing fatigue maths runs unchanged in reps at the chosen weight, so calibration (rho, d, b, deload) learns from dumbbell sets too.
- **Weight choice:** keep last time's weight while in `strength.repRange` [6, 15]; else nearest mid-range (tie heavier); else flagged too heavy / too light; else, when the range falls between two owned weights, the weight nearest the range (tie lighter). Too light caps reps at 15.
- **Starting estimate:** the "usual weight" answer (assumed 2 reps short of failure), else body mass × loadNorm × 0.85 (70 kg when body mass is unknown). The first set is a technical-failure test.
- **Missing data:** a weighted set without a weight deposits fatigue but teaches nothing. A weight on a bodyweight exercise is ignored. Acute and AMRAP learning only compare sets at the same weight.
- **Difficulty is derived, never stored:** library rating at the user's level, blended toward the strength fit as measurements accrue (w = n/(n+2)), plus rating and demand offsets. Ratings teach per-demand offsets that transfer to unrated exercises with the same demand.
- **Planner:** weighted exercises only when dumbbells are owned (`canLoad`); too-hard candidates (≥ 4.5) dropped unless all are; scores scaled by fit to 3 (factor 0.7–1).
- **Catalog:** now holds every library exercise; the old "unweighted only" filter moved into `canLoad`.
```

If Task 8 Step 6 changed any pre-existing test expectation, add one bullet per change naming the test and the reason.

- [ ] **Step 4: Final checkpoint.** Run: `npx tsc --noEmit && npx vitest run`. Expected: no type errors; every test passes, with the new files `weights.schema`, `strength`, `weights.prescribe`, `weights.learn`, `weights.plan`, `difficulty`, `difficulty.plan`, `weights.properties` and `weights.sim` all included.
