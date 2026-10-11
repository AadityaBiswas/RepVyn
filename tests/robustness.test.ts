// Robustness: messy real-world input (retries, bad values, reused ids, forgotten "end session", outlier sets)
// must never corrupt the state, and every output must stay finite.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  capacityOf, difficultyOf, ownedWeights, planSession, predictRange, predictSet, readiness, replay, soreness, systemic, weeklyNeed, REGIONS,
  type Dumbbells, type EngineEvent,
} from "../src/engine";
import { catalog, ev, H, params, profile, session, set, T0 } from "./helpers";

const p = params();
const D = 24 * H;
const PUSH: [string, number, number][] = [["push_up_standard", 15, 2], ["push_up_standard", 13, 2]];
const run = (events: EngineEvent[]) => replay([profile(T0 - D), ...events], catalog, p);

describe("duplicate events (network retries)", () => {
  it("an event delivered twice counts once", () => {
    const evs = [...session(T0, "a", PUSH), ...session(T0 + 2 * D, "b", PUSH)];
    expect(run([...evs, ...evs])).toEqual(run(evs));
  });
});

describe("invalid events", () => {
  it("are skipped and reported, never corrupt the numbers", () => {
    const bad = { ...set(T0, "a", "push_up_standard", Number.NaN, 2) } as EngineEvent;
    const s = run([...session(T0, "a", PUSH), bad]);
    expect(s.rejected.map((x) => x.id)).toEqual([bad.id]);
    expect(readiness(s, T0 + H).chest.fatigue).toBeCloseTo(readiness(run(session(T0, "a", PUSH)), T0 + H).chest.fatigue, 12);
  });
});

describe("session ids", () => {
  it("a session id reused on a later day is a new session, not the old one", () => {
    const s = run([...session(T0, "morning", PUSH), ...session(T0 + 2 * D, "morning", [["squat_bodyweight", 20, 2]])]);
    expect(s.sessions).toHaveLength(2);
    expect(s.sessions[0]!.sets.map((x) => x.exerciseId)).toEqual(["push_up_standard", "push_up_standard"]);
    expect(s.sessions[1]!.sets.map((x) => x.exerciseId)).toEqual(["squat_bodyweight"]);
    expect(s.sessions[0]!.end).toBe(T0);
  });

  it("a session never ended does not swallow tomorrow's sets as in-session fatigue", () => {
    const start = ev(T0, { type: "session_started", payload: { sessionId: "a" } });
    const s = run([start, set(T0, "a", "push_up_standard", 15, 2), set(T0 + D, "a", "push_up_standard", 15, 2)]);
    expect(s.sessions).toHaveLength(2);
    const nextDay = s.predictionLog[1]!;
    const fresh = run([start, set(T0, "a", "push_up_standard", 15, 2), ev(T0 + H, { type: "session_ended", payload: { sessionId: "a" } }), ...session(T0 + D, "b", [["push_up_standard", 15, 2]])]);
    expect(nextDay.M_pred).toBeCloseTo(fresh.predictionLog[1]!.M_pred, 9);
  });
});

describe("one outlier set", () => {
  it("moves an established capacity by at most emaAlpha × 50%", () => {
    const established = [0, 3, 6].flatMap((d) => session(T0 + d * D, `s${d}`, [["push_up_standard", 18, 2]])); // M = 20
    const s = run([...established, ...session(T0 + 9 * D, "typo", [["push_up_standard", 45, 2]])]);
    expect(capacityOf(s, "push_up_standard", T0 + 10 * D).M).toBeLessThanOrEqual(20 * (1 + p.capacity.emaAlpha * 0.5) + 1e-9);
  });
});

describe("prediction ranges come from the user's own error history", () => {
  it("are wide before there is data and narrow once predictions prove accurate", () => {
    const early = run(session(T0, "a", PUSH));
    const r0 = predictRange(early, "push_up_standard", T0 + 3 * D);
    const steady = run(Array.from({ length: 12 }, (_, i) => session(T0 + i * 3 * D, `s${i}`, [["push_up_standard", 18, 2], ["push_up_standard", 15, 2]])).flat());
    const r1 = predictRange(steady, "push_up_standard", T0 + 40 * D);
    expect(r0.low).toBeLessThan(r0.M_pred);
    expect(r0.high).toBeGreaterThan(r0.M_pred);
    expect((r1.high - r1.low) / r1.M_pred).toBeLessThan((r0.high - r0.low) / r0.M_pred);
    expect(r1.M_pred).toBeCloseTo(predictSet(steady, "push_up_standard", T0 + 40 * D).M_pred, 12);
  });
});

