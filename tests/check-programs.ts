// A look at what each program actually hands out: four weeks at four workouts a week, hard sets per muscle per week.
//   npx tsx tests/check-programs.ts            the table
//   npx tsx tests/check-programs.ts days       every session too
import { REGIONS, REGION_NAMES } from "../src/engine";
import { makePlan, planTitle } from "../shared/model";
import { DEFAULT_SETTINGS, append, engineState, fresh, withProfile, type Saved } from "../shared/store";
import { answer, asksLeft, fromPlan, nextSet, setDone, start, toEvents } from "../shared/workout";

const DAY = 86_400_000;
const t0 = new Date(2026, 9, 5, 18).getTime();
const verbose = process.argv.includes("days");
for (const programId of ["balanced", "upper_body", "legs_glutes"]) {
  let s: Saved = fresh(t0);
  s = withProfile({ ...s, onboarded: true, programStart: t0, settings: { ...DEFAULT_SETTINGS, programId, equipment: ["dumbbell", "pullup_bar", "chair"] } }, t0);
  // Sets where the muscle is the target, and "weighted" sets counting a helper at its share (0.5, 0.25).
  const main = Object.fromEntries(REGIONS.map((m) => [m, 0]));
  const weighted = Object.fromEntries(REGIONS.map((m) => [m, 0]));
  const days: string[] = [];
  let total = 0;
  for (let week = 0; week < 4; week++) {
    for (const d of [0, 1, 3, 4]) {
      const now = t0 + (week * 7 + d) * DAY;
      const state = engineState(s);
      const plan = makePlan(state, now, { minutes: 40, intensity: "normal", equipment: s.settings.equipment });
      days.push(planTitle(plan));
      if (plan.kind !== "workout") continue;
      for (const x of plan.exercises) {
        total += x.sets.length;
        for (const m of REGIONS) {
          const c = state.catalog.byId[x.exerciseId]!.contributions[m] ?? 0;
          weighted[m] = (weighted[m] ?? 0) + c * x.sets.length;
          if (c === 1) main[m] = (main[m] ?? 0) + x.sets.length;
        }
      }
      if (verbose) console.log(`  w${week + 1} d${d} ${planTitle(plan)} ${Math.round(plan.estMinutes)}min: ${plan.exercises.map((x) => `${state.catalog.byId[x.exerciseId]!.name} x${x.sets.length}`).join(", ")}`);
      let r = start(fromPlan(state, plan), now);
      let t = now;
      while (r.phase !== "done") {
        t += 45_000;
        r = setDone(r, t);
        if (asksLeft(r)) r = answer(r, "2");
        if (r.phase === "ask") r = { ...r, phase: "done" };
        else if (r.phase === "rest") r = nextSet(r);
      }
      s = append(s, toEvents(r, crypto.randomUUID(), t + 1000));
    }
  }
  const after = engineState(s);
  const at = t0 + 28 * DAY;
  const byTime = [20, 30, 40, 50].map((minutes) => {
    const plan = makePlan(after, at, { minutes, intensity: "normal", equipment: s.settings.equipment });
    return `${minutes} min: ${plan.exercises.length} exercises, ${plan.exercises.reduce((n, x) => n + x.sets.length, 0)} sets, ${Math.round(plan.estMinutes)} min used`;
  });
  console.log(`\n${programId}: ${(total / 16).toFixed(1)} sets a session. ${days.slice(0, 8).join(", ")} ...`);
  console.log("  target sets/week:   " + REGIONS.map((m) => `${REGION_NAMES[m]} ${(main[m]! / 4).toFixed(1)}`).join(" | "));
  console.log("  week 5, by time given: " + byTime.join(" | "));
  console.log("  with helper shares: " + REGIONS.map((m) => `${REGION_NAMES[m]} ${(weighted[m]! / 4).toFixed(1)}`).join(" | "));
}
