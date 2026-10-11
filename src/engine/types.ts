import { z } from "zod";
import type { Catalog } from "./catalog";
import type { SorenessState } from "./soreness";

// ---------- Domain enums ----------
// The exercise vocabulary (regions, equipment, patterns, experience) and the exercise record live in the
// exercise library (src/library); the engine re-exports them so existing imports keep working.

import { EquipmentSchema, ExperienceSchema, PatternSchema, REGIONS, RegionSchema, type Demand, type LibraryExercise, type Region } from "../library";
export {
  REGIONS, RegionSchema, EQUIPMENT, EquipmentSchema, PATTERNS, PatternSchema, EXPERIENCES, ExperienceSchema,
  ContributionSchema, ContributionsSchema, DefaultMSchema, LadderSchema, MUSCLES, EXTRA_MUSCLES,
} from "../library";
export type { Region, Equipment, Pattern, Experience, Contributions, DefaultM, Ladder, Muscle, Difficulty } from "../library";
export type RegionMap = Record<Region, number>;

export const MAJOR_REGIONS: readonly Region[] = ["chest", "upper_back", "quads", "glutes", "hamstrings"];

export const GoalSchema = z.enum(["muscle", "general_fitness"]);
export type Goal = z.infer<typeof GoalSchema>;

export const EXTERNAL_PRESETS = ["football", "running", "cycling", "badminton", "cricket"] as const;
export const ExternalPresetSchema = z.enum(EXTERNAL_PRESETS);
export type ExternalPreset = z.infer<typeof ExternalPresetSchema>;

// ---------- Catalog ----------

/** An exercise the planner can dose: a library exercise that is not weighted (its ladder is always resolved). */
export type Exercise = LibraryExercise;

export const TemplateSchema = z.strictObject({ id: z.string().min(1), slots: z.array(PatternSchema).min(1) });
export type Template = z.infer<typeof TemplateSchema>;

/** A training program: which muscles matter more (emphasis multiplies weekly target and planner priority) and its workout templates. */
export const ProgramSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  emphasis: z.partialRecord(RegionSchema, z.number().positive()),
  templates: z.array(TemplateSchema).min(1),
});
export type Program = z.infer<typeof ProgramSchema>;
export const ProgramsFileSchema = z.strictObject({ programs: z.array(ProgramSchema).min(1) });

// ---------- Events ----------

const Rir = z.number().int().min(0).max(5);

const Kg = z.number().gt(0).max(200);
/** Adjustable dumbbells expand to whole grams, so the smallest start and step is 1 g (no 0 kg or duplicate weights). */
const MIN_KG = 0.001;

/** The dumbbells a user owns: a list of fixed pairs, or an adjustable set's range. */
export const DumbbellsSchema = z.union([
  z.strictObject({ kind: z.literal("fixed"), kg: z.array(Kg).min(1).max(100) })
    .refine((d) => new Set(d.kg).size === d.kg.length, { message: "dumbbell weights must be distinct" }),
  z.strictObject({ kind: z.literal("adjustable"), minKg: Kg.min(MIN_KG), maxKg: Kg, stepKg: Kg.min(MIN_KG) })
    .refine((d) => d.minKg <= d.maxKg, { message: "minKg must not exceed maxKg" })
    .refine((d) => Math.floor((d.maxKg - d.minKg) / d.stepKg + 1e-9) + 1 <= 100, { message: "at most 100 dumbbell weights" }),
]);
export type Dumbbells = z.infer<typeof DumbbellsSchema>;

export const RatingSchema = z.enum(["too_easy", "just_right", "too_hard"]);
export type Rating = z.infer<typeof RatingSchema>;

export const ProfileSchema = z.strictObject({
  goal: GoalSchema,
  /** Optional self-report: only the starting guess. The engine infers the level from reps + RIR after calibration. */
  experience: ExperienceSchema.optional(),
  /** Program id from the catalog's programs; default the first program. */
  programId: z.string().min(1).optional(),
  /** The user's UTC offset in minutes (e.g. −300 for New York); "today" is their local day. Default 0 (UTC). */
  utcOffsetMinutes: z.number().int().min(-720).max(840).optional(),
  /** Body data for calories (energy.ts). Weight is required for calories; height, age and sex refine the resting burn. */
  bodyMassKg: z.number().min(25).max(350).optional(),
  heightCm: z.number().min(100).max(250).optional(),
  ageYears: z.number().int().min(13).max(100).optional(),
  sex: z.enum(["female", "male"]).optional(),
  equipment: z.array(EquipmentSchema),
  /** Dumbbells owned; required for weighted exercises to be planned. */
  dumbbells: DumbbellsSchema.optional(),
  excludeExercises: z.array(z.string()),
  excludeRegions: z.array(RegionSchema),
  daysPerWeek: z.number().int().min(1).max(7),
  sessionMinutes: z.number().positive(),
});
export type Profile = z.infer<typeof ProfileSchema>;

