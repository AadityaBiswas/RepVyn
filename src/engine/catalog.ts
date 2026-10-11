import { loadLibrary, type Library } from "../library";
import { EXPERIENCES, ProgramsFileSchema, type DefaultM, type Exercise, type Ladder, type Program, type Template } from "./types";

export interface Catalog {
  ladders: Ladder[];
  /** Every library exercise, sorted by id. Weighted ones need owned dumbbells (strength.canLoad). */
  exercises: Exercise[];
  byId: Record<string, Exercise>;
  /** Training programs; the first is the default. */
  programs: Program[];
  /** The whole exercise library, weighted exercises included, for browsing and queries (findExercises). */
  library: Library;
}

/** Table order is the tie-break order. The default program's templates. */
export const TEMPLATES: Template[] = [
  { id: "full", slots: ["squat", "horizontal_push", "horizontal_pull", "hinge", "core"] },
  { id: "upper", slots: ["horizontal_push", "horizontal_pull", "vertical_push", "vertical_pull", "elbow_flexion", "elbow_extension"] },
  { id: "lower", slots: ["squat", "hinge", "single_leg", "calf", "core"] },
  { id: "push", slots: ["horizontal_push", "vertical_push", "elbow_extension", "core"] },
  { id: "pull", slots: ["horizontal_pull", "vertical_pull", "elbow_flexion", "rear_delt"] },
  { id: "legs", slots: ["squat", "single_leg", "hamstring_curl", "calf"] },
];

export const DEFAULT_PROGRAM: Program = { id: "balanced", name: "Balanced", emphasis: {}, templates: TEMPLATES };

/**
 * Build the planner's catalog from raw exercise-library data (catalog/library) and fill derived defaultM.
 * The library validates exercises and ladders; this keeps every exercise and checks programs against the unweighted ones. Throws listing every problem.
 * `rawPrograms` is a parsed programs.json; without it the catalog has only DEFAULT_PROGRAM.
 */
export function loadCatalog(raw: unknown, rawPrograms?: unknown): Catalog {
  const library = loadLibrary(raw);
  const plannable = library.exercises.filter((e) => !e.weighted);
  const programs = rawPrograms === undefined ? [DEFAULT_PROGRAM] : ProgramsFileSchema.parse(rawPrograms).programs;
  const errors: string[] = [];
  const programIds = new Set<string>();
  for (const p of rawPrograms === undefined ? [] : programs) {
    if (programIds.has(p.id)) errors.push(`duplicate program id ${p.id}`);
    programIds.add(p.id);
    const t = p.templates.map((x) => x.id);
    if (new Set(t).size !== t.length) errors.push(`program ${p.id}: duplicate template id`);
    for (const slot of p.templates.flatMap((x) => x.slots)) {
      if (!plannable.some((e) => e.pattern === slot)) errors.push(`program ${p.id}: no exercise for pattern ${slot}`);
    }
  }
  if (errors.length) throw new Error(`Invalid catalog:\n${[...new Set(errors)].join("\n")}`);

  // Weighted exercises stay in the catalog: the planner admits them only for users who own dumbbells (canLoad).
  const ladderIds = new Set(library.exercises.map((e) => e.ladderId));
  const ladders = library.ladders.filter((l) => ladderIds.has(l.id));
  const exercises = library.exercises.map((e) => (e.weighted || e.defaultM ? e : { ...e, defaultM: deriveDefaultM(e, plannable, ladders) }));
  return { ladders, exercises, byId: Object.fromEntries(exercises.map((e) => [e.id, e])), programs, library };
}

/** Nearest ladder neighbour with an explicit defaultM (ties: lower level), scaled by stepRatio^Δlevel. */
function deriveDefaultM(e: Exercise, all: Exercise[], ladders: Ladder[]): DefaultM | undefined {
  const ratio = ladders.find((l) => l.id === e.ladderId)!.stepRatio;
  const n = all
    .filter((o) => o.ladderId === e.ladderId && o.defaultM)
    .sort((a, b) => Math.abs(a.level - e.level) - Math.abs(b.level - e.level) || a.level - b.level)[0];
  if (!n?.defaultM) return undefined;
  const f = ratio ** (e.level - n.level);
  const src = n.defaultM;
  return Object.fromEntries(EXPERIENCES.map((x) => [x, src[x] * f])) as DefaultM;
}

/** Display name of a movement family (ladder name, else its id in words). */
export const ladderName = (catalog: Catalog, id: string): string =>
  catalog.ladders.find((l) => l.id === id)?.name ?? id.replaceAll("_", " ");

/** Exercises of a ladder, easiest first. */
export function ladderExercises(catalog: Catalog, ladderId: string): Exercise[] {
  return catalog.exercises.filter((e) => e.ladderId === ladderId).sort((a, b) => a.level - b.level);
}

/** Adjacent exercise on the same ladder: dir +1 = harder, -1 = easier. */
export function ladderNeighbour(catalog: Catalog, exerciseId: string, dir: 1 | -1): Exercise | undefined {
  const e = catalog.byId[exerciseId];
  if (!e) return undefined;
  return catalog.exercises.find((o) => o.ladderId === e.ladderId && o.level === e.level + dir);
}

export function stepRatio(catalog: Catalog, ladderId: string): number {
  const l = catalog.ladders.find((x) => x.id === ladderId);
  if (!l) throw new Error(`unknown ladder ${ladderId}`);
  return l.stepRatio;
}
