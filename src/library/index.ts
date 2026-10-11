import {
  EXPERIENCES, LibraryFileSchema, MUSCLES, REGIONS,
  type Equipment, type Experience, type ExerciseRecord, type Ladder, type Muscle, type Pattern, type Region,
} from "./schema";

export * from "./schema";

/** A validated exercise with its ladder resolved and its muscle tags derived from contributions + alsoUses. */
export type LibraryExercise = ExerciseRecord & {
  ladderId: string;
  level: number;
  /** Regions at contribution 1. */
  targets: Region[];
  /** Regions at contribution 0.5 / 0.25. */
  secondary: Region[];
  /** Every muscle that works: targets, secondary, then alsoUses. */
  muscles: Muscle[];
};

export interface Library {
  /** Declared ladders plus one implicit one-rung ladder per stand-alone exercise. Sorted by id. */
  ladders: Ladder[];
  /** Sorted by id. */
  exercises: LibraryExercise[];
  byId: Record<string, LibraryExercise>;
}

const order = <T extends string>(list: readonly T[]) => (a: T, b: T) => list.indexOf(a) - list.indexOf(b);

/**
 * Validate raw library data (`{ ladders, exercises }`) and derive tags. Throws listing every problem.
 * Cross-record rules: unique ids, ladder rungs contiguous from 1, one weighted-ness per ladder,
 * difficulty never rising with experience and never falling up a ladder.
 */
export function loadLibrary(raw: unknown): Library {
  const file = LibraryFileSchema.parse(raw);
  const errors: string[] = [];
  const declared = new Map(file.ladders.map((l) => [l.id, l]));
  if (declared.size !== file.ladders.length) errors.push("duplicate ladder id");

  const seen = new Set<string>();
  const exercises: LibraryExercise[] = file.exercises.map((e) => {
    if (seen.has(e.id)) errors.push(`duplicate exercise id ${e.id}`);
    seen.add(e.id);
    if ((e.ladderId === undefined) !== (e.level === undefined)) errors.push(`${e.id}: ladderId and level go together`);
    if (e.ladderId !== undefined && !declared.has(e.ladderId)) errors.push(`${e.id}: unknown ladder ${e.ladderId}`);
    if (e.ladderId === undefined && declared.has(e.id)) errors.push(`${e.id}: stand-alone exercise clashes with ladder ${e.id}`);
    const ones = Object.values(e.contributions).filter((c) => c === 1).length;
    if (ones < 1 || ones > 2) errors.push(`${e.id}: needs 1 or 2 regions at contribution 1, has ${ones}`);
    if (new Set(e.equipment).size !== e.equipment.length) errors.push(`${e.id}: duplicate equipment tag`);
    if (new Set(e.alsoUses).size !== e.alsoUses.length) errors.push(`${e.id}: duplicate alsoUses tag`);
    for (const m of e.alsoUses) if (m in e.contributions) errors.push(`${e.id}: ${m} is in both contributions and alsoUses`);
    if (e.equipment.includes("dumbbell") !== e.weighted) errors.push(`${e.id}: weighted must be true exactly when it uses a dumbbell`);
    if (e.weighted && e.defaultM) errors.push(`${e.id}: weighted exercises have no defaultM (reps depend on the weight)`);
    if (new Set(e.demands).size !== e.demands.length) errors.push(`${e.id}: duplicate demand tag`);
    if ((e.loadNorm !== undefined) !== e.weighted) errors.push(`${e.id}: loadNorm is required exactly for weighted exercises`);
    if ((e.dumbbells !== undefined) !== e.weighted) errors.push(`${e.id}: dumbbells is required exactly for weighted exercises`);
    if (e.loadNorm && !(e.loadNorm.beginner < e.loadNorm.intermediate && e.loadNorm.intermediate < e.loadNorm.advanced)) {
      errors.push(`${e.id}: loadNorm must ascend from beginner to advanced`);
    }
    const d = e.difficulty;
    if (!(d.beginner >= d.intermediate && d.intermediate >= d.advanced)) errors.push(`${e.id}: difficulty must not rise with experience`);

    const regions = (Object.keys(e.contributions) as Region[]).sort(order(REGIONS));
    const targets = regions.filter((r) => e.contributions[r] === 1);
    const secondary = regions.filter((r) => e.contributions[r] !== 1);
    return {
      ...e,
      ladderId: e.ladderId ?? e.id,
      level: e.level ?? 1,
      targets,
      secondary,
      muscles: [...targets, ...secondary, ...[...e.alsoUses].sort(order(MUSCLES))],
    };
  });

  const ladders: Ladder[] = [...file.ladders];
  for (const e of exercises) if (!declared.has(e.ladderId)) ladders.push({ id: e.ladderId, name: e.name, stepRatio: 0.6 });
  for (const l of ladders) {
    const rungs = exercises.filter((e) => e.ladderId === l.id).sort((a, b) => a.level - b.level);
    if (rungs.length === 0) errors.push(`ladder ${l.id} has no exercises`);
    if (rungs.some((e, i) => e.level !== i + 1)) errors.push(`ladder ${l.id}: levels must be unique and contiguous from 1, got [${rungs.map((e) => e.level).join(",")}]`);
    if (new Set(rungs.map((e) => e.weighted)).size > 1) errors.push(`ladder ${l.id}: mixes weighted and unweighted exercises`);
    for (let i = 1; i < rungs.length; i++) {
      for (const x of EXPERIENCES) {
        if (rungs[i]!.difficulty[x] < rungs[i - 1]!.difficulty[x]) errors.push(`ladder ${l.id}: ${rungs[i]!.id} is rated easier for ${x} than the rung below it`);
      }
    }
  }

  if (errors.length) throw new Error(`Invalid exercise library:\n${[...new Set(errors)].join("\n")}`);
  exercises.sort((a, b) => a.id.localeCompare(b.id));
  ladders.sort((a, b) => a.id.localeCompare(b.id));
  return { ladders, exercises, byId: Object.fromEntries(exercises.map((e) => [e.id, e])) };
}

