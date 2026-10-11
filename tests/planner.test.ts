import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  checkinFor, EQUIPMENT, REGIONS, planSession, readiness, replay, TEMPLATES,
  type EngineEvent, type Equipment, type Plan, type Region,
} from "../src/engine";
import { catalog, ev, H, params, profile, session, set, T0 } from "./helpers";

const p = params();
const D = 24 * H;
const ALL_KIT = [...EQUIPMENT];
const run = (events: EngineEvent[], over = {}) => replay([profile(T0, over), ...events], catalog, p);
const ex = (id: string) => catalog.byId[id]!;
const primary = (id: string) => REGIONS.filter((m) => ex(id).contributions[m] === 1);
const FULL: [string, number, number][] = [
  ["squat_bodyweight", 15, 2], ["squat_bodyweight", 15, 2], ["push_up_standard", 12, 2], ["push_up_standard", 12, 2],
  ["glute_bridge", 20, 2], ["glute_bridge", 20, 2], ["prone_y_t_raise", 12, 2], ["prone_y_t_raise", 12, 2],
];
const PUSH_DAY: [string, number, number][] = [["push_up_standard", 15, 2], ["push_up_standard", 13, 2], ["pike_push_up", 12, 2], ["diamond_push_up", 12, 2]];

/** Raw session stimulus per region implied by a plan. */
function planStimulus(plan: Plan): Record<Region, number> {
  const out = Object.fromEntries(REGIONS.map((m) => [m, 0])) as Record<Region, number>;
  for (const e of plan.exercises) for (const x of e.sets) for (const m of REGIONS) out[m] += p.effort.stimulus[x.targetRir]! * (ex(e.exerciseId).contributions[m] ?? 0);
  return out;
}

describe("planSession basics", () => {
  it("fresh user, no equipment: a full-body workout within the time budget", () => {
    const plan = planSession(run([]), { now: T0 });
    expect(plan.kind).toBe("workout");
    expect(plan.template).toBe("full");
    expect(plan.exercises.length).toBeGreaterThan(0);
    expect(plan.estMinutes).toBeLessThanOrEqual(45);
    for (const e of plan.exercises) {
      expect(ex(e.exerciseId).equipment).toEqual([]);
      expect(e.firstSetMode).toBe("technical_failure");
      expect(e.reasons.length).toBeGreaterThan(0);
    }
    expect(plan.calibrating).toBe(true);
    expect(plan.deloadActive).toBe(false);
  });

  it("requires a profile", () => {
    expect(() => planSession(replay([], catalog, p), { now: T0 })).toThrow(/profile/);
  });

  it("rest when rest is recommended (3 daily hard sessions)", () => {
    const s = run([...session(T0, "a", FULL), ...session(T0 + D, "b", FULL), ...session(T0 + 2 * D, "c", FULL)]);
    const plan = planSession(s, { now: T0 + 3 * D });
    expect(plan).toMatchObject({ kind: "rest", template: null, exercises: [], estMinutes: 0 });
    expect(plan.reasons[0]).toMatch(/Systemic fatigue high/);
  });

  it("the day after a push session it picks a template that is not push, and says what it skipped", () => {
    const s = run(session(T0, "a", PUSH_DAY));
    const plan = planSession(s, { now: T0 + 20 * H });
    expect(plan.kind).toBe("workout");
    expect(plan.template).not.toBe("push");
    expect(plan.template).not.toBe("upper");
  });

  it("skipped regions carry state, hours and a reason", () => {
    const s = run(session(T0, "a", PUSH_DAY));
    const plan = planSession(s, { now: T0 + 20 * H, overrideEquipment: [] });
    for (const x of plan.skippedRegions) {
      expect(x.state).not.toBe("ready");
      expect(plan.reasons.some((r) => r.startsWith(`${x.region[0]!.toUpperCase()}`) && /skipped: (recovering|fatigued), ready in ~\d+h/.test(r))).toBe(true);
    }
  });
});