describe("fuzz: any stream of events, including garbage, gives finite answers", () => {
  const exercises = ["push_up_standard", "squat_bodyweight", "plank", "pull_up", "glute_bridge", "db_curl", "db_floor_press", "no_such_exercise"];
  const bellSets: (Dumbbells | undefined)[] = [undefined, { kind: "fixed", kg: [5, 7.5, 10, 15] }, { kind: "adjustable", minKg: 2.5, maxKg: 30, stepKg: 2.5 }];
  const item = fc.record({
    kind: fc.constantFrom("set", "set", "set", "start", "end", "checkin", "feedback", "external", "usual", "rate"),
    // Garbage weights (0, NaN, 1e9, missing) mix with real ones; the bad ones are rejected or ignored, never corrupt anything.
    kg: fc.oneof(fc.constantFrom(5, 7.5, 10, 12.5, 15), fc.constantFrom(0, Number.NaN, 1e9, -2), fc.constant(undefined)),
    rating: fc.constantFrom("too_easy", "just_right", "too_hard"),
    amrap: fc.boolean(),
    bells: fc.constantFrom(0, 1, 2),
    gapMin: fc.integer({ min: 0, max: 3000 }),
    ex: fc.constantFrom(...exercises),
    reps: fc.oneof(fc.integer({ min: 0, max: 500 }), fc.constant(Number.NaN), fc.constant(-3)),
    rir: fc.oneof(fc.integer({ min: 0, max: 5 }), fc.constant(9)),
    sid: fc.constantFrom("a", "b", "a"),
  });
  it("readiness, soreness, systemic, weekly need, predictions and plans stay finite and sane", () => {
    fc.assert(
      fc.property(fc.array(item, { maxLength: 50 }), fc.constantFrom(0, 1, 2), (items, bells0) => {
        let t = T0;
        const events: EngineEvent[] = [];
        for (const it of items) {
          t += it.gapMin * 60_000;
          if (it.kind === "set") {
            const e = set(t, it.sid, it.ex, it.reps, it.rir, { hold: it.ex === "plank", isAmrap: it.amrap });
            if (it.kg !== undefined) (e.payload as { weightKg?: number }).weightKg = it.kg;
            events.push(e);
          }
          if (it.kind === "usual") events.push(ev(t, { type: "usual_weight", payload: { exerciseId: it.ex, weightKg: it.kg ?? 10, reps: Math.abs(it.reps) % 60 } }));
          if (it.kind === "rate") events.push(ev(t, { type: "exercise_feedback", payload: { exerciseId: it.ex, rating: it.rating } }));
          if (it.kind === "feedback" && it.reps % 3 === 0) {
            // A mid-stream profile change: dumbbells added, swapped or removed, body mass present or not.
            events.push(profile(t, { equipment: ["dumbbell", "bench"], bodyMassKg: it.reps % 2 === 0 ? 70 : undefined, ...(bellSets[it.bells] ? { dumbbells: bellSets[it.bells]! } : {}) }));
          }
          if (it.kind === "start") events.push(ev(t, { type: "session_started", payload: { sessionId: it.sid } }));
          if (it.kind === "end") events.push(ev(t, { type: "session_ended", payload: { sessionId: it.sid } }));
          if (it.kind === "checkin") events.push(ev(t, { type: "checkin", payload: { feel: "normal", soreRegions: ["chest"], sorenessChecked: true } }));
          if (it.kind === "feedback") events.push(ev(t, { type: "exercise_feedback", payload: { exerciseId: it.ex, pain: it.reps % 2 === 0 } }));
          if (it.kind === "external") events.push(ev(t, { type: "external_activity", payload: { presetId: "running", minutes: 30, intensity: "hard" } }));
        }
        const s = replay([profile(T0 - D, { equipment: ["dumbbell", "bench"], bodyMassKg: 70, ...(bellSets[bells0] ? { dumbbells: bellSets[bells0]! } : {}) }), ...events], catalog, p);
        const now = t + 12 * H;
        const finite = (x: number) => expect(Number.isFinite(x)).toBe(true);
        const r = readiness(s, now);
        const so = soreness(s, now);
        const w = weeklyNeed(s, now);
        for (const m of REGIONS) [r[m].fatigue, r[m].hoursToReady, r[m].load, so[m].felt, w[m].need].forEach(finite);
        finite(systemic(s, now).G);
        for (const id of Object.keys(s.capacity)) {
          const pr = predictRange(s, id, now);
          [pr.M_pred, pr.low, pr.high].forEach(finite);
          expect(pr.low).toBeLessThanOrEqual(pr.M_pred);
        }
        for (const [id, entry] of Object.entries(s.strength)) {
          finite(entry.oneRm);
          expect(entry.oneRm).toBeGreaterThan(0);
          if (ownedWeights(s.profile).length) [predictRange(s, id, now)].forEach((pr) => [pr.M_pred, pr.low, pr.high].forEach(finite));
        }
        for (const ex of catalog.exercises) {
          const d = difficultyOf(s, ex.id, now).score;
          finite(d);
          expect(d).toBeGreaterThanOrEqual(1);
          expect(d).toBeLessThanOrEqual(5);
        }
        const plan = planSession(s, { now });
        expect(plan.estMinutes).toBeLessThanOrEqual(45);
        const owned = ownedWeights(s.profile);
        for (const e of plan.exercises) {
          for (const x of e.sets) {
            expect((x.reps ?? x.seconds)!).toBeGreaterThanOrEqual(1);
            if (x.weightKg !== undefined) expect(owned).toContain(x.weightKg);
          }
          if (catalog.byId[e.exerciseId]!.weighted) expect(owned.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 150 },
    );
  }, 120_000);
});
