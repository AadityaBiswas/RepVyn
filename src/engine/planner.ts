import { checkinFor, isCalibrating } from "./calibrate";
import { capacityOf, deloadActiveAt, prescribe, repsTarget, type FirstSetMode, type DayIntensity, type LoadFlag, type PrescribedSet } from "./capacity";
import { applyFit, difficultyOf, type PersonalDifficulty } from "./difficulty";
import { noveltyMult, priorExposures, saturate, setLoad } from "./load";
import { MS_PER_HOUR, toleranceScale } from "./recovery";
import { emphasisOf, programOf, readiness, readinessState, readinessWeight, systemic, weeklyNeed } from "./state";
import { canLoad, sameWeight } from "./strength";
import {
  REGIONS, zeroRegions,
  type EngineState, type Equipment, type Exercise, type Pattern, type ReadinessState, type Region, type RegionMap,
} from "./types";

const DAY_MS = 24 * MS_PER_HOUR;

export interface PlanOptions {
  now: number;
  minutes?: number;
  overrideEquipment?: Equipment[];
  /** Easy / hard day: shifts the reps left on every set by planner.intensityRirAdd. Default normal. */
  intensity?: DayIntensity;
  /**
   * Muscles the user wants to train today. The day is built around them (template "focus"): one slot per muscle, then spare
   * time on more exercises for them. They are trained even at this week's target (planner.focus.needFloor) and count
   * planner.focus.boost times as much; fatigued ones are skipped with a reason, and the fatigue caps still hold.
   */
  focus?: Region[];
  /** Exercises left out of this plan only (a swap): the next best takes their place. */
  excludeExercises?: string[];
}

export interface PlannedExercise {
  exerciseId: string;
  sets: PrescribedSet[];
  firstSetMode: FirstSetMode;
  loadFlag: LoadFlag;
  difficulty: PersonalDifficulty;
  reasons: string[];
}

export interface Plan {
  kind: "workout" | "rest";
  template: string | null;
  program: string;
  exercises: PlannedExercise[];
  skippedRegions: { region: Region; state: ReadinessState; hoursToReady: number }[];
  deloadActive: boolean;
  calibrating: boolean;
  estMinutes: number;
  /** Plan-level reasons: rest reasons, template choice, skipped regions. */
  reasons: string[];
  /** The muscles the plan was built around (PlanOptions.focus), or null for the usual day. */
  focus: Region[] | null;
  /**
   * Why the workout fills less of the time given (planner.shortSessionMin or more left over), or null. "learning": the engine
   * only adds exercises it can measure while it learns a new user; "deload" / "worn_out": short on purpose; "targets_met": the
   * rested muscles are near this week's target.
   */
  short: "learning" | "deload" | "worn_out" | "targets_met" | null;
}

/** Minutes left unplanned before a plan says why it is shorter than the time given. */
const SHORT_SESSION_MIN = 8;
const SHORT_WORDS: Record<NonNullable<Plan["short"]>, string> = {
  learning: "RepVyn is still learning what you can do, so it only adds exercises it can measure today. Longer workouts open up over your first sessions",
  deload: "This is a lighter recovery week, so workouts are kept short on purpose",
  worn_out: "Kept short because you said you're worn out",
  targets_met: "The muscles that are rested are close to this week's target, and more sets would add tiredness without much gain",
};

const STATE_WORDS: Record<ReadinessState, string> = { ready: "rested", recovering: "partly recovered", fatigued: "still tired" };
const hardSets = (n: number) => `${n} hard set${n === 1 ? "" : "s"}`;