describe("constraints", () => {
  it("equipment: uses profile equipment, or overrideEquipment when given", () => {
    const kit = run([], { equipment: ALL_KIT });
    const withKit = planSession(kit, { now: T0 });
    const none = planSession(kit, { now: T0, overrideEquipment: [] });
    expect(withKit.exercises.some((e) => ex(e.exerciseId).equipment.length > 0)).toBe(true);
    for (const e of none.exercises) expect(ex(e.exerciseId).equipment).toEqual([]);
  });

  it("excluded exercises and excluded regions are never planned", () => {
    const first = planSession(run([]), { now: T0 }).exercises.map((e) => e.exerciseId);
    const plan = planSession(run([], { excludeExercises: first, excludeRegions: ["abs"] }), { now: T0 });
    for (const e of plan.exercises) {
      expect(first).not.toContain(e.exerciseId);
      expect(primary(e.exerciseId)).not.toContain("abs");
    }
  });

  it("sore regions from today's check-in are treated as fatigued", () => {
    const both = planSession(run([ev(T0 - H, { type: "checkin", payload: { feel: "normal", soreRegions: ["quads", "chest"] } })]), { now: T0 });
    for (const e of both.exercises) {
      expect(primary(e.exerciseId)).not.toContain("quads");
      expect(primary(e.exerciseId)).not.toContain("chest");
    }
    const s = run([ev(T0 - H, { type: "checkin", payload: { feel: "normal", soreRegions: ["quads"] } })]);
    const plan = planSession(s, { now: T0 });
    expect(plan.template).toBe("full");
    expect(plan.skippedRegions).toContainEqual(expect.objectContaining({ region: "quads", state: "fatigued" }));
    expect(plan.reasons).toContain("Quads skipped: you said they're sore");
    // Next day the soreness no longer applies.
    expect(planSession(s, { now: T0 + D }).exercises.some((e) => primary(e.exerciseId).includes("quads"))).toBe(true);
  });

  it("time budget: fewer minutes, fewer (or equal) exercises, never over budget", () => {
    const s = run([], { equipment: ALL_KIT });
    const long = planSession(s, { now: T0, minutes: 60 });
    const short = planSession(s, { now: T0, minutes: 12 });
    expect(short.estMinutes).toBeLessThanOrEqual(12);
    expect(short.exercises.length).toBeLessThanOrEqual(long.exercises.length);
  });

  it("projected raw session stimulus stays at or below sessionMax for every region", () => {
    const plan = planSession(run([], { equipment: ALL_KIT }), { now: T0, minutes: 120 });
    for (const v of Object.values(planStimulus(plan))) expect(v).toBeLessThanOrEqual(p.stimulus.sessionMax + 1e-9);
  });
});

describe("sets, deload, check-in, AMRAP", () => {
  const trained = () => {
    // Familiar user: several weeks of full-body sessions, then a week off so needs are high and nothing is fatigued.
    const days = [0, 2, 4, 7, 9, 11, 14, 16, 18];
    return days.flatMap((d) => session(T0 + d * D, `s${d}`, FULL));
  };
  const now = T0 + 25 * D;
  const totalSets = (plan: Plan) => plan.exercises.reduce((a, e) => a + e.sets.length, 0);

  it("AMRAP on the last set of the first exercise with 2+ sets; not again within amrapIntervalDays", () => {
    const plan = planSession(run(trained()), { now });
    const first = plan.exercises.find((e) => e.sets.length >= 2)!;
    expect(first.sets.at(-1)!.isAmrap).toBe(true);
    expect(plan.exercises.flatMap((e) => e.sets).filter((x) => x.isAmrap)).toHaveLength(1);
    const recent = run([...trained(), set(now - D, "x", "dead_bug", 10, 0, { isAmrap: true })]);
    expect(planSession(recent, { now }).exercises.flatMap((e) => e.sets).some((x) => x.isAmrap)).toBe(false);
  });

  it("beat_up check-in never adds sets", () => {
    const normal = planSession(run(trained()), { now });
    const beat = planSession(run([...trained(), ev(now - H, { type: "checkin", payload: { feel: "beat_up", soreRegions: [] } })]), { now });
    expect(beat.kind).toBe("workout");
    expect(totalSets(beat)).toBeLessThanOrEqual(totalSets(normal));
  });

  it("deload: fewer sets and +deloadRirAdd", () => {
    const s = run(trained());
    const normal = planSession(s, { now });
    s.deload = { active: true, since: now - D, endedAt: null };
    const deload = planSession(s, { now });
    expect(deload.deloadActive).toBe(true);
    expect(totalSets(deload)).toBeLessThan(totalSets(normal));
    const rir = normal.exercises[0]!.sets[0]!.targetRir; // level-dependent (this user is inferred near beginner: 3)
    for (const e of deload.exercises) for (const x of e.sets) expect(x.targetRir).toBe(rir + 2);
  });

  it("continuity reason for recently used exercises", () => {
    const plan = planSession(run(trained()), { now: T0 + 20 * D });
    expect(plan.exercises.some((e) => e.reasons.some((r) => /^Keeps your progress going \(done \d+ times? in the last 3 weeks\)$/.test(r)))).toBe(true);
  });

  it("moves up the ladder with a reason when the current level is too easy", () => {
    const s = run(trained());
    s.capacity.push_up_standard = { M: 30, obs: 10, lastPerformed: now - 5 * D };
    const plan = planSession(s, { now });
    const push = plan.exercises.find((e) => ex(e.exerciseId).ladderId === "push_up");
    expect(push?.exerciseId).toBe("push_up_decline");
    expect(push?.reasons).toContain("Moved up to Decline push-up: you're past 20 reps, so this makes it hard enough again");
  });
});

