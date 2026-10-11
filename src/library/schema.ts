import { z } from "zod";

// The exercise library's vocabulary and record shape. Pure: no I/O, so it runs unchanged in the app.

/** The 12 regions the stress engine tracks. Contributions (targeted / secondary) use only these. */
export const REGIONS = [
  "chest", "front_delt", "side_rear_delt", "triceps", "upper_back", "biceps",
  "quads", "glutes", "hamstrings", "calves", "abs", "lower_back",
] as const;
export const RegionSchema = z.enum(REGIONS);
export type Region = z.infer<typeof RegionSchema>;

/** Muscles that are tagged as "also used" but not stress-tracked. */
export const EXTRA_MUSCLES = ["forearms", "traps", "obliques", "adductors", "hip_flexors"] as const;
export const MUSCLES = [...REGIONS, ...EXTRA_MUSCLES] as const;
export const MuscleSchema = z.enum(MUSCLES);
export type Muscle = z.infer<typeof MuscleSchema>;

export const EQUIPMENT = ["bench", "dumbbell", "resistance_band", "pullup_bar", "table", "chair"] as const;
export const EquipmentSchema = z.enum(EQUIPMENT);
export type Equipment = z.infer<typeof EquipmentSchema>;

/** Movement patterns. Workout templates fill slots by pattern; the last six have no template slot yet. */
export const PATTERNS = [
  "horizontal_push", "vertical_push", "horizontal_pull", "vertical_pull", "squat", "single_leg",
  "hinge", "hamstring_curl", "calf", "core", "elbow_flexion", "elbow_extension", "rear_delt", "back_extension",
  "chest_fly", "shoulder_raise", "shrug", "hip_abduction", "carry", "full_body",
] as const;
export const PatternSchema = z.enum(PATTERNS);
export type Pattern = z.infer<typeof PatternSchema>;

export const EXPERIENCES = ["beginner", "intermediate", "advanced"] as const;
export const ExperienceSchema = z.enum(EXPERIENCES);
export type Experience = z.infer<typeof ExperienceSchema>;

/** What makes an exercise hard beyond strength. Ratings teach a per-user offset per demand. */
export const DEMANDS = ["balance", "coordination", "mobility", "grip"] as const;
export const DemandSchema = z.enum(DEMANDS);
export type Demand = z.infer<typeof DemandSchema>;

/** Typical one-rep max of one dumbbell as a multiple of body mass, per experience. */
export const LoadNormSchema = z.strictObject({
  beginner: z.number().positive(),
  intermediate: z.number().positive(),
  advanced: z.number().positive(),
});
export type LoadNorm = z.infer<typeof LoadNormSchema>;

/** Stress share per region: 1 = targeted, 0.5 / 0.25 = secondary. Omitted = not loaded (stabilisers go in alsoUses). */
export const ContributionSchema = z.union([z.literal(1), z.literal(0.5), z.literal(0.25)]);
export const ContributionsSchema = z.partialRecord(RegionSchema, ContributionSchema);
export type Contributions = z.infer<typeof ContributionsSchema>;

/** 1 = too easy to be useful, 2 = easy, 3 = right challenge, 4 = hard, 5 = too hard or unsafe. */
export const DifficultyScoreSchema = z.number().int().min(1).max(5);
export const DifficultySchema = z.strictObject({
  beginner: DifficultyScoreSchema,
  intermediate: DifficultyScoreSchema,
  advanced: DifficultyScoreSchema,
});
export type Difficulty = z.infer<typeof DifficultySchema>;

export const DefaultMSchema = z.strictObject({
  beginner: z.number().positive(),
  intermediate: z.number().positive(),
  advanced: z.number().positive(),
});
export type DefaultM = z.infer<typeof DefaultMSchema>;

export const ExerciseRecordSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().min(1),
  pattern: PatternSchema,
  /** All of these are needed. Empty = bodyweight, no equipment. */
  equipment: z.array(EquipmentSchema),
  /** Needs an external weight (dumbbells). Planned only when the user owns dumbbells (strength.canLoad). */
  weighted: z.boolean().default(false),
  /** Weighted only: dumbbells in use (1 = goblet-style, 2 = a pair). */
  dumbbells: z.union([z.literal(1), z.literal(2)]).optional(),
  /** Weighted only: typical one-dumbbell 1RM ÷ body mass. Starting estimate and level scoring. */
  loadNorm: LoadNormSchema.optional(),
  /** Progression family. Omit for a stand-alone exercise (it becomes its own one-rung ladder). */
  ladderId: z.string().min(1).optional(),
  /** Rung within the ladder, 1 = easiest. Required with ladderId. */
  level: z.number().int().positive().optional(),
  contributions: ContributionsSchema,
  /** Other muscles that work (stabilisers, grip, ...), not stress-tracked. */
  alsoUses: z.array(MuscleSchema).default([]),
  /** What makes it hard beyond strength. */
  demands: z.array(DemandSchema).default([]),
  difficulty: DifficultySchema,
  unilateral: z.boolean().default(false),
  lengthened: z.boolean().default(false),
  isHold: z.boolean().default(false),
  /** Reps-to-failure guess per experience (holds in repsEq). Bodyweight/band exercises only. */
  defaultM: DefaultMSchema.optional(),
  rationale: z.string().min(1),
});
export type ExerciseRecord = z.infer<typeof ExerciseRecordSchema>;

export const LadderSchema = z.strictObject({
  id: z.string().min(1),
  /** Display name of the movement family, e.g. "Push-ups". */
  name: z.string().min(1).optional(),
  stepRatio: z.number().gt(0).lt(1).default(0.6),
});
export type Ladder = z.infer<typeof LadderSchema>;

export const LibraryFileSchema = z.strictObject({
  ladders: z.array(LadderSchema),
  exercises: z.array(ExerciseRecordSchema).min(1),
});
