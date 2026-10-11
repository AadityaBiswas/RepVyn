// The in-workout flow as a pure state machine: work → rest → … → done. The screen calls these and ticks once a second;
// `toEvents` turns a finished (or abandoned) run into engine events.
import type { EngineEvent, EngineState, Plan } from "../../src/engine";

export const REST_SECONDS = 45;

export interface RunSet { reps?: number; seconds?: number; weightKg?: number; isAmrap: boolean; targetRir: number }
export interface RunExercise { id: string; name: string; unilateral: boolean; hold: boolean; weighted: boolean; pair: boolean; sets: RunSet[] }
/** One set as done. `rir` is the answer to "How many more reps could you do?", asked once per exercise. */
export interface DoneSet { exerciseId: string; ts: number; reps?: number; seconds?: number; weightKg?: number; isAmrap: boolean; rir?: number }
export type HoldMode = "idle" | "ready" | "run" | "paused" | "over";

export interface Run {
  exercises: RunExercise[];
  startTs: number;
  /** Index of the current exercise and set (set is 1-based, as shown). */
  ex: number;
  set: number;
  phase: "work" | "rest" | "ask" | "done";
  /** Reps (or hold seconds) the user is about to log for this set. */
  amount: number;
  hold: { mode: HoldMode; ready: number; left: number };
  /** Dumbbell chosen per exercise, kg. */
  kg: Record<number, number>;
  rest: number;
  restTotal: number;
  /** Answer given on this rest / ask screen, as shown ("0".."5+"). */
  effort: string | null;
  elapsed: number;
  done: DoneSet[];
  /** A set was just completed: the progress segment flashes red. */
  flash: boolean;
}

export function fromPlan(s: EngineState, plan: Plan): RunExercise[] {
  return plan.exercises.map((x) => {
    const ex = s.catalog.byId[x.exerciseId]!;
    return {
      id: ex.id, name: ex.name, unilateral: ex.unilateral, hold: ex.isHold, weighted: ex.weighted, pair: ex.dumbbells === 2,
      sets: x.sets.map((y) => ({ reps: y.reps, seconds: y.seconds, weightKg: y.weightKg, isAmrap: y.isAmrap, targetRir: y.targetRir })),
    };
  });
}

/** What the user aims for on a set. An all-out set opens on the usual target plus the reps normally left in the tank. */
export function targetOf(e: RunExercise, setIdx: number): number {
  const x = e.sets[setIdx]!;
  const base = x.seconds ?? x.reps ?? 0;
  return x.isAmrap && !e.hold ? base + x.targetRir : base;
}

export function start(exercises: RunExercise[], now: number): Run {
  if (!exercises.length) throw new Error("empty workout");
  return {
    exercises, startTs: now, ex: 0, set: 1, phase: "work", amount: targetOf(exercises[0]!, 0),
    hold: { mode: "idle", ready: 0, left: exercises[0]!.hold ? targetOf(exercises[0]!, 0) : 0 },
    kg: {}, rest: 0, restTotal: REST_SECONDS, effort: null, elapsed: 0, done: [], flash: false,
  };
}

export const current = (r: Run): RunExercise => r.exercises[r.ex]!;
export const isAllOut = (e: RunExercise): boolean => !!e.sets.at(-1)?.isAmrap && !e.hold;
export const setsTotal = (r: Run): number => r.exercises.reduce((a, e) => a + e.sets.length, 0);
export const kgOf = (r: Run): number | undefined => r.kg[r.ex] ?? current(r).sets[r.set - 1]?.weightKg;

/** The reps-left question shows after an exercise's last set, or one set earlier when the last set is all out. */
export function asksLeft(r: Run): boolean {
  if (r.phase !== "rest" && r.phase !== "ask") return false;
  const e = current(r);
  return r.set === e.sets.length - (isAllOut(e) ? 1 : 0);
}
const isLastSet = (r: Run) => r.ex === r.exercises.length - 1 && r.set === current(r).sets.length;

export function setDone(r: Run, now: number): Run {
  const e = current(r);
  const x = e.sets[r.set - 1]!;
  const kg = e.weighted ? kgOf(r) : undefined;
  const logged: DoneSet = {
    exerciseId: e.id, ts: now, isAmrap: x.isAmrap && !e.hold,
    ...(e.hold ? { seconds: r.amount } : { reps: r.amount }),
    ...(kg !== undefined ? { weightKg: kg } : {}),
  };
  const next: Run = { ...r, done: [...r.done, logged], effort: null, flash: true };
  if (!isLastSet(r)) return { ...next, phase: "rest", rest: REST_SECONDS, restTotal: REST_SECONDS };
  // The last set has no rest; it gets its own step for the question, unless it was all out (nothing to ask).
  return asksLeft({ ...next, phase: "ask" }) ? { ...next, phase: "ask" } : { ...next, phase: "done" };
}

/** Records the reps-left answer on the set it refers to (the one just done). */
export function answer(r: Run, label: string): Run {
  const rir = label === "5+" ? 5 : Number(label);
  const done = r.done.slice();
  const last = done.at(-1);
  if (last) done[done.length - 1] = { ...last, rir };
  return { ...r, done, effort: label };
}

export function nextSet(r: Run): Run {
  const e = current(r);
  const same = r.set < e.sets.length;
  const ex = same ? r.ex : r.ex + 1;
  if (ex >= r.exercises.length) return { ...r, phase: "done" };
  const set = same ? r.set + 1 : 1;
  const ne = r.exercises[ex]!;
  const amount = targetOf(ne, set - 1);
  return { ...r, ex, set, phase: "work", amount, effort: null, hold: { mode: "idle", ready: 0, left: ne.hold ? amount : 0 } };
}

/** One second passes. */
export function tick(r: Run): Run {
  if (r.phase === "done") return r;
  if (r.phase === "rest" && r.rest <= 1) return nextSet({ ...r, elapsed: r.elapsed + 1 });
  let hold = r.hold;
  if (r.phase === "work" && hold.mode === "ready") hold = hold.ready <= 1 ? { ...hold, ready: 0, mode: "run" } : { ...hold, ready: hold.ready - 1 };
  else if (r.phase === "work" && hold.mode === "run") hold = hold.left <= 1 ? { ...hold, left: 0, mode: "over" } : { ...hold, left: hold.left - 1 };
  return { ...r, elapsed: r.elapsed + 1, hold, rest: r.phase === "rest" ? r.rest - 1 : r.rest };
}

export const repsDone = (r: Run): number => r.done.reduce((a, x) => a + (x.reps ?? 0), 0);

/** Engine events for what was done: nothing if no set was logged. */
export function toEvents(r: Run, sessionId: string, endTs: number): Omit<EngineEvent, "id" | "userId" | "seq" | "schemaVersion">[] {
  if (!r.done.length) return [];
  const out: Omit<EngineEvent, "id" | "userId" | "seq" | "schemaVersion">[] = [{ ts: r.startTs, type: "session_started", payload: { sessionId } } as never];
  for (const x of r.done) {
    out.push({
      ts: x.ts, type: "set_logged",
      payload: {
        sessionId, exerciseId: x.exerciseId, isWarmup: false, isAmrap: x.isAmrap,
        ...(x.seconds !== undefined ? { holdSeconds: x.seconds } : { reps: x.reps! }),
        ...(x.rir !== undefined ? { rir: x.rir } : {}),
        ...(x.weightKg !== undefined ? { weightKg: x.weightKg } : {}),
      },
    } as never);
  }
  out.push({ ts: Math.max(endTs, r.done.at(-1)!.ts), type: "session_ended", payload: { sessionId } } as never);
  return out;
}
