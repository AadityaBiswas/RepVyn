import { isCalibrating } from "./calibrate";
import { prescribe, type DayIntensity, type FirstSetMode, type LoadFlag, type PrescribedSet } from "./capacity";
import { applyFit, difficultyOf, type PersonalDifficulty } from "./difficulty";
import { estimateCalories } from "./energy";
import { exerciseEffects, leastUsedMuscles, muscleUsage, usageWords, type MuscleEffect } from "./muscles";
import { currentLevels, REGION_NAMES, REGION_PLURAL, usableNow, withinDifficulty } from "./planner";
import { readinessWeight, weeklyNeed } from "./state";
import { REGIONS, type EngineState, type Equipment, type Exercise, type Muscle, type Region } from "./types";

/**
 * The suggestion engine: exercises ranked for the muscles the user wants to train, or, when none are chosen, for the muscles
 * that have had the least work. Same rules as the planner (owned equipment and dumbbells, pain, soreness, fatigue, difficulty,
 * likes) and the same prescription, so a suggestion is exactly what the planner would ask for if it picked that exercise.
 * Read-only; planSession({ focus }) builds a whole workout from the same muscles.
 */

export interface SuggestOptions {
  now: number;
  /** Muscles to train. Empty or omitted: the least-used muscles (leastUsedMuscles). */
  muscles?: Region[];
  /** Equipment for today; default the profile's. */
  equipment?: Equipment[];
  /** Exercise ids to leave out (already in the plan, or swapped away). */
  exclude?: string[];
  /** At most this many suggestions. Default 6. */
  limit?: number;
  /** Sets each suggestion is prescribed. Default planner.sets.base. */
  sets?: number;
  intensity?: DayIntensity;
}

export interface Suggestion {
  exerciseId: string;
  name: string;
  /** Muscles it targets (catalog share 1). */
  targets: Region[];
  sets: PrescribedSet[];
  firstSetMode: FirstSetMode;
  loadFlag: LoadFlag;
  difficulty: PersonalDifficulty;
  /** Its effect on each muscle if done now, with these sets (muscles.ts). */
  effects: MuscleEffect[];
  alsoUses: Muscle[];
  /** "Works biceps hard. Also uses forearms." */
  summary: string;
  /** Active calories for these sets; null without body mass. */
  kcal: number | null;
  score: number;
  reasons: string[];
}

export interface Suggestions {
  /** "chosen": the muscles asked for; "least_used": picked by the engine. */
  basis: "chosen" | "least_used";
  muscles: Region[];
  suggestions: Suggestion[];
  /** Asked-for muscles with nothing to suggest, and why. */
  unavailable: { region: Region; reason: string }[];
}

/** Share of a suggestion's score carried by muscles it only helps; the ones it targets count in full. */
const HELPER_WEIGHT = 0.25;
/** Score kept by an exercise the user's lightest dumbbell is too heavy for. */
const TOO_HEAVY_FACTOR = 0.25;
/** Each pick already covering a muscle scales later candidates led by that muscle, so several muscles get a turn. */
const COVERED_FACTOR = 0.6;

