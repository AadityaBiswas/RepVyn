import type { Equipment, Experience, Profile } from "../../engine";

export interface Scenario {
  name: string;
  /** No self-reported experience: the engine must infer the level. */
  profile: Profile;
  /** Hidden truths. trueLevel sets true capacities (catalog norms) and true tolerance. */
  trueLevel: Experience;
  rhoTrue: number;
  bTrue: number;
  dTrue: number;
  /** 1-based weeks with no training at all. */
  offWeeks?: number[];
  /** Football, hard, 90 min every Sunday. */
  sundayFootball?: boolean;
  /** Hidden true tolerance as a multiple of the experience default (default 1). */
  toleranceTrue?: number;
  /** Extra sets the user adds to every planned exercise (repeats the last prescribed set). */
  extraSets?: number;
  /** The app's behaviour: reps left are reported only on an exercise's last set (the set before an all-out set). */
  lastSetRirOnly?: boolean;
  /** Hidden soreness traits; when set, the user does a body-map check-in every day (morning, or before training). */
  sorenessTrue?: { sigma: number; rho: number };
}

const profile = (trueLevel: Experience, equipment: Equipment[], daysPerWeek: number): { profile: Profile; trueLevel: Experience } => ({
  profile: { goal: "muscle", equipment, excludeExercises: [], excludeRegions: [], daysPerWeek, sessionMinutes: 45 },
  trueLevel,
});

const BAR_BANDS: Equipment[] = ["pullup_bar", "resistance_band"];
const base = { rhoTrue: 1.0, bTrue: 0, dTrue: 0.15 };

export const SCENARIOS: Scenario[] = [
  { name: "beginner_3x_no_equipment", ...profile("beginner", [], 3), ...base },
  { name: "intermediate_5x_bar_bands", ...profile("intermediate", BAR_BANDS, 5), ...base },
  { name: "slow_recoverer", ...profile("intermediate", BAR_BANDS, 4), ...base, rhoTrue: 1.5 },
  { name: "fast_recoverer", ...profile("intermediate", BAR_BANDS, 4), ...base, rhoTrue: 0.7 },
  { name: "rir_sandbagger", ...profile("intermediate", BAR_BANDS, 4), ...base, bTrue: 2 },
  { name: "returns_after_layoff", ...profile("intermediate", BAR_BANDS, 4), ...base, offWeeks: [6, 7, 8, 9] },
  { name: "weekend_footballer", ...profile("intermediate", BAR_BANDS, 3), ...base, sundayFootball: true },
  // Trains well past the plan (7 sets per exercise) and is adapted to it: true tolerance 1.3 × the advanced default.
  { name: "sore_prone", ...profile("intermediate", BAR_BANDS, 3), ...base, sorenessTrue: { sigma: 2, rho: 1.4 } },
  { name: "rarely_sore", ...profile("intermediate", BAR_BANDS, 3), ...base, sorenessTrue: { sigma: 0.5, rho: 0.75 } },
  { name: "advanced_high_volume", ...profile("advanced", BAR_BANDS, 4), ...base, toleranceTrue: 1.3, extraSets: 4 },
];

export function scenario(name: string): Scenario {
  const s = SCENARIOS.find((x) => x.name === name);
  if (!s) throw new Error(`unknown scenario ${name}; one of: ${SCENARIOS.map((x) => x.name).join(", ")}`);
  return s;
}
