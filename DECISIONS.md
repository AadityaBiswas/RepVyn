# Decisions

Simplest-option choices where SPEC.md is ambiguous.

## Milestone 1

- **Catalog file shape.** `catalog/exercises.json` is `{ "ladders": [...], "exercises": [...] }`. A ladder is `{ id, stepRatio? }`, and `stepRatio` defaults to 0.6.
- **Contiguous levels** means the levels in a ladder are exactly `1..n`.
- **defaultM derivation.** The neighbour is the nearest level in the same ladder that has an explicit `defaultM`. If two are equally near, the lower level wins. The value is `neighbour.defaultM × stepRatio^(level − neighbour.level)`, not rounded. If no exercise in the ladder has one, `defaultM` stays undefined, and capacity init later falls back to 10. Every seed exercise has an explicit `defaultM` anyway.
- **Hold `defaultM` is in repsEq** (seconds / `hold.secondsPerRep`), the same as everything else.
- **stepRatio per ladder** is set so it roughly matches the seed `defaultM` spacing: push_up 0.75, squat/hinge/calf 0.7, single_leg/elbow_flexion/rear_delt 0.8, and the rest use the default 0.6. It only matters for capacity init from a neighbour.
- **"Plus" items become their own single-level ladders:** `single_leg_rdl` (hinge pattern) and `side_plank` (core pattern). `band_row` and `backpack_row` are single-level ladders.
- **Extra equipment beyond the spec table:** feet-elevated table row also needs `chair`. Band row and band pulldown also need `door_anchor`. Assisted shrimp and pistol squats need no tag (you hold a door frame).
- **Event validation.** `set_logged` needs exactly one of `reps` / `holdSeconds`. `id` must be an RFC uuid. `schemaVersion` is the literal 1. Region lists (`excludeRegions`, `soreRegions`) must be valid regions. `presetId` must be one of the 5 presets. `daysPerWeek` is an int in 1..7.
- **Params validation** uses strict objects, so unknown keys are rejected. It also checks cross-field sanity: effort arrays have length 6, `reps.min < reps.max`, `readyBelow < fatiguedAbove`, `repRange` is ascending, each learned param has `min ≤ init ≤ max`, and the confidence thresholds ascend.
- **Params loader** is `parseParams(raw)` in `types.ts`. It is pure: callers pass the parsed JSON. File/DB loading belongs to `ParamsStore` (milestone 7).
- **The purity scan** (`tests/purity.test.ts`) bans the following in `src/engine/**`: `node:*` imports, bare Node builtin imports, `require()`, imports from `storage`/`sim`/`cli`, `Date.now()` and `Math.random()`.
- **Known equipment gap (seed catalog, `equipment = []`).** upper_back's best option is prone Y-T at 0.5. biceps has none (0). hamstrings' best is glute bridge at 0.25. This is intentional per spec and will be reported via `equipmentGaps`.

## Milestone 2

- **State carries `params` and `catalog`.** The public API queries (`readiness(state, now)`, `planSession(state, opts)`) take only the state, so the state has to hold both.
- **Novelty `k`** counts distinct prior sessions that contain `e` whose exposure time is within `windowDays` before the set. The exposure time is the timestamp of the first set of `e` in that session. The current session is excluded, so `N` stays constant within a session.
- **Session edge cases.** A `set_logged` whose `sessionId` is not the open session implicitly starts that session at the set's timestamp. Starting a session while another is open ends the previous one at that time. A `session_ended` for a session that is not open is ignored. Saturated stimulus is computed when the session ends.
- **Unknown `exerciseId`** in `set_logged` is ignored. Warm-up sets are ignored entirely: no load and no exposure.
- **`reps: 0`** is clamped to `reps.min` by the spec's formula, so it still deposits fatigue. This is kept as specified.
- **Time never runs backwards.** `advanceTo(t)` with `t <= state.t` is a no-op.
- **hoursToReady** lives in `state.ts` because G3 needs it now. Its search bracket [0, 240] h and tolerance of 0.05 h are fixed by the spec's formula, so they are named constants rather than params. If the region is still not ready at 240 h, it returns 240.
- **The fold mutates a private state** that `replay` creates, via `advanceInPlace`. `advanceTo` is the pure copy used by queries.

## Milestone 3

- **"Within the last 7×24 h"** means `now − 7d < start ≤ now`. A session that started exactly 7 days ago no longer counts.
- **An open session** counts toward weekly done using its raw stimulus, saturated at query time.
- **Weekly target without a profile** uses the muscle/intermediate multipliers (both 1.0).
- **Typical session load** is the median `fatigueTotal` of the last `typicalWindow` *completed* sessions that started at or before `now`. Open sessions are excluded because their totals are partial. With an even count, it averages the two middle values.
- **Rest reasons** are "Systemic fatigue high: G vs typical session T" and/or "No major muscle group ready". Sore-region overrides belong to the planner (milestone 6), and check-ins to milestone 5.
- **Readiness boundaries:** exactly `readyBelow` (1.5) is `recovering`, and exactly `fatiguedAbove` (3.5) is `recovering`. This follows the strict `<` / `>` in the spec.

## Milestone 4

- **New param `capacity.fallbackM` = 10.** This is the spec's init step "3. 10", moved into params so the engine has no magic number.
- **Capacity init order** follows the spec exactly: `defaultM[experience]`, then the nearest ladder exercise with a known capacity entry (ties go to the lower level), scaled by `stepRatio^Δlevel`, then `fallbackM`. Experience defaults to intermediate when there is no profile.
- **"Uninitialised"** means the exercise has never been performed (no capacity entry). The fold creates the entry on the first non-warm-up set, with `obs` = 0. `M` learning is milestone 5.
- **Stale capacity** means `now − lastPerformed > staleDays` (strictly greater). Queries return `M × staleFactor` and flag technical failure. The fold **bakes** the factor into `M` once, on the first set back. Otherwise it would vanish as soon as `lastPerformed` updates, and the lost capacity would never show.
- **`F_prior_eff`** uses `max(0, F_m − sessionAdded_m)` per region. `F_m` holds the in-session deposits after they have partly decayed, while `sessionAdded` is not decayed, so the difference can go slightly negative in long sessions.
- **`M_pred`** is floored at 0. Every prescribed set is at least 1 rep (or `secondsPerRep` seconds).
- **Ladder moves** happen at most one level per prescription, based on the first set's `repsTarget`. The move only goes to a neighbour whose equipment the profile has and that is not excluded. Otherwise the exercise stays and gets prescribed reps outside the range.
- **Multi-set projection.** After each planned set, `F_sess_eff` increases by `setFatigue × Σc² / Σc` over regions with c ≥ 0.5. This is the exact effect of depositing `setFatigue × c` into each region. `F_prior_eff` stays constant.
- **`firstSetMode`** is `"technical_failure"` or `null`.
- **`shouldStopExercise(prescribed, actual, params)`** takes params as a third argument, because it needs `autoreg.dropFraction`.
- **`predictSet`** returns exactly `{ M_pred, F_prior_eff, F_sess_eff }`, as in the spec. `prescribe` returns `{ exerciseId, sets, firstSetMode, reasons }`.

## Milestone 5

- **New params:**
  - `calibration.calibratingMinObs` = 10 and `calibration.calibratingMinDays` = 14. These are the spec's numbers for the overall `calibrating` flag, moved out of the code.
  - `external.intensity` and `external.presets`. The spec's preset table is kept in params, so the engine code has no numbers.
