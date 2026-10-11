import type { Catalog } from "./catalog";
import { applyCheckin, calibrateSet, expireDeload, isCalibrating } from "./calibrate";
import { capacityOf, impliedRir } from "./capacity";
import { applyRating } from "./difficulty";
import { externalLoad } from "./external";
import { noveltyFactor, noveltyMult, priorExposures, repsEq, saturate, setLoad } from "./load";
import { advanceInPlace, deposit, learnTolerance } from "./recovery";
import { initialOneRm, strengthOf } from "./strength";
import { advanceSoreness, depositDamage, grids, initSoreness, learnFromSoreness, sorenessNovelty } from "./soreness";
import { EventSchema, REGIONS, zeroRegions, type EngineEvent, type EngineState, type Params, type SessionRecord } from "./types";

/** The grid value closest to 1 in log space (the prior's mode). */
const nearestOne = (xs: number[]) => xs.reduce((a, b) => (Math.abs(Math.log(b)) < Math.abs(Math.log(a)) ? b : a));

export function initialState(catalog: Catalog, params: Params): EngineState {
  return {
    params,
    catalog,
    t: 0,
    profile: null,
    regions: Object.fromEntries(REGIONS.map((r) => [r, { fast: 0, slow: 0 }])) as EngineState["regions"],
    G: 0,
    sessions: [],
    openSessionId: null,
    capacity: {},
    strength: {},
    usualWeights: {},
    ratings: {},
    demandOffsets: { balance: 0, coordination: 0, mobility: 0, grip: 0 },
    tolerance: zeroRegions(),
    soreness: initSoreness(params),
    sigma: { value: nearestOne(grids(params).sigma), obs: 0 },
    rhoS: { value: nearestOne(grids(params).rho), obs: 0 },
    levelObs: {},
    feedback: {},
    calibratedAt: null,
    exposures: {},
    rho: { value: params.calibration.rho.init, obs: 0 },
    b: { value: params.calibration.rirBias.init, obs: 0 },
    d: { value: params.calibration.acute.init, obs: 0 },
    lastAmrapTs: null,
    deload: { active: false, since: null, endedAt: null },
    predictionLog: [],
    checkin: null,
    rejected: [],
  };
}

/**
 * Validate, de-duplicate (by event id, first wins), sort by (ts, seq) and fold. The input array is not mutated.
 * Invalid events are skipped and listed in `state.rejected`; one bad event never corrupts the numbers.
 */
