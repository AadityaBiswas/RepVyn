// Builds a believable saved state for looking at the app mid-program: three weeks of workouts ending on a legs day.
//   npx tsx tests/seed-demo.ts > out/demo-state.json     then put it in localStorage under "home-v2"
import { isLegsDay, makePlan, planRegions, planTitle } from "../app/src/model";
import { DEFAULT_SETTINGS, append, engineState, fresh, withProfile, type Saved } from "../app/src/store";
import { answer, asksLeft, fromPlan, nextSet, setDone, start, toEvents } from "../app/src/workout";

const DAY = 86_400_000;

function play(s: Saved, now: number): Saved {
  const state = engineState(s);
  const plan = makePlan(state, now, { minutes: 40, intensity: "normal", equipment: s.settings.equipment });
  if (plan.kind !== "workout") return s;
  let r = start(fromPlan(state, plan), now);
  let t = now;
  while (r.phase !== "done") {
    t += 45_000;
    r = setDone(r, t);
    if (asksLeft(r)) r = answer(r, "2");
    if (r.phase === "ask") r = { ...r, phase: "done" };
    else if (r.phase === "rest") r = nextSet(r);
  }
  return append(s, toEvents(r, crypto.randomUUID(), t + 1000));
}

const now = Date.now();
// Try the days-ago patterns until today's plan comes out as a legs day.
for (const last of [[5, 3, 2], [4, 2, 1], [5, 3, 1], [6, 4, 2], [3, 2, 1], [5, 2], [4, 1]]) {
  const began = now - 16 * DAY;
  let s = fresh(began);
  s = withProfile({ ...s, onboarded: true, programStart: began, settings: { ...DEFAULT_SETTINGS } }, began);
  for (const ago of [16, 14, 12, 9, 8, ...last]) s = play(s, now - ago * DAY - 3_600_000);
  const state = engineState(s);
  const plan = makePlan(state, now, { minutes: 40, intensity: "normal", equipment: [] });
  const legs = plan.kind === "workout" && isLegsDay(planRegions(state, plan));
  console.error(last.join(","), planTitle(plan), legs ? "legs day" : "");
  if (legs) {
    console.log(JSON.stringify(s));
    break;
  }
}