/** Muscle names as people say them. */
export const REGION_NAMES: Record<Region, string> = {
  chest: "Chest", front_delt: "Front shoulders", side_rear_delt: "Side and rear shoulders", triceps: "Triceps", upper_back: "Upper back",
  biceps: "Biceps", quads: "Quads", glutes: "Glutes", hamstrings: "Hamstrings", calves: "Calves", abs: "Abs", lower_back: "Lower back",
};
/** Whether the name takes a plural verb ("glutes are", "chest is"). */
export const REGION_PLURAL: Record<Region, boolean> = {
  chest: false, front_delt: true, side_rear_delt: true, triceps: true, upper_back: false,
  biceps: true, quads: true, glutes: true, hamstrings: true, calves: true, abs: true, lower_back: false,
};
const isAre = (m: Region) => (REGION_PLURAL[m] ? "are" : "is");

/** "upper_back" -> "Upper back". */
export const label = (id: string): string => {
  const t = id.replaceAll("_", " ");
  return t[0]!.toUpperCase() + t.slice(1);
};

const primaryRegions = (e: Exercise): Region[] => REGIONS.filter((m) => e.contributions[m] === 1);
const contributions = (e: Exercise): [Region, number][] =>
  REGIONS.flatMap((m) => (e.contributions[m] ? [[m, e.contributions[m]!] as [Region, number]] : []));

/** Candidates below difficulty.excludeAbove; if none are, all of them (a too-hard option beats an empty slot). */
export function withinDifficulty(s: EngineState, cands: Exercise[], now: number): Exercise[] {
  const ok = cands.filter((e) => difficultyOf(s, e.id, now).score < s.params.difficulty.excludeAbove);
  return ok.length ? ok : cands;
}

/**
 * Whether an exercise can go in a plan right now: owned equipment and dumbbells, not excluded, not recently painful, and no
 * target muscle excluded or fatigued (a sore muscle counts as fatigued). Shared by the planner and suggestions (suggest.ts).
 */
export function usableNow(s: EngineState, now: number, opts: { equipment?: Equipment[]; exclude?: readonly string[] } = {}): (e: Exercise) => boolean {
  const P = s.params;
  const profile = s.profile;
  if (!profile) throw new Error("needs a profile_set event first");
  const ready = readiness(s, now);
  const sore = new Set<Region>(checkinFor(s, now)?.soreRegions ?? []);
  const excludedRegions = new Set<Region>(profile.excludeRegions);
  const equipment = opts.equipment ?? profile.equipment;
  const skip = new Set([...profile.excludeExercises, ...(opts.exclude ?? [])]);
  const painAvoidMs = P.planner.painAvoidDays * DAY_MS;
  const hurts = (id: string) => {
    const t = s.feedback[id]?.painTs;
    return t != null && t <= now && now - t < painAvoidMs;
  };
  const stateAt = (m: Region): ReadinessState => (sore.has(m) ? "fatigued" : readinessState(ready[m].fatigue, P, toleranceScale(s, m)));
  return (e) =>
    canLoad(s, e) &&
    e.equipment.every((t) => equipment.includes(t)) &&
    !skip.has(e.id) &&
    !hurts(e.id) &&
    primaryRegions(e).every((m) => !excludedRegions.has(m) && stateAt(m) !== "fatigued");
}

/**
 * Current level per ladder among the candidates: the highest performed level with repsTarget <= repRange max,
 * else the highest performed level (prescribe then moves it up), else the entry level for the user's experience.
 */
