import { describe, expect, it } from "vitest";
import { applyFit, byLevel, capacityOf, difficultyLabel, difficultyOf, ladderLevel, replay, targetRir, type EngineEvent, type Rating } from "../src/engine";
import { catalog, ev, H, params, profile, T0 } from "./helpers";

const p = params();
const D = 24 * H;
const rate = (ts: number, exerciseId: string, rating: Rating) => ev(ts, { type: "exercise_feedback", payload: { exerciseId, rating } });
const run = (events: EngineEvent[], over: Parameters<typeof profile>[1] = {}) => replay([profile(T0 - D, over), ...events], catalog, p);

describe("difficulty labels", () => {
  it("bands at 1.5 / 2.5 / 3.5 / 4.5", () => {
    expect([1, 1.4, 1.5, 2.4, 2.5, 3.4, 3.5, 4.4, 4.5, 5].map(difficultyLabel)).toEqual([
      "too_easy", "too_easy", "easy", "easy", "right_challenge", "right_challenge", "hard", "hard", "too_hard", "too_hard",
    ]);
  });
});

describe("predicted difficulty", () => {
  it("is the library rating at the user's level before any data", () => {
    const s = run([]);
    expect(difficultyOf(s, "pistol_squat", T0)).toEqual({ score: 4, label: "hard", source: "predicted", reasons: [] });
    expect(difficultyOf(run([], { experience: "beginner" }), "pistol_squat", T0).score).toBe(5);
  });
});

describe("ratings", () => {
  it("move this exercise and, through demand tags, related exercises never rated", () => {
    const s = run([rate(T0, "pistol_squat", "too_hard")]);
    // R = 0.5; balance, mobility, coordination each 0.25, so D = 0.25: 4 + 0.5 + 0.25.
    expect(difficultyOf(s, "pistol_squat", T0 + H)).toMatchObject({ score: 4.8, label: "too_hard", source: "personal" });
    // reverse_lunge (balance) was never rated: 1 + 0.25.
    expect(difficultyOf(s, "reverse_lunge", T0 + H).score).toBe(1.3);
    // squat_bodyweight has no demands: unchanged.
    expect(difficultyOf(s, "squat_bodyweight", T0 + H).source).toBe("predicted");
  });

  it("too_easy pulls down; repeated ratings converge; demand offsets stay within ±demandMax", () => {
    const easy = run([rate(T0, "pull_up", "too_easy"), rate(T0 + 1, "pull_up", "too_easy")]);
    expect(difficultyOf(easy, "pull_up", T0 + H).score).toBeLessThan(difficultyOf(run([]), "pull_up", T0 + H).score);
    const many = run(Array.from({ length: 40 }, (_, i) => rate(T0 + i, "pistol_squat", "too_hard")));
    for (const v of Object.values(many.demandOffsets)) expect(Math.abs(v)).toBeLessThanOrEqual(p.difficulty.demandMax);
    expect(difficultyOf(many, "pistol_squat", T0 + H).score).toBe(5);
  });

  it("ratings for unknown exercises are ignored", () => {
    expect(run([rate(T0, "not_an_exercise", "too_hard")]).ratings).toEqual({});
  });
});

describe("strength fit", () => {
  it("a measured exercise far above the rep range becomes easy for this user", () => {
    const s = run([]);
    s.capacity.push_up_standard = { M: 40, obs: 3, lastPerformed: T0 };
    // m = 40 − 2 = 38; S = 3 − 2·log2(38/13) → clamps to 1; w = 3/5; P = 2: 0.4·2 + 0.6·1 = 1.4.
    expect(difficultyOf(s, "push_up_standard", T0 + D)).toMatchObject({ score: 1.4, label: "too_easy", source: "personal" });
  });

  it("weighted: dumbbells too light reads as too easy, with the reason, once measured", () => {
    const s = run([], { equipment: ["dumbbell"], dumbbells: { kind: "fixed", kg: [2, 3] } });
    s.strength.db_curl = { oneRm: 14, obs: 4, lastPerformed: T0, lastWeightKg: 3 };
    const d = difficultyOf(s, "db_curl", T0 + D);
    expect(d.reasons).toContain("dumbbells too light");
    expect(d.score).toBeLessThan(1.5);
  });

  it("an unmeasured rung next to a measured one gets neighbourTrust", () => {
    const s = run([]);
    s.capacity.push_up_standard = { M: 40, obs: 3, lastPerformed: T0 };
    expect(difficultyOf(s, "push_up_decline", T0 + D).source).toBe("personal");
  });
});