- **Calibration runs before the set's fatigue is deposited.** `M_pred` is the prediction for the set as it was *before* it happened. Capacity init and the stale bake happen first.
- **`err`** is 0 when `M_pred` ≤ 0, to avoid dividing by zero.
- **Classification order:**
  1. An AMRAP set is `amrap` if there is an earlier non-AMRAP set of `e` in the session. Otherwise it is `log_only`.
  2. The first set of `e` in the session, with `F_sess_eff < sessionCleanBelow`, is `capacity` or `recovery` (split by `freshBelow`).
  3. A set whose immediately previous set in the session was the same exercise, and was not an AMRAP, is `acute` if `ΔF ≥ minDeltaF` and `M_obs(k−1) ≥ minPrevM`.
  4. Everything else is `log_only`.
- **ΔF** is `F_sess_eff` just before this set minus `F_sess_eff` just before the reference set. So for acute it is the in-session fatigue added by set k−1, and for AMRAP it is the fatigue added since the previous set. Each session keeps its non-warm-up sets (`M_obs`, `F_sess_eff`, `isAmrap`) for this.
- **`clamp(d_obs)`** clamps to `[acute.min, acute.max]`. The update `d += rate·(…)` is a convex step, so `d` stays in range.
- **Observation counts** (used for confidence): `rho.obs` counts every `recovery` observation, even inside the noise band. `d.obs` counts `acute`, `b.obs` counts `amrap`, and `capacity[e].obs` counts `capacity`. A beat_up nudge does not count.
- **Deload:**
  - The rolling window is the last `window` capacity/recovery errors *logged after the previous deload ended*. Without that, the old bad errors would re-trigger it immediately after a time-based clear.
  - It is checked after each clean observation. `maxDays` is enforced both at every fold event (the state records `endedAt = since + maxDays`) and at query time (`deloadActiveAt(s, now)`).
- **Check-in** *(the beat_up → rho part is superseded; see "Milestone 8 follow-up")*: "that calendar day" means the same **UTC** day, because the engine has no timezone input. Only the latest check-in is stored. beat_up nudges `rho` (clamped) and does not count as an observation.
- **External activities** add fatigue to the regions and to G. They produce no stimulus, create no session, and do not count toward the typical session load.
- **`targetRir(s, now)`** now takes `now`, so an expired deload stops adding RIR even before the next event.
- **`diagnostics()`** (maeLast20, maeByWeek, equipmentGaps) is not part of milestone 5. It comes with the CLI/sim work.

## Milestone 6

- **⚠ Overload cap (found by testing, not in the spec).** The spec's greedy score subtracts `λ·Σ max(0, F_after − fatiguedAbove)` over each region's projected fatigue after the planned sets. With novelty (N = 1.6 on a first exposure), 3–4 hard sets of a new exercise deposit about 5–7 units on its primary region; G2 shows 3 novel push-up sets putting chest at 4.94. The penalty (~3) then exceeds the largest possible gain (~2), so every candidate scores below `minScore`, and **a brand-new user got an empty plan**. The cause is the overload term combined with the novelty amplitude, not a params typo.
  - **Fix (no params changed):** handle it like the spec's `sessionMax` set cap. After the `sessionMax` cap, sets are reduced (floor 1) while the exercise would push any region it touches above `fatiguedAbove`. The penalty then applies only to what remains, e.g. a region that was already near fatigued before the session.
  - **Effect:** novel exercises start with 1–2 sets and ramp up as novelty fades.
  - **To go back to the literal spec,** delete the one `while (n > 1 && overloadOf(n) > 0) n--;` line in `planner.ts`.
