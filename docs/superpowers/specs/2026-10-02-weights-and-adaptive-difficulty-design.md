# Weight support and adaptive difficulty: design

Date: 2026-10-02. Status: approved in brainstorming, pending spec review.

## Goal

1. Let the engine prescribe dumbbell exercises: choose a weight the user owns and a rep target, and learn the user's strength from logged sets.
2. Give every exercise a per-user difficulty: predicted from the library at first, then personalised from the user's numbers and one-tap ratings, always consistent with the rest of the state.

Both build on the exercise library (`src/library`, `catalog/library`) and the existing reps-based engine. Nothing here changes behaviour for users who own no dumbbells and never rate an exercise, apart from difficulty-aware planner scoring.

## Evidence used

- People underestimate reps to failure: novices by about 4–5 reps, experienced lifters by 1–2, and accuracy improves over successive sets (Steele et al. 2017, PMC5712461). The existing per-user RIR bias `b` absorbs this; weighted sets feed the same `b`.
- Classic 1RM equations are least accurate at light weights and high reps, the home-dumbbell range (arXiv 2603.17495). So the engine only prescribes weights whose fresh reps-to-failure is ≤ 30, and re-anchors the estimate at the weight actually lifted.
- Perceived difficulty rises steeply with balance demand and with age (Frontiers in Rehabilitation Sciences 2026, PMC12929541). Strength alone does not describe difficulty, hence the `demands` tags and the one-tap rating.

## 1. Data and events

### Library (`ExerciseRecord`)

| Field | Applies to | Meaning | Validation |
|---|---|---|---|
| `demands` | all | Subset of `balance, coordination, mobility, grip`: what makes the move hard beyond strength. Default `[]`. | no duplicates |
| `loadNorm` | weighted only | Typical 1RM of one dumbbell as a multiple of body mass, `{ beginner, intermediate, advanced }`. | required iff `weighted`; each > 0; strictly ascending |
| `dumbbells` | weighted only | `1` or `2` dumbbells in use. | required iff `weighted` |

All 129 exercises get `demands`; the 42 weighted ones get `loadNorm` and `dumbbells`.

### Profile (`profile_set` payload)

`dumbbells?` is one of:
- `{ kind: "fixed", kg: number[] }`: 1–100 distinct values, each in (0, 200].
- `{ kind: "adjustable", minKg, maxKg, stepKg }`: 0 < minKg ≤ maxKg ≤ 200, 0 < stepKg, at most 100 resulting weights.

`ownedWeights(profile)` expands either form to a sorted list. For adjustable sets each weight is `minKg + i·stepKg`, rounded to 3 decimals, up to `maxKg + 1e-9`. The planner uses weighted exercises only when `"dumbbell"` is in `equipment` and `dumbbells` is set. `bodyMassKg` (existing, optional) feeds the fallback estimate.

### Events (additive; `schemaVersion` stays 1)

- `set_logged.weightKg?`: weight of one dumbbell, in (0, 200]. Meaningful only on weighted exercises.
- `exercise_feedback.rating?`: `"too_easy" | "just_right" | "too_hard"`.
- New `usual_weight`: `{ exerciseId, weightKg, reps }`. `weightKg` is in (0, 200]; `reps` is an int in 1..50, default 10. It is sent when the user answers "what weight do you usually use for this?". "Not sure" sends nothing.

The engine works in kg. The app converts for lb users. Prescribed weights are always members of `ownedWeights`, so no rounding produces an unowned weight.

## 2. Weight model (`src/engine/strength.ts`)

### State

`EngineState.strength: Record<exerciseId, { oneRm: number; obs: number; lastPerformed: number; lastWeightKg: number | null }>`. This sits beside `capacity` and holds weighted exercises only.

### Rep-weight curve (Epley)

```
repsAt(oneRm, w) = max(1, 30 · (oneRm / w − 1))      reps to failure, fresh
oneRmFrom(w, M)  = w · (1 + M / 30)
```

### Initial `oneRm` (first match wins)

1. A `usual_weight` event for the exercise: `oneRmFrom(weightKg, reps + strength.usualRir + b)`, where `usualRir` = 2.
2. `bodyMass · byLevel(loadNorm, ladderLevel) · strength.initFactor`, where `initFactor` = 0.85 and `bodyMass` = `profile.bodyMassKg` or `strength.fallbackBodyMassKg` (70).