const eventBase = {
  id: z.uuid(),
  userId: z.string().min(1),
  ts: z.number().int().nonnegative(),
  seq: z.number().int().nonnegative(),
  schemaVersion: z.literal(1),
};

export const EventSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...eventBase, type: z.literal("profile_set"), payload: ProfileSchema }),
  z.strictObject({ ...eventBase, type: z.literal("session_started"), payload: z.strictObject({ sessionId: z.string().min(1) }) }),
  z.strictObject({
    ...eventBase,
    type: z.literal("set_logged"),
    payload: z
      .strictObject({
        sessionId: z.string().min(1),
        exerciseId: z.string().min(1),
        reps: z.number().int().nonnegative().optional(),
        holdSeconds: z.number().int().nonnegative().optional(),
        /** Reps left. The app asks only after an exercise's last set; a set without it teaches nothing by itself (calibrate.ts). */
        rir: Rir.optional(),
        isWarmup: z.boolean(),
        isAmrap: z.boolean(),
        /** Weight of one dumbbell, kg. Weighted exercises only (ignored elsewhere). */
        weightKg: Kg.optional(),
      })
      .refine((p) => (p.reps === undefined) !== (p.holdSeconds === undefined), {
        message: "exactly one of reps or holdSeconds is required",
      }),
  }),
  z.strictObject({ ...eventBase, type: z.literal("session_ended"), payload: z.strictObject({ sessionId: z.string().min(1) }) }),
  z.strictObject({
    ...eventBase,
    type: z.literal("checkin"),
    payload: z.strictObject({
      feel: z.enum(["fresh", "normal", "beat_up"]),
      soreRegions: z.array(RegionSchema),
      /** True when the user went through the body map, so unmarked regions mean "not sore" (the engine learns from it). */
      sorenessChecked: z.boolean().optional(),
    }),
  }),
  // Like / pain flags and a one-tap difficulty rating for one exercise.
  z.strictObject({
    ...eventBase,
    type: z.literal("exercise_feedback"),
    payload: z.strictObject({
      exerciseId: z.string().min(1),
      liked: z.boolean().optional(),
      pain: z.boolean().optional(),
      /** One-tap difficulty rating after the exercise. */
      rating: RatingSchema.optional(),
    }),
  }),
  z.strictObject({
    ...eventBase,
    type: z.literal("usual_weight"),
    /** "What weight do you usually use for this?" Seeds the strength estimate until the exercise is first measured. */
    payload: z.strictObject({ exerciseId: z.string().min(1), weightKg: Kg, reps: z.number().int().min(1).max(50).default(10) }),
  }),
  z.strictObject({
    ...eventBase,
    type: z.literal("external_activity"),
    payload: z.strictObject({
      presetId: ExternalPresetSchema,
      minutes: z.number().positive(),
      intensity: z.enum(["light", "moderate", "hard"]),
    }),
  }),
]);
export type EngineEvent = z.infer<typeof EventSchema>;
export type EventType = EngineEvent["type"];

// ---------- Params ----------

const pos = z.number().positive();
const nonneg = z.number().nonnegative();
const regionRecord = z.record(RegionSchema, pos);
const clampBase = z.strictObject({ init: z.number(), rate: pos, min: z.number(), max: z.number() });
const inClamp = (c: z.infer<typeof clampBase>) => c.min <= c.init && c.init <= c.max;
const clampSchema = <T extends z.ZodRawShape>(shape: T) => clampBase.extend(shape);