export interface ExerciseQuery {
  /** Equipment the user has: keeps exercises whose every need is available ([] = bodyweight only). */
  equipment?: readonly Equipment[];
  /** Keeps exercises that target (contribution 1) any of these. */
  targets?: readonly Region[];
  /** Keeps exercises that work any of these at all (targets, secondary or alsoUses). */
  uses?: readonly Muscle[];
  pattern?: Pattern | readonly Pattern[];
  weighted?: boolean;
  /** With maxDifficulty (default 4): keeps exercises scored at most that for this experience. */
  experience?: Experience;
  maxDifficulty?: number;
}

/** Exercises matching every given filter, in id order. */
export function findExercises(lib: Library, q: ExerciseQuery = {}): LibraryExercise[] {
  const patterns = q.pattern === undefined ? undefined : ([] as Pattern[]).concat(q.pattern);
  const max = q.maxDifficulty ?? 4;
  return lib.exercises.filter(
    (e) =>
      (q.equipment === undefined || e.equipment.every((t) => q.equipment!.includes(t))) &&
      (q.targets === undefined || e.targets.some((r) => q.targets!.includes(r))) &&
      (q.uses === undefined || e.muscles.some((m) => q.uses!.includes(m))) &&
      (patterns === undefined || patterns.includes(e.pattern)) &&
      (q.weighted === undefined || e.weighted === q.weighted) &&
      (q.experience === undefined || e.difficulty[q.experience] <= max),
  );
}

/** Exercises grouped by the exact equipment they need ("bodyweight", "bench + dumbbell", ...), keys sorted. */
export function groupByEquipment(lib: Library): Record<string, LibraryExercise[]> {
  const groups: Record<string, LibraryExercise[]> = {};
  for (const e of lib.exercises) {
    const key = e.equipment.length ? [...e.equipment].sort().join(" + ") : "bodyweight";
    (groups[key] ??= []).push(e);
  }
  return Object.fromEntries(Object.keys(groups).sort().map((k) => [k, groups[k]!]));
}
