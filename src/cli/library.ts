// npm run library -- [--equipment dumbbell,bench] [--target chest] [--uses obliques] [--experience beginner] [--max 3]
// Lists the exercise library grouped by the equipment each exercise needs, after optional filters.
import { parseArgs } from "node:util";
import raw from "../../catalog/library";
import { findExercises, groupByEquipment, loadLibrary, type Equipment, type Experience, type Muscle, type Region } from "../library";

const list = <T extends string>(v: string | undefined) => (v === undefined ? undefined : (v.split(",").filter(Boolean) as T[]));

try {
  const { values } = parseArgs({
    options: {
      equipment: { type: "string" }, target: { type: "string" }, uses: { type: "string" },
      experience: { type: "string" }, max: { type: "string" },
    },
  });
  const lib = loadLibrary(raw);
  const matches = findExercises(lib, {
    equipment: list<Equipment>(values.equipment),
    targets: list<Region>(values.target),
    uses: list<Muscle>(values.uses),
    experience: values.experience as Experience | undefined,
    maxDifficulty: values.max === undefined ? undefined : Number(values.max),
  });
  const groups = groupByEquipment({ ...lib, exercises: matches });
  for (const [equipment, exercises] of Object.entries(groups)) {
    console.log(`\n${equipment} (${exercises.length})`);
    for (const e of exercises) {
      const d = e.difficulty;
      const also = e.muscles.slice(e.targets.length + e.secondary.length);
      console.log(
        `  ${e.name.padEnd(36)} targets ${e.targets.join(", ").padEnd(22)} difficulty ${d.beginner}/${d.intermediate}/${d.advanced}` +
          (e.secondary.length ? `  also ${[...e.secondary, ...also].join(", ")}` : also.length ? `  also ${also.join(", ")}` : "") +
          (e.demands.length ? `  hard: ${e.demands.join(", ")}` : "") +
          (e.weighted ? `  [${e.dumbbells} × dumbbell, typical 1RM ${e.loadNorm!.intermediate} × body mass]` : ""),
      );
    }
  }
  console.log(`\n${matches.length} of ${lib.exercises.length} exercises. Difficulty is beginner/intermediate/advanced, 1 (too easy) to 5 (too hard).`);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
