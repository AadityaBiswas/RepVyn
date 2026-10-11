import {
  applyEvent, initialState, planSession, readiness, REGIONS, repMae, shouldStopExercise, weeklyNeed,
  type Catalog, type EngineEvent, type EngineState, type Params, type Plan, type Region,
} from "../engine";
import { Rng } from "./rng";
import type { Scenario } from "./scenarios";
import { SyntheticUser } from "./syntheticUser";

const H = 3_600_000;
const DAY = 24 * H;
const WEEK = 7 * DAY;
/** Simulation starts Monday 5 Jan 2026, 00:00 UTC. */
export const SIM_START = Date.UTC(2026, 0, 5);
const TRAIN_HOUR = 18;
const FOOTBALL_HOUR = 10;
const BEAT_UP_RATIO = 0.9;
const STATE_CHAR = { ready: "R", recovering: "r", fatigued: "F" } as const;

type EventBody = { [K in EngineEvent["type"]]: { type: K; payload: Extract<EngineEvent, { type: K }>["payload"] } }[EngineEvent["type"]];

export interface DayRow {
  day: number;
  date: string;
  plan: string;
  exercises: string;
  /** Engine-estimated readiness at plan time, one char per region (R/r/F). */
  states: string;
  rho: number;
  b: number;
  d: number;
}

export interface SessionSummary {
  day: number;
  week: number;
  /** Per exercise, after the session: engine M vs hidden M_true. */
  exercises: { id: string; firstSetMode: string | null; M: number; Mtrue: number }[];
  /** Mean |M_engine − M_true| / M_true over this session's exercises, after the session. */
  capRelErr: number;
}

export interface SimResult {
  scenario: string;
  seed: number;
  weeks: number;
  events: EngineEvent[];
  state: EngineState;
  days: DayRow[];
  sessions: SessionSummary[];
  /** Rep MAE per sim week (index 0 = week 1); null when no sets were logged that week. */
  weeklyMae: (number | null)[];
  /** Max over regions of weekly done / target at the end of each week. */
  weeklyDoneRatio: number[];
  /** Planned exercises whose c=1 region was fatigued (engine estimate) at plan time. */
  violations: string[];
  truth: { rho: number; b: number; d: number; M: Record<string, number>; tolerance: Record<Region, number> };
}

/** Training days spread evenly over the week: floor(i * 7 / n), e.g. 3 -> Mon/Wed/Fri. */
export const trainingDays = (n: number) => new Set(Array.from({ length: n }, (_, i) => Math.floor((i * 7) / n)));