describe("each term of the score", () => {
  const owner = (kg: number[]) => run([], { equipment: ["dumbbell"], dumbbells: { kind: "fixed", kg } });
  const predictedOf = (s: ReturnType<typeof run>, id: string) => byLevel(catalog.byId[id]!.difficulty, ladderLevel(s, catalog.byId[id]!.ladderId));

  it("too_heavy dumbbells give S = 5, blended by w = n / (n + trustK)", () => {
    const s = owner([12.5, 15]);
    const P = predictedOf(s, "db_curl");
    s.strength.db_curl = { oneRm: 14, obs: 4, lastPerformed: T0, lastWeightKg: null }; // 12.5 kg: 30·(14/12.5 − 1) − 2 = 1.6 reps, below the range
    const w = 4 / (4 + p.difficulty.trustK);
    const d = difficultyOf(s, "db_curl", T0 + H);
    expect(d.score).toBeCloseTo(Math.min(5, (1 - w) * P + w * 5), 1);
    expect(d.reasons).toContain("dumbbells too heavy");
    expect(d.source).toBe("personal");
  });

  it("'not enough reps' appears when the fit score is 4 or more without a load flag", () => {
    const s = owner([11]);
    s.strength.db_curl = { oneRm: 14, obs: 4, lastPerformed: T0, lastWeightKg: null }; // 11 kg: about 6.2 target reps, in range but low
    expect(difficultyOf(s, "db_curl", T0 + H).reasons).toContain("not enough reps");
  });

  it("an unmeasured rung beside a measured one blends in S with neighbourTrust", () => {
    const s = run([]);
    s.capacity.push_up_standard = { M: 40, obs: 3, lastPerformed: T0 };
    const ex = catalog.byId.push_up_decline!;
    const m = capacityOf(s, ex.id, T0 + D).M - targetRir(s, T0 + D);
    const [lo, hi] = p.capacity.repRange;
    const S = Math.min(5, Math.max(1, 3 - 2 * Math.log2(m / ((lo + hi) / 2))));
    const wN = p.difficulty.neighbourTrust;
    expect(difficultyOf(s, ex.id, T0 + D).score).toBeCloseTo((1 - wN) * predictedOf(s, ex.id) + wN * S, 1);
  });

  it("demand tags the user finds hard (offset > 0.25) are listed, at most two", () => {
    const s = run([rate(T0, "pistol_squat", "too_hard"), rate(T0 + 1, "pistol_squat", "too_hard")]);
    const r = difficultyOf(s, "pistol_squat", T0 + H).reasons;
    expect(r).toHaveLength(2);
    for (const k of r) expect(catalog.byId.pistol_squat!.demands).toContain(k);
    expect(difficultyOf(run([rate(T0, "pistol_squat", "too_hard")]), "pistol_squat", T0 + H).reasons).toEqual([]); // 0.25 is not above 0.25
  });
});

describe("fit factor", () => {
  it("scales a positive score by f = 1 − preferWeight·|difficulty − 3| / 2 and divides a negative one", () => {
    expect(applyFit(2, 3, 0.3)).toBe(2);
    expect(applyFit(2, 5, 0.3)).toBeCloseTo(2 * 0.7, 12);
    expect(applyFit(2, 1, 0.3)).toBeCloseTo(2 * 0.7, 12);
    expect(applyFit(-2, 3, 0.3)).toBe(-2);
    expect(applyFit(-2, 5, 0.3)).toBeCloseTo(-2 / 0.7, 12); // worse than -2, never better
    expect(applyFit(-2, 5, 0.3)).toBeLessThan(-2);
    expect(applyFit(2, 5, 0)).toBe(2);
  });
});
