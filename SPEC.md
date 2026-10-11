# SPEC: Readiness-Based Home Workout Engine (Data Layer Only)

You are building the **engine and data layer** of a home-workout app. There is **no UI** in this phase. Everything must be testable from unit tests, a simulation harness and a CLI.

Work **milestone by milestone** (see the Milestones section). After each milestone:
- run the typecheck and all tests,
- fix any failures,
- summarise what was built,
- then stop.

If the spec is ambiguous, pick the simplest option and record it in `DECISIONS.md`. Do not invent new model terms that are not in this spec.

---

## 1. What the app does (context)

The app generates home workouts (bodyweight, plus optional bar/bands/backpack) based on:
- how fatigued each muscle region is estimated to be right now,
- how much training each region still needs this week,
- and how strong the user is on each exercise.

After every logged set, it estimates the fatigue and growth stimulus that set caused for each muscle region. Fatigue decays over time using a two-compartment recovery model.

The app **predicts how many reps the user can do** on each set, compares that with what they actually do, and uses the difference to learn a few personal parameters:
- recovery speed,
- RIR (reps-in-reserve) reporting bias,
- within-session fatigue sensitivity,
- per-exercise capacity.

It uses no AI or ML. Everything is deterministic math.

**Core principle:** fatigue is a hidden estimate. The observable ground truth is reps performed at a reported RIR. Every learning update and every accuracy metric is based on **predicted reps vs actual reps**.

---

## 2. Tech constraints

- TypeScript (strict mode), Node 20+, a single package.
- Libraries:
  - `vitest` for tests
  - `fast-check` for property tests
  - `zod` for validation
  - `better-sqlite3` for SQLite storage
  - `tsx` for running scripts
- `src/engine/**` must be **pure**:
  - no I/O,
  - no `Date.now()`,
  - no `Math.random()`,
  - no imports from `node:*`, `src/storage`, `src/sim` or `src/cli`.

  Time is always passed in as `now` (milliseconds, UTC). Add a test that scans engine files and fails if any forbidden import or call exists.
- The engine must later run inside an Expo/React Native app unchanged. Only storage adapters may be platform-specific.
- All numeric constants live in `params/default.params.json`, validated by zod. No magic numbers in engine code.
- Determinism: the same events, catalog and params must produce a deep-equal state and plan. All ties are broken by stable ordering (exercise id, then template order).

### Folder structure
```
SPEC.md  DECISIONS.md  package.json  tsconfig.json
params/default.params.json
catalog/exercises.json
src/engine/
  types.ts        regions, events, exercise, params, state types + zod schemas
  catalog.ts      load + validate catalog, ladder helpers
  load.ts         per-set stimulus/fatigue
  recovery.ts     two-compartment decay, advanceTo(t)
  fold.ts         replay: events -> EngineState (learning happens here)
  state.ts        readiness, hoursToReady, weekly need, systemic
  capacity.ts     capacity, prediction, prescription, progression
  calibrate.ts    rho, b, d updates, deload, confidence, prediction log
  planner.ts      templates, greedy selection, reasons
  external.ts     external activity presets
  index.ts        public API
src/storage/
  repo.ts         interfaces
  memory.ts       in-memory implementation
  sqlite.ts       better-sqlite3 implementation
src/sim/
  rng.ts          seeded RNG (mulberry32)
  syntheticUser.ts
  runner.ts
  scenarios/*.ts
src/cli/
  sim.ts  replay.ts  plan.ts
tests/            unit, golden, property, sim acceptance
```

---

## 3. Domain

### 3.1 Muscle regions (12)
`chest, front_delt, side_rear_delt, triceps, upper_back, biceps, quads, glutes, hamstrings, calves, abs, lower_back`

Major regions (used by the rest rule): `chest, upper_back, quads, glutes, hamstrings`.

### 3.2 Exercise catalog schema (`catalog/library/`, see DECISIONS "Exercise library")
```json
{
  "id": "push_up_standard",
  "name": "Standard push-up",
  "pattern": "horizontal_push",
  "ladderId": "push_up",
  "level": 5,
  "equipment": [],
  "contributions": { "chest": 1, "triceps": 0.5, "front_delt": 0.5 },
  "unilateral": false,
  "lengthened": false,
  "isHold": false,
  "defaultM": { "beginner": 8, "intermediate": 20, "advanced": 35 },
  "rationale": "Shoulder horizontal adduction (chest, front delt) + elbow extension (triceps). Core is isometric only, so 0."
}
```

**Validation rules** (zod, plus custom checks):
- Contribution values must be one of `{1, 0.5, 0.25}`. Omit a region to mean 0.
- At least one region must be 1. At most two regions may be 1.
- Stabilizers get **0** (omitted).
- `level` values are unique and contiguous within a ladder.
- Each ladder has a `stepRatio` (default 0.6) in a separate `ladders` array. It is the ratio of reps-to-failure between adjacent levels.
- `defaultM` is optional. If missing, derive it from the nearest ladder neighbour using `stepRatio`.
- `rationale` is required on every exercise. It explains the tiers by joint action and whether the muscle changes length under load.

**Equipment tags:** `bench, dumbbell, resistance_band, pullup_bar, table, chair` (superseded the original list; see DECISIONS "Exercise library"). Records also carry `difficulty`, `alsoUses`, `weighted` and `demands`; weighted records also carry `loadNorm` (typical one-dumbbell 1RM ÷ body mass at each level) and `dumbbells` (1 or 2 in use). See the design doc §1.

**Patterns:** `horizontal_push, vertical_push, horizontal_pull, vertical_pull, squat, single_leg, hinge, hamstring_curl, calf, core, elbow_flexion, elbow_extension, rear_delt, back_extension`

**Seed catalog.** Target about 50–60 exercises. Assign tiers yourself using the rules above.

