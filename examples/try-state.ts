// Hands-on playground for the engine queries (milestones 3-6). Edit EVENTS / CHECK_AT and re-run:  npm run try
import rawCatalog from "../catalog/library";
import rawParams from "../params/default.params.json";
import {
  confidence, deloadActiveAt, isCalibrating, loadCatalog, parseParams, planSession, predictSet, prescribe, readiness, replay, systemic, weeklyNeed,
  type EngineEvent,
} from "../src/engine";

const H = 3_600_000;
const DAY = 24 * H;
const T0 = Date.UTC(2026, 0, 5, 18); // Mon 5 Jan 2026, 18:00 UTC

let seq = 0;
const ev = (ts: number, type: EngineEvent["type"], payload: object) =>
  ({ id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`, userId: "me", ts, seq, schemaVersion: 1, type, payload }) as EngineEvent;
const workout = (day: number, id: string, sets: [exerciseId: string, reps: number, rir: number][]) => {
  const ts = T0 + day * DAY;
  return [
    ev(ts, "session_started", { sessionId: id }),
    ...sets.map(([exerciseId, reps, rir]) => ev(ts, "set_logged", { sessionId: id, exerciseId, reps, rir, isWarmup: false, isAmrap: false })),
    ev(ts, "session_ended", { sessionId: id }),
  ];
};

const FULL_BODY: [string, number, number][] = [
  ["squat_bodyweight", 15, 2], ["squat_bodyweight", 15, 2],
  ["push_up_standard", 12, 2], ["push_up_standard", 12, 2],
  ["glute_bridge", 20, 2], ["glute_bridge", 20, 2],
  ["prone_y_t_raise", 12, 2], ["prone_y_t_raise", 12, 2],
];

const EVENTS: EngineEvent[] = [
  ev(T0, "profile_set", {
    goal: "muscle", experience: "intermediate", equipment: [], excludeExercises: [], excludeRegions: [], daysPerWeek: 3, sessionMinutes: 45,
  }),
  ...workout(0, "mon", FULL_BODY),
  ...workout(1, "tue", FULL_BODY),
  ...workout(2, "wed", FULL_BODY),
  // Other event types — uncomment to try:
  // ev(T0 + 2 * DAY + 3 * H, "checkin", { feel: "beat_up", soreRegions: ["quads"] }),
  // ev(T0 + 3 * DAY, "external_activity", { presetId: "football", minutes: 90, intensity: "hard" }),
];

// Times (hours after the first workout) at which to print the state.
const CHECK_AT = [0, 12, 24, 72, 96];

// Exercises to predict + prescribe (3 sets) at each check time. Ids come from catalog/exercises.json.
const PRESCRIBE = ["push_up_standard", "squat_bodyweight", "plank"];

const catalog = loadCatalog(rawCatalog);
const params = parseParams(rawParams);
for (const h of CHECK_AT) {
  const now = T0 + h * H;
  const state = replay(EVENTS.filter((e) => e.ts <= now), catalog, params); // only what has happened by now
  const r = readiness(state, now);
  const w = weeklyNeed(state, now);
  const sys = systemic(state, now);
  console.log(`\n=== ${new Date(now).toISOString()}  (+${h}h) ===`);
  console.table(
    Object.fromEntries(
      Object.entries(r).map(([region, x]) => [region, {
        fatigue: +x.fatigue.toFixed(2), state: x.state, hoursToReady: +x.hoursToReady.toFixed(1),
        target: +w[region as keyof typeof w].target.toFixed(1), done: +w[region as keyof typeof w].done.toFixed(2), need: +w[region as keyof typeof w].need.toFixed(2),
      }]),
    ),
  );
  console.log(`G=${sys.G.toFixed(2)}  typical=${sys.typical.toFixed(2)}  rest=${sys.restRecommended}  ${sys.reasons.join("; ")}`);
  const learned = (name: string, x: { value: number; obs: number }) => `${name}=${x.value.toFixed(3)} (${x.obs} obs, ${confidence(x.obs, params)})`;
  console.log(`Learned: ${learned("rho", state.rho)}  ${learned("b", state.b)}  ${learned("d", state.d)}  deload=${deloadActiveAt(state, now)}  calibrating=${isCalibrating(state, now)}`);
  const types = state.predictionLog.reduce<Record<string, number>>((a, x) => ((a[x.type] = (a[x.type] ?? 0) + 1), a), {});
  console.log(`Prediction log: ${state.predictionLog.length} sets ${JSON.stringify(types)}`);
  for (const id of PRESCRIBE) {
    const pred = predictSet(state, id, now);
    const pr = prescribe(state, id, 3, now);
    const sets = pr.sets.map((x) => (x.seconds !== undefined ? `${x.seconds}s` : `${x.reps}`) + `@RIR${x.targetRir}`).join(", ");
    console.log(
      `  ${id}: M_pred=${pred.M_pred.toFixed(1)} (F_prior_eff=${pred.F_prior_eff.toFixed(2)})  ->  ${pr.exerciseId}: ${sets}` +
        (pr.firstSetMode ? `  [${pr.firstSetMode}]` : "") + (pr.reasons.length ? `  (${pr.reasons.join("; ")})` : ""),
    );
  }
  const plan = planSession(state, { now });
  console.log(`PLAN: ${plan.kind}${plan.template ? ` (${plan.template})` : ""}  ~${plan.estMinutes.toFixed(0)} min`);
  for (const r of plan.reasons) console.log(`  * ${r}`);
  for (const e of plan.exercises) {
    const sets = e.sets.map((x) => (x.seconds !== undefined ? `${x.seconds}s` : `${x.reps}`) + `@RIR${x.targetRir}` + (x.isAmrap ? " AMRAP" : "")).join(", ");
    console.log(`  ${e.exerciseId}: ${sets}${e.firstSetMode ? `  [${e.firstSetMode}]` : ""}`);
    for (const r of e.reasons) console.log(`      - ${r}`);
  }
}
