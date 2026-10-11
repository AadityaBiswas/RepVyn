import { describe, expect, it } from "vitest";
import { difficultyOf, prescribe, replay, type EngineEvent } from "../src/engine";
import { Rng } from "../src/sim/rng";
import { catalog, ev, H, params, profile, T0 } from "./helpers";

const p = params();
const D = 24 * H;

/**
 * A synthetic lifter on db_curl with a true 1RM of 11 kg rising `growth` per session. They take the engine's weight.
 * On a technical-failure set they stop 1 rep short of failure and say so. Otherwise they do the target reps
 * (+/-1, never past failure) and under-report reps left by about 1 (Steele et al. 2017).
 */
function simulate(seed: number, sessions: number, growth: number) {
  const rng = new Rng(seed);
  const events: EngineEvent[] = [profile(T0 - D, { equipment: ["dumbbell"], bodyMassKg: 70, dumbbells: { kind: "adjustable", minKg: 2, maxKg: 30, stepKg: 1 } })];
  let trueOneRm = 11;
  const chosen: number[] = [];
  const errors: number[] = [];
  let s = replay(events, catalog, p);
  for (let i = 0; i < sessions; i++) {
    const now = T0 + i * 3 * D;
    const pr = prescribe(s, "db_curl", 1, now);
    const w = pr.sets[0]!.weightKg!;
    chosen.push(w);
    const trueM = Math.max(1, 30 * (trueOneRm / w - 1));
    let reps: number;
    let rir: number;
    if (pr.firstSetMode === "technical_failure") {
      reps = Math.max(1, Math.floor(trueM) - 1);
      rir = 1;
    } else {
      reps = Math.max(1, Math.min(Math.floor(trueM), Math.round(pr.sets[0]!.reps! + rng.normal(0, 1))));
      rir = Math.max(0, Math.min(5, Math.round(trueM - reps - 1 + rng.normal(0, 0.5))));
    }
    events.push(
      ev(now, { type: "session_started", payload: { sessionId: `s${i}` } }),
      ev(now, { type: "set_logged", payload: { sessionId: `s${i}`, exerciseId: "db_curl", reps, rir, isWarmup: false, isAmrap: false, weightKg: w } }),
      ev(now, { type: "session_ended", payload: { sessionId: `s${i}` } }),
    );
    s = replay(events, catalog, p);
    errors.push(Math.abs(s.strength.db_curl!.oneRm - trueOneRm) / trueOneRm);
    trueOneRm *= growth;
  }
  return { events, s, chosen, errors };
}

describe("simulation: a dumbbell lifter", () => {
  it("learns their strength within 10% from the second session on, and ratings raise difficulty", () => {
    const { events, s, errors } = simulate(7, 8, 1.015);
    // The spec bound is session 6 (index 5); in this run the error is already under 10% from the second session on (session 0 is the first measurement).
    errors.slice(1).forEach((e) => expect(e).toBeLessThan(0.1));

    const end = T0 + 30 * D;
    const before = difficultyOf(s, "db_curl", end).score;
    for (let k = 0; k < 3; k++) events.push(ev(end + k, { type: "exercise_feedback", payload: { exerciseId: "db_curl", rating: "too_hard" } }));
    expect(difficultyOf(replay(events, catalog, p), "db_curl", end + H).score).toBeGreaterThan(before);
  });

  it("steps the weight up after calibration as true strength rises well past the rep range", () => {
    // The engine keeps the calibrated weight while predicted reps stay inside the rep range, so strength must rise
    // 3% a session for a while before a step-up; the first calibration jump (chosen[0] -> chosen[1]) does not count.
    const { chosen } = simulate(7, 14, 1.03);
    expect(Math.max(...chosen.slice(2))).toBeGreaterThan(chosen[1]!);
  });
});