export function suggestExercises(s: EngineState, opts: SuggestOptions): Suggestions {
  const { now } = opts;
  const P = s.params;
  const profile = s.profile;
  if (!profile) throw new Error("suggestExercises needs a profile_set event first");
  const excluded = new Set(profile.excludeRegions);
  const chosen = REGIONS.filter((m) => opts.muscles?.includes(m) && !excluded.has(m));
  const basis: Suggestions["basis"] = chosen.length ? "chosen" : "least_used";
  const muscles = chosen.length ? chosen : leastUsedMuscles(s, now, 3);
  const want = new Set<Region>(muscles);
  const usage = Object.fromEntries(muscleUsage(s, now).map((u) => [u.region, u]));
  const need = weeklyNeed(s, now);
  const canUse = usableNow(s, now, { ...(opts.equipment ? { equipment: opts.equipment } : {}), ...(opts.exclude ? { exclude: opts.exclude } : {}) });
  const calibrating = isCalibrating(s, now);
  const nSets = opts.sets ?? P.planner.sets.base;

  const unavailable: Suggestions["unavailable"] = [];
  const pool = new Map<string, Exercise>();
  for (const m of muscles) {
    const all = s.catalog.exercises.filter((e) => e.contributions[m] === 1);
    const cands = withinDifficulty(s, currentLevels(s, all.filter(canUse), now), now);
    if (!cands.length) {
      const u = usage[m]!;
      const isAre = REGION_PLURAL[m] ? "are" : "is";
      unavailable.push({
        region: m,
        reason: u.state === "fatigued"
          ? `${REGION_NAMES[m]} ${isAre} still recovering${u.hoursToReady > 0 ? `: ready in about ${Math.ceil(u.hoursToReady)} h` : ""}`
          : `No exercise for ${REGION_NAMES[m].toLowerCase()} fits your equipment and settings`,
      });
    }
    for (const e of cands) pool.set(e.id, e);
  }

  const scored = [...pool.values()].map((e): Suggestion => {
    const pr = prescribe(s, e.id, nSets, now, { canUse, ...(opts.intensity ? { intensity: opts.intensity } : {}) });
    const ex = s.catalog.byId[pr.exerciseId]!;
    const targets = REGIONS.filter((m) => ex.contributions[m] === 1);
    let score = 0;
    for (const m of REGIONS) {
      const c = ex.contributions[m];
      if (!c) continue;
      const u = usage[m]!;
      const wanted = want.has(m) ? 1 : HELPER_WEIGHT;
      // Chosen muscles count in full; otherwise the further behind this week, the more it counts.
      const behind = basis === "chosen" && want.has(m) ? 1 : Math.max(0.1, need[m].need);
      score += c * wanted * behind * readinessWeight(u.state, P);
    }
    // Even the lightest owned dumbbell is too heavy: a poor pick while anything else fits.
    if (pr.loadFlag === "too_heavy") score *= TOO_HEAVY_FACTOR;
    const liked = s.feedback[ex.id]?.liked;
    score += liked === true ? P.planner.likeBonus : liked === false ? -P.planner.dislikePenalty : 0;
    const difficulty = difficultyOf(s, ex.id, now);
    const measuring = !(s.capacity[ex.id]?.obs ?? 0) && !(s.strength[ex.id]?.obs ?? 0);
    const effects = exerciseEffects(s, ex.id, pr.sets, now);
    const kcal = estimateCalories(s, pr.sets.map((x) => ({ exerciseId: ex.id, reps: x.reps, seconds: x.seconds, targetRir: x.targetRir })));

    const reasons: string[] = [];
    const lead = targets.filter((m) => want.has(m));
    for (const m of lead) {
      reasons.push(basis === "chosen" ? `Targets ${REGION_NAMES[m].toLowerCase()}, which you chose` : `${usageWords(usage[m]!)}: one of your least trained muscles`);
    }
    if (liked === true) reasons.push("You said you like this one");
    if (measuring) reasons.push(calibrating ? "New to you: the first set measures your level" : "New to you");
    if (difficulty.score >= 3.5) reasons.push(`Hard for you${difficulty.reasons.length ? `: ${difficulty.reasons.join(", ")}` : ""}`);
    reasons.push(...pr.reasons);

    return {
      exerciseId: ex.id, name: ex.name, targets, sets: pr.sets, firstSetMode: pr.firstSetMode, loadFlag: pr.loadFlag, difficulty,
      effects: effects.regions, alsoUses: effects.alsoUses, summary: effects.summary, kcal: kcal ? Math.round(kcal.activeKcal) : null,
      score: applyFit(score, difficulty.score, P.difficulty.preferWeight), reasons,
    };
  });

  // Greedy pick: one exercise per movement family, spreading picks across the muscles.
  const limit = opts.limit ?? 6;
  const picked: Suggestion[] = [];
  const covered = new Map<Region, number>();
  const ladders = new Set<string>();
  const leadOf = (x: Suggestion) => x.targets.find((m) => want.has(m)) ?? x.targets[0]!;
  const adjusted = (x: Suggestion) => x.score * COVERED_FACTOR ** (covered.get(leadOf(x)) ?? 0);
  let left = scored;
  while (picked.length < limit) {
    left = left.filter((x) => !ladders.has(s.catalog.byId[x.exerciseId]!.ladderId) && !picked.some((p) => p.exerciseId === x.exerciseId));
    if (!left.length) break;
    const best = left.reduce((a, b) => (adjusted(b) > adjusted(a) || (adjusted(b) === adjusted(a) && b.exerciseId < a.exerciseId) ? b : a));
    picked.push(best);
    ladders.add(s.catalog.byId[best.exerciseId]!.ladderId);
    for (const m of best.targets) covered.set(m, (covered.get(m) ?? 0) + 1);
  }
  return { basis, muscles, suggestions: picked, unavailable };
}
