import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  advanceTo, checkinFor, confidence, decay, deloadActiveAt, diagnostics, effectiveRho, equipmentGaps, fatigueOf, isCalibrating, predictSet,
  prescribe, regionFatigue, replay, weeklyNeed,
  type EngineEvent,
} from "../src/engine";
import { catalog, ev, H, params, profile, session, set, T0 } from "./helpers";

const p = params();
const D = 24 * H;
const run = (events: EngineEvent[], pp = p) => replay([profile(), ...events], catalog, pp);
const start = (ts: number, id: string) => ev(ts, { type: "session_started", payload: { sessionId: id } });

describe("prediction log and observation types", () => {
  it("logs every non-warm-up set with M_pred, M_obs and clamped err", () => {
    const s = run([...session(T0, "a", [["push_up_standard", 3, 0], ["push_up_standard", 40, 0]])]);
    expect(s.predictionLog).toHaveLength(2);
    const [a] = s.predictionLog;
    expect(a).toMatchObject({ ts: T0, exerciseId: "push_up_standard", type: "capacity", M_pred: 20, M_obs: 3 });
    expect(a!.err).toBe(-0.3); // (3 - 20) / 20 = -0.85, clamped
  });

  it("capacity: the first fresh set replaces the guess, later ones update M by EMA", () => {
    const s = run(session(T0, "a", [["push_up_standard", 15, 2]]));
    expect(s.capacity.push_up_standard).toMatchObject({ M: 17, obs: 1 });
    const s2 = run([...session(T0, "a", [["push_up_standard", 15, 2]]), ...session(T0 + 3 * D, "b", [["push_up_standard", 18, 2]])]);
    expect(s2.capacity.push_up_standard).toMatchObject({ M: 17 + 0.3 * (20 - 17), obs: 2 });
    expect(s.rho.obs + s.d.obs + s.b.obs).toBe(0);
  });

  it("recovery: first clean set with carried fatigue updates rho; positive err lowers rho", () => {
    const heavy: [string, number, number][] = [["push_up_standard", 15, 0], ["push_up_standard", 12, 0], ["push_up_standard", 10, 0]];
    const s = run([...session(T0, "a", heavy), ...session(T0 + 12 * H, "b", [["push_up_standard", 30, 0]])]);
    const obs = s.predictionLog.at(-1)!;
    expect(obs.type).toBe("recovery");
    expect(obs.err).toBe(0.3);
    expect(s.rho).toEqual({ value: 1 * (1 - 0.1 * 0.3), obs: 1 });
  });

  it("recovery inside the noise band leaves rho unchanged but counts the observation", () => {
    const heavy: [string, number, number][] = [["push_up_standard", 15, 0], ["push_up_standard", 12, 0]];
    const before = run(session(T0, "a", heavy));
    const M_pred = predictSet(before, "push_up_standard", T0 + 12 * H).M_pred;
    const s = run([...session(T0, "a", heavy), ...session(T0 + 12 * H, "b", [["push_up_standard", Math.round(M_pred) - 2, 2]])]);
    expect(s.predictionLog.at(-1)!.type).toBe("recovery");
    expect(Math.abs(s.predictionLog.at(-1)!.err)).toBeLessThanOrEqual(0.08);
    expect(s.rho).toEqual({ value: 1, obs: 1 });
  });

  it("acute: only consecutive sets of the same exercise", () => {
    const s = run(session(T0, "a", [["push_up_standard", 12, 2], ["squat_bodyweight", 20, 2], ["push_up_standard", 10, 2]]));
    expect(s.predictionLog.map((x) => x.type)).toEqual(["capacity", "capacity", "log_only"]);
    expect(s.d).toEqual({ value: 0.12, obs: 0 });
  });

  it("acute: ΔF below minDeltaF is log_only", () => {
    const s = run(session(T0, "a", [["push_up_standard", 12, 2], ["push_up_standard", 10, 2]]), params((x) => (x.calibration.acute.minDeltaF = 5)));
    expect(s.predictionLog[1]!.type).toBe("log_only");
  });

  it("amrap: updates b from the earlier non-AMRAP set, comparing the whole-rep midpoint; d untouched", () => {
    const familiar = params((x) => (x.novelty.amp = 0));
    const s = run([start(T0, "a"), set(T0, "a", "push_up_standard", 12, 2), set(T0, "a", "push_up_standard", 13, 0, { isAmrap: true })], familiar);
    const predicted = 14 * 0.88 ** ((1.2 ** 0.25) * 0.75);
    expect(s.predictionLog[1]!.type).toBe("amrap");
    expect(s.b.value).toBeCloseTo(0.3 * (13 + 0.5 - predicted), 9); // 13 whole reps -> true max in [13, 14)
    expect(s.b.obs).toBe(1);
    expect(s.d).toEqual({ value: 0.12, obs: 0 });
    expect(s.lastAmrapTs).toBe(T0);
  });

  it("amrap on a hold: the midpoint is half a second in repsEq", () => {
    const familiar = params((x) => (x.novelty.amp = 0));
    const s = run([start(T0, "a"), set(T0, "a", "plank", 45, 2, { hold: true }), set(T0, "a", "plank", 39, 0, { isAmrap: true, hold: true })], familiar);
    const dF = 1.0 * (15 / 10) ** 0.25; // plank: abs 1 -> ΔF = set-1 fatigue
    const predicted = (15 + 2) * 0.88 ** dF;
    expect(s.b.value).toBeCloseTo(0.3 * (13 + 0.5 / 3 - predicted), 9);
  });

  it("amrap without an earlier non-AMRAP set is log_only; b is clamped", () => {
    const lone = run([start(T0, "a"), set(T0, "a", "push_up_standard", 20, 0, { isAmrap: true })]);
    expect(lone.predictionLog[0]!.type).toBe("log_only");
    expect(lone.b.value).toBe(0);
    const big = run([start(T0, "a"), set(T0, "a", "push_up_standard", 12, 2), set(T0, "a", "push_up_standard", 200, 0, { isAmrap: true })]);
    expect(big.b.value).toBe(5);
  });
});

