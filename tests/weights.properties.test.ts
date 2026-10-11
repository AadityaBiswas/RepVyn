import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { difficultyOf, ownedWeights, planSession, prescribe, replay, type Dumbbells, type EngineEvent, type Rating } from "../src/engine";
import { catalog, ev, H, params, profile, session, T0 } from "./helpers";

const p = params();
const D = 24 * H;
const WEIGHTED = catalog.exercises.filter((e) => e.weighted).map((e) => e.id);
const ALL = catalog.exercises.map((e) => e.id);
type Bells = Dumbbells;
const ownerOf = (dumbbells: Bells) => profile(T0 - D, { equipment: ["dumbbell", "bench"], bodyMassKg: 70, dumbbells });
const owner = (kg: number[]) => ownerOf({ kind: "fixed", kg });
const fixedBells = fc.uniqueArray(fc.integer({ min: 1, max: 160 }).map((x) => x / 4), { minLength: 1, maxLength: 12 }).map((kg): Bells => ({ kind: "fixed", kg }));
const adjustableBells = fc
  .tuple(fc.integer({ min: 1, max: 40 }).map((x) => x / 4), fc.constantFrom(0.1, 0.25, 0.5), fc.integer({ min: 0, max: 60 }))
  .map(([minKg, stepKg, n]): Bells => ({ kind: "adjustable", minKg, stepKg, maxKg: Math.round((minKg + n * stepKg) * 1000) / 1000 }));

describe("invariants", () => {
  it("prescriptions only use owned weights, with at least 1 rep or second per set", () => {
    fc.assert(
      fc.property(
        fc.oneof(fixedBells, adjustableBells),
        fc.double({ min: 2, max: 120, noNaN: true }),
        fc.integer({ min: 1, max: 6 }),
        fc.constantFrom(...WEIGHTED),
        (bells, oneRm, sets, id) => {
          const s = replay([ownerOf(bells)], catalog, p);
          const owned = ownedWeights(s.profile);
          s.strength[id] = { oneRm, obs: 1, lastPerformed: T0, lastWeightKg: null };
          const pr = prescribe(s, id, sets, T0 + D);
          return pr.sets.length === sets && pr.sets.every((x) => x.weightKg !== undefined && owned.includes(x.weightKg) && (x.reps ?? x.seconds!) >= 1);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("difficulty always lies in [1, 5] and is finite", () => {
    const RATINGS: Rating[] = ["too_easy", "just_right", "too_hard"];
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.constantFrom(...ALL), fc.constantFrom(...RATINGS)), { maxLength: 30 }),
        fc.double({ min: 0.5, max: 200, noNaN: true }),
        (ratings, M) => {
          const s = replay([owner([5, 10, 15]), ...ratings.map(([id, rating], i) => ev(T0 + i, { type: "exercise_feedback", payload: { exerciseId: id, rating } }))], catalog, p);
          s.capacity.push_up_standard = { M, obs: 2, lastPerformed: T0 };
          return ALL.every((id) => {
            const d = difficultyOf(s, id, T0 + D).score;
            return Number.isFinite(d) && d >= 1 && d <= 5;
          });
        },
      ),
      { numRuns: 60 },
    );
  });

  it("replaying a generated weighted history twice gives deep-equal state and plans", () => {
    const RATINGS: Rating[] = ["too_easy", "just_right", "too_hard"];
    const KG = [5, 7.5, 10, 12.5];
    const item = fc.oneof(
      fc.record({ k: fc.constant("set" as const), id: fc.constantFrom(...WEIGHTED), kg: fc.constantFrom(...KG), reps: fc.integer({ min: 1, max: 20 }), rir: fc.integer({ min: 0, max: 5 }) }),
      fc.record({ k: fc.constant("usual" as const), id: fc.constantFrom(...WEIGHTED), kg: fc.constantFrom(...KG), reps: fc.integer({ min: 1, max: 20 }) }),
      fc.record({ k: fc.constant("rate" as const), id: fc.constantFrom(...ALL), rating: fc.constantFrom(...RATINGS) }),
    );
    fc.assert(
      fc.property(fc.array(item, { maxLength: 25 }), (items) => {
        const events: EngineEvent[] = [
          owner(KG),
          ev(T0 - H, { type: "session_started", payload: { sessionId: "g" } }),
          ...items.map((x, i): EngineEvent => {
            const ts = T0 - H + i + 1;
            if (x.k === "set") return ev(ts, { type: "set_logged", payload: { sessionId: "g", exerciseId: x.id, reps: x.reps, rir: x.rir, isWarmup: false, isAmrap: false, weightKg: x.kg } });
            if (x.k === "usual") return ev(ts, { type: "usual_weight", payload: { exerciseId: x.id, weightKg: x.kg, reps: x.reps } });
            return ev(ts, { type: "exercise_feedback", payload: { exerciseId: x.id, rating: x.rating } });
          }),
          ev(T0 + H, { type: "session_ended", payload: { sessionId: "g" } }),
        ];
        const a = replay(events, catalog, p);
        const b = replay(events, catalog, p);
        expect(a).toEqual(b);
        expect(planSession(a, { now: T0 + D })).toEqual(planSession(b, { now: T0 + D }));
      }),
      { numRuns: 40 },
    );
  });

  it("garbage weights are rejected and never corrupt state", () => {
    const bad = [Number.NaN, -1, 0, 1e9, Number.POSITIVE_INFINITY].map((weightKg, i) =>
      ev(T0 + i, { type: "set_logged", payload: { sessionId: "x", exerciseId: "db_curl", reps: 10, rir: 2, isWarmup: false, isAmrap: false, weightKg } }),
    );
    const s = replay([owner([5, 10]), ...bad], catalog, p);
    expect(s.rejected).toHaveLength(bad.length);
    expect(s.strength).toEqual({});
    const plan = planSession(s, { now: T0 + D });
    for (const x of plan.exercises) for (const set of x.sets) expect(Number.isFinite(set.reps ?? set.seconds!)).toBe(true);
  });
});
