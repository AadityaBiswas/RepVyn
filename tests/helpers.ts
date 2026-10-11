import rawCatalog from "../catalog/library";
import rawParams from "../params/default.params.json";
import { loadCatalog, parseParams, type EngineEvent, type Params } from "../src/engine";

export const catalog = loadCatalog(rawCatalog);
export const params = (patch?: (p: any) => void): Params => {
  const p = structuredClone(rawParams) as any;
  patch?.(p);
  return parseParams(p);
};

export const H = 3_600_000;
export const T0 = Date.UTC(2026, 0, 5, 18); // a Monday, 18:00 UTC

let n = 0;
type Body = { [K in EngineEvent["type"]]: { type: K; payload: Extract<EngineEvent, { type: K }>["payload"] } }[EngineEvent["type"]];
export function ev(ts: number, body: Body, seq = n): EngineEvent {
  n++;
  return { id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, userId: "u1", ts, seq, schemaVersion: 1, ...body } as EngineEvent;
}

export const profile = (ts = T0, over: Partial<Extract<EngineEvent, { type: "profile_set" }>["payload"]> = {}) =>
  ev(ts, {
    type: "profile_set",
    payload: { goal: "muscle", experience: "intermediate", equipment: [], excludeExercises: [], excludeRegions: [], daysPerWeek: 3, sessionMinutes: 45, ...over },
  });

export const set = (ts: number, sessionId: string, exerciseId: string, reps: number, rir: number, o: { isWarmup?: boolean; isAmrap?: boolean; hold?: boolean } = {}) =>
  ev(ts, {
    type: "set_logged",
    payload: {
      sessionId, exerciseId, rir, isWarmup: o.isWarmup ?? false, isAmrap: o.isAmrap ?? false,
      ...(o.hold ? { holdSeconds: reps } : { reps }),
    },
  });

/** A session: start, sets [exerciseId, reps, rir], end — all at ts, seq-ordered. */
export function session(ts: number, id: string, sets: [string, number, number][]): EngineEvent[] {
  return [
    ev(ts, { type: "session_started", payload: { sessionId: id } }),
    ...sets.map(([e, r, rir]) => set(ts, id, e, r, rir)),
    ev(ts, { type: "session_ended", payload: { sessionId: id } }),
  ];
}