describe("deload", () => {
  // Four exercises with (mostly) separate regions, each measured once a fortnight earlier: a first measurement is judged against the
  // catalog's guess, so it never counts towards a deload. After that, each first set of a session is a clean capacity observation.
  const names = ["push_up_standard", "squat_bodyweight", "dead_bug", "calf_raise_double"];
  const B = T0 - 14 * D;
  const measured = session(B, "m", names.map((e) => [e, 20, 0] as [string, number, number]));
  const weak: [string, number, number][] = names.map((e) => [e, 3, 0]);
  const strong: [string, number, number][] = names.map((e) => [e, 40, 0]);

  it("a first measurement far below the catalog's guess is not a drop in form", () => {
    expect(run(session(T0, "a", weak)).deload.active).toBe(false);
  });

  it("triggers when the mean err of >= minObs clean observations is below triggerBelow", () => {
    const three = run([...measured, ...session(T0, "a", weak.slice(0, 3))]);
    expect(three.deload.active).toBe(false);
    const s = run([...measured, ...session(T0, "a", weak)]);
    expect(s.deload).toEqual({ active: true, since: T0, endedAt: null });
    // Same state a day after the deload has run out: the target is back to normal.
    const rir = (at: number) => prescribe(s, "glute_bridge", 1, at).sets[0]!.targetRir;
    expect(rir(T0 + H)).toBe(rir(T0 + 8 * D) + p.planner.deloadRirAdd);
  });

  it("clears when the rolling mean rises above clearAbove", () => {
    const s = run([...measured, ...session(T0, "a", weak), ...session(T0 + 2 * D, "b", strong)]);
    expect(s.deload).toEqual({ active: false, since: null, endedAt: T0 + 2 * D });
  });

  it("clears after maxDays, and old observations cannot re-trigger it", () => {
    const s = run([...measured, ...session(T0, "a", weak)]);
    expect(deloadActiveAt(s, T0 + 7 * D)).toBe(true);
    expect(deloadActiveAt(s, T0 + 7 * D + 1)).toBe(false);
    const later = run([...measured, ...session(T0, "a", weak), ...session(T0 + 9 * D, "b", [["push_up_standard", 3, 0]])]);
    expect(later.deload).toEqual({ active: false, since: null, endedAt: T0 + 7 * D });
  });
});

