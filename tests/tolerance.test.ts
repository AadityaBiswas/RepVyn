import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  predictSet, priorDrop, priorExposures, readiness, replay, toleranceOf, typicalSessionLoad, type EngineEvent, type Experience,
} from "../src/engine";
import { catalog, H, params, profile, session, T0 } from "./helpers";

const p = params();
const D = 24 * H;
const PUSH3: [string, number, number][] = [["push_up_standard", 10, 2], ["push_up_standard", 10, 2], ["push_up_standard", 10, 2]];
// The "15 exercises × 3 sets" session from the demo.
const BIG: [string, number, number][] = [
  "push_up_standard", "push_up_decline", "diamond_push_up", "pike_push_up", "pull_up", "chin_up", "band_row", "squat_bodyweight",
  "split_squat", "reverse_lunge", "glute_bridge_single_leg", "band_leg_curl", "calf_raise_single", "hanging_knee_raise", "band_curl",
].flatMap((e) => [[e, 10, 2], [e, 10, 2], [e, 10, 2]] as [string, number, number][]);
const as = (experience: Experience, ...events: EngineEvent[][]) => replay([profile(T0 - D, { experience }), ...events.flat()], catalog, p);

describe("priorDrop (bounded performance loss)", () => {
  it("has slope beta at zero fatigue for scale 1", () => {
    expect(priorDrop(0, 1, p)).toBe(0);
    expect(priorDrop(1e-6, 1, p) / 1e-6).toBeCloseTo(p.capacity.beta, 4);
  });

  it("never exceeds maxDrop, rises with fatigue and falls with tolerance", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 200, noNaN: true }), fc.double({ min: 0.3, max: 3, noNaN: true }), (F, scale) => {
        const d = priorDrop(F, scale, p);
        expect(d).toBeLessThanOrEqual(p.capacity.maxDrop);
        expect(priorDrop(F + 1, scale, p)).toBeGreaterThanOrEqual(d);
        expect(priorDrop(F, scale * 1.5, p)).toBeLessThanOrEqual(d);
      }),
    );
  });

  it("a 15-exercise session right after predicts under maxDrop, not near-zero reps", () => {
    const s = as("advanced", session(T0, "big", BIG));
    const { M_pred } = predictSet(s, "push_up_standard", T0 + H);
    expect(1 - M_pred / s.capacity.push_up_standard!.M).toBeLessThan(p.capacity.maxDrop);
  });
});

describe("readiness is relative to the user's tolerance", () => {
  it("3 sets of a new exercise: fatigued for a beginner, not for an advanced lifter", () => {
    expect(readiness(as("beginner", session(T0, "s", PUSH3)), T0).chest.state).toBe("fatigued");
    expect(readiness(as("advanced", session(T0, "s", PUSH3)), T0).chest.state).toBe("recovering");
  });

  it("reports load = fatigue / tolerance, and an advanced lifter is ready sooner from the same session", () => {
    const b = readiness(as("beginner", session(T0, "s", PUSH3)), T0 + H).chest;
    const a = readiness(as("advanced", session(T0, "s", PUSH3)), T0 + H).chest;
    expect(b.tolerance).toBe(p.tolerance.init.beginner);
    expect(b.load).toBeCloseTo(b.fatigue / b.tolerance, 9);
    expect(a.hoursToReady).toBeLessThan(b.hoursToReady);
  });
});

describe("whole-body typical session before any history", () => {
  it("scales the default with experience", () => {
    expect(typicalSessionLoad(as("beginner"), T0)).toBeCloseTo(12 * p.tolerance.init.beginner / 5, 9);
    expect(typicalSessionLoad(as("intermediate"), T0)).toBe(12);
    expect(typicalSessionLoad(as("advanced"), T0)).toBeCloseTo(12 * 7.5 / 5, 9);
  });
});

describe("tolerance learning (repeated-bout effect)", () => {
  it("a session whose work exceeds T raises T by learnRate toward it; a lighter one never lowers it", () => {
    const s = as("intermediate", session(T0, "big", BIG));
    const dep = s.sessions[0]!.addedWork.quads;
    expect(dep).toBeGreaterThan(p.tolerance.init.intermediate);
    const T = 5 + p.tolerance.learnRate * (Math.min(dep, p.tolerance.max) - 5);
    expect(toleranceOf(s, "quads")).toBeCloseTo(T, 9);
    const after = as("intermediate", session(T0, "big", BIG), session(T0 + 3 * D, "light", PUSH3));
    expect(toleranceOf(after, "quads")).toBeCloseTo(T, 9);
  });

  it("learns from work, not novelty: a beginner's first 3 sets (4.8 fatigue, 3.0 work) leave T at the default", () => {
    const s = as("beginner", session(T0, "s", PUSH3));
    expect(s.sessions[0]!.addedFatigue.chest).toBeGreaterThan(p.tolerance.init.beginner);
    expect(s.sessions[0]!.addedWork.chest).toBeLessThan(p.tolerance.init.beginner);
    expect(toleranceOf(s, "chest")).toBe(p.tolerance.init.beginner);
  });
});

describe("novelty is per movement family (ladder)", () => {
  it("a new push-up variation after regular push-ups is not novel", () => {
    const s = as("intermediate", session(T0, "a", PUSH3), session(T0 + 2 * D, "b", PUSH3), session(T0 + 4 * D, "c", PUSH3));
    expect(priorExposures(s, "push_up_decline", null, T0 + 6 * D)).toBe(3);
    expect(priorExposures(s, "squat_bodyweight", null, T0 + 6 * D)).toBe(0);
  });

  it("advanced lifters take half the novelty penalty", () => {
    const b = as("beginner", session(T0, "s", PUSH3)).sessions[0]!.addedFatigue.chest;
    const a = as("advanced", session(T0, "s", PUSH3)).sessions[0]!.addedFatigue.chest;
    expect(b / a).toBeCloseTo(1.6 / 1.3, 9);
  });
});