| Ladder | Levels (easy → hard) |
|---|---|
| push_up | wall → high incline → knee → low incline → standard → decline → deficit (lengthened) → archer → pseudo-planche |
| pike | pike push-up → elevated pike → wall handstand hold (hold) → partial wall HSPU → wall HSPU |
| table_row (sturdy_table) | bent-knee → straight-leg → feet-elevated |
| band_row / backpack_row | include as separate ladders |
| pull_up (pullup_bar) | scapular pull-up → negative → band-assisted (also needs bands) → chin-up → pull-up → archer |
| band_pulldown (bands) | single-level ladder is fine |
| squat | chair box squat → bodyweight squat → split squat → rear-foot-elevated split squat (lengthened) → assisted shrimp → assisted pistol → pistol |
| single_leg | reverse lunge → walking lunge → step-up (step) |
| hinge | glute bridge → single-leg glute bridge → shoulder-elevated hip thrust (chair) → single-leg hip thrust; plus backpack single-leg RDL |
| hamstring_curl | sliding leg curl (floor_slider) → single-leg sliding curl → nordic negative (door_anchor, lengthened) |
| calf | double-leg raise → single-leg raise → deficit single-leg (step, lengthened) |
| core | dead bug → plank (hold) → hollow hold (hold) → hanging knee raise (pullup_bar); plus side plank (hold) |
| elbow_extension | diamond push-up → table triceps extension (sturdy_table) → backpack overhead extension (backpack, lengthened) |
| elbow_flexion | backpack curl → band curl (bands) |
| rear_delt | prone Y-T raise → band pull-apart (bands) → backpack reverse fly |
| back_extension | prone superman → table reverse hyper (sturdy_table) |

**Known equipment blocker (do not hide it).** With `equipment = []`, the regions upper_back, biceps and hamstrings have weak options. The planner must still work, and diagnostics must report `equipmentGaps` listing regions whose best available exercise has contribution below 1.

### 3.3 Events (append-only)
Every event has:
- `id` (uuid),
- `userId`,
- `ts` (ms),
- `seq` (a monotonic integer that breaks ties when timestamps are equal),
- `type`,
- `payload`,
- `schemaVersion`.