describe("confidence and calibrating flag", () => {
  it("confidence levels by observation count", () => {
    expect([0, 2, 3, 7, 8, 19, 20, 100].map((n) => confidence(n, p))).toEqual([
      "calibrating", "calibrating", "low", "low", "medium", "medium", "high", "high",
    ]);
  });

  it("calibrating until 6 clean observations and 7 days since the first session; the fold records when it ended", () => {
    const ex = ["push_up_standard", "squat_bodyweight", "dead_bug", "calf_raise_double", "prone_superman"];
    const sessions = [0, 4].flatMap((day) => session(T0 + day * D, `s${day}`, ex.map((e) => [e, 12, 2] as [string, number, number])));
    const five = run(sessions.slice(0, 7)); // first session only: 5 clean observations
    expect(isCalibrating(five, T0 + 30 * D)).toBe(true);
    const s = run(sessions);
    expect(s.predictionLog.filter((x) => x.type === "capacity" || x.type === "recovery")).toHaveLength(10);
    expect(isCalibrating(s, T0 + 6 * D)).toBe(true);
    expect(isCalibrating(s, T0 + 7 * D)).toBe(false);
    expect(s.calibratedAt).toBeNull(); // no event after day 7 yet
    expect(run([...sessions, ...session(T0 + 8 * D, "s8", [["push_up_standard", 12, 2]])]).calibratedAt).toBe(T0 + 8 * D);
    expect(isCalibrating(run([]), T0 + 100 * D)).toBe(true);
  });
});

describe("check-ins", () => {
  const beatUp = (ts: number) => ev(ts, { type: "checkin", payload: { feel: "beat_up", soreRegions: ["quads"] } });
  const workout = session(T0 - 12 * H, "a", [["push_up_standard", 15, 1], ["push_up_standard", 12, 1]]); // 06:00 the same UTC day

  it("never changes the learned rho; sore regions kept for that UTC day only", () => {
    const s = run([beatUp(T0)]);
    expect(s.rho).toEqual({ value: 1, obs: 0 });
    expect(checkinFor(s, T0 + H)?.soreRegions).toEqual(["quads"]);
    expect(checkinFor(s, T0 + 6 * H + 1)).toBeNull(); // T0 is 18:00 UTC, so +6h is the next day
    const many = Array.from({ length: 100 }, (_, i) => beatUp(T0 + i * H));
    expect(run(many).rho.value).toBe(1); // no ratchet
  });

  it("beat_up slows recovery on its UTC day only (rho × beatUpNudge)", () => {
    const plain = run(workout);
    const beat = run([...workout, beatUp(T0 - H)]);
    expect(effectiveRho(beat, T0)).toBeCloseTo(1.02, 12);
    expect(effectiveRho(beat, T0 + 6 * H + 1)).toBe(1);
    expect(effectiveRho(plain, T0)).toBe(1);
    // Same day: more fatigue left than without the check-in.
    expect(regionFatigue(beat, "chest", T0 + 5 * H)).toBeGreaterThan(regionFatigue(plain, "chest", T0 + 5 * H));
    // From the state's own time (the profile event at T0), the next 5 h decay with rho 1.02.
    expect(beat.t).toBe(T0);
    const c = beat.regions.chest;
    expect(fatigueOf(advanceTo(beat, T0 + 5 * H).regions.chest)).toBeCloseTo(fatigueOf(decay(c, "chest", 5, 1.02, p)), 12);
    // Next day: back to the learned rho.
    const nextDay = advanceTo(beat, T0 + 7 * H);
    expect(fatigueOf(advanceTo(nextDay, T0 + 12 * H).regions.chest)).toBeCloseTo(fatigueOf(decay(nextDay.regions.chest, "chest", 5, 1, p)), 12);
  });

  it("the day's effective rho is clamped to rho.max", () => {
    const s = run([beatUp(T0)]);
    s.rho.value = 1.8;
    expect(effectiveRho(s, T0)).toBe(1.8);
  });
});