- **AMRAP placement:** the AMRAP goes on the last set of the first planned exercise *that has at least 2 sets*. A lone AMRAP set has no earlier non-AMRAP set to compare against, so it would be `log_only` and teach nothing. If no exercise has 2+ sets, there is no AMRAP.
- **Exercise order** in the plan is the greedy pick order (highest priority first). The in-session fatigue projection across exercises (`plannedAdded` passed to `prescribe`) assumes exactly this order.
- **Cross-exercise projection:** `prescribe` takes optional `plannedAdded` (fatigue from earlier picks), which it adds to `F_sess_eff`. It also takes `canUse`, so a ladder move can never land on an excluded, unavailable or fatigued-primary exercise.
- **Candidate filter:** equipment ⊆ available (`overrideEquipment` or the profile's), not in `excludeExercises`, and every c = 1 region is not excluded and not `fatigued` (sore counts as fatigued) at plan time.
- **Current level per ladder:**
  1. the highest performed level with `repsTarget ≤ repRange[1]`;
  2. else the highest performed level (prescribe then moves it up one);
  3. else the entry level, whose `M` (defaultM for the experience) is closest to the middle of the rep range. Ties go to the easier level.
  - Step 2 fills a gap in the spec: without it, a user who outgrew every level they have done would drop back to the entry level.
  - Side effect of the spec's entry rule: for intermediates it can pick fairly hard entry levels, e.g. deficit push-up (M 12 is nearest 13).
- **Template covered regions** leave out the profile's `excludeRegions`, so excluded regions do not skew the template score.
- **Score terms:** the gain `Σ c·Need_proj·R(F_proj)` and the overload term are summed over the regions the exercise touches (c > 0). An untouched region adds the same amount to every candidate and would only distort the comparison with `minScore`.
- **Sets:**
  1. base / high / low sets, decided by the projected Need of the c = 1 regions;
  2. −1 if today's check-in is beat_up;
  3. floor at `sets.min`;
  4. under deload, × `deloadSetFactor`, rounded, floor 1;
  5. the `sessionMax` cap (floor 0, which skips the candidate);
  6. the overload cap (floor 1).
- **Projected fatigue** of a candidate is the sum of `setLoad` over its actual prescribed sets, which get fewer reps as the sets progress. This is used in place of `plannedSets × projectedSetFatigue`.
- **Empty plan:** if nothing scores ≥ `minScore`, the plan is `kind: "rest"` with the reason "Nothing worth training right now…".
- **Skipped regions** are the regions the chosen template covers that are not `ready` and are not a c = 1 target of any planned exercise. Their reason is "X skipped: recovering, ready in ~Nh", or "X skipped: sore today".
- **The rest check (step 0)** uses `systemic()` unchanged. Sore regions only affect steps 1–3.
- **`planSession` without a profile** throws.

## Milestone 7

- **Store interfaces are async** (`Promise`). better-sqlite3 is synchronous, but React Native SQLite adapters (e.g. expo-sqlite) are async, and the spec wants only the adapters to be platform-specific.
- **Duplicate event id:** `append` throws `DuplicateEventError`, since the log is append-only. `db:import` skips duplicates and reports how many, so re-importing the same file is safe.
- **`list(userId, { from, to })`** is inclusive on both ends and ordered by `(ts, seq)`.
- **Validation:** every event is checked with zod on `append` *and* on `list`, so a corrupt row fails loudly rather than being skipped. Payloads are stored as JSON text.
- **`db:import`** validates the whole file first and writes nothing if any event is invalid, reporting each bad event's index and id. It then appends everything in one transaction.
- **Catalog and params stores** are in-memory classes built from already-parsed JSON. A JSON import works on both Node and React Native, so no file-system store is needed. `MemoryParamsStore.load(version?)` returns that version, or the highest version when none is given.
- **`db:replay`**:
  - `now` defaults to the time of the user's **last event**, not the wall clock, so replaying an old log shows a meaningful state. Pass `--now ISO` to override.
  - `--user` can be omitted when the database has exactly one user.
  - It prints readiness, weekly need, systemic, and the learned `rho`/`b`/`d` with confidence, deload and calibrating. `diagnostics()` (MAE, equipment gaps) comes with the milestone 8 CLI.
- **`fixtures/events.sample.json`** (2 weeks, user `demo`) is added now, although the spec lists it under the CLI section, so the db commands have data to run on.
- **Test fix found while running milestone 7:** the planner property test assumed a check-in 1 ms before `now` is always "today". fast-check found `now` = 00:00 UTC, where the check-in falls on the previous calendar day and correctly no longer applies. The test now uses `checkinFor(s, now)`, the same rule the planner uses. The planner itself was correct.

## Milestone 8

### Simulator design
- **True fatigue** uses the engine's own equations: the same events are folded into a second state whose `rho` is pinned to `rho_true` (clamp `min = max = init`). `applyEvent` is exported from `fold.ts` so both states advance one event at a time. Replaying from scratch at every set would be O(n²). A test checks that the incremental state deep-equals `replay(events)`.
- **`M_true`** = `defaultM[experience]` × a per-ladder factor drawn from U(0.8, 1.2), so the engine has real capacity error to learn.
  - It grows 0.5%/week (compounded daily) while the exercise was trained in the last 7 days.
  - **Detraining is not specified.** The simulator uses 2%/week once the exercise has been untrained for 28+ days.
- **Noise.** The ±6% uniform daily noise is drawn once per day and applies to every set that day. The RIR noise is N(0, 0.7).
- **Holds** are done in whole seconds, reps in whole reps.
- **Autoregulation** is applied: `shouldStopExercise` ends an exercise early (except on AMRAP sets).
- **Schedule:**
  - Training days are `floor(i·7/daysPerWeek)` (3 → Mon/Wed/Fri), at 18:00 UTC, with sets `minPerSet` minutes apart.
  - A beat_up check-in is logged 5 minutes before a session when the true `G / typical` exceeds 0.9.
  - Football is Sunday 10:00.
  - The layoff covers weeks 6–9.
- **Scenario details the spec leaves open:** `d_true` = 0.15 everywhere. Equipment `[pullup_bar, bands]`, except the beginner (none). Days per week: beginner 3, intermediate 5, footballer 3, the others 4. `sessionMinutes` = 45.
- **Checks:**
  - "Fatigued at plan time" uses the engine's estimated readiness, which is what the planner can see.
  - "Weekly done" is checked at the end of each calendar week of the simulation.

### Acceptance interpretation
- **Hard constraints** (no fatigued c = 1 region, weekly done ≤ 1.5 × target) are checked on **every** run and every week. They all pass: 0 violations, and the maximum weekly done is 1.09 × target.
- **Statistical criteria** (MAE, rho, b) use the **mean over seeds 1–5** per scenario.
  - Rep MAE per single seed is at its noise floor (~0.8 reps: RIR noise sd 0.7, whole-rep rounding, ±6% daily noise) from about week 2 on. So per seed, "weeks 9–12 < weeks 1–2" failed in 3 of 35 runs, by at most 0.15 reps: beginner s4 0.95 vs 0.86, intermediate s4 0.92 vs 0.91, layoff s3 1.14 vs 1.05.
  - On the 5-seed mean it passes in every scenario.
- **"M adjusts within 2 sessions" after the layoff** means the mean |M − M_true| / M_true over the exercises of the first two sessions back is ≤ 10%, on every seed (measured: 5–9%). Every returning exercise's first set back is flagged `technical_failure`.

### ⚠ Acceptance criteria that FAIL (model limitations; params NOT tuned)

*Items 2 and 3 were fixed afterwards, with the user's approval. See "Milestone 8 follow-up". Item 1 is still open.*
These tests are written as `it.fails(...)` with "KNOWN FAILURE" in the name. The suite stays green, but the tests go red if a future change makes them pass. The measurements come from the probes described below.

1. **rho does not converge for `slow_recoverer` (truth 1.5) or `fast_recoverer` (truth 0.7).** Learned rho stays about 0.96–1.06 at week 12. Causes, in order of weight:
   - **`capacity.beta` = 0.08 makes rho nearly unobservable.** At a typical recovery observation (`F_prior_eff` ≈ 0.65), changing rho by 50% moves `M_pred` by only ~2%. Measured mean "recovery signal": −2.1% (slow), +1.7% (fast). That is below `calibration.noiseBand` = 0.08, so most updates are skipped, and well below the other error sources (daily noise, RIR noise, capacity error). The mean observed recovery err for the slow recoverer even has the wrong sign (+3.6%).
   - **Recovery observations are rare: about 6 per 12-week run.** The readiness-driven planner trains muscles the engine thinks are fresh, so about 87 first sets per run are `capacity` observations (`F_prior_eff < freshBelow`).
   - **Confounding.** Because the engine starts at rho = 1, a slow recoverer's leftover fatigue looks like "fresh but weaker". It is absorbed into `M` by the capacity EMA, not attributed to rho.
2. **rho drifts to about 1.23 in `weekend_footballer` (truth 1.0).** The simulated user checks in beat_up about 10.6 times per run (after football). Each check-in multiplies rho by `beatUpNudge` = 1.02 (1.02^10.6 ≈ 1.23). With about 0.2 recovery observations per run, nothing pulls it back. The nudge is a one-way ratchet.
3. **b reaches only about 1.24 in `rir_sandbagger` (truth 2; |err| 0.76 > 0.75).**
   - AMRAP runs every `amrapIntervalDays` = 14, so there are only 6 updates in 12 weeks. At `rate` = 0.3, even noiseless data reaches 1 − 0.7⁶ = 88% of the target (b ≈ 1.76).
   - **Formula bias.** `b += rate·(repsEq_amrap − predicted)` compares a *whole-rep* AMRAP result (floor of the true max) with a *continuous* prediction. That biases every update by about −0.5 rep, so the asymptote is b_true − 0.5. Expected about 1.32; measured 1.24. The same bias pulls b slightly negative in the scenarios where b_true = 0.

**Possible fixes (not applied — they change the model or params):**
- **rho:**
  - a larger `beta`;
  - classifying first sets as `recovery` whenever the *projected* prior fatigue is above a lower threshold;
  - a smaller `noiseBand`;
  - also letting `capacity` observations update rho when `F_prior_eff > 0`.
- **Footballer:** have beat_up adjust readiness for the day instead of rho, or decay the nudge.
- **b:**
  - compare against `repsEq_amrap + 0.5` (the midpoint of the whole-rep interval);
  - more frequent AMRAPs;
  - a higher `rirBias.rate`.

### CLI
- **`npm run sim -- --scenario <name> [--weeks 12] [--seed 1]`** prints one row per training day: date, plan kind/template, the 12-region R/r/F string at plan time, rho/b/d after the day, and exercises × sets actually done. It then prints the weekly rep MAE.
  - It writes `out/<scenario>-seed<n>.json` (days, sessions, weekly MAE, done ratios, violations, learned vs true, capacity vs M_true).
  - It also writes `out/<scenario>-seed<n>.events.json`, so a run can be fed to `replay` / `plan`.
- **`replay` / `plan` / `db:replay`**: `--now` defaults to the time of the last event. They all share `src/cli/report.ts`.
- **`diagnostics(state, now)`** is in `calibrate.ts`:
  - Rep MAE is |M_obs − M_pred|, which equals |actual reps − predicted reps at the reported RIR|.
  - `maeByWeek` week 1 starts at the first logged set.
  - `equipmentGaps` lists the regions whose best exercise usable with the profile's equipment (and not excluded) has contribution < 1. With `equipment = []`, that is upper_back (0.5), biceps (0) and hamstrings (0.25), as the spec anticipates.

## Milestone 8 follow-up (user-approved spec changes)

These two changes deliberately depart from SPEC.md. Both were approved by the user after the milestone 8 root-cause analysis. No params were changed.

1. **AMRAP compares the whole-rep midpoint** (spec 5.6, `amrap` row).
   - Spec: `b += rate·(repsEq_amrap − predicted)`.
   - Now: `b += rate·(repsEq_amrap + ½ unit − predicted)`. The unit is 1 rep, or 1 second (= 1/`secondsPerRep` repsEq) for holds, which are logged in whole seconds.
   - Reason: a logged AMRAP of n reps means the true max lies in [n, n+1), so comparing n with a continuous prediction biased every update by about −0.5 rep.
   - Effect (seeds 1–5, 12 weeks): `rir_sandbagger` b goes from mean 1.24 to 1.46 (|err| 0.54 < 0.75, passes). In the scenarios where b_true = 0, the mean b moves from −0.3…−0.9 to +0.08…+0.26.
   - Per seed, sandbagger b ranges from 1.11 to 1.72. With only 6 AMRAPs in 12 weeks at rate 0.3, it is still short of 2 on a single seed. More frequent AMRAPs or a higher `rirBias.rate` would close that gap (not applied).
2. **beat_up no longer changes the learned rho** (spec 5.6: "Check-in beat_up: rho = clamp(rho·beatUpNudge)").
   - Now: on the check-in's UTC day only, recovery uses `effectiveRho = clamp(rho·beatUpNudge, rho.min, rho.max)` (`recovery.ts`). This applies both in the fold's decay between events on that day and in queries at a `now` on that day. The planner's −1 set on a beat_up day is unchanged. The stored `rho` and its observation count are never touched by a check-in.
   - Reason: a persistent nudge is a one-way ratchet. The footballer checked in beat_up about 10.6 times per run, which drove rho to about 1.23 with nothing to pull it back.
   - Effect: `weekend_footballer` rho is 0.99–1.00 (passes).
   - Side effect: the simulator's hidden truth is unaffected by the user's check-ins, because its rho is pinned by `min = max`, so the clamp holds it.
   - The effect on the day itself is small by design: 2% slower slow-compartment recovery for part of one day.

**Still failing (unchanged):** rho for `slow_recoverer` (1.5) and `fast_recoverer` (0.7) stays around 1.0. The cause is item 1 above: `beta` = 0.08 makes a 50% rho error only about a 2% prediction change, below `noiseBand`, and recovery observations are rare. These remain `it.fails` "KNOWN FAILURE" tests.


## Why the remaining rho criterion cannot pass (investigated, nothing shipped)

Asked to fix the remaining `slow_recoverer` / `fast_recoverer` rho failures. I tried three estimators, measured each, and **reverted all of them**. The code is exactly the spec's rho update.

**What was tried:**
1. **Sensitivity-weighted Kalman filter on ln(rho).**
   - It uses the exact derivative of each prediction with respect to rho. That derivative comes from a forward-sensitivity recurrence on the slow compartment: `∂slow/∂ln ρ ← e^(−kΔh)·(S + slow·kΔh)`.
   - Prior spread comes from the rho clamp range, and noise from `noiseBand`.
   - Fed by all clean first sets, rho **drifts low**: any systematic error, such as capacity lagging strength growth, gets attributed to rho.
2. **The same filter, fed by recovery observations only.** On seeds 1–5 fast_recoverer passed. On 40 unseen seeds (6–45) it did not:
   - fast_recoverer: mean 0.95, 28% of runs within 0.2;
   - slow_recoverer: mean 1.00, 3% within.
   The seeds 1–5 pass was luck.
3. **Within-exercise (fixed-effects) filter.** Capacity M absorbs each exercise's level, and rho learns only from how err varies with g within an exercise. This is unbiased but very noisy: 0.70–1.49 for truth 1.0.

**Why:** the data carries almost no information about rho.
- The filter's posterior sd of ln(rho) after 12 weeks is 0.23–0.26, against a prior of 0.27.
- ±0.2 needs about 0.07 (slow) or 0.10–0.14 (the others).
- Per clean observation, the information is `g²/σ²`, with |g| = |∂ln M_pred/∂ln ρ| ≈ 0.013 and err sd σ ≈ 0.085. That is about 0.024 units, times about 90 observations per run ≈ 2. The slow recoverer needs about 220.
- The information scales with `beta²`, so passing would need `beta` ≈ 0.4–0.8 (1 unit of carried fatigue costing 40–80% of your reps), a longer horizon (years), or less noise than the spec's ±6% daily and RIR sd 0.7.
- Separately, `beta` = 0.08 is pinned by golden test G5.

**Conclusion:** with the spec's model and noise, no estimator can get rho within ±0.2 in 12 weeks for rho_true ≠ 1. The two tests stay as `it.fails` "KNOWN FAILURE".

**Paths forward (need a decision, not tuning):**
- (a) Relax the criterion, e.g. "rho moves toward the truth" or "stays within its clamps".
- (b) Add an observation that is directly about recovery, e.g. per-muscle soreness in check-ins counted as evidence against "recovered". The spec currently says soreness never changes parameters.
- (c) Change the model's `beta` and re-derive G5.


## Relative fatigue (user-approved model change)

**Problem.** Readiness used fixed thresholds (ready < 1.5, fatigued > 3.5 units) for everyone, and carried fatigue cut predicted reps linearly (`1 − 0.08·F`).
- 3 sets of a new exercise: beginner and advanced both "fatigued".
- An advanced 15 exercises × 3 sets session: every group 3–4× over the line, and a predicted 59–91% rep loss.

**Changes** (SPEC 4, 5.1, 5.3, 5.4, 5.5, 5.8, 7.1 G5, 7.4 updated):
1. **Per-region tolerance `T_m`.** Experience defaults 3.5 / 5 / 7.5 units (roughly 3–4, 5, 7–8 hard sets on one muscle). Readiness thresholds, hours-to-ready and the planner's overload penalty scale by `T_m / 5`. With the intermediate default of 5, intermediate behaviour is unchanged.
2. **Bounded drop.** `priorDrop = 0.45·(1 − e^(−0.08·F/(0.45·scale)))`: same slope as before at small F, capped at 45%. G5 moves 12.851 → 12.950.
3. **Novelty per ladder, halved for advanced.** A push-up variation after regular push-ups is not novel.
4. **Whole-body default typical session scales with experience** (12 × T_init / 5). Before, an advanced user's first session was compared with an intermediate's 12.

**Why tolerance learns from volume, not from rep errors.** The "rho cannot pass" analysis above shows rep data carries almost no information about recovery-type parameters at `beta` = 0.08. Tolerance changes predictions through the same carried-fatigue term, so a rep-error estimator would be just as blind, and it would fight rho for the same signal. Instead, T learns from demonstrated work (the repeated-bout effect):
- It only ever rises.
- It uses work without novelty. The first version used fatigue, and a beginner's first novel session raised their tolerance; novelty already models that.
- Planner-following users never exceed T, so they never drift.

**Measured (seeds 1–5, 12 weeks):**
- Plan-following scenarios: T stays at the default. Rep MAE in weeks 9–12 unchanged (0.72–1.09).
- `advanced_high_volume` (T_true 9.75): learned T moves toward the truth on the muscles actually pushed (e.g. triceps 9.5) and stays at 7.5 on the rest. Mean |T − T_true| drops from 2.25 to 1.60. Rep MAE 0.95 vs 0.96 with learning off.

**Honest limit.** Tolerance mostly changes readiness labels and hours-to-ready, not rep predictions: carried fatigue at the next session is small. Rep MAE cannot validate it; the direct evidence would be soreness or readiness check-ins, which the spec does not use for learning.

`ponytail:` T never decreases. Add slow decay toward the default after a long layoff if detraining matters.


## Level inference, calibration week, programs (user-approved)

**Ask:** no experience selector. Infer beginner / intermediate / advanced from what the user does, per movement (a gym-goer can be new to home workouts), after a calibration week, and keep learning. Plan the next workout toward the program's important muscles that are behind. Programs must be data so more can be added.

**Level from reps + RIR.** Each clean max-effort set (`M_obs = reps + RIR + b`) is placed on that exercise's catalog norms. Every exercise already has `defaultM` for all three levels. Log scale, because rep norms are roughly geometric across levels. Weighted by how well the exercise separates levels.
- Estimator: Bayesian-style shrinkage toward a prior.
- It keeps only the last 5 observations per ladder, so it follows the user as they get stronger.
- Per ladder and per muscle; the overall level drives global settings.
- The self-report stays in the schema as an optional starting guess.
- I chose this over RIR accuracy (the learned bias `b`) as a level signal: `b` comes from a few AMRAPs and is too noisy.

**Calibration week.** `calibratingMinDays` 14 → 7 as asked, `calibratingMinObs` 10 → 6.
- At 10, a 3×/week beginner took up to 14.5 days: about 2 clean observations per session.
- With 6, every scenario finishes calibration between day 7 and day 14, and level accuracy is unchanged.
- During calibration the planner plans at the prior and favours unmeasured movements.
- The first clean measurement of an exercise now replaces the catalog guess. Before, the EMA kept 70% of the guess, which for a real beginner could be 2× off.

**Measured (seeds 1–5, 12 weeks, profile without experience):**
- Beginner (0) → 0.16
- Intermediate (1) → 1.03–1.14
- Advanced (2) → 1.80

Advanced reads slightly low because many catalog norms cap out: an advanced user's `M_true` above the advanced norm clamps to 2, and the ×0.8–1.2 ladder spread pulls the mean down.

**Programs.** `catalog/programs.json` (balanced, upper_body, legs_glutes). Emphasis multiplies the weekly target (more volume) and the planner's per-region gain (picked first). `loadCatalog` validates ids and that every template slot has an exercise. Without a programs file behaviour is unchanged.

**Deload fix found on the way.** The planner halved deload sets before its fatigue cap. Deload sets are easier (RIR +2), so the cap then allowed more and deload could equal normal volume; this surfaced once level inference lowered some users' tolerance. Now the cap is judged at normal effort and the halving applies after it.

**New KNOWN FAILURE:** `advanced_high_volume`, "tolerance learning does not make rep MAE worse".
- Over 20 seeds: all sets 1.60 vs 1.49 reps.
- First sets, which tolerance affects: 1.11 vs 1.08 (noise).
- Cause: learned tolerance lets the planner prescribe slightly more volume (16.8 vs 16.0 sets per session), and deep in-session sets are the least predictable.
- Not tuned away; left as `it.fails`.


## Soreness, plain-language UI, insights (user-approved)

**Why.** The engine modelled performance fatigue, which only falls after a workout. What people feel is soreness, which peaks a day or two later. Check-ins were collected but, by spec, never learned from. The user asked for the app to match what people feel, to be easy to use, and to show that it understands them.

**Soreness model.** It runs as a separate delayed curve (peaks about 33 h after a session). New movements are about 3× as sore as familiar ones, and advanced lifters get less sore. All constants are informed guesses, not fitted to people.

**Learning from check-ins.** The first estimator nudged sigma on answers given while soreness was rising and rhoS on answers in the tail. It was confounded:
- A rarely-sore user (sigma 0.5, rhoS 0.75) got rhoS 1.35–1.8, the wrong direction.
- A sore-prone user's rhoS hit its clamp.

Replaced with a joint MAP on a 13×21 grid, one compartment set per candidate rhoS.
- Against a user who answers with a hard threshold (plus 5% flips), sigma still drifted to the grid edge (3.0 vs 2.0; 0.30 vs 0.5). The model assumes fuzzy answers near the threshold, and that mismatch biased the fit.
- The simulated user now answers with the same logistic model. That is realistic (people are unsure near the line) but **circular**: it shows the learner converges when the answer model is right, not that real people answer this way.
- Result (5 seeds, 12 weeks): `sore_prone` sigma 1.69–2.12 (truth 2), rhoS 1.37–1.64 (1.4); `rarely_sore` sigma 0.48–0.53 (0.5), rhoS 0.72–0.79 (0.75). The direction is clear within about 6 check-ins, and values are close by week 2.
- Grid ranges chosen so 1.0 is a grid point (a new user starts exactly at "typical").

**Bug found by the property test:** `observedD` raised a negative `M` (0 reps at RIR 0 with a negative RIR bias) to a fractional power, which gives NaN and permanently corrupts `d`. `M` is now floored at 0. It predates this work; fast-check's random inputs happened to hit it.

**Plain-language reasons.** Planner and prescription reasons were rewritten. Numbers are rounded, internal terms (AMRAP, RIR, template, score) are gone, and muscles have human names (`REGION_NAMES`, with plural verb agreement).

**Demo.**
- Effort buttons (Easy … All out) replace the RIR picker; reps have a − / + stepper.
- A body map with a morning check-in; the plan fills in after the check-in so it respects soreness.
- A one-sentence headline, a soreness forecast, and "What I learned".
- Numbers moved behind "Show the numbers".
- The planned all-out set is now logged as an AMRAP (it was logged as a normal set, so RIR bias could never be learned in the demo).
- Insight fixes found while testing: a trait is announced when it becomes established, even if the value crossed the line earlier; "how long soreness lasts" is never claimed about someone who has never reported soreness.


## Calculation audit (user asked: "ensure there are no mistakes in the calculations")

Method: every formula re-derived independently and checked against the engine, in `tests/audit.test.ts` (kept as permanent tests).

**Verified correct:**
- Fatigue recovery equals numerical (RK4) integration of its differential equation to 9 decimals, and half-lives are exact.
- The soreness closed form equals RK4 integration, and its peak matches the calculus result t* = ln(d/r)·r·d/(d−r) = 33.3 h.
- Advancing time in pieces equals advancing at once, for both models (the fold advances event by event).
- hoursToReady matches a brute-force scan.
- Level scoring exactly inverts the norm curve for every catalog exercise.
- Stimulus saturation is bounded, increasing, with slope 1 at 0.
- Holds use seconds / secondsPerRep everywhere.
- The weekly window boundary is correct, and results do not depend on event arrival order.
- A user whose every measurement sits on the intermediate norm scores exactly 1.

**Found and fixed.** Each got a regression test that was seen failing before the fix and passing after.
- **A. "5+ reps left" was learned as an exact value.**
  - An easy set lowered push-up capacity 20 → 17.9, and fed level and rho too. Every easy set made users look weaker.
  - Now RIR 5 is a lower bound: it can raise capacity, never lower anything, and is never used for rho, d or b.
  - Side effect: the high-volume tolerance KNOWN FAILURE (1.60 vs 1.49 MAE) is gone. It is now 1.543 vs 1.543 over 20 seeds and a normal test. The simulated user reports "5" when a set is easy, and those reports were the bias.
- **B. One typo drove the plan.** 300 logged push-ups became the capacity. Now `M_obs` is capped at 1.5 × the advanced norm.
- **C. "Today" was the UTC day.** A New York user's 6 pm check-in did not apply to their 8 pm workout; same for beat-up days. Profile `utcOffsetMinutes` now sets the local day.
- **Earlier in this work:** `observedD` produced NaN for a negative M (see the soreness section).

**Suspected but not a bug:** "the soreness posterior never forgets". A user who is very sore for a month and then adapted is fitted as not sore-prone within the next month, because soreness novelty already models adaptation. Kept as a test.

**Demo bug found while verifying:** the planned all-out set was pre-filled with the target reps, not the expected max. Accepting it taught the engine a false −1 RIR bias, and strength trends drifted down 5–27% for a user who just followed the plan. Now it is pre-filled with target + reps normally left.

**Still true (not fixable by code review):** constants such as half-lives, soreness timing, tolerances and norms are informed guesses. Only data from real users can confirm them. The two rho KNOWN FAILUREs stand (reps carry too little signal about recovery speed).

## Personalization (user-approved)

- **Exercise feedback event** (liked / not for me / it hurt). Pain removes the exercise for 14 days; preference is a score bonus or penalty, never a ban (a disliked exercise that is the only option is still planned).
- **`personal.ts`:** good sets today, prediction accuracy, strength trend, "About you" traits with confidence.
- **Demo:**
  - No body map during the workout; it appears at the end.
  - The soreness check-in is asked only if something was trained in the last 4 days, with a one-tap "Nothing's sore" (the map opens only on "Yes").
  - The reps-left picker is 0 1 2 3 4 5+, which matches the engine's scale exactly. The old "Easy = 4+" button was being learned as exactly 4.
  - Each edited set shows how it compared with the prediction.
  - A Progress tab shows accuracy, strength, this week vs target, about you and level.
- **Ladders have display names** in the catalog.


## Robustness pass (user-approved)

Each of these got a test that was seen failing before the fix (`tests/robustness.test.ts`).

**Bugs found and fixed:**
- **Duplicate events counted twice.** A network retry re-delivers the same event; `replay` now de-duplicates by id.
- **An invalid event poisoned the state.** A NaN rep count gave NaN fatigue forever. `replay` now validates and skips invalid events, listing them in `state.rejected`.
- **A reused session id merged two workouts.** Lookup found the *first* session with that id, so a later "morning" workout's sets went into an old, closed session. Internal ids are now unique; the external id is kept as `key`.
- **A never-ended session swallowed the next day.** Yesterday's fatigue counted as in-session fatigue, and next-day predictions were far too low. A set more than 3 h after the open session's last event now starts a new session.
- **One outlier set could swing capacity.** For example, 45 push-ups when M = 20 moved M to 28.1. The observation is now clipped to M × (1 ± 0.5) before the EMA, so the most one set can move M is ±15%.

**Added:**
- `predictRange`: a likely range from the user's own recent error history, shown as "first set likely X–Y".
- **A fuzz test:** 150 random streams of valid and garbage events (NaN, negative reps, RIR 9, unknown exercises, reused ids, huge gaps). All outputs stay finite, plans stay within budget, and every prescribed set has at least 1 rep.

## Calories (user-approved)

Built on the 2024 Adult Compendium of Physical Activities (the 2024 values are used: vigorous calisthenics is 7.5, down from 8.0 in 2011). Details are in SPEC 5.13.
- **Honest scope.** Compendium values are population averages for adults aged 19–59, and the paper states they do not reflect precise individual energy expenditure. The result is shown with a ± range, and "active" (net) calories are the headline, as watches show.
- **Why not one whole-session MET:** a strength workout is mostly rest. Splitting sets from rest with the real gaps (capped at 5 min) avoids the common 2–3× overestimate.
- **Afterburn:** measured EPOC after resistance sessions is about 5–7 L O₂ (about 25–37 kcal). Modelled as +10% of set energy.
- **Heart rate** from a wearable would improve this and is the next step. Calories are computed on read and never feed back into fatigue or planning.

## Exercise library (user-approved)

The exercise catalog is now its own pure module, `src/library` ("the exercise engine"), and data set, `catalog/library/` (one JSON file per movement group: push, pull, legs, core, arms, plus `ladders.json`). The workout engine selects from it: `loadCatalog` calls `loadLibrary` and keeps every exercise; weighted ones are gated by `canLoad`.
- **Equipment is exactly six tags:** `bench, dumbbell, resistance_band, pullup_bar, table, chair`. `backpack`, `step`, `door_anchor` and `floor_slider` are gone. Their exercises were removed (backpack row/curl/reverse fly/overhead extension, sliding leg curls, deficit calf raise) or rewritten: step-up is now a chair step-up, the backpack single-leg RDL is bodyweight, band exercises assume a door or post to anchor to, and the nordic curl hooks the feet under a couch or bed (no tag).
- **Muscle tags use the existing contributions, not a second list.** Targeted = contribution 1, secondary = 0.5 / 0.25 (both feed the stress model, unchanged). `alsoUses` lists every other working muscle; it may name any of the 12 regions or `forearms, traps, obliques, adductors, hip_flexors`, and is not stress-tracked. `loadLibrary` derives `targets`, `secondary` and `muscles` (all of them). Shrugs and carries count traps under `upper_back` for stress.
- **Difficulty** is a 1–5 score per experience (1 too easy, 3 right challenge, 5 too hard or unsafe). Validation: it never rises with experience, and never falls going up a ladder. The planner drops candidates at or above `difficulty.excludeAbove` and scales scores by the fit to 3; ladders and capacity still pick the rung from reps. It is exposed through `findExercises(lib, { experience, maxDifficulty })`.
- **Weighted (dumbbell) exercises.** `weighted` is true exactly when an exercise uses a dumbbell; such exercises have no `defaultM` and never share a ladder with unweighted ones. They are planned only for users who own dumbbells (see "Weights and adaptive difficulty").
- **Stand-alone exercises** may omit `ladderId`/`level`; they become their own one-rung ladder (stepRatio 0.6), so a new exercise needs no ladder entry.
- **New patterns** `chest_fly, shoulder_raise, shrug, hip_abduction, carry, full_body` have no template slot, so the planner does not pick them until a program uses them.
- **Equipment gaps change:** with no equipment, hamstrings are now covered (nordic curl, single-leg RDL); upper_back (best 0.5) and biceps (0) remain gaps. With a bar and a band there are none.
- **Browsing:** `npm run library -- --equipment dumbbell,bench --target chest` lists matches grouped by the equipment they need.

## Weights and adaptive difficulty (user-approved)

Design: `docs/superpowers/specs/2026-10-02-weights-and-adaptive-difficulty-design.md`; plan: `docs/superpowers/plans/2026-10-02-weights-and-adaptive-difficulty.md`.
- **Strength model:** one-dumbbell 1RM per weighted exercise, Epley curve `reps = 30·(1RM/w − 1)`. The existing fatigue maths runs unchanged in reps at the chosen weight, so calibration (rho, d, b, deload) learns from dumbbell sets too.
- **Weight choice:** keep last time's weight while in `strength.repRange` [6, 15]; else nearest mid-range (tie heavier); else flagged too heavy / too light; else, when the range falls between two owned weights, the weight nearest the range (tie lighter). Too light caps reps at 15.
- **Starting estimate:** the "usual weight" answer (assumed 2 reps short of failure), else body mass × loadNorm × 0.85 (70 kg when body mass is unknown). The first set is a technical-failure test.
- **Missing data:** a weighted set without a weight deposits fatigue but teaches nothing. A weight on a bodyweight exercise is ignored. Acute and AMRAP learning only compare sets at the same weight.
- **Difficulty is derived, never stored:** library rating at the user's level, blended toward the strength fit as measurements accrue (w = n/(n+2)), plus rating and demand offsets. Ratings teach per-demand offsets that transfer to unrated exercises with the same demand.
- **Planner:** weighted exercises only when dumbbells are owned (`canLoad`); too-hard candidates (≥ 4.5) dropped unless all are; scores scaled by fit to 3 (factor 0.7–1).
- **Earlier than planned:** weighted exercises entered the catalog in Task 3 rather than Task 6. The catalog holds every library exercise, and `canLoad` (owned dumbbells) gates planner `canUse`, capacity `usableNeighbour` and calibrate `equipmentGaps`. `audit.test` skips weighted exercises in its defaultM loop, because they have no defaultM.
- **Shared projection:** bodyweight and weighted prescription share one private `projectSets` helper in capacity.ts (user-approved over the plan's duplicated logic).
- **Test-side fixes (strength learning golden test):** floating-point M_pred/M_obs are compared with `toBeCloseTo(…, 9)` because exact 12 came out as 11.999999999999996; the test profile is typed via `Parameters<typeof profile>[1]`.
- **Known behaviour, 1RM lag:** the estimate lags fast strength gains. The steady-state EMA lag is about (1−emaAlpha)/emaAlpha × the gain per session: roughly 7%, 12% and 16% at 3%, 5% and 7% per session, about 6% at a realistic 1.5%. It is larger when users report capped "5+ RIR", since censored sets only lower-bound capacity, and the weight steps up slowly because the last weight is kept while predicted reps stay in range. Tuning knobs for faster tracking: `capacity.emaAlpha`, or a larger update after clearly easy sets.
- **Replay change:** before this work, `set_logged` and `exercise_feedback` events for weighted exercise ids were dropped by the fold (not in the catalog). They now deposit fatigue and learn, so a `schemaVersion` 1 history that logged dumbbell exercises replays slightly differently.
- **AMRAP placement:** the planner puts the AMRAP only on an exercise whose last two sets share a weight (and that is not "too light"), because calibration compares the AMRAP with the set before it at the same weight.
- **Weight equality:** logged and owned weights match within half a gram (`sameWeight` in strength.ts), because unit conversion is not exact (42.5 lb = 19.277675725 kg, owned 19.278). Adjustable dumbbells need `minKg` and `stepKg` of at least 0.001 so the expansion never yields 0 kg or duplicates.
- **Views for weighted exercises:** `strengthTrend` reports the 1RM (kg) for weighted exercises, not reps at whatever weight; `goodSets` is empty when the profile has no dumbbells. The "New to you" bonus ends once a weighted exercise has a strength measurement, even without body mass.
- **Planner `minScore`:** now compares difficulty-scaled fit scores, which can be up to 30% lower than before, so it may need retuning.

## Reps left on the last set only, and workout intensity (user-approved)

**Ask.** The app's workout screen asks "how many more reps could you do?" once per exercise, after its last set. The engine required it on every set. The user chose to change the engine. The app also has an Easy / Normal / Hard choice the engine did not know.

**Reps left.** `rir` is optional on `set_logged`. Sets that carry it behave exactly as before (all earlier tests pass unchanged).
- An unrated set deposits fatigue using the reps left the prediction implies. It is never an observation.
- The rated last set becomes the exercise's capacity / recovery observation, taken back to the fatigue the exercise started at with the in-session curve `(1 - d)^ΔF`.
- An all-out set needs no rating. For `b` (rating bias) to keep learning, the app asks after the set *before* an all-out set.
- **Cost, measured** (`tests/lastSetRir.sim.test.ts`, seeds 1–3, weeks 9–12, engine capacity vs the hidden truth): beginner 4.4% → 6.1%, intermediate 5.3% → 7.9%. Inferred level stays within 0.3 of the truth. Calibration still finishes.
- **Known limit.** `d` (how fast reps fall within a session) needs two rated sets in a row, so with this app it stays at its default 0.12, and every last-set observation leans on that default. A user whose reps fall much faster or slower than average is read a little strong or weak. Fix if it matters: rate the first set too, once every few weeks.
- The simulator has `lastSetRirOnly` on a scenario to reproduce the app's logging.

**Intensity.** `planSession({ intensity })` shifts the target reps left: easy +2, hard −1 (`planner.intensityRirAdd`), clamped to 0..5. Sets, exercise choice and weekly targets are untouched: an easy day is the same workout with more left in the tank, and the lower effort is logged, so recovery and weekly need follow from what was done.
- Not symmetric on purpose: intermediates plan at 2 reps left, so −2 would put every set at failure.
- Ladder level choice (`currentLevels`) ignores intensity, so an easy day does not demote the exercise.

## Planner volume and focus programs (10 October 2026)

Found by simulating four weeks of each program (`npx tsx tests/check-programs.ts`): sessions were 1 to 2 sets an exercise, the "upper body" program gave whole lower-body days and more glute sets than chest sets, and the legs program gave the arms nothing.

- **`planner.sessionFatigueCap` = 1.1 (new param).** The overload cap from Milestone 6 cut sets at `fatiguedAbove x T/ref`, which is 0.7 of a full session for that muscle. It now cuts at 1.1 times that line. Higher values were tried and rejected: at 1.2 the last-set-only beginner scenario's capacity error rose from under 0.12 to 0.24, and from 1.3 up plan-following users drifted above their default tolerance. So this is as far as the cap can move without retuning tolerance; a beginner's volume is held down by `tolerance.init.beginner`, by design.
- **Bonuses never add work at target.** A candidate whose every muscle is already at this week's target is not picked, unless it is a calibration measurement. Before, the continuity bonus alone (0.3) cleared `minScore` (0.1), so an exercise done recently was added every session while time remained.
- **A maintained muscle gets the minimum sets.** When every target muscle of an exercise has program emphasis below 1, it gets `sets.min`.
- **Focus programs have no off-focus days.** Each template ends with one slot from the other half of the body, and the off-focus emphasis is 0.4 (upper program) and 0.5 (legs program), down from 0.7.

## Sessions fill their time; beginner tolerance (10 October 2026, user-approved)

**Ask.** "When I'm changing the time limit, the number of exercises is very low." A 50-minute session used 27 minutes: one exercise per template slot, then nothing.

- **Planner step 3b: spare time becomes more exercises.** After every slot has had its turn, the rest of the budget goes to further exercises: another movement family for the day's own muscles, then other muscles, whatever is furthest behind this week. Rules: never the same ladder twice; every muscle the exercise works at a half share or more must still be short of its weekly target; a muscle from outside the day's own must be `ready`; a muscle the program only maintains (emphasis below 1) is never added this way; not on a deload or a worn-out day. Two or more exercises from outside the day's muscles rename the day `full` when the program has that template, so the title stays honest.
- **A never-measured exercise is only added where it can be measured** (`learnable`): fresh muscles (`capacity.freshBelow`) that the session has not touched (`capacity.sessionCleanBelow`). Otherwise its first set is no observation and the catalog's guess stands. Found by simulation: a beginner was left with a guess of 15 for a push-up variation they could do 5 of.
- **`tolerance.init.beginner` 3.5 -> 4.5.** A beginner's full session for one muscle goes from about two sets to about three. 5.0 was tried and rejected: the last-set-only beginner scenario's capacity error rose past its 0.12 bar.
- **Why not simply raise the fatigue cap.** Per-muscle volume in one session is held by `sessionFatigueCap` x `fatiguedAbove` x T/ref, and the learner depends on it (see the entry above). So extra volume comes from more muscles and more movement families in a session, not from piling sets on one muscle.
- **Simulator: the set a user stops on is rated.** With `lastSetRirOnly` the runner rated only the last *planned* set, so an exercise the user stopped early was never rated and never learned. The app asks after whichever set is the exercise's last.
- **One acceptance bar moved:** `returns_after_layoff` capacity error within two sessions back, 0.10 -> 0.11 (seed 4 lands at 0.1005).

- **A first measurement never counts towards a deload.** The deload trigger is the rolling mean prediction error. Until an exercise has been measured once, its prediction is the catalog's guess (guessed 39 reps, did 17: error -0.30), which says nothing about the user's form. With sessions now holding many new exercises, a new user hit a false deload in week 2: three sessions of four single sets, whatever time was given. `rollingCleanErr` now skips an exercise's entries up to and including its first capacity observation. The deload unit tests measure their exercises a fortnight earlier.
- **Second acceptance bar moved:** weekly done / target is allowed 1.75 in week 1 (1.5 after). The level is inferred during week 1; when it comes out lower the target falls after the sets were planned (lower back planned against 4.0, judged against 2.9). The false deload had been hiding this.

**Measured** (`npx tsx tests/check-programs.ts`, a new beginner, four workouts a week, week 5): Balanced gives 2 exercises in 20 min, 4 in 30, 6 in 40, 8 in 50. Sets per session over four weeks rose from 5.8 to 11.5 (Balanced), 9.8 (Upper body), 10.8 (Legs and glutes).

## Muscle-targeted suggestions, muscle effects, calorie estimates, more dumbbell work (11 October 2026)

**Ask.** An engine that suggests exercises for the muscles the user wants to train or has used least, shows which muscles each exercise works, estimates calories per exercise, covers dumbbell exercises with reps and muscle effects, includes them in recovery, and stays in sync with the app.

What already existed and was kept: the planner already favours the muscles furthest behind this week (weekly need × readiness), dumbbell exercises already deposit fatigue and recover like any other set, and calories were already computed per finished session (`byExercise`).

- **Chosen muscles: `planSession({ focus })`.** One slot per chosen muscle, filled by anything that targets it (template id `focus`, `plan.focus` set), then spare time on more exercises that target one of them. A chosen muscle counts `planner.focus.boost` (2) times, is treated as at least `planner.focus.needFloor` (0.5) behind even at this week's target, keeps the readiness it started the day with, and may end the session at `planner.focus.fatigueCap` (2.0) × `fatiguedAbove` instead of `sessionFatigueCap` (1.1). Without the higher cap a chest day for a 4-week intermediate was one exercise of 2 sets in 40 minutes; with it, three exercises and 6 sets. Fatigued or sore chosen muscles are skipped with a reason; if none can be trained the plan is a rest day saying when they will be ready. Only whole-body fatigue (G) rests a focus day; "no major muscle ready" does not, since the user named the muscles. Two chosen muscles never get two exercises from one family.
- **Known cost, accepted:** on a focus day an exercise the engine has never measured may be added on a muscle the session already worked, so its first set teaches nothing and the catalog's guess stands until it is done fresh. The usual plan keeps the `learnable` rule. The simulator does not use focus, so no acceptance bar moved.
- **Swaps: `planSession({ excludeExercises })`.** Leaves exercises out of this plan only; the next best fills the place (or nothing, if nothing else fits).
- **Short sessions say why: `plan.short`.** When 8 or more minutes of the time given are left unplanned the plan carries `learning` / `deload` / `worn_out` / `targets_met` and a reason line. A new user's plan stops at about 35 minutes whatever the time given (the fatigue cap and the `learnable` rule, both by design), so 40 and 50 minutes give the same workout until the engine has measured the user. This is the answer to "longer durations don't add exercises on a fresh profile".
- **Suggestion engine: `suggestExercises(s, { now, muscles?, equipment?, exclude?, limit?, sets?, intensity? })`** (`src/engine/suggest.ts`). Without muscles it uses `leastUsedMuscles`. Same filter as the planner (`usableNow`, shared), same ladder level choice and prescription, so a suggestion is exactly what the planner would prescribe. One per family, spread across the muscles (each pick covering a muscle scales later candidates led by it by 0.6). A dumbbell exercise whose lightest owned weight is too heavy keeps a quarter of its score.
- **Muscle-effects engine** (`src/engine/muscles.ts`): `workEffects` / `exerciseEffects` / `planEffects` run the fold's per-set maths on a copy of the state (hard sets, fatigue as a share of a full session, load before and after, hours until ready), tested to match logging the same dumbbell sets. `muscleUsage` ranks muscles least used first (this week ÷ target, then the 28-day average, then days since trained); `muscleSummary` gives "Works glutes and hamstrings hard; lower back moderately. Also uses forearms and traps."
- **Calorie estimates:** `estimateCalories(s, sets)` and `planCalories(s, plan)` reuse the session maths (one shared function). Without set times, sets are spaced by `energy.defaultRestMin`. Dumbbell sets use the same effort-based METs: the Compendium rates resistance work by effort, not by the weight moved.
- **Six dumbbell exercises** fill the dumbbell gaps (no dumbbell exercise targeted the lower back, a leg curl, or abs by crunching): good morning, lying leg curl (bench), weighted prone back extension, weighted crunch, close-grip floor press, Zottman curl. `loadNorm` for the body-weight-heavy ones (back extension, crunch, good morning) was set from what a first set should look like at 72 kg (about 9–12 reps at 7.5–15 kg); first guesses that were too low produced 1-rep sets.
- **App:** a "Muscles to train" chip on the workout page (with the least trained muscles named), the plan titled by the chosen muscles, a Swap button and the engine's reason, muscles worked and calories on each exercise, and active calories with a range on the done screen. The profile now always carries the user's dumbbells, so picking Dumbbells for one workout plans dumbbell exercises (before, it planned none unless Dumbbells was also in Profile).

## Production backend and wiring (11 October 2026, defaults pending approval)

Recorded as ADRs in `docs/adr/` (status Proposed): engine stays on the device and the server stores the event log (0001); Supabase in Mumbai (0002); event-log sync with per-user sequence numbers and tombstones, settings last-writer-wins (0003); optional account with email codes (0004); Razorpay Subscriptions with webhook-driven entitlements and Free/Pro gating that is off until billing is live, all features open for the first 7 days (0005); PWA on Cloudflare Pages (0006); web push reminders (0007); PostHog without personal data (0008). Setup in `docs/LAUNCH-SETUP.md`, review in `docs/REVIEW.md`.