| type | payload |
|---|---|
| `profile_set` | `goal: "muscle"\|"general_fitness"`, `experience?: "beginner"\|"intermediate"\|"advanced"` (optional self-report; only the starting guess, see 5.10), `programId?: string` (default: the catalog's first program), `utcOffsetMinutes?: int` (the user's time zone; "today" for check-ins and beat-up days is their local day, default UTC), `bodyMassKg?`, `heightCm?`, `ageYears?`, `sex?: "female"|"male"` (for calories only), `dumbbells?` (`{kind:"fixed", kg: number[]}` or `{kind:"adjustable", minKg, maxKg, stepKg}`; at most 100 weights, the adjustable `minKg` and `stepKg` at least 0.001; weighted exercises are planned only when it is set), `equipment: string[]`, `excludeExercises: string[]`, `excludeRegions: string[]`, `daysPerWeek: number`, `sessionMinutes: number` |
| `session_started` | `sessionId` |
| `set_logged` | `sessionId`, `exerciseId`, `reps?` (int), `holdSeconds?` (int), `rir?: 0..5` (5 means 5+; optional, the app asks only after an exercise's last set, see 5.6 "Last-set rating"), `isWarmup: boolean`, `isAmrap: boolean`, `weightKg?` (one dumbbell, in (0, 200]; meaningful only on weighted exercises) |
| `session_ended` | `sessionId` |
| `exercise_feedback` | `exerciseId`, `liked?: boolean`, `pain?: boolean`, `rating?: "too_easy"\|"just_right"\|"too_hard"` (one tap; moves the exercise's difficulty, see design doc §3). Pain leaves the exercise out of plans for `planner.painAvoidDays` (14) unless cleared with `pain: false`; liked / disliked adds `likeBonus` / subtracts `dislikePenalty` in planner scoring (a preference, never a ban). |
| `checkin` | `feel: "fresh"\|"normal"\|"beat_up"`, `soreRegions: string[]`, `sorenessChecked?: boolean` (true = the user went through the body map, so unmarked regions mean "not sore"; only then does the engine learn from it, see 5.11) |
| `usual_weight` | `exerciseId` (a weighted exercise), `weightKg` in (0, 200], `reps?` (int 1..50, default 10): "the weight I usually use". Sets the starting 1RM until the exercise is measured; ignored afterwards and for unweighted exercises. |
| `external_activity` | `presetId`, `minutes`, `intensity: "light"\|"moderate"\|"hard"` |

Rules:
- Warm-up sets are ignored by all math.
- Holds are converted with `repsEq = holdSeconds / params.hold.secondsPerRep` (default 3). All maths uses `repsEq`. Prescriptions for holds are converted back to seconds.
- Unilateral sets are logged once per side-pair (reps = per side). They count as one set.

---

## 4. Default params (`params/default.params.json`)
```json
{
  "version": 1,
  "effort": {
    "stimulus": [1.0, 1.0, 0.95, 0.85, 0.6, 0.3],
    "fatigue":  [1.3, 1.1, 1.0, 0.85, 0.65, 0.4]
  },
  "reps": { "ref": 10, "exponent": 0.25, "min": 5, "max": 40 },
  "novelty": { "amp": 0.6, "decay": 2, "windowDays": 56, "experience": { "beginner": 1.0, "intermediate": 1.0, "advanced": 0.5 } },
  "lengthenedFactor": 1.25,
  "hold": { "secondsPerRep": 3 },
  "recovery": {
    "fastShare": 0.4,
    "fastHalfLifeH": 4,
    "slowHalfLifeH": {
      "chest": 22, "upper_back": 22, "quads": 22, "glutes": 22, "hamstrings": 22, "lower_back": 22,
      "front_delt": 16, "side_rear_delt": 16, "triceps": 16, "biceps": 16, "calves": 16, "abs": 16
    }
  },
  "readiness": { "readyBelow": 1.5, "fatiguedAbove": 3.5, "weights": { "ready": 1.0, "recovering": 0.4, "fatigued": 0.0 } },
  "systemic": { "halfLifeH": 24, "restRatio": 0.8, "defaultTypicalSession": 12, "minSessionsForTypical": 3, "typicalWindow": 10 },
  "stimulus": { "sessionMax": 6 },
  "weeklyTargets": {
    "chest": 10, "upper_back": 10, "quads": 10, "glutes": 8, "hamstrings": 8, "lower_back": 4,
    "front_delt": 4, "side_rear_delt": 6, "triceps": 6, "biceps": 6, "calves": 6, "abs": 6
  },
  "targetMultipliers": {
    "goal": { "muscle": 1.0, "general_fitness": 0.7 },
    "experience": { "beginner": 0.7, "intermediate": 1.0, "advanced": 1.2 }
  },
  "capacity": {
    "emaAlpha": 0.3, "freshBelow": 0.5, "sessionCleanBelow": 0.3,
    "beta": 0.08, "repRange": [6, 20], "staleDays": 28, "staleFactor": 0.93,
    "targetRir": { "beginner": 3, "intermediate": 2, "advanced": 1 },
    "maxDrop": 0.45
  },
  "tolerance": { "ref": 5, "init": { "beginner": 3.5, "intermediate": 5, "advanced": 7.5 }, "learnRate": 0.2, "max": 15 },
  "calibration": {
    "noiseBand": 0.08, "errorClamp": 0.3,
    "rho":  { "init": 1.0, "rate": 0.1, "min": 0.6, "max": 1.8, "beatUpNudge": 1.02 },
    "rirBias": { "init": 0, "rate": 0.3, "min": -2, "max": 5, "amrapIntervalDays": 14 },
    "acute": { "init": 0.12, "rate": 0.2, "min": 0.03, "max": 0.3, "minDeltaF": 0.3, "minPrevM": 3 },
    "deload": { "window": 6, "minObs": 4, "triggerBelow": -0.10, "clearAbove": -0.03, "maxDays": 7 },
    "confidence": { "calibrating": 3, "low": 8, "medium": 20 }
  },
  "autoreg": { "dropFraction": 0.3 },
  "planner": {
    "overloadLambda": 1.0, "continuityBonus": 0.3, "continuityDays": 21, "minScore": 0.1,
    "sets": { "base": 3, "highNeed": 0.7, "highSets": 4, "lowNeed": 0.35, "lowSets": 2, "min": 2 },
    "time": { "warmupMin": 3, "minPerSet": 1.75, "unilateralSetFactor": 1.6, "transitionMin": 1 },
    "calibrationBonus": 0.5, "fullBodyBonusMaxDays": 3, "fullBodyBonus": 1.2,
    "deloadSetFactor": 0.5, "deloadRirAdd": 2,
    "intensityRirAdd": { "easy": 2, "hard": -1 }
  },
  "strength": { "repRange": [6, 15], "usualRir": 2, "initFactor": 0.85, "fallbackBodyMassKg": 70, "maxObsReps": 50 },
  "difficulty": { "ratingAlpha": 0.5, "demandAlpha": 0.25, "demandMax": 1.5, "trustK": 2, "neighbourTrust": 0.3, "excludeAbove": 4.5, "preferWeight": 0.3 }
}
```

The `strength` and `difficulty` blocks drive weighted exercises and personal difficulty; see the design doc §2 and §3.

---

## 5. Model

### 5.1 Per-set load (`load.ts`)
For a non-warm-up set of exercise `e`:
```
r      = min(rir, 5)
x      = clamp(repsEq, reps.min, reps.max)
g      = (x / reps.ref) ^ reps.exponent
k      = number of distinct PRIOR sessions containing any exercise on e's ladder (its movement family)
         within novelty.windowDays before this set
N      = 1 + novelty.amp * novelty.experience[experience] * exp(-k / novelty.decay)   (constant for all sets of e in a session)
L      = lengthened ? lengthenedFactor : 1

setStimulus = effort.stimulus[r]
setFatigue  = effort.fatigue[r] * g * N * L

for each region m with c = contributions[m]:
    rawSessionStimulus[m] += setStimulus * c
    fatigue deposit to m   = setFatigue * c
systemic deposit = setFatigue
```
Unit: 1 fatigue unit is one familiar hard set (10 reps, RIR 2). The same deposit without N is the set's **work**.

**Tolerance `T_m`** (per region, `recovery.ts`): the fatigue a full, normal session leaves in that muscle for this user.
```
T_m     = max(tolerance.init[experience], learned_m)          (learned_m starts at 0)
scale_m = T_m / tolerance.ref
```
At session end, for each region whose session work `W_m` exceeds `T_m`: `learned_m = T_m + learnRate * (min(W_m, tolerance.max) - T_m)`.
It is never lowered (repeated-bout effect). It learns from work, not fatigue, so a novel session does not count twice.

### 5.2 Recovery (`recovery.ts`)
Each region has two compartments, `fast` and `slow`. A deposit `D` adds `fastShare*D` to fast and `(1-fastShare)*D` to slow.

`advanceTo(t)` decays from the last update time over `Δh` hours:
```
fast *= 0.5 ^ (Δh / fastHalfLifeH)
slow *= 0.5 ^ (Δh / (slowHalfLifeH[m] * rho))
F_m = fast + slow
```
Decay is **piecewise**: the fold advances to each event's time using the `rho` current at that point, then applies the event. Queries advance to `now`.

Systemic `G` is a single compartment decayed with `systemic.halfLifeH` (not scaled by rho).

### 5.3 Fold (`fold.ts`)
`replay(events, catalog, params) -> EngineState`
- Sort events by `(ts, seq)`.
- Fold left over them. Learning updates (section 5.6) happen inside the fold at `set_logged` events, so state and learned parameters stay one deterministic function of the history.

The state holds:
- the profile,
- per-region compartments,
- `G`,
- the list of sessions (id, start, end, per-region saturated stimulus, per-session fatigue totals),
- per-exercise capacity `M_e`, observation count and last-performed time,
- exposure history,
- the learned `rho`, `b` and `d` with their observation counts,
- the last AMRAP time,
- deload status,
- the prediction log,
- today's check-in.

Per-session bookkeeping: while a session is open, also track `sessionAdded[m]`, the fatigue deposited to each region in this session. It is used to separate prior fatigue from in-session fatigue. Also track the session's work per region; tolerance learns from it when the session ends.

Session saturation, applied when the session ends (or at query time for an open session):
```
sessionStimulus[m] = sessionMax * (1 - exp(-rawSessionStimulus[m] / sessionMax))
```

### 5.4 State queries (`state.ts`)
- **Readiness state:** thresholds are defined at `tolerance.ref` and scale with the user: `F_m < readyBelow·scale_m` gives `ready`; `F_m > fatiguedAbove·scale_m` gives `fatigued`; anything else is `recovering`. `R_m` = the weight for that state. Readiness also reports `tolerance = T_m` and `load = F_m / T_m` (1.0 = a full, normal session).
- **Hours to ready:** bisection on `F_m(now + h) = readyBelow·scale_m` over [0, 240] h, tolerance 0.05 h. Return 0 if already ready.
- **Weekly target:** `T_m = weeklyTargets[m] * goalMult * byLevel(targetMultipliers.experience, level) * emphasis_m` (program emphasis, default 1).
- **Weekly done:** `Done_m` = sum of `sessionStimulus[m]` for sessions starting within the last 7×24 h of `now`.
- **Need:** `Need_m = max(0, T_m - Done_m) / T_m`.
- **Typical session load:** `G_typical` = median total set fatigue per session over the last `typicalWindow` sessions. If fewer than `minSessionsForTypical` sessions exist, use `defaultTypicalSession · tolerance.init[experience] / tolerance.ref`.
- **Rest recommended** when `G(now) > restRatio * G_typical` OR no major region is `ready`. With `restRatio` 0.8, this triggers after about 3 consecutive daily hard sessions.

### 5.5 Capacity, prediction, prescription (`capacity.ts`)
`M_e` is the estimated reps-to-failure (repsEq) for exercise `e` when fresh.

Initialisation, in order:
1. `defaultM` at the user's level for e's ladder (log-interpolated, see 5.10),
2. ladder neighbour: known `M` × `stepRatio^Δlevel`,
3. 10.

A first set on an uninitialised or stale exercise is flagged `firstSetMode: "technical_failure"`.

**Stale capacity.** If days since `e` was last performed exceed `staleDays`, use `M_e * staleFactor` and flag technical failure.

**Effective fatigue for exercise e** is contribution-weighted over regions with c ≥ 0.5:
```
F_prior_eff = Σ c_m * (F_m - sessionAdded_m) / Σ c_m      (fatigue carried from previous sessions)
F_sess_eff  = Σ c_m * sessionAdded_m / Σ c_m              (fatigue added in this session)
```

**Predicted max for the next set:**
```
M_pred = M_e * (1 - priorDrop) * (1 - d) ^ F_sess_eff
priorDrop = maxDrop * (1 - exp(-beta * F_prior_eff / (maxDrop * scale_eff)))
scale_eff = Σ c_m * scale_m / Σ c_m      (same regions as F_prior_eff)
```
`priorDrop` has slope `beta` at zero fatigue (scale 1) and never exceeds `maxDrop`: carried fatigue can cost at most 45% of your reps.

**Observed max from a logged set:** `M_obs = repsEq + rir + b`. For AMRAP sets, `M_obs = repsEq` (rir is treated as 0 and `b` is not added). `M_obs` is capped at `capacity.maxObsFactor` (1.5) × the exercise's advanced norm, so a typo cannot drive the plan.

**Censored sets.** RIR 5 means "5 or more": `M_obs` is only a lower bound. Such a set may raise capacity (a capacity observation only if `M_obs > M_e`) and is never used for rho, d, b, or to lower anything. An AMRAP compared against a censored earlier set is skipped.

**Prescription:**
```
targetRir  = capacity.targetRir[experience]       (+ deloadRirAdd if deload)
repsTarget = round(M_pred - targetRir)
```
- If `repsTarget > repRange[1]`, move up one ladder level (if available) and recompute.
- If `repsTarget < repRange[0]`, move down one level.
- For holds, output seconds = `repsTarget * secondsPerRep`.
- Multi-set prescriptions project `F_sess_eff` forward using the projected fatigue of the planned sets.

**Autoregulation helper:** `shouldStopExercise(prescribedReps, actualReps)` returns true when `actualReps < (1 - dropFraction) * prescribedReps`.

**Weighted exercises** (dumbbells) store a one-dumbbell 1RM instead of M and are predicted, prescribed and calibrated at a weight: see docs/superpowers/specs/2026-10-02-weights-and-adaptive-difficulty-design.md §2.

### 5.6 Calibration (`calibrate.ts`, called inside the fold at each set)
Clamp every error to `[-errorClamp, +errorClamp]` before using it.

For each non-warm-up set, first compute `M_pred` and `M_obs` and append to the prediction log:
- ts, exercise, observation type, `M_pred`, `M_obs`, `err = (M_obs - M_pred) / M_pred`.

Then classify the observation and update **only** the matching parameter.

| Type | Condition | Update |
|---|---|---|
| `capacity` | first set of e in session, `F_sess_eff < sessionCleanBelow`, `F_prior_eff < freshBelow`, not AMRAP | first capacity observation of e: `M_e = max(1, M_obs)` (the measurement replaces the catalog guess); later: `M_e += emaAlpha * (M_obs_fresh - M_e)`, where `M_obs_fresh = M_obs`. Also records a level observation (5.10). |
| `recovery` | first set of e in session, `F_sess_eff < sessionCleanBelow`, `F_prior_eff >= freshBelow`, not AMRAP | if `|err| > noiseBand`: `rho = clamp(rho * (1 - rho.rate * err))`. Positive err means faster recovery, so rho decreases. |
| `acute` | set k ≥ 2 of the same exercise, consecutive, not AMRAP, `ΔF >= minDeltaF`, `M_obs(k-1) >= minPrevM` | `d_obs = 1 - (M_obs_k / M_obs_{k-1}) ^ (1/ΔF)`; `d += acute.rate * (clamp(d_obs) - d)`. `ΔF` = F_sess_eff added by set k-1. |
| `amrap` | isAmrap, with an earlier non-AMRAP set of e in the same session | `predicted = M_obs(prev) * (1 - d)^(ΔF since prev)`, where M_obs(prev) already includes b. `b = clamp(b + rirBias.rate * (repsEq_amrap - predicted))`. |
| `log_only` | anything else | none |

**Last-set rating.** A set logged without `rir` is not an observation. Its fatigue and stimulus are sized with the reps left the prediction implies, `clamp(round(M_pred - repsEq - b), 0, 5)` (an all-out set: 0).
When a rated set follows only unrated sets of the same exercise in the session, it is that exercise's observation: `capacity` or `recovery`, judged clean by the in-session fatigue *before the exercise's first set* (`F_start`), with
`M_first = M_obs / (1 - d)^(F_sess_eff - F_start)` used wherever the table uses `M_obs_fresh` (capacity, 1RM, level). `err` is unchanged (prediction and observation at the same fatigue).
`d` is learned only when two sets in a row are rated, and `b` only when the set before an all-out set is rated (the app asks there in place of the last set).

Other calibration state:
- **Check-in `beat_up`:** `rho = clamp(rho * beatUpNudge)`. Sore regions are stored for that calendar day only (planner use). They never change parameters.
- **Deload:**
  - Track `err` over the last `window` observations of type capacity or recovery.
  - If there are at least `minObs` and the mean is below `triggerBelow`, set `deloadActive` from that time.
  - Clear it when the rolling mean rises above `clearAbove` or after `maxDays`.
- **Confidence** for each learned parameter, by observation count:
  - under `calibrating` → "calibrating",
  - under `low` → "low",
  - under `medium` → "medium",
  - otherwise "high".
- **Overall `calibrating` flag:** fewer than `calibratingMinObs` (6) clean observations, or fewer than `calibratingMinDays` (7) days since the first session. The fold stores `calibratedAt`, the time of the first set logged after both hold; the level estimate is used from then on.

### 5.7 External activities (`external.ts`)
Presets give fatigue units per 60 minutes at moderate intensity, plus a systemic value. They produce **no stimulus**, and N = 1.

Scale by `minutes/60 × {light 0.5, moderate 1, hard 1.5}`.

| Preset | Fatigue per 60 min (moderate) | Systemic |
|---|---|---|
| football | quads 2, hamstrings 2, calves 1.5, glutes 1.5, abs 0.5 | 8 |
| running | quads 1.5, calves 2, hamstrings 1, glutes 1 | 6 |
| cycling | quads 2, glutes 1 | 5 |
| badminton | quads 1, calves 1.5, front_delt 0.5, side_rear_delt 0.5 | 5 |
| cricket | quads 1, glutes 0.5, side_rear_delt 0.5 | 4 |

### 5.8 Planner (`planner.ts`)
`planSession(state, { now, minutes?, overrideEquipment?, intensity? }) -> Plan`

`intensity: "easy" | "normal" | "hard"` (default normal) adds `planner.intensityRirAdd` (+2 / −1) to every set's target reps left, clamped to 0..5.

**Step 0: rest check.** If rest is recommended, return `{ kind: "rest", reasons }`, for example "3 hard sessions in a row; systemic fatigue high" or "No major muscle group ready".

**Step 1: template choice.** Templates come from the profile's program (`catalog/programs.json`); the default program's templates are:

| Template | Slots (patterns) |
|---|---|
| full | squat, horizontal_push, horizontal_pull, hinge, core |
| upper | horizontal_push, horizontal_pull, vertical_push, vertical_pull, elbow_flexion, elbow_extension |
| lower | squat, hinge, single_leg, calf, core |
| push | horizontal_push, vertical_push, elbow_extension, core |
| pull | horizontal_pull, vertical_pull, elbow_flexion, rear_delt |
| legs | squat, single_leg, hamstring_curl, calf |

- Covered regions = regions with c = 1 in any catalog exercise of those patterns.
- `score = Σ emphasis_m * Need_m * R_m / Σ emphasis_m` over covered regions.
- For the program's first template, multiply by `fullBodyBonus` when `daysPerWeek <= fullBodyBonusMaxDays`.
- While calibrating, add `calibrationBonus × (share of slots whose pattern has no measured ladder)`.
- Sore regions from today's check-in count as `fatigued` today.
- Highest score wins. Ties go by table order.

**Step 2: candidates per slot.**
- Exercises of that pattern whose equipment is a subset of the user's equipment.
- Remove excluded exercises and exercises whose c=1 region is in `excludeRegions`.
- Per ladder, keep only the user's current level. That is the highest level performed with `repsTarget <= repRange[1]`; if none, the entry level for their level on that ladder, meaning the exercise whose initial M falls closest to the middle of the rep range.

**Step 3: greedy fill.**
Loop until every slot is filled, the time budget is used, or the best score falls below `minScore`:
```
for each unfilled slot, for each candidate e:
    F_after_m = F_proj_m + plannedSets * projectedSetFatigue(e) * c_m
    score = Σ c_m * Need_proj_m * R(F_proj_m)
          - overloadLambda * Σ max(0, F_after_m - fatiguedAbove·scale_m)
          + (used within continuityDays ? continuityBonus : 0)
pick the argmax (tie-break by exercise id), fill its slot
```
After each pick:
- add the projected stimulus and fatigue of its planned sets into `F_proj` and `Need_proj`, then re-score the remaining candidates.

**Sets per exercise:**
- `base`; use `highSets` if the max Need of its c=1 regions exceeds `highNeed`; use `lowSets` if it is below `lowNeed`.
- Subtract 1 if today's check-in is `beat_up`. Floor at `min`.
- Then reduce sets so that projected raw session stimulus for any region stays at or below `sessionMax`, and (floor 1) so no region passes `fatiguedAbove·scale_m`. Under deload this cap is judged at normal effort (targetRir − deloadRirAdd).
- Under deload, then multiply by `deloadSetFactor` and round, with a floor of 1: a deload is a fraction of the normal plan.
- Score gain per region is `c_m * emphasis_m * Need_proj_m * R_m`. While calibrating, an exercise whose ladder has no level observation gets `+calibrationBonus` and the reason "Calibration: measures your level on this movement".

**Time:**
```
total = warmupMin + Σ(sets * minPerSet * (unilateral ? unilateralSetFactor : 1) + transitionMin)
```
Skip a candidate that does not fit `sessionMinutes`.

**AMRAP:** if at least `amrapIntervalDays` have passed since the last AMRAP, mark the last set of the first planned exercise that has two sets and whose last two sets share a weight as AMRAP (a weighted exercise that stepped down on its last set, or is "too light", is skipped, since the AMRAP is compared with the set before it).

**Output:**
```ts
Plan = {
  kind: "workout" | "rest",
  template,
  exercises: [{ exerciseId, sets: [{ reps | seconds, weightKg?, targetRir, isAmrap }], firstSetMode, loadFlag, difficulty, reasons: string[] }],
  skippedRegions: [{ region, state, hoursToReady }],
  deloadActive,
  calibrating,
  estMinutes
}
```

Reasons are built from the dominant score terms, for example:
- "Upper back is ready and 7.7 sets behind this week"
- "Continuing progression: used 3 times in the last 21 days"
- "Moved up to decline push-up: you exceeded 20 reps"
- For skipped regions: "Chest skipped: recovering, ready in ~9h"

**Difficulty**: candidates at or above difficulty.excludeAbove are dropped unless all are; scores are scaled by the difficulty fit (design doc §3).

### 5.10 Level (`level.ts`)
The level is a continuous score: 0 beginner, 1 intermediate, 2 advanced. `byLevel(record, score)` interpolates any per-experience param linearly; `normAt(defaultM, score)` interpolates rep norms in log space.

**Observation.** Every capacity observation (a clean, fresh first set) scores `M_obs = reps + rir + b` against the exercise's `defaultM`: `score` = position of ln M_obs between ln beginner (0), ln intermediate (1), ln advanced (2), clamped. Its weight is `ln(advanced / beginner)`, so exercises whose norms barely separate levels count little. The last `level.window` observations per ladder are kept.

**Estimate** (shrinkage toward a prior; prior = self-reported experience, else 1):
```
overall  = (priorWeight·prior + Σ w·score) / (priorWeight + Σ w)            all ladders
ladder_l = (ladderPriorWeight·overall + Σ_l w·score) / (ladderPriorWeight + Σ_l w)
region_m = n-weighted mean of measured ladders with a c=1 exercise on m, else overall
```
While calibrating (`calibratedAt` null), the effective level everywhere is the prior; after, the estimate.

**Weighted observations.** A clean weighted capacity observation scores `oneRm / bodyMass` (1RM from `oneRmFrom(w, M_obs)`) against the exercise's `loadNorm` in the same way. It is recorded only when `profile.bodyMassKg` is set.

**Used for:** initial M per ladder, `targetRir` (rounded), novelty multiplier, weekly target multiplier and default typical session (overall); tolerance defaults (per region).

**Programs** (`catalog/programs.json`, `loadCatalog(exercises, programs?)`): `{ id, name, description?, emphasis: partial region → multiplier, templates: [{ id, slots: pattern[] }] }`. Without a programs file the catalog has one `balanced` program with the templates above. Every slot pattern must have at least one exercise.

### 5.11 Soreness (`soreness.ts`)
What a person feels (DOMS), separate from performance fatigue.

**Deposit.** Each set adds `work × c × sorenessNovelty × byLevel(soreness.level)` to region m's pending pool, where `sorenessNovelty = 1 + noveltyAmp × noveltyMult × exp(−k / novelty.decay)`. Soreness has a much stronger repeated-bout effect than fatigue: a new movement is about 3× as sore as a familiar one.

**Time course.** `dP/dt = −P/riseH`, `dS/dt = P/riseH − S/(decayH·rhoS)`, solved in closed form. A session's soreness peaks about 33 h later at the defaults, then clears over a few days. Fatigue, by contrast, only falls.

**Felt level.** `felt = sigma × S`; levels none / mild / sore / very sore at `thresholds` [1, 2.5, 4].

**Learning (joint MAP on a grid).** sigma (how sore this user gets) and rhoS (how long it lasts) explain the same answers, so they are fitted together.
- The fold keeps one compartment set per candidate rhoS, plus a log-posterior over every (rhoS, sigma) pair: a log-normal prior (`priorSd`), plus, per body-map answer on each region trained within `windowH`, `log P(answer)`.
- `P(sore) = floor + (1 − 2·floor)·logistic((ln(sigma·S) − ln mild) / width)`.
- The estimate is the argmax; `sigma.obs` / `rhoS.obs` count learning check-ins.
- A check-in without `sorenessChecked` never changes them.

**Insights (`insights.ts`).** `insights(before, after)` returns plain-language notes: calibration done, level change, a new max (≥ 8%), raised tolerance, sore-prone / rarely sore (announced once, when established with ≥ 3 check-ins and outside ×1.25), soreness lasting longer / shorter (additionally needs ≥ 2 check-ins with something sore), and RIR bias ≥ 1.

### 5.13 Calories (`energy.ts`)
`sessionCalories(state, session)` (null without `bodyMassKg`), from the 2024 Adult Compendium of Physical Activities:
- Every set (warm-ups included) is logged with its active seconds: reps × `energy.secondsPerRep` (3), ×2 for unilateral exercises; holds use their seconds.
- **MET by reps left** (index 0..5):
  - Multi-joint: 7.5 (02020 vigorous calisthenics), 7.5, 6.5 (02057 high-intensity body-weight resistance), 5.15, 3.8 (02022 moderate), 3.8.
  - `energy.lightPatterns` (core, calves, arms, rear delts, back extension, leg curls): 3.8, 3.8, 3.5, 3.15, 2.8 (02024 light), 2.8.
  - Warm-ups use index 5.
- **Rest** before each set = the gap since the previous set minus this set's time, capped at `maxRestMin` (5); a gap ≤ 0 counts as `defaultRestMin` (1.5). Rest is charged at 07040 standing quietly, 1.3 MET.
- **Formula:** kcal/min per MET = 3.5 × kg / 200 (ACSM). Active (net) kcal = Σ sets (MET − 1)·t × (1 + `recoveryFraction` 0.10, recovery oxygen) + Σ rest (1.3 − 1)·t.
- **Total** adds resting burn over the session: Mifflin–St Jeor when height and age are known (sex constant +5 / −161, −78 if unknown), else 1 MET.
- **Range:** ±`uncertainty.withBody` (25%) with height and age, else ±`massOnly` (30%).
- **Check:** a typical 15 × 12 session at 70 kg ≈ 2.9 METs averaged over the session. The Compendium's 02056 "body weight resistance, general" is 3.0.

### 5.14 Robustness
- **`replay`:** de-duplicates events by id (first wins). It validates each event, skips invalid ones and lists them in `state.rejected`.
- **Session ids:** a session id reused later gets a unique internal id; the external one is kept as `key`. A set arriving more than `session.maxGapH` (3 h) after the open session's last event closes that session (at its last event) and starts a new one.
- **Capacity updates** after the first move toward the observation clipped to M × (1 ± `capacity.maxStep` 0.5).
- **`predictRange(state, exerciseId, now)`:** M_pred with the 10th–90th percentile band of the user's own last 30 relative errors (exact observations only). It is at least ±5% and ±20% until 8 errors exist.

### 5.12 Personal views (`personal.ts`)
Read-only views for "the app understands you" screens:
- `goodSets(state, exerciseId, now)`: predicted reps per set at target effort (no ladder move) until a set would drop below `(1 − autoreg.dropFraction)` × the first.
- `predictionAccuracy(state)`: share of the last 20 sets within ±2 reps of the prediction, and of the first 20.
- `strengthTrend(state, exerciseId)`: clean max measurements over time.
- `aboutYou(state)`: plain-language traits (level, in-session fatigue, effort-rating bias, recovery, soreness, soreness duration, raised capacity, favourites). Each carries a confidence; traits without enough data are omitted.

### 5.9 Public API (`index.ts`)
```ts
replay(events, catalog, params): EngineState
readiness(state, now): Record<Region, { fatigue, state, hoursToReady }>
weeklyNeed(state, now): Record<Region, { target, done, need }>
systemic(state, now): { G, typical, restRecommended, reasons }
predictSet(state, exerciseId, now): { M_pred, F_prior_eff, F_sess_eff }
prescribe(state, exerciseId, sets, now): Prescription
planSession(state, opts): Plan
diagnostics(state, now): { rho, b, d, confidences, calibrating, deloadActive, maeLast20, maeByWeek, equipmentGaps, predictionLogTail }
```

---

## 6. Storage (`src/storage`)
The `repo.ts` interfaces:
- `EventStore.append(event)`
- `EventStore.list(userId, { from?, to? })`
- `CatalogStore.load()`
- `ParamsStore.load(version?)`

Implementations:
- `memory.ts`
- `sqlite.ts`, using a `better-sqlite3` table:
  `events(id TEXT PK, user_id TEXT, ts INTEGER, seq INTEGER, type TEXT, payload TEXT JSON, schema_version INTEGER)`
  with an index on `(user_id, ts, seq)`.

Validate every event with zod on append and on read.

State is **never stored**. It is always computed as `replay(events)`. Snapshot caching is out of scope.

---

## 7. Tests (all must pass)

### 7.1 Golden tests
Use tolerance 1e-3, default params, and all sets at the same timestamp t0.

- **G1: familiar push-ups** (novelty amp overridden to 0).
  - Sets: 12 @ RIR2, 10 @ RIR2, 8 @ RIR1.
  - Set fatigues: 1.0466, 1.0000, 1.0403. Total 3.0870.
  - Chest fatigue 3.0870; triceps and front_delt 1.5435.
  - Raw stimulus: chest 2.90, triceps 1.45.
  - Saturated session stimulus: chest 2.2998, triceps 1.2880.
- **G2: same sets, novel exercise** (k=0, default params). Chest fatigue 4.9391 (G1 × 1.6).
- **G3: decay of G1 chest.**
  - At +12h: 1.4235 (fast 0.1543, slow 1.2691).
  - At +24h: 0.8889.
  - hoursToReady is between 10 and 12.
- **G4: triceps at +12h after G1:** 0.6278.
- **G5: prediction next day.**
  - Push-up `M_e` = 14, rho 1, at +12h after G1, no in-session fatigue.
  - `F_prior_eff` = 1.0257, `M_pred` = 12.950 (bounded drop; 12.851 under the old linear `1 - beta·F`).
- **G6: weekly need.** After G1 only, chest need = 0.7700 (target 10, profile muscle/intermediate).
- **G7: acute update.**
  - Set 1 `M_obs` 14, set 2 `M_obs` 12, ΔF 0.785.
  - `d_obs` ≈ 0.178, so `d` goes 0.12 → ≈ 0.1316.

### 7.2 Unit tests
One test file per module, covering:
- boundaries (RIR 5+, rep clamps, holds, unilateral),
- stale capacity,
- ladder moves,
- rest rule (3 consecutive daily sessions trigger it; 1 session does not),
- external activity deposits,
- check-in effects,
- deload trigger and clear,
- confidence levels.

### 7.3 Property tests (fast-check)
- Fatigue is ≥ 0 and non-increasing over time when there are no events.
- Lower RIR never gives less set fatigue. More reps never give less set fatigue.
- `replay` is deterministic (deep-equal) and independent of input array order (it sorts by ts, seq).
- All learned parameters stay within their clamps under arbitrary event streams.
- The planner never selects excluded exercises, missing equipment or exercises from sore regions. It never plans a c=1 exercise for a region that is `fatigued` at plan time. Its output is deterministic.
- The engine purity scan passes.

### 7.4 Simulation harness (`src/sim`)
The synthetic user has a hidden `trueLevel` (sets `M_true` from the catalog norms × U(0.8, 1.2) per ladder, and `T_true`); its profile carries no experience, so the engine must infer it. Other hidden true values: `rho_true`, `b_true`, `d_true`, `T_true` (experience default × `toleranceTrue`, never learned), and `M_true` per exercise. `M_true` grows 0.5% per week and decays after 4+ weeks without training.

True fatigue is simulated with the same load and recovery equations, but using `rho_true`. The user's daily performance has seeded noise of ±6% (uniform).

For each prescribed set:
```
trueMax = M_true * (1 - priorDrop(F_prior_eff_true, T_true)) * (1 - d_true)^F_sess_eff_true * noise
reps    = min(prescribed, floor(trueMax))
trueRir = trueMax - reps
reported rir = clamp(round(trueRir - b_true + N(0, 0.7)), 0, 5)
```
AMRAP sets: `reps = floor(trueMax)`.

The user follows the planner on its training days (`daysPerWeek`, spread evenly). They check in "beat_up" when the true systemic ratio exceeds 0.9.

Scenarios:
- `beginner_3x_no_equipment`
- `intermediate_5x_bar_bands`
- `slow_recoverer` (rho_true 1.5)
- `fast_recoverer` (rho_true 0.7)
- `rir_sandbagger` (b_true +2)
- `returns_after_layoff` (4 weeks off at week 6)
- `weekend_footballer` (football, hard, 90 min every Sunday)
- `sore_prone` (sigma_true 2, rhoS_true 1.4) and `rarely_sore` (0.5, 0.75): body-map check-in every day (morning, or before training), answering with the same logistic model at the true values
- `advanced_high_volume` (advanced, adds 4 sets to every planned exercise, `T_true` = 1.3 × default)

**Acceptance** (seeds 1–5, 12 weeks each):
- `|rho_learned - rho_true| < 0.2` by week 12 for rho_true in {0.7, 1.0, 1.5}.
- `|b_learned - b_true| < 0.75` in `rir_sandbagger`.
- Rep MAE in weeks 9–12 is below rep MAE in weeks 1–2, in every scenario.
- No region's weekly done exceeds 1.5 × target in any week (not for `advanced_high_volume`, which ignores the plan on purpose).
- Soreness: learned sigma within ×1.3 and rhoS within 0.25 of the truth by week 12 (`sore_prone`, `rarely_sore`).
- Level: inferred level within 0.35 of `trueLevel` by week 12 in every scenario; calibration ends between day 7 and day 14.
- Tolerance: plan-following users stay at their level's default; in `advanced_high_volume` learned T is closer to `T_true` than the default, and rep MAE is no worse than with learning off.
- No planned exercise has a c=1 region in `fatigued` state at plan time.
- `returns_after_layoff`: the first sets after the layoff are flagged technical failure, and M adjusts within 2 sessions.

If an acceptance test fails, investigate before tuning. Report which parameter or formula causes it in `DECISIONS.md`. Do not silently change params to force a pass.

---

## 8. CLI (`src/cli`, run via `tsx`)
- `npm run sim -- --scenario <name> --weeks 12 --seed 1`
  - Prints a per-day table: date, plan kind/template, exercises × sets, a 12-region state string (R/r/F), and rho/b/d, followed by weekly MAE.
  - Writes a JSON report to `out/`.
- `npm run replay -- --file events.json [--now ISO]`
  - Prints readiness, weekly need, systemic, diagnostics.
- `npm run plan -- --file events.json [--now ISO] [--minutes 30]`
  - Prints the plan with reasons.
- `npm run db:import -- --file events.json --db data.sqlite`
- `npm run db:replay -- --db data.sqlite --user <id>`

Also include `fixtures/events.sample.json`: 2 weeks of realistic hand-written events for one user.

---

## 9. Milestones
1. Scaffold, types and zod schemas, params loader, catalog validator, the full seed catalog, and the purity-scan test.
2. `load.ts`, `recovery.ts`, the fold skeleton, and golden tests G1–G4.
3. `state.ts` queries, weekly need, systemic and rest rule, and G6.
4. `capacity.ts`: prediction, prescription, ladders, stale capacity, and G5.
5. `calibrate.ts` (rho, b, d, deload, confidence, prediction log), external activities, check-ins, and G7.
6. `planner.ts`, planner property tests, and reasons.
7. Storage: memory, SQLite and the db CLI.
8. Simulation harness, scenarios, acceptance tests, and the sim/replay/plan CLI.

---

## 10. Out of scope (do not build)
- UI
- Auth
- Network or sync
- Push notifications
- ML or AI
- Camera or pose estimation
- Sleep inputs
- Per-exercise muscle contribution learning
- Per-region recovery multipliers
- State snapshots/caching

### 5.15 Suggestions and muscle effects (`suggest.ts`, `muscles.ts`; see DECISIONS, 11 October 2026)

- `planSession(s, { focus?: Region[], excludeExercises?: string[] })`: a day built around chosen muscles (`plan.focus`, template `focus`), and swaps. `plan.short` says why a plan fills less of the time given.
- `suggestExercises(s, opts)` → `{ basis, muscles, suggestions[], unavailable[] }`; each suggestion has sets (with dumbbell weight), muscle effects, a summary, active kcal and reasons.
- `workEffects`, `exerciseEffects`, `planEffects`, `muscleUsage`, `leastUsedMuscles`, `muscleSummary`, `usageWords`, `MUSCLE_NAMES`.
- `estimateCalories(s, sets)`, `planCalories(s, plan)`; `usableNow`, `currentLevels` and `hoursFrom` are exported for these views.
- Params: `planner.focus { boost, needFloor, fatigueCap }`.