export const ParamsSchema = z.strictObject({
  version: z.number().int().positive(),
  effort: z.strictObject({ stimulus: z.array(nonneg).length(6), fatigue: z.array(nonneg).length(6) }),
  reps: z.strictObject({ ref: pos, exponent: nonneg, min: pos, max: pos }).refine((r) => r.min < r.max, { message: "reps.min < reps.max" }),
  novelty: z.strictObject({ amp: nonneg, decay: pos, windowDays: pos, experience: z.record(ExperienceSchema, nonneg) }),
  lengthenedFactor: pos,
  hold: z.strictObject({ secondsPerRep: pos }),
  recovery: z.strictObject({ fastShare: z.number().min(0).max(1), fastHalfLifeH: pos, slowHalfLifeH: regionRecord }),
  readiness: z
    .strictObject({
      readyBelow: pos,
      fatiguedAbove: pos,
      weights: z.strictObject({ ready: nonneg, recovering: nonneg, fatigued: nonneg }),
    })
    .refine((r) => r.readyBelow < r.fatiguedAbove, { message: "readyBelow < fatiguedAbove" }),
  systemic: z.strictObject({
    halfLifeH: pos,
    restRatio: pos,
    defaultTypicalSession: pos,
    minSessionsForTypical: z.number().int().positive(),
    typicalWindow: z.number().int().positive(),
  }),
  stimulus: z.strictObject({ sessionMax: pos }),
  weeklyTargets: regionRecord,
  targetMultipliers: z.strictObject({ goal: z.record(GoalSchema, pos), experience: z.record(ExperienceSchema, pos) }),
  capacity: z.strictObject({
    fallbackM: pos,
    emaAlpha: z.number().gt(0).max(1),
    freshBelow: pos,
    sessionCleanBelow: pos,
    beta: nonneg,
    repRange: z.tuple([pos, pos]).refine(([lo, hi]) => lo < hi, { message: "repRange must be ascending" }),
    staleDays: pos,
    staleFactor: z.number().gt(0).max(1),
    targetRir: z.record(ExperienceSchema, z.number().int().min(0).max(5)),
    maxDrop: z.number().gt(0).max(1),
    /** A logged max is capped at this × the exercise's advanced norm (typo protection). */
    maxObsFactor: z.number().gt(1),
    /** After the first measurement, one set can pull capacity toward at most M × (1 ± maxStep) (outlier protection). */
    maxStep: z.number().gt(0).lt(1),
  }),
  level: z.strictObject({ priorWeight: pos, ladderPriorWeight: pos, window: z.number().int().positive() }),
  energy: z.strictObject({
    secondsPerRep: pos,
    /** MET by reps left (index 0..5) for multi-joint and small-muscle/core exercises; rest between sets. */
    met: z.strictObject({ compound: z.array(pos).length(6), light: z.array(pos).length(6), rest: pos }),
    lightPatterns: z.array(PatternSchema),
    recoveryFraction: nonneg,
    maxRestMin: pos,
    defaultRestMin: nonneg,
    uncertainty: z.strictObject({ withBody: z.number().gt(0).lt(1), massOnly: z.number().gt(0).lt(1) }),
  }),
  /** A set more than maxGapH after the open session's last event starts a new session (a forgotten "end session"). */
  session: z.strictObject({ maxGapH: pos }),
  /** Prediction ranges: empirical quantiles of the user's own relative errors (last `window`), default ±defaultRel until minObs. */
  range: z.strictObject({ window: z.number().int().positive(), minObs: z.number().int().positive(), quantile: z.number().gt(0.5).lt(1), defaultRel: pos, minRel: nonneg }),
  soreness: z
    .strictObject({
      riseH: pos,
      decayH: pos,
      noveltyAmp: nonneg,
      level: z.record(ExperienceSchema, pos),
      thresholds: z.tuple([pos, pos, pos]),
      learn: z.strictObject({
        /** Candidate grids [min, max, count], geometric. */
        sigma: z.tuple([pos, pos, z.number().int().positive()]),
        rho: z.tuple([pos, pos, z.number().int().positive()]),
        priorSd: z.strictObject({ sigma: pos, rho: pos }),
        width: pos,
        floor: z.number().min(0).lt(0.5),
        windowH: pos,
      }),
    })
    .refine((x) => x.thresholds[0] < x.thresholds[1] && x.thresholds[1] < x.thresholds[2], { message: "soreness thresholds must ascend" })
    .refine((x) => x.learn.sigma[0] <= x.learn.sigma[1] && x.learn.rho[0] <= x.learn.rho[1], { message: "soreness grids need min <= max" })
    .refine((x) => x.riseH < x.decayH * x.learn.rho[0], { message: "soreness riseH must be below decayH × the smallest rho" }),
  tolerance: z.strictObject({
    ref: pos,
    init: z.record(ExperienceSchema, pos),
    learnRate: z.number().min(0).max(1),
    max: pos,
  }),
  calibration: z.strictObject({
    noiseBand: nonneg,
    errorClamp: pos,
    rho: clampSchema({ beatUpNudge: pos }),
    rirBias: clampSchema({ amrapIntervalDays: pos }),
    acute: clampSchema({ minDeltaF: nonneg, minPrevM: nonneg }),
    deload: z.strictObject({
      window: z.number().int().positive(),
      minObs: z.number().int().positive(),
      triggerBelow: z.number(),
      clearAbove: z.number(),
      maxDays: pos,
    }),
    confidence: z
      .strictObject({ calibrating: z.number().int().positive(), low: z.number().int().positive(), medium: z.number().int().positive() })
      .refine((c) => c.calibrating < c.low && c.low < c.medium, { message: "confidence thresholds must ascend" }),
    calibratingMinObs: z.number().int().nonnegative(),
    calibratingMinDays: nonneg,
  }).refine((c) => inClamp(c.rho) && inClamp(c.rirBias) && inClamp(c.acute), { message: "learned params require min <= init <= max" }),
  autoreg: z.strictObject({ dropFraction: z.number().gt(0).lt(1) }),
  external: z.strictObject({
    intensity: z.strictObject({ light: nonneg, moderate: nonneg, hard: nonneg }),
    presets: z.record(ExternalPresetSchema, z.strictObject({ fatigue: z.partialRecord(RegionSchema, pos), systemic: nonneg })),
  }),
  planner: z.strictObject({
    overloadLambda: nonneg,
    sessionFatigueCap: z.number().min(1),
    continuityBonus: nonneg,
    continuityDays: pos,
    minScore: nonneg,
    sets: z.strictObject({
      base: z.number().int().positive(),
      highNeed: nonneg,
      highSets: z.number().int().positive(),
      lowNeed: nonneg,
      lowSets: z.number().int().positive(),
      min: z.number().int().positive(),
    }),
    time: z.strictObject({ warmupMin: nonneg, minPerSet: pos, unilateralSetFactor: pos, transitionMin: nonneg }),
    calibrationBonus: nonneg,
    likeBonus: nonneg,
    dislikePenalty: nonneg,
    painAvoidDays: pos,
    fullBodyBonusMaxDays: z.number().int().min(0).max(7),
    fullBodyBonus: pos,
    deloadSetFactor: z.number().gt(0).max(1),
    deloadRirAdd: z.number().int().nonnegative(),
    /** Reps left added to every set of an easy / hard workout (PlanOptions.intensity). */
    intensityRirAdd: z.strictObject({ easy: z.number().int().nonnegative(), hard: z.number().int().nonpositive() }),
    /** Muscles the user chose (PlanOptions.focus): weight on the plan's score, and the weekly need they are treated as having at least. */
    focus: z.strictObject({ boost: z.number().min(1), needFloor: z.number().gt(0).max(1), fatigueCap: z.number().min(1) }),
  }),
  strength: z.strictObject({
    repRange: z.tuple([pos, pos]).refine(([lo, hi]) => lo < hi && hi <= 30, { message: "strength.repRange must ascend and stay within 30 reps" }),
    /** Reps a user leaves in reserve at their "usual weight". */
    usualRir: z.number().min(0).max(5),
    /** Caution on the body-mass estimate. */
    initFactor: z.number().gt(0).max(1),
    fallbackBodyMassKg: z.number().min(25).max(350),
    /** Typo cap on a weighted set's observed max (reps). */
    maxObsReps: pos,
  }),
  difficulty: z.strictObject({
    ratingAlpha: z.number().gt(0).max(1),
    demandAlpha: z.number().gt(0).max(1),
    demandMax: pos,
    trustK: pos,
    neighbourTrust: z.number().min(0).max(1),
    excludeAbove: z.number().min(1).max(5),
    preferWeight: z.number().min(0).lt(1),
  }),
});
export type Params = z.infer<typeof ParamsSchema>;