export function runScenario(sc: Scenario, opts: { weeks: number; seed: number; catalog: Catalog; params: Params }): SimResult {
  const { weeks, seed, catalog, params } = opts;
  const rng = new Rng(seed);
  const state = initialState(catalog, params);
  const user = new SyntheticUser(sc, catalog, params, rng);
  const events: EngineEvent[] = [];
  const days: DayRow[] = [];
  const sessions: SessionSummary[] = [];
  const violations: string[] = [];
  let seq = 0;

  const emit = (ts: number, body: EventBody) => {
    const e = { id: rng.uuid(), userId: `sim-${sc.name}`, ts, seq: seq++, schemaVersion: 1, ...body } as EngineEvent;
    applyEvent(state, e);
    user.observe(e);
    events.push(e);
  };

  emit(SIM_START + 7 * H, { type: "profile_set", payload: sc.profile });
  const train = trainingDays(sc.profile.daysPerWeek);

  for (let d = 0; d < weeks * 7; d++) {
    const dayStart = SIM_START + d * DAY;
    const week = Math.floor(d / 7) + 1;
    user.newDay(dayStart);
    if (sc.sundayFootball && d % 7 === 6) {
      emit(dayStart + FOOTBALL_HOUR * H, { type: "external_activity", payload: { presetId: "football", minutes: 90, intensity: "hard" } });
    }
    const row = (plan: string, exercises = "", states = "") =>
      days.push({ day: d, date: new Date(dayStart).toISOString().slice(0, 10), plan, exercises, states, rho: state.rho.value, b: state.b.value, d: state.d.value });
    if (sc.sorenessTrue && !train.has(d % 7)) {
      const t = dayStart + 8 * H;
      emit(t, { type: "checkin", payload: { feel: "normal", soreRegions: user.soreRegions(t), sorenessChecked: true } });
    }
    if (!train.has(d % 7)) continue;
    if (sc.offWeeks?.includes(week)) {
      row("off");
      continue;
    }

    let t = dayStart + TRAIN_HOUR * H;
    const beatUp = user.systemicRatio(t - H / 12) > BEAT_UP_RATIO;
    if (sc.sorenessTrue) {
      emit(t - H / 12, { type: "checkin", payload: { feel: beatUp ? "beat_up" : "normal", soreRegions: user.soreRegions(t - H / 12), sorenessChecked: true } });
    } else if (beatUp) emit(t - H / 12, { type: "checkin", payload: { feel: "beat_up", soreRegions: [] } });

    const plan: Plan = planSession(state, { now: t });
    const ready = readiness(state, t);
    const states = REGIONS.map((m) => STATE_CHAR[ready[m].state]).join("");
    for (const e of plan.exercises) {
      for (const m of REGIONS) {
        if (catalog.byId[e.exerciseId]!.contributions[m] === 1 && ready[m].state === "fatigued") violations.push(`day ${d}: ${e.exerciseId} while ${m} fatigued`);
      }
    }
    if (plan.kind === "rest") {
      row("rest", plan.reasons.join("; "), states);
      continue;
    }

    const sessionId = `d${d}`;
    emit(t, { type: "session_started", payload: { sessionId } });
    const done: string[] = [];
    for (const e of plan.exercises) {
      let n = 0;
      const extra = Array.from({ length: sc.extraSets ?? 0 }, () => ({ ...e.sets[e.sets.length - 1]!, isAmrap: false }));
      const all = [...e.sets, ...extra];
      // The one rated set: the last, or the one before an all-out last set (which needs no rating).
      const rated = all.length - (all[all.length - 1]!.isAmrap ? 2 : 1);
      for (const [i, set] of all.entries()) {
        t += params.planner.time.minPerSet * 60_000;
        const r = user.perform(e.exerciseId, set, t);
        const { repsEq: _, ...logged } = r;
        const prescribed = set.seconds !== undefined ? set.seconds / params.hold.secondsPerRep : set.reps!;
        const stop = !set.isAmrap && shouldStopExercise(prescribed, r.repsEq, params);
        // The app asks after whichever set turns out to be the exercise's last, so a set the user stops on is rated too.
        if (sc.lastSetRirOnly && i !== rated && !stop) delete (logged as { rir?: number }).rir;
        emit(t, { type: "set_logged", payload: { sessionId, exerciseId: e.exerciseId, ...logged, isWarmup: false, isAmrap: set.isAmrap } });
        n++;
        if (stop) break;
      }
      done.push(`${e.exerciseId}×${n}`);
    }
    emit(t + 60_000, { type: "session_ended", payload: { sessionId } });

    const ids = plan.exercises.map((e) => e.exerciseId);
    sessions.push({
      day: d,
      week,
      exercises: plan.exercises.map((e) => ({ id: e.exerciseId, firstSetMode: e.firstSetMode, M: state.capacity[e.exerciseId]!.M, Mtrue: user.trueM(e.exerciseId) })),
      capRelErr: ids.reduce((a, id) => a + Math.abs(state.capacity[id]!.M - user.trueM(id)) / user.trueM(id), 0) / ids.length,
    });
    row(`${plan.template}`, done.join(" "), states);
  }

  const weeklyMae = Array.from({ length: weeks }, (_, w) =>
    repMae(state.predictionLog.filter((x) => x.ts >= SIM_START + w * WEEK && x.ts < SIM_START + (w + 1) * WEEK)),
  );
  const weeklyDoneRatio = Array.from({ length: weeks }, (_, w) => {
    const need = weeklyNeed(state, SIM_START + (w + 1) * WEEK - 1);
    return Math.max(...REGIONS.map((m) => need[m].done / need[m].target));
  });

  return {
    scenario: sc.name, seed, weeks, events, state, days, sessions, weeklyMae, weeklyDoneRatio, violations,
    truth: {
      rho: sc.rhoTrue, b: sc.bTrue, d: sc.dTrue, M: Object.fromEntries(user.M),
      tolerance: Object.fromEntries(REGIONS.map((m) => [m, user.trueTolerance(m)])) as Record<Region, number>,
    },
  };
}
