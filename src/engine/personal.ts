import { confidence } from "./calibrate";
import { prescribe, targetRir } from "./capacity";
import { ladderName } from "./catalog";
import { byLevel, level, levelName } from "./level";
import { REGION_NAMES } from "./planner";
import { toleranceOf } from "./recovery";
import { canLoad, oneRmFrom } from "./strength";
import { REGIONS, type Confidence, type EngineState, type PredictionLogEntry } from "./types";

/**
 * What the engine knows about one user, in plain words, for "you're understood" screens.
 * Pure read-only views over the state; nothing here changes what the engine learns.
 */

/**
 * Good sets in you today: predicted reps per set at target effort for this exercise (no ladder move),
 * until a set would fall below (1 − autoreg.dropFraction) of the first — where the engine would stop you anyway.
 * Empty for a weighted exercise when the profile has no dumbbells (nothing can be prescribed).
 */
export function goodSets(s: EngineState, exerciseId: string, now: number, maxSets = 8): { reps: number[]; targetRir: number; seconds: boolean } {
  const ex = s.catalog.byId[exerciseId];
  if (ex && !canLoad(s, ex)) return { reps: [], targetRir: targetRir(s, now), seconds: false };
  const pr = prescribe(s, exerciseId, maxSets, now, { canUse: () => false });
  const amounts = pr.sets.map((x) => x.seconds ?? x.reps!);
  const floor = (1 - s.params.autoreg.dropFraction) * amounts[0]!;
  const n = amounts.findIndex((a, i) => i > 0 && a < floor);
  return { reps: n === -1 ? amounts : amounts.slice(0, n), targetRir: pr.sets[0]!.targetRir, seconds: pr.sets[0]!.seconds !== undefined };
}

/** Share of recent sets predicted within ±tolerance reps, and the same for the first sets ever logged. */
export function predictionAccuracy(s: EngineState, tolerance = 2, window = 20): { recent: number | null; start: number | null; sets: number } {
  const log = s.predictionLog;
  const within = (xs: PredictionLogEntry[]) => (xs.length ? xs.filter((x) => Math.abs(x.M_obs - x.M_pred) <= tolerance).length / xs.length : null);
  return { recent: log.length >= window ? within(log.slice(-window)) : null, start: log.length >= 2 * window ? within(log.slice(0, window)) : null, sets: log.length };
}

/**
 * Clean all-out-quality measurements of an exercise over time (the engine's evidence of strength), oldest first.
 * `max` is reps for an unweighted exercise and the one-rep max (kg) for a weighted one, so a change of weight is not a change of strength.
 */
export function strengthTrend(s: EngineState, exerciseId: string): { ts: number; max: number }[] {
  return s.predictionLog
    .filter((x) => x.exerciseId === exerciseId && x.type === "capacity")
    .map((x) => ({ ts: x.ts, max: x.weightKg === undefined ? x.M_obs : oneRmFrom(x.weightKg, x.M_obs) }));
}

export interface Trait {
  label: string;
  text: string;
  confidence: Confidence;
}

const BAND = 0.15;
const reps = (x: number) => `${Math.round(x)} rep${Math.round(x) === 1 ? "" : "s"}`;

/** "About you": everything learned, each with how sure the engine is. Traits without enough data are left out. */
export function aboutYou(s: EngineState): Trait[] {
  const P = s.params;
  const out: Trait[] = [];
  const l = level(s);
  const fams = Object.entries(l.byLadder).sort((a, b) => b[1].score - a[1].score);
  out.push({
    label: "Level",
    text: l.calibrated
      ? `You train like ${/^[aeiou]/.test(l.experience) ? "an" : "a"} ${l.experience}.` +
        (fams.length > 1 && fams[0]![1].score - fams.at(-1)![1].score >= 0.5
          ? ` Strongest: ${ladderName(s.catalog, fams[0]![0]).toLowerCase()}. Most room to grow: ${ladderName(s.catalog, fams.at(-1)![0]).toLowerCase()}.`
          : "")
      : `Still getting to know you${fams.length ? `. So far you look like ${/^[aeiou]/.test(levelName(l.estimate)) ? "an" : "a"} ${levelName(l.estimate)}` : ""}.`,
    confidence: l.confidence >= 0.8 ? "high" : l.confidence >= 0.6 ? "medium" : l.confidence >= 0.3 ? "low" : "calibrating",
  });

  if (s.d.obs >= P.calibration.confidence.calibrating) {
    // d is the fractional rep loss per unit of in-session fatigue; one hard set on the working muscle ≈ 1 unit.
    out.push({ label: "Within a workout", text: `Each hard set costs you about ${Math.round(s.d.value * 100)}% of your reps on the next one.`, confidence: confidence(s.d.obs, P) });
  }
  if (s.b.obs >= 2) {
    const b = s.b.value;
    out.push({
      label: "Effort ratings",
      text: Math.abs(b) < 0.75
        ? "Your \"reps left\" ratings are accurate."
        : b > 0 ? `You have about ${reps(b)} more in you than you rate. I correct for it.` : `You rate about ${reps(-b)} more left than you have. I correct for it.`,
      confidence: confidence(s.b.obs, P),
    });
  }
  if (s.rho.obs >= P.calibration.confidence.low) {
    const r = s.rho.value;
    out.push({
      label: "Recovery",
      text: Math.abs(r - 1) < BAND ? "You recover at a typical pace." : r < 1 ? "Your strength comes back faster than typical." : "Your strength takes longer than typical to come back.",
      confidence: confidence(s.rho.obs, P),
    });
  }
  if (s.sigma.obs >= 3) {
    const g = s.sigma.value;
    out.push({
      label: "Soreness",
      text: Math.abs(Math.log(g)) < Math.log(1.25) ? "You get about as sore as most people." : g > 1 ? "You get more sore than most people from the same work." : "You get less sore than most people from the same work.",
      confidence: confidence(s.sigma.obs, P),
    });
  }
  if (s.soreness.soreReports >= 2 && s.rhoS.obs >= 3) {
    const r = s.rhoS.value;
    out.push({
      label: "Soreness lasts",
      text: Math.abs(r - 1) < BAND ? "About as long as typical." : r < 1 ? "Shorter than typical: you feel fresh sooner." : "Longer than typical: I leave extra time.",
      confidence: confidence(s.rhoS.obs, P),
    });
  }
  const raised = REGIONS.filter((m) => toleranceOf(s, m) > byLevel(P.tolerance.init, level(s).score) + 0.3 && s.tolerance[m] > 0);
  if (raised.length) {
    out.push({ label: "Work capacity", text: `You handle more work than usual for ${raised.map((m) => REGION_NAMES[m].toLowerCase()).join(", ")}.`, confidence: "medium" });
  }
  const liked = Object.entries(s.feedback).filter(([, f]) => f.liked === true).map(([id]) => s.catalog.byId[id]?.name.toLowerCase()).filter(Boolean);
  if (liked.length) out.push({ label: "Favourites", text: `You like ${liked.join(", ")}. I pick ${liked.length === 1 ? "it" : "them"} when ${liked.length === 1 ? "it fits" : "they fit"}.`, confidence: "high" });
  return out;
}