/** Validate a raw params object (e.g. parsed default.params.json). Throws on invalid input. */
export function parseParams(raw: unknown): Params {
  return ParamsSchema.parse(raw);
}

// ---------- Engine state ----------

export const zeroRegions = (): RegionMap => Object.fromEntries(REGIONS.map((r) => [r, 0])) as RegionMap;
export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

export type ReadinessState = "ready" | "recovering" | "fatigued";
export type ObservationType = "capacity" | "recovery" | "acute" | "amrap" | "log_only";
export type Confidence = "calibrating" | "low" | "medium" | "high";

export interface Compartments {
  fast: number;
  slow: number;
}

export interface SessionRecord {
  /** Unique within the state. Equals `key` unless that id was already used (then `key@start`). */
  id: string;
  /** The sessionId the events use. */
  key: string;
  /** Time of the last event in this session (for closing forgotten sessions). */
  lastTs: number;
  /** Every set including warm-ups, for calories: time logged, active seconds, reps left. */
  log: { exerciseId: string; ts: number; activeSeconds: number; rir: number; isWarmup: boolean }[];
  start: number;
  end: number | null;
  rawStimulus: RegionMap;
  /** Saturated stimulus, set when the session ends. */
  stimulus: RegionMap;
  /** Fatigue deposited per region in this session (sessionAdded). */
  addedFatigue: RegionMap;
  /** addedFatigue without the novelty factor: the work done, which is what tolerance learns from. */
  addedWork: RegionMap;
  /** Sum of set fatigue (systemic deposit) in this session. */
  fatigueTotal: number;
  /** Non-warm-up sets in order, for acute / AMRAP calibration. F_sess_eff is the value just before the set. */
  sets: { exerciseId: string; M_obs: number; F_sess_eff: number; isAmrap: boolean; censored: boolean; weightKg: number | null; /** Logged without reps left. */ unrated?: true }[];
}