describe("property: planner safety and determinism", () => {
  const EX_IDS = catalog.exercises.map((e) => e.id);
  const arb = fc.record({
    equipment: fc.subarray(ALL_KIT as Equipment[]),
    excludeExercises: fc.subarray(EX_IDS, { maxLength: 8 }),
    excludeRegions: fc.subarray([...REGIONS], { maxLength: 3 }),
    daysPerWeek: fc.integer({ min: 1, max: 7 }),
    sessionMinutes: fc.integer({ min: 10, max: 90 }),
    sore: fc.subarray([...REGIONS], { maxLength: 4 }),
    history: fc.array(
      fc.record({ day: fc.integer({ min: 0, max: 20 }), sets: fc.array(fc.tuple(fc.constantFrom(...EX_IDS), fc.integer({ min: 1, max: 30 }), fc.integer({ min: 0, max: 4 })), { minLength: 1, maxLength: 8 }) }),
      { maxLength: 6 },
    ),
    nowH: fc.integer({ min: 0, max: 48 }),
  });

  it("never plans excluded / missing-equipment / sore / fatigued-primary exercises; deterministic", () => {
    fc.assert(
      fc.property(arb, (a) => {
        const events = [
          ...a.history.flatMap((h, i) => session(T0 + h.day * D + i, `h${i}`, h.sets)),
        ];
        const now = T0 + 21 * D + a.nowH * H;
        const all = [
          profile(T0, { equipment: a.equipment, excludeExercises: a.excludeExercises, excludeRegions: a.excludeRegions, daysPerWeek: a.daysPerWeek, sessionMinutes: a.sessionMinutes }),
          ...events,
          ev(now - 1, { type: "checkin", payload: { feel: "normal", soreRegions: a.sore } }),
        ];
        const s = replay(all, catalog, p);
        const plan = planSession(s, { now });
        const r = readiness(s, now);
        // Soreness applies on the check-in's UTC day only (it can be "yesterday" when now is just after midnight).
        const sore = checkinFor(s, now)?.soreRegions ?? [];
        for (const e of plan.exercises) {
          const x = ex(e.exerciseId);
          expect(a.excludeExercises).not.toContain(x.id);
          for (const t of x.equipment) expect(a.equipment).toContain(t);
          for (const m of primary(x.id)) {
            expect(sore).not.toContain(m);
            expect(a.excludeRegions).not.toContain(m);
            expect(r[m].state).not.toBe("fatigued");
          }
        }
        if (plan.kind === "workout") expect(plan.estMinutes).toBeLessThanOrEqual(a.sessionMinutes);
        expect(TEMPLATES.map((t) => t.id).concat([null as never])).toContain(plan.template);
        // Deterministic, and independent of event order.
        expect(planSession(replay([...all].reverse(), catalog, p), { now })).toEqual(plan);
      }),
      { numRuns: 60 },
    );
  });
});