The first set on an unmeasured or stale weighted exercise is `firstSetMode: "technical_failure"`, as today. Stale: `oneRm · capacity.staleFactor`, applied for prediction and baked once on the first set back, the same as capacity.

### Prediction at weight `w`

`M_pred(w) = repsAt(oneRm, w) · (1 − priorDrop) · (1 − d)^F_sess_eff`. `priorDrop`, `F_prior_eff`, `F_sess_eff` and `scale_eff` are computed exactly as in SPEC 5.5. `predictRange` works unchanged on `M_pred(w)`.

### Observation from a set at `w`

`M_obs` as in SPEC 5.5 (`reps + rir + b`; AMRAP = reps). For weighted sets the typo cap is absolute, `strength.maxObsReps` = 50, because a rep norm without a weight is meaningless. The calibration type is classified exactly as SPEC 5.6:

- `capacity` (clean, fresh first set): `R_obs = oneRmFrom(w, M_obs)`. The first observation sets `oneRm = R_obs`. Later ones apply `oneRm += emaAlpha · (clamp(R_obs, oneRm·(1−maxStep), oneRm·(1+maxStep)) − oneRm)`. Also records a level observation when body mass is known (see Level).
- `recovery`, `acute`, `amrap`: unchanged formulas, with `M_pred` evaluated at the logged `w`.
- A set with no `weightKg` on a weighted exercise is `log_only`. It still deposits fatigue (fatigue depends on reps and RIR only).

`lastPerformed` and `lastWeightKg` update on every non-warm-up set that has a weight.

### Weight choice (`chooseWeight`)

Inputs: the owned weights `W` (sorted), `targetRir`, `strength.repRange = [lo, hi] = [6, 15]`, `mid = (lo+hi)/2`.

```
reps(w) = round(M_pred(w) − targetRir)
keep    = lastWeightKg ∈ W and lo ≤ reps(lastWeightKg) ≤ hi
choice  = keep ? lastWeightKg
        : some w has lo ≤ reps(w) ≤ hi → the one minimising |reps(w) − mid| (tie: heavier)
        : every reps(w) < lo           → W[0], flag "too_heavy"
        : every reps(w) > hi           → W[last], flag "too_light"
        : otherwise (the range falls between two owned weights)
                                      → the w whose reps are nearest the range, i.e. minimising
                                        max(lo − reps(w), reps(w) − hi, 0) (tie: lighter, the safer); no flag
```

Multi-set: all sets use `choice`, with fatigue projected forward exactly as today. If a later set's target drops below `lo` and a lighter owned weight exists, the remaining sets step down one weight. Every set's reps are ≥ 1. With "too_light", reps are capped at `hi`: the set stops short of failure rather than running to 50+ reps. `PrescribedSet` gains `weightKg`; `PrescribedExercise` gains `loadFlag: "too_heavy" | "too_light" | null`.

### Level

A weighted capacity observation scores `oneRm / bodyMass` against `loadNorm`, the same way `scoreObservation` scores reps against `defaultM`: position in log space, weight `ln(advanced/beginner)`. It is only recorded when `profile.bodyMassKg` is set.

## 3. Adaptive difficulty (`src/engine/difficulty.ts`)

### State (fold, event-sourced)

- `ratings: Record<exerciseId, number>`: exponential average of ratings mapped too_easy = −1, just_right = 0, too_hard = +1, rate `difficulty.ratingAlpha` = 0.5, starting 0.
- `demandOffsets: Record<Demand, number>`: on each rating `r` of exercise e, for each demand k in e.demands: `D_k += difficulty.demandAlpha · (r − D_k)`, where `demandAlpha` = 0.25, clamped to ±`difficulty.demandMax` (1.5).

### Query: `difficultyOf(state, exerciseId, now)`

```
P   = byLevel(e.difficulty, ladderLevel(e))                                  predicted, 1..5
m   = fresh target reps = fresh reps to failure − targetRir   (so a well-fitted exercise sits at the range middle)
      weighted: reps to failure at chooseWeight's choice; others: capacityOf(e).M
      weighted with no owned dumbbells: no strength term (w = 0)
mid = midpoint of strength.repRange (weighted) or capacity.repRange (others)
S   = clamp(3 − 2·log2(m / mid), 1, 5);  S = 5 if loadFlag = too_heavy, 1 if too_light
n   = clean observations of e (capacity.obs or strength.obs)
w   = n / (n + difficulty.trustK)                         trustK = 2
      if n = 0 and e's ladder has a measured rung: w = difficulty.neighbourTrust (0.3)
R   = ratings[e] ?? 0
D   = mean of demandOffsets[k] over e.demands (0 if none)
score = clamp((1 − w)·P + w·S + R + D, 1, 5), rounded to 1 decimal
```