export function currentLevels(s: EngineState, cands: Exercise[], now: number): Exercise[] {
  const [lo, hi] = s.params.capacity.repRange;
  const mid = (lo + hi) / 2;
  const ladders = [...new Set(cands.map((e) => e.ladderId))];
  return ladders
    .map((id) => {
      const list = cands.filter((e) => e.ladderId === id).sort((a, b) => a.level - b.level);
      const performed = list.filter((e) => s.capacity[e.id]).reverse();
      const entry = [...list].sort(
        (a, b) => Math.abs(capacityOf(s, a.id, now).M - mid) - Math.abs(capacityOf(s, b.id, now).M - mid) || a.level - b.level,
      )[0]!;
      return performed.find((e) => repsTarget(s, e.id, now) <= hi) ?? performed[0] ?? entry;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

interface Candidate {
  slot: number;
  pr: PlannedExercise;
  ex: Exercise;
  score: number;
  fatigue: number;
  stimPerSet: number;
  minutes: number;
  reasons: string[];
}

export function planSession(s: EngineState, opts: PlanOptions): Plan {
  const { now } = opts;
  const P = s.params;
  const profile = s.profile;
  if (!profile) throw new Error("planSession needs a profile_set event first");
  const base = { deloadActive: deloadActiveAt(s, now), calibrating: isCalibrating(s, now) };
  const program = programOf(s);
  const excludedRegions = new Set<Region>(profile.excludeRegions);
  const focus = REGIONS.filter((m) => opts.focus?.includes(m) && !excludedRegions.has(m));
  const focusSet = new Set<Region>(focus);
  const focusMode = focus.length > 0;
  const rest = (reasons: string[]): Plan => ({ kind: "rest", template: null, program: program.id, exercises: [], skippedRegions: [], estMinutes: 0, reasons, focus: focusMode ? focus : null, short: null, ...base });

  // Step 0: rest check. With muscles chosen, only whole-body fatigue rests the day: those muscles are checked one by one below.
  const sys = systemic(s, now);
  if (focusMode ? sys.G > P.systemic.restRatio * sys.typical : sys.restRecommended) return rest(focusMode ? sys.reasons.slice(0, 1) : sys.reasons);

  const ready = readiness(s, now);
  const checkin = checkinFor(s, now);
  const sore = new Set<Region>(checkin?.soreRegions ?? []);
  const stateAt = (m: Region, F: number): ReadinessState => (sore.has(m) ? "fatigued" : readinessState(F, P, toleranceScale(s, m)));
  const R = (m: Region, F: number) => readinessWeight(stateAt(m, F), P);
  const need = weeklyNeed(s, now);

  // Step 1: template choice. Emphasis weights each region; while calibrating, templates covering unmeasured movements get a bonus.
  const emph = (m: Region) => emphasisOf(s, m);
  const unmeasured = (pattern: Pattern) => !s.catalog.exercises.some((e) => e.pattern === pattern && s.levelObs[e.ladderId]);
  const scored = program.templates.map((t, i) => {
    const covered = REGIONS.filter(
      (m) => !excludedRegions.has(m) && s.catalog.exercises.some((e) => t.slots.includes(e.pattern) && e.contributions[m] === 1),
    );
    const w = covered.reduce((a, m) => a + emph(m), 0);
    let score = covered.reduce((a, m) => a + emph(m) * need[m].need * R(m, ready[m].fatigue), 0) / Math.max(1, w);
    if (i === 0 && profile.daysPerWeek <= P.planner.fullBodyBonusMaxDays) score *= P.planner.fullBodyBonus;
    if (base.calibrating) score += (P.planner.calibrationBonus * t.slots.filter(unmeasured).length) / t.slots.length;
    return { t, score, covered };
  });
  // Chosen muscles replace the template: one slot per muscle, filled by anything that targets it.
  const best = focusMode ? { t: { id: "focus", slots: [] as Pattern[] }, score: 0, covered: focus } : scored.reduce((a, b) => (b.score > a.score ? b : a));

  // Step 2: candidates per slot.
  const painAvoidMs = P.planner.painAvoidDays * DAY_MS;
  const hurts = (id: string) => {
    const t = s.feedback[id]?.painTs;
    return t != null && t <= now && now - t < painAvoidMs;
  };
  const canUse = usableNow(s, now, { ...(opts.overrideEquipment ? { equipment: opts.overrideEquipment } : {}), ...(opts.excludeExercises ? { exclude: opts.excludeExercises } : {}) });
  const slots = focusMode
    ? focus.map((m) => withinDifficulty(s, currentLevels(s, s.catalog.exercises.filter((e) => e.contributions[m] === 1 && canUse(e)), now), now))
    : best.t.slots.map((pattern) =>
      withinDifficulty(s, currentLevels(s, s.catalog.exercises.filter((e) => e.pattern === pattern && canUse(e)), now), now),
    );

  // Step 3: greedy fill.
  const F_proj = Object.fromEntries(REGIONS.map((m) => [m, ready[m].fatigue])) as RegionMap;
  const rawProj = zeroRegions();
  const added = zeroRegions();
  const needProj = (m: Region) => Math.max(0, need[m].target - need[m].done - saturate(rawProj[m], P)) / need[m].target;
  // A chosen muscle is wanted even at this week's target, and counts more than the muscles it brings along.
  const needOf = (m: Region) => (focusSet.has(m) ? Math.max(needProj(m), P.planner.focus.needFloor) : needProj(m));
  const wantOf = (m: Region) => emph(m) * (focusSet.has(m) ? P.planner.focus.boost : 1);
  // A chosen muscle may end the session more tired (planner.focus.fatigueCap): a day for it is more than its usual share.
  const capOf = (m: Region) => (focusSet.has(m) ? P.planner.focus.fatigueCap : P.planner.sessionFatigueCap);
  const budget = opts.minutes ?? profile.sessionMinutes;
  const beatUp = checkin?.feel === "beat_up";
  const filled = slots.map(() => false);
  const picks: Candidate[] = [];
  let minutes = P.planner.time.warmupMin;

  const setsFor = (e: Exercise): number => {
    const sp = P.planner.sets;
    const maxNeed = Math.max(...primaryRegions(e).map(needOf));
    let n = maxNeed > sp.highNeed ? sp.highSets : maxNeed < sp.lowNeed ? sp.lowSets : sp.base;
    // A muscle the program only maintains gets the minimum: enough to keep it, no more (unless the user chose it today).
    if (primaryRegions(e).every((m) => emph(m) < 1 && !focusSet.has(m))) n = sp.min;
    if (beatUp) n -= 1;
    n = Math.max(sp.min, n);
    return n;
  };

  const evaluate = (slot: number, cand: Exercise): Candidate | null => {
    const pr = prescribe(s, cand.id, setsFor(cand), now, { canUse, plannedAdded: added, ...(opts.intensity ? { intensity: opts.intensity } : {}) });
    const ex = s.catalog.byId[pr.exerciseId]!;
    const rir = pr.sets[0]!.targetRir;
    const stimPerSet = P.effort.stimulus[Math.min(rir, P.effort.stimulus.length - 1)]!;
    const cs = contributions(ex);
    const k = priorExposures(s, ex.id, null, now);
    const loadAt = (rirAdd: number) =>
      pr.sets.map((x) => setLoad(ex, x.seconds !== undefined ? x.seconds / P.hold.secondsPerRep : x.reps!, x.targetRir + rirAdd, k, P, noveltyMult(s)).fatigue);
    const setFatigue = loadAt(0);
    // Caps are judged at normal effort, so a deload is a fraction of the normal plan rather than of a looser cap.
    const capFatigue = base.deloadActive ? loadAt(-P.planner.deloadRirAdd) : setFatigue;
    const fatigueOf = (n: number, f = setFatigue) => f.slice(0, n).reduce((a, x) => a + x, 0);
    const overloadOf = (n: number, f = setFatigue) =>
      cs.reduce((a, [m, c]) => a + Math.max(0, F_proj[m] + fatigueOf(n, f) * c - P.readiness.fatiguedAbove * capOf(m) * toleranceScale(s, m)), 0);

    let n = pr.sets.length;
    while (n > 0 && cs.some(([m, c]) => rawProj[m] + n * stimPerSet * c > P.stimulus.sessionMax)) n--;
    // ponytail: same kind of cap for fatigue — drop sets (floor 1) rather than push a region past sessionFatigueCap x fatiguedAbove. See DECISIONS.md.
    while (n > 1 && overloadOf(n, capFatigue) > 0) n--;
    // Deload: a fraction of what normal effort would allow.
    if (base.deloadActive) n = Math.max(1, Math.round(n * P.planner.deloadSetFactor));
    if (n === 0) return null;
    const sets = pr.sets.slice(0, n);
    const t = P.planner.time;
    const mins = n * t.minPerSet * (ex.unilateral ? t.unilateralSetFactor : 1) + t.transitionMin;
    if (minutes + mins > budget) return null;

    const fatigue = fatigueOf(n);
    // A chosen muscle keeps the readiness it started the day with: the session making it tired is the point, and capOf limits it.
    const gain = cs.map(([m, c]) => [m, c * wantOf(m) * needOf(m) * R(m, focusSet.has(m) ? ready[m].fatigue : F_proj[m])] as [Region, number]);
    const measuring = base.calibrating && !s.levelObs[ex.ladderId] && !(s.strength[ex.id]?.obs ?? 0);
    // Bonuses (continuity, liked) choose between useful exercises; they never add work for muscles already at this week's target.
    if (!measuring && gain.every(([, g]) => g <= 0)) return null;
    const overload = overloadOf(n);
    const cutoff = now - P.planner.continuityDays * DAY_MS;
    const recent = (s.exposures[ex.id] ?? []).filter((x) => x.ts >= cutoff && x.ts <= now).length;
    const liked = s.feedback[ex.id]?.liked;
    const score = gain.reduce((a, [, g]) => a + g, 0) - P.planner.overloadLambda * overload + (recent > 0 ? P.planner.continuityBonus : 0) +
      (measuring ? P.planner.calibrationBonus : 0) + (liked === true ? P.planner.likeBonus : liked === false ? -P.planner.dislikePenalty : 0);
    // Prefer exercises that are the right challenge (see applyFit).
    const difficulty = difficultyOf(s, ex.id, now);
    const fitted = applyFit(score, difficulty.score, P.difficulty.preferWeight);

    const reasons: string[] = [];
    const top = gain.filter(([m]) => ex.contributions[m] === 1).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] > 0) {
      const [m] = top;
      const behind = Math.round(needProj(m) * need[m].target);
      if (focusSet.has(m)) {
        reasons.push(`${REGION_NAMES[m]}: you chose to train ${REGION_PLURAL[m] ? "them" : "it"} today` + (behind >= 1 ? `, ${hardSets(behind)} short of this week's target` : ""));
      } else {
        reasons.push(`${REGION_NAMES[m]} ${isAre(m)} ${STATE_WORDS[stateAt(m, ready[m].fatigue)]} and ${hardSets(Math.max(1, behind))} short of this week's target`);
      }
    }
    if (measuring) reasons.push("New to you: the first set measures your level");
    if (liked === true) reasons.push("You said you like this one");
    if (difficulty.source === "personal" && difficulty.score >= 3.5) {
      reasons.push(`Hard for you${difficulty.reasons.length ? `: ${difficulty.reasons.join(", ")}` : ""}`);
    }
    if (recent > 0) reasons.push(`Keeps your progress going (done ${recent} time${recent === 1 ? "" : "s"} in the last ${Math.round(P.planner.continuityDays / 7)} weeks)`);
    reasons.push(...pr.reasons);
    if (overload > 0) reasons.push("Lightly works a muscle that is still tired, so sets are kept low");

    return { slot, ex, score: fitted, fatigue, stimPerSet, minutes: mins, reasons, pr: { exerciseId: ex.id, sets, firstSetMode: pr.firstSetMode, reasons, loadFlag: pr.loadFlag, difficulty } };
  };

  const better = (c: Candidate | null, than: Candidate | null): boolean =>
    !!c && (!than || c.score > than.score || (c.score === than.score && c.ex.id < than.ex.id));
  const take = (pick: Candidate): void => {
    picks.push(pick);
    minutes += pick.minutes;
    for (const [m, c] of contributions(pick.ex)) {
      rawProj[m] += pick.pr.sets.length * pick.stimPerSet * c;
      added[m] += pick.fatigue * c;
      F_proj[m] += pick.fatigue * c;
    }
  };
  for (;;) {
    let bestC: Candidate | null = null;
    slots.forEach((cands, slot) => {
      if (filled[slot]) return;
      for (const e of cands) {
        const c = evaluate(slot, e);
        // Two chosen muscles can share an exercise family (chest and triceps both list push-ups): one of it is enough.
        if (focusMode && c && picks.some((p) => p.ex.ladderId === c.ex.ladderId)) continue;
        if (better(c, bestC)) bestC = c;
      }
    });
    const pick = bestC as Candidate | null;
    if (!pick || pick.score < P.planner.minScore) break;
    filled[pick.slot] = true;
    take(pick);
  }

  // Step 3b: time left over. A longer session is more exercises, not a short one with minutes to spare. A muscle is full after a
  // few sets (the fatigue cap), so the rest of the budget goes to other movement families and then to other muscles: whatever is
  // furthest behind this week and fully rested (a muscle from outside the day's own must be ready, not just recovering), never the same ladder twice. A muscle the program only maintains (emphasis below 1) is
  // not added this way; it keeps to its one slot.
  // With chosen muscles, spare time goes only to exercises that target one of them.
  const extras = withinDifficulty(
    s,
    currentLevels(s, s.catalog.exercises.filter((e) => canUse(e) && primaryRegions(e).length > 0 && (!focusMode || primaryRegions(e).some((m) => focusSet.has(m))) && primaryRegions(e).every((m) => best.covered.includes(m) || (emph(m) >= 1 && stateAt(m, ready[m].fatigue) === "ready"))), now),
    now,
  );
  // Not on a deload or a worn-out day: those are meant to be short.
  // An exercise the engine has never measured is only added where it can be measured: on muscles that are fresh today and that this
  // session has not touched yet. Anywhere else its first set would teach nothing (capacity.freshBelow, capacity.sessionCleanBelow)
  // and the catalog's guess at what the user can do would stand.
  const learnable = (e: Exercise): boolean => {
    if ((s.capacity[e.id]?.obs ?? 0) > 0 || (s.strength[e.id]?.obs ?? 0) > 0) return true;
    const cs = contributions(e);
    const w = cs.reduce((a, [, c]) => a + c, 0);
    return cs.reduce((a, [m, c]) => a + c * added[m], 0) / w < P.capacity.sessionCleanBelow && cs.reduce((a, [m, c]) => a + c * ready[m].fatigue, 0) / w < P.capacity.freshBelow;
  };
  let widened = 0;
  for (; !base.deloadActive && !beatUp; ) {
    const done = new Set(picks.map((c) => c.ex.ladderId));
    let bestC: Candidate | null = null;
    for (const e of extras) {
      // Every muscle it works hard (a half share or more) must still be short of its weekly target, so extra time never overshoots one.
      // On a day built around chosen muscles, those muscles decide: an exercise new to the user is allowed on them even though
      // its first set will teach nothing (the user asked for the volume), and a muscle it only brings along may pass its target.
      const fits = (x: Exercise) => focusMode || (learnable(x) && contributions(x).every(([m, c]) => c < 0.5 || needOf(m) > 0));
      if (done.has(e.ladderId) || !fits(e)) continue;
      const c = evaluate(-1, e);
      if (c && !done.has(c.ex.ladderId) && fits(c.ex) && better(c, bestC)) bestC = c;
    }
    const pick = bestC as Candidate | null;
    if (!pick || pick.score < P.planner.minScore) break;
    take(pick);
    if (!primaryRegions(pick.ex).every((m) => best.covered.includes(m))) widened++;
  }
  // Two or more exercises from outside the day's own muscles make it a full-body day, and it is named as one.
  const template = !focusMode && widened >= 2 && program.templates.some((t) => t.id === "full") ? "full" : best.t.id;

  const restLine = (m: Region) => {
    const h = ready[m].hoursToReady;
    return sore.has(m) ? `${REGION_NAMES[m]}: you said ${REGION_PLURAL[m] ? "they're" : "it's"} sore` : `${REGION_NAMES[m]} ${isAre(m)} ${STATE_WORDS[stateAt(m, ready[m].fatigue)]}` + (h > 0 ? `, ready in about ${Math.ceil(h)} h` : "");
  };
  if (picks.length === 0) {
    return rest(focusMode
      ? [`Nothing you chose can be trained right now. ${focus.map(restLine).join(". ")}`, ...(stateAt(focus[0]!, ready[focus[0]!].fatigue) === "fatigued" ? [] : ["Your equipment or weekly targets left no exercise for these muscles"])]
      : ["Nothing worth training right now: weekly targets met, or the muscles that need work are not ready"]);
  }

  // AMRAP on the last set of the first planned exercise whose last two sets share a weight (the AMRAP is compared with
  // the set before it, so a step-down or a capped "too light" set cannot carry it; see DECISIONS.md).
  const exercises = picks.map((c) => c.pr);
  const amrapDue = s.lastAmrapTs === null || now - s.lastAmrapTs >= P.calibration.rirBias.amrapIntervalDays * DAY_MS;
  const first = exercises.find((x) => x.sets.length >= 2 && x.loadFlag !== "too_light" && sameWeight(x.sets.at(-1)!.weightKg ?? null, x.sets.at(-2)!.weightKg ?? null));
  if (amrapDue && first) {
    first.sets[first.sets.length - 1] = { ...first.sets[first.sets.length - 1]!, isAmrap: true };
    first.reasons.push("Last set: go until you can't do another rep. It keeps your effort ratings honest.");
  }

  const trained = new Set(picks.flatMap((c) => primaryRegions(c.ex)));
  const skippedRegions = best.covered
    .filter((m) => !trained.has(m) && stateAt(m, ready[m].fatigue) !== "ready")
    .map((m) => ({ region: m, state: stateAt(m, ready[m].fatigue), hoursToReady: ready[m].hoursToReady }));
  const swapped = s.catalog.exercises
    .filter((e) => best.t.slots.includes(e.pattern) && hurts(e.id))
    .map((e) => `${e.name} left out: you said it hurt (back on the menu in ${Math.ceil((P.planner.painAvoidDays * DAY_MS - (now - s.feedback[e.id]!.painTs!)) / DAY_MS)} days)`);
  const reasons = [
    focusMode ? `Built around the muscles you chose: ${focus.map((m) => REGION_NAMES[m].toLowerCase()).join(", ")}` : `${label(template)} day: the best match for what's rested and what's behind this week`,
    ...swapped,
    ...skippedRegions.map((x) =>
      sore.has(x.region)
        ? `${REGION_NAMES[x.region]} skipped: you said ${REGION_PLURAL[x.region] ? "they're" : "it's"} sore`
        : `${REGION_NAMES[x.region]} skipped: ${STATE_WORDS[x.state]}, ready in about ${Math.ceil(x.hoursToReady)} h`,
    ),
  ];
  const short: Plan["short"] = budget - minutes < SHORT_SESSION_MIN ? null
    : base.deloadActive ? "deload" : beatUp ? "worn_out"
    : s.catalog.exercises.some((e) => extras.includes(e) && !learnable(e) && !picks.some((c) => c.ex.ladderId === e.ladderId)) && base.calibrating ? "learning"
    : "targets_met";
  if (short) reasons.push(`About ${Math.max(5, Math.round(minutes / 5) * 5)} of your ${Math.round(budget)} minutes: ${SHORT_WORDS[short]}`);
  return { kind: "workout", template, program: program.id, exercises, skippedRegions, estMinutes: minutes, reasons, focus: focusMode ? focus : null, short, ...base };
}