describe("external activities", () => {
  it("football, hard, 90 min: preset × 1.5 h × 1.5, systemic too, no stimulus", () => {
    const s = run([ev(T0, { type: "external_activity", payload: { presetId: "football", minutes: 90, intensity: "hard" } })]);
    expect(fatigueOf(s.regions.quads)).toBeCloseTo(2 * 2.25, 12);
    expect(fatigueOf(s.regions.abs)).toBeCloseTo(0.5 * 2.25, 12);
    expect(fatigueOf(s.regions.chest)).toBe(0);
    expect(s.G).toBeCloseTo(8 * 2.25, 12);
    expect(s.sessions).toHaveLength(0);
    expect(weeklyNeed(s, T0).quads.done).toBe(0);
  });

  it("light cycling for 30 minutes", () => {
    const s = run([ev(T0, { type: "external_activity", payload: { presetId: "cycling", minutes: 30, intensity: "light" } })]);
    expect(fatigueOf(s.regions.quads)).toBeCloseTo(2 * 0.25, 12);
    expect(s.G).toBeCloseTo(5 * 0.25, 12);
  });
});

describe("property: learned parameters stay within their clamps", () => {
  const EX = ["push_up_standard", "squat_bodyweight", "plank", "pull_up", "calf_raise_single"];
  const item = fc.record({
    gapH: fc.integer({ min: 0, max: 96 }),
    kind: fc.constantFrom("set", "set", "set", "amrap", "checkin", "new_session"),
    ex: fc.constantFrom(...EX),
    reps: fc.integer({ min: 0, max: 60 }),
    rir: fc.integer({ min: 0, max: 5 }),
  });

  it("rho, b, d, M within bounds for arbitrary streams", () => {
    fc.assert(
      fc.property(fc.array(item, { maxLength: 60 }), (items) => {
        let t = T0;
        let sid = 0;
        const events: EngineEvent[] = [start(t, "s0")];
        for (const it of items) {
          t += it.gapH * H;
          if (it.kind === "checkin") events.push(ev(t, { type: "checkin", payload: { feel: "beat_up", soreRegions: [] } }));
          else if (it.kind === "new_session") events.push(start(t, `s${++sid}`));
          else events.push(set(t, `s${sid}`, it.ex, it.reps, it.rir, { isAmrap: it.kind === "amrap", hold: it.ex === "plank" }));
        }
        const s = run(events);
        const c = p.calibration;
        expect(s.rho.value).toBeGreaterThanOrEqual(c.rho.min);
        expect(s.rho.value).toBeLessThanOrEqual(c.rho.max);
        expect(s.b.value).toBeGreaterThanOrEqual(c.rirBias.min);
        expect(s.b.value).toBeLessThanOrEqual(c.rirBias.max);
        expect(s.d.value).toBeGreaterThanOrEqual(c.acute.min - 1e-12);
        expect(s.d.value).toBeLessThanOrEqual(c.acute.max + 1e-12);
        for (const e of Object.values(s.capacity)) expect(e.M).toBeGreaterThan(0);
        for (const x of s.predictionLog) expect(Math.abs(x.err)).toBeLessThanOrEqual(c.errorClamp);
      }),
    );
  });
});

describe("diagnostics", () => {
  it("equipmentGaps: with no equipment, upper_back and biceps have no c=1 option", () => {
    // Hamstrings are covered without equipment since the nordic curl and single-leg RDL are bodyweight.
    expect(equipmentGaps(run([]))).toEqual([
      { region: "upper_back", best: 0.5 },
      { region: "biceps", best: 0 },
    ]);
    expect(equipmentGaps(replay([profile(T0, { equipment: ["pullup_bar", "resistance_band"] })], catalog, p))).toEqual([]);
  });

  it("MAE, confidences, log tail", () => {
    const s = run(session(T0, "a", [["push_up_standard", 3, 0], ["push_up_standard", 40, 0]]));
    const d = diagnostics(s, T0 + H);
    const expected = s.predictionLog.reduce((a, x) => a + Math.abs(x.M_obs - x.M_pred), 0) / 2;
    expect(d.maeLast20).toBeCloseTo(expected, 12);
    expect(d.maeByWeek).toEqual([{ week: 1, mae: d.maeLast20, n: 2 }]);
    expect(d.predictionLogTail).toHaveLength(2);
    expect(d.confidences).toEqual({ rho: "calibrating", b: "calibrating", d: "calibrating" });
    expect(diagnostics(run([]), T0).maeLast20).toBeNull();
  });
});