The result is `{ score, label, source, reasons }`:
- `label` by score: < 1.5 too easy, < 2.5 easy, < 3.5 right challenge, < 4.5 hard, else too hard.
- `source` is `"predicted"` when w = 0 and R = D = 0, else `"personal"`.
- `reasons` lists up to 2 strings from `e.demands` whose offset is > 0.25, and, only when w > 0, "not enough reps" when S ≥ 4 or "dumbbells too light" / "dumbbells too heavy" from `loadFlag`.

Difficulty is never stored; it is derived on every read from replayed state, so it cannot drift from capacity, strength, ratings or level.

### Planner use

- A candidate with score ≥ `difficulty.excludeAbove` (4.5) is dropped from its slot, unless every candidate in that slot is that hard (then all stay).
- The candidate's score is multiplied by `f = 1 − difficulty.preferWeight · |difficulty − 3| / 2` (`preferWeight` = 0.3, so f ∈ [0.7, 1]); a negative score is divided by f instead, so the factor always counts against a poor fit. `PlannedExercise` carries the difficulty for display.
- Ladders still choose the rung from reps (unchanged).

## 4. Integration, safety, testing

### Code units

- `src/library`: schema fields and validation for `demands`, `loadNorm` and `dumbbells`; data in `catalog/library/*.json`.
- `src/engine/strength.ts` (new): `ownedWeights`, `repsAt`, `oneRmFrom`, `initialOneRm`, `strengthOf`, `predictAtWeight`, `chooseWeight`.
- `src/engine/difficulty.ts` (new): `applyRating`, `difficultyOf`.
- Adjusted: `types.ts` (events, profile, params, state), `capacity.ts` (route weighted exercises to strength, prescription output), `calibrate.ts` (weighted observations), `fold.ts` (`weightKg`, `usual_weight`, `rating`), `planner.ts` (weighted candidates when dumbbells are owned, difficulty filter and scoring), `level.ts` (weighted observations), `src/cli` (show weights, demands, difficulty).
- Params (validated): a `strength` block `{ repRange, usualRir, initFactor, fallbackBodyMassKg, maxObsReps }` and a `difficulty` block `{ ratingAlpha, demandAlpha, demandMax, trustK, neighbourTrust, excludeAbove, preferWeight }`.
- Storage: no change (events are stored as JSON).

### Bad input never corrupts state

- Schema rejects: weights ≤ 0 or > 200, invalid dumbbell setups, reps outside 1..50 in `usual_weight`, unknown rating values.
- Fold ignores without effect: `usual_weight` or a rating for an unknown or unweighted exercise (ratings for unweighted exercises are allowed; `usual_weight` is not).
- `weightKg` on an unweighted exercise is ignored; the set counts normally.
- A weight the user does not own still teaches the estimate.
- `w ≥ oneRm` gives `repsAt` = 1. Every numeric output is finite; the existing fuzz test is extended to the new fields.

### Tests

- Unit:
  - curve round trip and monotonicity;
  - `ownedWeights` for both kinds, including float steps;
  - `chooseWeight`: owned-only, keep-last rule, tie to heavier, both flags, step-down;
  - strength init order, capacity EMA with outlier clamp, stale handling;
  - difficulty: each term, label boundaries, demand transfer to an unrated exercise;
  - params and schema validation.
- Property (fast-check):
  - prescribed weights ∈ `ownedWeights`;
  - every set ≥ 1 rep;
  - difficulty ∈ [1, 5];
  - replay twice gives deep-equal state.
- Golden: one weighted session with hand-computed `oneRm`, prediction and update.
- Simulation: a synthetic lifter with a true `oneRm`, true RIR bias and noise. `oneRm` error converges below 10% within 6 sessions, the chosen weight progresses as true strength rises, and synthetic "too hard" ratings raise difficulty.
- Regression: all existing tests pass; plans for profiles without dumbbells are unchanged except for difficulty scoring.

## Out of scope

Barbells, kettlebells and machines; different weights per hand; band tension levels; app UI; heart-rate input.