export function replay(events: readonly EngineEvent[], catalog: Catalog, params: Params): EngineState {
  const s = initialState(catalog, params);
  const seen = new Set<string>();
  const valid: EngineEvent[] = [];
  for (const e of events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const r = EventSchema.safeParse(e);
    if (r.success) valid.push(r.data);
    else s.rejected.push({ id: String(e.id), reason: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
  }
  for (const e of valid.sort((a, b) => a.ts - b.ts || a.seq - b.seq)) applyEvent(s, e);
  return s;
}

export function openSession(s: EngineState): SessionRecord | undefined {
  return s.openSessionId === null ? undefined : s.sessions.find((x) => x.id === s.openSessionId);
}

/** Start a session for the events' sessionId `key`. A key used before gets a unique internal id. */
function startSession(s: EngineState, key: string, ts: number): SessionRecord {
  endSession(s, ts);
  const id = s.sessions.some((x) => x.id === key) ? `${key}@${ts}` : key;
  const sess: SessionRecord = {
    id, key, lastTs: ts, start: ts, end: null, log: [],
    rawStimulus: zeroRegions(), stimulus: zeroRegions(), addedFatigue: zeroRegions(), addedWork: zeroRegions(), fatigueTotal: 0, sets: [],
  };
  s.sessions.push(sess);
  s.openSessionId = id;
  return sess;
}

/** The open session for this key, unless it has been idle longer than session.maxGapH (then it is closed at its last event). */
function sessionFor(s: EngineState, key: string, ts: number): SessionRecord | undefined {
  const open = openSession(s);
  if (!open || open.key !== key) return undefined;
  if (ts - open.lastTs > s.params.session.maxGapH * 3_600_000) {
    endSession(s, open.lastTs);
    return undefined;
  }
  return open;
}

function endSession(s: EngineState, ts: number): void {
  const sess = openSession(s);
  if (!sess) return;
  sess.end = ts;
  for (const r of REGIONS) sess.stimulus[r] = saturate(sess.rawStimulus[r], s.params);
  learnTolerance(s, sess.addedWork);
  s.openSessionId = null;
}

/**
 * One fold step: mutates `s`. Events must arrive in (ts, seq) order. `replay` is the normal entry point;
 * this is exported for incremental use (the simulator), where replaying from scratch every set would be O(n²).
 */
export function applyEvent(s: EngineState, e: EngineEvent): void {
  advanceInPlace(s, e.ts);
  advanceSoreness(s, e.ts);
  expireDeload(s, e.ts);
  switch (e.type) {
    case "profile_set":
      s.profile = e.payload;
      break;
    case "session_started":
      startSession(s, e.payload.sessionId, e.ts);
      break;
    case "session_ended":
      if (openSession(s)?.key === e.payload.sessionId) endSession(s, e.ts);
      break;
    case "set_logged": {
      const p = e.payload;
      const ex = s.catalog.byId[p.exerciseId];
      if (!ex) break;
      const sess = sessionFor(s, p.sessionId, e.ts) ?? startSession(s, p.sessionId, e.ts);
      sess.lastTs = e.ts;
      const activeSeconds = p.holdSeconds ?? (p.reps ?? 0) * s.params.energy.secondsPerRep;
      sess.log.push({ exerciseId: ex.id, ts: e.ts, activeSeconds: activeSeconds * (ex.unilateral ? 2 : 1), rir: p.rir ?? 0, isWarmup: p.isWarmup });
      if (p.isWarmup) break;
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
      const x = repsEq(p, s.params);
      // No rating: an all-out set has 0 left; any other set is sized by what the prediction implies.
      const rir = p.rir ?? (p.isAmrap ? 0 : impliedRir(s, ex.id, x, e.ts, weightKg ?? undefined));
      sess.log[sess.log.length - 1]!.rir = rir;
      // Learning happens before this set's fatigue is deposited: the prediction must not see the set itself.
      calibrateSet(s, sess, { exerciseId: ex.id, repsEq: x, isHold: p.holdSeconds !== undefined, rir: p.rir ?? (p.isAmrap ? 0 : null), isAmrap: p.isAmrap, weightKg }, e.ts);
      const k = priorExposures(s, ex.id, sess.id, e.ts);
      const { stimulus, fatigue } = setLoad(ex, x, rir, k, s.params, noveltyMult(s));
      const work = fatigue / noveltyFactor(k, s.params, noveltyMult(s));
      const damage = work * sorenessNovelty(k, s.params, noveltyMult(s));
      for (const m of REGIONS) {
        const c = ex.contributions[m];
        if (!c) continue;
        sess.rawStimulus[m] += stimulus * c;
        sess.addedFatigue[m] += fatigue * c;
        sess.addedWork[m] += work * c;
        depositDamage(s, m, damage * c, e.ts);
        s.regions[m] = deposit(s.regions[m], fatigue * c, s.params);
      }
      s.G += fatigue;
      sess.fatigueTotal += fatigue;
      const exp = (s.exposures[ex.id] ??= []);
      if (!exp.some((x) => x.sessionId === sess.id)) exp.push({ sessionId: sess.id, ts: e.ts });
      if (s.calibratedAt === null && !isCalibrating(s, e.ts)) s.calibratedAt = e.ts;
      break;
    }
    case "checkin":
      applyCheckin(s, e.ts, e.payload.feel, e.payload.soreRegions);
      if (e.payload.sorenessChecked) learnFromSoreness(s, e.ts, e.payload.soreRegions);
      break;
    case "exercise_feedback": {
      const { exerciseId, liked, pain, rating } = e.payload;
      const f = (s.feedback[exerciseId] ??= { liked: null, painTs: null });
      if (liked !== undefined) f.liked = liked;
      if (pain !== undefined) f.painTs = pain ? e.ts : null;
      if (rating !== undefined) applyRating(s, exerciseId, rating);
      break;
    }
    case "usual_weight": {
      const ex = s.catalog.byId[e.payload.exerciseId];
      if (!ex?.weighted) break;
      const entry = s.strength[ex.id];
      if (entry && entry.obs > 0) break; // measured: the usual weight no longer matters
      s.usualWeights[ex.id] = { weightKg: e.payload.weightKg, reps: e.payload.reps };
      if (entry) s.strength[ex.id] = { ...entry, oneRm: initialOneRm(s, ex) };
      break;
    }
    case "external_activity": {
      const { regions, systemic } = externalLoad(e.payload.presetId, e.payload.minutes, e.payload.intensity, s.params);
      for (const [m, f] of regions) s.regions[m] = deposit(s.regions[m], f, s.params);
      s.G += systemic;
      break;
    }
  }
}