export interface CapacityEntry {
  M: number;
  obs: number;
  lastPerformed: number | null;
}

/** Strength of one weighted exercise: estimated one-rep max of one dumbbell (kg). */
export interface StrengthEntry {
  oneRm: number;
  /** Clean max-effort observations (like CapacityEntry.obs). */
  obs: number;
  lastPerformed: number | null;
  /** Weight of the last set logged with a weight; the next plan keeps it while it still fits. */
  lastWeightKg: number | null;
}

export interface LearnedParam {
  value: number;
  obs: number;
}

export interface PredictionLogEntry {
  ts: number;
  /** "5+ reps left": M_obs is only a lower bound. */
  censored: boolean;
  exerciseId: string;
  type: ObservationType;
  M_pred: number;
  M_obs: number;
  err: number;
  /** Weight of a weighted set (kg); absent for unweighted exercises. */
  weightKg?: number;
}

export interface EngineState {
  /** Carried so queries (readiness, planSession, ...) need only the state. */
  params: Params;
  catalog: Catalog;
  /** Time the compartments were last advanced to (ms). */
  t: number;
  profile: Profile | null;
  regions: Record<Region, Compartments>;
  G: number;
  sessions: SessionRecord[];
  openSessionId: string | null;
  capacity: Record<string, CapacityEntry>;
  /** Weighted exercises only (strength.ts). */
  strength: Record<string, StrengthEntry>;
  /** Answers to "what weight do you usually use?"; used only until the exercise is first measured. */
  usualWeights: Record<string, { weightKg: number; reps: number }>;
  /** Exponential average of one-tap ratings per exercise: too_easy −1, just_right 0, too_hard +1. */
  ratings: Record<string, number>;
  /** Personal offset per demand tag, learned from ratings (difficulty.ts). */
  demandOffsets: Record<Demand, number>;
  /** Level observations per ladder (last level.window), from clean max-effort sets. */
  levelObs: Record<string, { score: number; weight: number }[]>;
  /** When calibration finished (ts of the event that completed it); null while calibrating. */
  calibratedAt: number | null;
  /** Per-exercise feedback: liked (null = no opinion) and when it last hurt. */
  feedback: Record<string, { liked: boolean | null; painTs: number | null }>;
  /** Soreness (DOMS) model state (soreness.ts). */
  soreness: SorenessState;
  /** Fitted soreness sensitivity (how sore this user gets) and recovery-time multiplier, from body-map check-ins (obs = check-ins used). */
  sigma: LearnedParam;
  rhoS: LearnedParam;
  /** Learned tolerance T_m per region (fatigue units of a full, normal session); 0 = not learned, use the experience default. */
  tolerance: RegionMap;
  /** exerciseId -> sessions containing it (id, ts of first set of e in that session), in order. */
  exposures: Record<string, { sessionId: string; ts: number }[]>;
  rho: LearnedParam;
  b: LearnedParam;
  d: LearnedParam;
  lastAmrapTs: number | null;
  /** endedAt: when the last deload ended; only later observations can trigger the next one. */
  deload: { active: boolean; since: number | null; endedAt: number | null };
  predictionLog: PredictionLogEntry[];
  checkin: { ts: number; feel: "fresh" | "normal" | "beat_up"; soreRegions: Region[] } | null;
  /** Events replay skipped because they failed validation (never applied). */
  rejected: { id: string; reason: string }[];
}
