// What the screens show, worked out from the engine state. Pure: no DOM, no storage, so it is unit-tested.
import {
  MUSCLES, REGIONS, REGION_NAMES, REGION_PLURAL, currentLevels, leastUsedMuscles, levelName, muscleSummary, planCalories, planSession, readiness,
  scoreObservation, sessionCalories, strengthTrend, targetRir, typicalSessionLoad, weeklyNeed, weeklyTarget,
  type DayIntensity, type EngineEvent, type Experience, type EngineState, type Equipment, type Muscle, type Plan, type PlannedExercise, type Program, type Region,
} from "../../src/engine";

export const H = 3_600_000;
export const DAY = 24 * H;

// ---------- local days ----------

/** Local midnight of the day containing ts. */
export function dayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
/** Local midnight `n` days after the day containing ts (DST safe). */
export function addDays(ts: number, n: number): number {
  const d = new Date(dayStart(ts));
  d.setDate(d.getDate() + n);
  return d.getTime();
}
/** Monday 00:00 of the week containing ts. */
export function weekStart(ts: number): number {
  const dow = (new Date(ts).getDay() + 6) % 7;
  return addDays(ts, -dow);
}
/** Whole local days from a to b. */
export const daysBetween = (a: number, b: number): number => Math.round((dayStart(b) - dayStart(a)) / DAY);

// ---------- words ----------

const cap = (x: string) => x[0]!.toUpperCase() + x.slice(1);
const join = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
/** Groups that read as one word when every member is in the list. */
const AREAS: [string, Region[]][] = [
  ["legs", ["quads", "glutes", "hamstrings", "calves"]],
  ["shoulders", ["front_delt", "side_rear_delt"]],
  ["arms", ["biceps", "triceps"]],
  ["core", ["abs", "lower_back"]],
];
/** "legs and chest", collapsing whole areas. Second value: whether it takes a plural verb. */
export function regionWords(ms: readonly Region[]): [string, boolean] {
  const left = new Set(ms);
  const out: string[] = [];
  for (const [area, rs] of AREAS) {
    if (rs.every((m) => left.has(m))) {
      out.push(area);
      rs.forEach((m) => left.delete(m));
    }
  }
  for (const m of REGIONS) if (left.has(m)) out.push(REGION_NAMES[m].toLowerCase());
  const plural = ms.length === 1 ? REGION_PLURAL[ms[0]!] : !(out.length === 1 && out[0] === "core");
  return [join(out), plural];
}

/** "Ready tonight", "Ready tomorrow", "Ready Friday". */
export function readyWhen(hours: number, now: number): string {
  if (hours <= 0) return "Ready";
  const at = now + hours * H;
  const days = daysBetween(now, at);
  if (days === 0) return new Date(at).getHours() >= 17 ? "Ready tonight" : "Ready later today";
  if (days === 1) return "Ready tomorrow";
  return `Ready ${new Date(at).toLocaleDateString("en-GB", { weekday: "long" })}`;
}

// ---------- the plan ----------

const TEMPLATE_TITLES: Record<string, string> = {
  full: "Full body", upper: "Upper body", lower: "Lower body", push: "Push", pull: "Pull", legs: "Legs", glutes_hams: "Glutes and hamstrings",
};
export const planTitle = (plan: Plan): string =>
  plan.kind === "rest" ? "Rest day"
    : plan.focus?.length ? cap(regionWords(plan.focus)[0])
    : TEMPLATE_TITLES[plan.template ?? ""] ?? cap((plan.template ?? "Workout").replaceAll("_", " "));

/** Muscles an exercise targets (contribution 1). */
export const primary = (s: EngineState, exerciseId: string): Region[] =>
  REGIONS.filter((m) => s.catalog.byId[exerciseId]?.contributions[m] === 1);
/** Which half of the body a one-sided day belongs to; a full-body day is in neither. */
const HALF: Record<string, "upper" | "lower"> = { upper: "upper", push: "upper", pull: "upper", lower: "lower", legs: "lower", glutes_hams: "lower" };
/** A legs day: the card and the workout page then show the legs alone. */
export const isLegsDay = (ms: readonly Region[]): boolean => ms.some((r) => LOWER.includes(r)) && ms.every((r) => LOWER.includes(r) || CORE.includes(r));
/** How hard an exercise works each muscle: 1 high, 0.5 moderate, 0.25 light. The catalog's stress shares, plus the muscles it only lists as helping, at light. */
export function activation(s: EngineState, exerciseId: string): Partial<Record<Muscle, number>> {
  const x = s.catalog.byId[exerciseId];
  if (!x) return {};
  return { ...Object.fromEntries(x.alsoUses.map((m) => [m, 0.25])), ...x.contributions };
}
/** The same for a whole workout: each muscle at the most any one exercise asks of it. */
export function planActivation(s: EngineState, plan: Plan): Partial<Record<Muscle, number>> {
  const out: Partial<Record<Muscle, number>> = {};
  for (const x of plan.exercises) {
    const a = activation(s, x.exerciseId);
    for (const m of MUSCLES) if ((a[m] ?? 0) > (out[m] ?? 0)) out[m] = a[m]!;
  }
  return out;
}
/**
 * What is white on today's card, by half of the body: a workout that targets anything above the waist lights the whole upper body,
 * anything below it the whole lower body, so a full-body day lights both. The abs belong to the upper body; on a legs day the core only helps.
 */
/** `template`: the kind of day the planner chose. An upper-body day stays an upper-body card even when it carries one leg exercise, and the other way round. */
export function planValues(ms: readonly Region[], template?: string | null): Partial<Record<Muscle, number>> {
  const out: Partial<Record<Muscle, number>> = {};
  const half = HALF[template ?? ""];
  if (half) ms = ms.filter((r) => CORE.includes(r) || (half === "upper" ? UPPER : LOWER).includes(r));
  if (ms.some((r) => UPPER.includes(r))) for (const m of [...UPPER, "forearms" as const, "abs" as const]) out[m] = 1;
  if (ms.some((r) => LOWER.includes(r))) for (const m of LOWER) out[m] = 1;
  for (const m of ms) if (CORE.includes(m)) out[m] ??= isLegsDay(ms) ? 0.5 : 1;
  return out;
}
export const planRegions = (s: EngineState, plan: Plan): Region[] =>
  REGIONS.filter((m) => plan.exercises.some((x) => primary(s, x.exerciseId).includes(m)));

/** One sentence on why today's workout: what is recovered and what rests. */
export function planWhy(s: EngineState, plan: Plan, now: number): string {
  if (plan.kind === "rest") return plan.reasons[0] ? `${plan.reasons[0].replace(/\.$/, "")}.` : "Your body needs a day off.";
  if (!s.sessions.length) return "Your first workout. Every set teaches RepVyn what you can do.";
  const r = readiness(s, now);
  const trained = planRegions(s, plan);
  const fresh = trained.filter((m) => r[m].state === "ready");
  const resting = REGIONS.filter((m) => !trained.includes(m) && r[m].state !== "ready").sort((a, b) => r[b].load - r[a].load).slice(0, 3);
  const parts: string[] = [];
  if (fresh.length) {
    const [w, pl] = regionWords(fresh);
    parts.push(`Your ${w} ${pl ? "are" : "is"} fully recovered.`);
  }
  if (resting.length) parts.push(`${cap(regionWords(resting)[0])} rest today.`);
  return parts.join(" ") || "Everything is ready to train.";
}

/**
 * `region`: the muscle the exercise is pictured by. `muscles`: what it works, in words. `why`: the engine's first reason for it.
 * `kcal`: active calories for its planned sets, or null without body weight.
 */
export interface PlanRow { id: string; name: string; detail: string; region: Region | undefined; levels: Partial<Record<Muscle, number>>; muscles: string; why: string; kcal: number | null }

/** "3 sets · 10 reps each side · 8 kg" from the first regular set. */
export function exerciseDetail(s: EngineState, x: PlannedExercise, units: "metric" | "imperial" = "metric"): string {
  const ex = s.catalog.byId[x.exerciseId]!;
  const set = x.sets.find((y) => !y.isAmrap) ?? x.sets[0]!;
  const n = x.sets.length;
  const amount = set.seconds !== undefined ? `${set.seconds} sec` : `${set.reps} rep${set.reps === 1 ? "" : "s"}${ex.unilateral ? " each side" : ""}`;
  const kg = set.weightKg !== undefined ? ` · ${weightLabel(set.weightKg, units)}` : "";
  return `${n} set${n === 1 ? "" : "s"} · ${amount}${kg}`;
}
/** One step of the body-weight stepper in the shown unit (1 kg or 1 lb), kept in kg and clamped to 30–200 kg. */
export function nudgeWeight(kg: number, units: "metric" | "imperial", dir: 1 | -1): number {
  const next = units === "metric" ? Math.round(kg) + dir : (Math.round(kg * 2.2046) + dir) / 2.2046;
  return Math.min(200, Math.max(30, Math.round(next * 100) / 100));
}
export const weightLabel = (kg: number, units: "metric" | "imperial"): string =>
  units === "imperial" ? `${Math.round(kg * 2.2046)} lb` : `${Math.round(kg * 10) / 10} kg`;

export function planRows(s: EngineState, plan: Plan, units: "metric" | "imperial" = "metric"): PlanRow[] {
  const kcal = new Map((planCalories(s, plan)?.byExercise ?? []).map((x) => [x.exerciseId, Math.round(x.kcal)]));
  return plan.exercises.map((x) => ({
    id: x.exerciseId, name: s.catalog.byId[x.exerciseId]!.name, detail: exerciseDetail(s, x, units), region: primary(s, x.exerciseId)[0], levels: activation(s, x.exerciseId),
    muscles: muscleSummary(s, x.exerciseId), why: x.reasons[0] ?? "", kcal: kcal.get(x.exerciseId) ?? null,
  }));
}

/** `focus`: muscles chosen for today (the plan is built around them). `skip`: exercises swapped out of today's plan. */
export interface PlanChoice { minutes: number; intensity: DayIntensity; equipment: Equipment[]; focus?: Region[]; skip?: string[] }
export const makePlan = (s: EngineState, now: number, c: PlanChoice): Plan =>
  planSession(s, {
    now, minutes: c.minutes, intensity: c.intensity, overrideEquipment: c.equipment,
    ...(c.focus?.length ? { focus: c.focus } : {}), ...(c.skip?.length ? { excludeExercises: c.skip } : {}),
  });

/** Muscle groups to choose from for today, in the order people scan a body: top to bottom. */
export const FOCUS_GROUPS: [string, Region[]][] = [
  ["Chest", ["chest"]], ["Back", ["upper_back"]], ["Shoulders", ["front_delt", "side_rear_delt"]], ["Biceps", ["biceps"]], ["Triceps", ["triceps"]],
  ["Abs", ["abs"]], ["Lower back", ["lower_back"]], ["Glutes", ["glutes"]], ["Quads", ["quads"]], ["Hamstrings", ["hamstrings"]], ["Calves", ["calves"]],
];
/** "Least trained lately: biceps and calves", from the engine's least-used muscles; null when nothing is behind. */
export function leastTrainedLine(s: EngineState, now: number): string | null {
  if (!s.profile) return null;
  const ms = leastUsedMuscles(s, now, 2);
  return ms.length ? `Least trained lately: ${regionWords(ms)[0]}` : null;
}

// ---------- work scale ----------

/** Rest, light, medium, hard: one scale for days, muscles and programs. */
/** Light, medium and hard work, and the ink that reads on each. The values live in app/index.html, one set per theme. */
export const WORK = ["var(--w1)", "var(--w2)", "var(--w3)"] as const;
export const WORK_INK = ["var(--on-w1)", "var(--on-w2)", "var(--on-w3)"] as const;
/** More work is further from the ground: darker on the light theme, brighter on the dark one. */
const REDS: Record<"light" | "dark", [number, string][]> = {
  light: [[0, "#F7CDD2"], [0.5, "#E8596B"], [0.75, "#D91E36"], [1, "#7A0E1E"]],
  dark: [[0, "#F7CDD2"], [0.5, "#E8596B"], [0.75, "#E22A40"], [1, "#7A0E1E"]],
};
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export function red(v: number, theme: "light" | "dark" = "light"): string {
  const x = Math.max(0, Math.min(1, v));
  const stops = REDS[theme];
  for (let i = 1; i < stops.length; i++) {
    const [b, cb] = stops[i]!;
    if (x <= b) {
      const [a, ca] = stops[i - 1]!;
      const k = (x - a) / (b - a);
      const c = rgb(ca).map((v0, j) => Math.round(v0 + (rgb(cb)[j]! - v0) * k));
      return `#${c.map((v1) => v1.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
    }
  }
  return stops[stops.length - 1]![1];
}

/** Sessions that started on the local day `day` (midnight). */
const sessionsOn = (s: EngineState, day: number) => s.sessions.filter((x) => x.start >= day && x.start < addDays(day, 1) && x.log.length > 0);

/** 0 rest, 1 light, 2 medium, 3 hard: the day's work against a typical session. */
export function dayWork(s: EngineState, day: number, now: number): 0 | 1 | 2 | 3 {
  const done = sessionsOn(s, day);
  if (!done.length) return 0;
  const ratio = done.reduce((a, x) => a + x.fatigueTotal, 0) / typicalSessionLoad(s, now);
  return ratio < 0.75 ? 1 : ratio < 1.25 ? 2 : 3;
}

// ---------- Today ----------

export type DayKind = "done" | "rest" | "today" | "todayDone" | "upcoming" | "before";
export interface StripDay { letter: string; date: number; day: number; kind: DayKind; work: 0 | 1 | 2 | 3; label: string }

/** `since`: when the user started; earlier days are plain, not rest days. */
export function weekStrip(s: EngineState, now: number, since = 0): StripDay[] {
  const mon = weekStart(now);
  const today = dayStart(now);
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(mon, i);
    const d = new Date(day);
    const work = day <= today ? dayWork(s, day, now) : 0;
    const kind: DayKind = day === today ? (work ? "todayDone" : "today") : day > today ? "upcoming" : work ? "done" : day < dayStart(since) ? "before" : "rest";
    const name = d.toLocaleDateString("en-GB", { weekday: "long" });
    const label = `${name}, ${kind === "done" || kind === "todayDone" ? "workout done" : kind === "rest" ? "rest day" : kind === "today" ? "today" : kind === "before" ? "before you started" : "upcoming"}`;
    return { letter: name[0]!, date: d.getDate(), day, kind, work, label };
  });
}

export const trainedToday = (s: EngineState, now: number) => sessionsOn(s, dayStart(now));

/** Program week, 1..12, from when the program was started. */
export const programWeek = (start: number | null, now: number): number =>
  start === null ? 1 : Math.min(12, Math.max(1, Math.floor(daysBetween(start, now) / 7) + 1));

/** Ask how the user feels only when something was trained recently and they have not answered today. */
export function needsCheckin(s: EngineState, now: number, windowH = 96): boolean {
  if (s.checkin && dayStart(s.checkin.ts) === dayStart(now)) return false;
  if (trainedToday(s, now).length) return false;
  return REGIONS.some((m) => {
    const t = s.soreness.lastTs[m];
    return t !== null && now - t <= windowH * H;
  });
}

// ---------- Body ----------

export interface RecoveringRow { region: Region; name: string; color: string; when: string; load: number }
/** Region shade on the Body figure: grey when ready, else red by how used. */
export function bodyValues(s: EngineState, now: number): Partial<Record<Region, number>> {
  const r = readiness(s, now);
  return Object.fromEntries(REGIONS.filter((m) => r[m].state !== "ready").map((m) => [m, Math.max(0.05, Math.min(1, r[m].load))]));
}
/** `at`: the moment the figure shows, when the user has dragged the body forward; "ready when" is always told from now. */
export function recovering(s: EngineState, now: number, theme: "light" | "dark" = "light", at = now): RecoveringRow[] {
  const r = readiness(s, now);
  const v = bodyValues(s, at);
  return REGIONS.filter((m) => v[m] !== undefined)
    .sort((a, b) => r[b].load - r[a].load)
    .map((m) => ({ region: m, name: REGION_NAMES[m], color: red(v[m]!, theme), when: readyWhen(r[m].hoursToReady, now), load: r[m].load }));
}

/**
 * How strained each muscle is at `at`, 0..1: 1 is what a full, normal session leaves in it, and it falls to 0 the moment the
 * muscle is ready. Ready muscles are left out.
 */
export function strain(s: EngineState, at: number): Partial<Record<Region, number>> {
  const r = readiness(s, at);
  const floor = s.params.readiness.readyBelow / s.params.tolerance.ref;
  return Object.fromEntries(REGIONS.filter((m) => r[m].state !== "ready").map((m) => [m, Math.max(0.02, Math.min(1, (r[m].load - floor) / (1 - floor)))]));
}
/** 2 high (75% and up), 1 medium (30 to 75%), 0 low (under 30%). */
export const strainBand = (v: number): 0 | 1 | 2 => (v >= 0.75 ? 2 : v >= 0.3 ? 1 : 0);
/** The three strain reds, the same as the figure's level reds (figure.ts) and the workout-intensity reds (--w1..--w3). */
export const STRAIN = { light: ["#EE8794", "#D91E36", "#7A0E1E"], dark: ["#EE8794", "#E22A40", "#7A0E1E"] } as const;
export const strainColour = (v: number, theme: "light" | "dark" = "light"): string => STRAIN[theme][strainBand(v)];
/** Strain as values for a "level" figure, which paints 1, 0.5 and below in the same three reds. */
export const strainFigure = (st: Partial<Record<Region, number>>): Partial<Record<Region, number>> =>
  Object.fromEntries(Object.entries(st).map(([m, v]) => [m, [0.2, 0.5, 1][strainBand(v!)]]));

/** "Today, 3 pm", "Tonight, 11 pm", "Mon, 9 am": when a muscle is ready, to the hour. */
export function readyAt(hours: number, now: number): string {
  const d = new Date(Math.ceil((now + hours * H) / H) * H);
  const h = d.getHours();
  const time = `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;
  const days = daysBetween(now, d.getTime());
  const day = days === 0 ? (h >= 18 ? "Tonight" : "Today") : d.toLocaleDateString("en-GB", { weekday: "short" });
  return `${day}, ${time}`;
}

export interface StrainRow { region: Region; name: string; hours: number; strain: number }
/** Every muscle recovering now, most strained first, with its strain at `at` (0 once it is ready by then). */
export function strainRows(s: EngineState, now: number, at = now): StrainRow[] {
  const r = readiness(s, now);
  const st = strain(s, at);
  return REGIONS.filter((m) => r[m].state !== "ready")
    .sort((a, b) => r[b].load - r[a].load)
    .map((m) => ({ region: m, name: REGION_NAMES[m], hours: r[m].hoursToReady, strain: st[m] ?? 0 }));
}

// ---------- Progress ----------

/** Days this week with a workout, and how hard each was. */
export const weekWorkouts = (s: EngineState, now: number): number => weekStrip(s, now).filter((d) => d.work > 0).length;

export interface PlanWeeks { weeks: { work: (0 | 1 | 2 | 3)[]; before: boolean }[]; run: number }
/**
 * The last `n` weeks, oldest first, each as its workout days' intensity in order (up to `target`, padded with 0s), and `run`:
 * weeks on plan (at least `target` workout days) in a row, back from last week, plus this week once it is on plan.
 */
export function planWeeks(s: EngineState, now: number, target: number, since = 0, n = 8): PlanWeeks {
  const mon = weekStart(now);
  const today = dayStart(now);
  const days = (wk: number) => Array.from({ length: 7 }, (_, i) => addDays(wk, i)).filter((d) => d <= today).map((d) => dayWork(s, d, now)).filter((w) => w > 0);
  const weeks = Array.from({ length: n }, (_, i) => {
    const wk = addDays(mon, -7 * (n - 1 - i));
    const w = days(wk).slice(0, target);
    return { work: [...w, ...Array<0>(target - w.length).fill(0)], before: addDays(wk, 7) <= dayStart(since) };
  });
  let run = days(mon).length >= target ? 1 : 0;
  for (let wk = addDays(mon, -7); wk >= weekStart(since || wk) && days(wk).length >= target; wk = addDays(wk, -7)) run++;
  return { weeks, run };
}

/** Consecutive weeks with a workout, counting back from this week (or last week, while this one has none yet). */
export function streakWeeks(s: EngineState, now: number): number {
  const has = (mon: number) => s.sessions.some((x) => x.log.length > 0 && x.start >= mon && x.start < addDays(mon, 7));
  let mon = weekStart(now);
  if (!has(mon)) mon = addDays(mon, -7);
  let n = 0;
  while (has(mon)) {
    n++;
    mon = addDays(mon, -7);
  }
  return n;
}

export interface GridCell { work: 0 | 1 | 2 | 3; today: boolean; future: boolean; before: boolean }
export interface ActivityGrid { months: string[]; cells: GridCell[] }
/** One square per day, weeks as columns (Monday first), ending with this week. */
/** `since` is when the user started: days before it are not drawn, so a new user's grid is not a wall of rest days. */
export function activity(s: EngineState, now: number, weeks = 20, since = 0): ActivityGrid {
  const first = addDays(weekStart(now), -7 * (weeks - 1));
  const today = dayStart(now);
  const months: string[] = [];
  const cells: GridCell[] = [];
  let lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    const mon = addDays(first, 7 * w);
    const m = new Date(addDays(mon, 6)).getMonth();
    months.push(m !== lastMonth ? new Date(addDays(mon, 6)).toLocaleDateString("en-US", { month: "short" }) : "");
    lastMonth = m;
    for (let d = 0; d < 7; d++) {
      const day = addDays(mon, d);
      const work = day <= today ? dayWork(s, day, now) : 0;
      cells.push({ work, today: day === today, future: day > today, before: !work && day < dayStart(since) });
    }
  }
  return { months, cells };
}

export interface WeekRow { name: string; done: number; target: number; color: string | null }
/** Hard sets this week against target. Untrained regions of one area fold into one row ("Legs"). */
export function weekMuscles(s: EngineState, now: number, theme: "light" | "dark" = "light"): { rows: WeekRow[]; values: Partial<Record<Region, number>> } {
  const need = weeklyNeed(s, now);
  const frac = (m: Region) => need[m].done / need[m].target;
  const top = Math.max(...REGIONS.map(frac));
  const values = Object.fromEntries(REGIONS.filter((m) => need[m].done > 0.05).map((m) => [m, frac(m) / top]));
  const rows: WeekRow[] = [];
  const folded = new Set<Region>();
  for (const [area, rs] of AREAS) {
    if (rs.every((m) => values[m] === undefined)) {
      rows.push({ name: cap(area), done: 0, target: Math.round(rs.reduce((a, m) => a + need[m].target, 0)), color: null });
      rs.forEach((m) => folded.add(m));
    }
  }
  for (const m of REGIONS) {
    if (folded.has(m)) continue;
    const v = values[m];
    rows.push({ name: REGION_NAMES[m], done: Math.round(need[m].done), target: Math.round(need[m].target), color: v === undefined ? null : red(v, theme) });
  }
  rows.sort((a, b) => b.done / b.target - a.done / a.target);
  return { rows, values };
}

export interface StrengthRow { name: string; from: number; to: number; unit: string; delta: number; points: number[] }
/** Exercises measured at least twice: first and latest best, newest first. */
export function strengthRows(s: EngineState, limit = 5, units: "metric" | "imperial" = "metric"): StrengthRow[] {
  const P = s.params;
  return Object.keys(s.exposures)
    .map((id) => {
      const ex = s.catalog.byId[id]!;
      const t = strengthTrend(s, id);
      if (t.length < 2) return null;
      const conv = (m: number) => Math.round(ex.isHold ? m * P.hold.secondsPerRep : ex.weighted && units === "imperial" ? m * 2.2046 : m);
      const points = t.slice(-7).map((x) => conv(x.max));
      const from = conv(t[0]!.max);
      const to = conv(t.at(-1)!.max);
      const unit = ex.weighted ? (units === "imperial" ? "lb" : "kg") : ex.isHold ? "sec" : ex.unilateral ? "reps each side" : "reps";
      return { name: ex.name, from, to, unit, delta: to - from, points, last: t.at(-1)!.ts };
    })
    .filter((x): x is StrengthRow & { last: number } => x !== null)
    .sort((a, b) => b.last - a.last)
    .slice(0, limit)
    .map(({ last: _, ...row }) => row);
}

export interface StartRow { name: string; value: number; unit: string }
/** Exercises done once so far: the first best set, the starting point a trend will grow from. */
export function startingPoints(s: EngineState, limit = 5, units: "metric" | "imperial" = "metric"): StartRow[] {
  const P = s.params;
  return Object.keys(s.exposures)
    .map((id) => {
      const ex = s.catalog.byId[id]!;
      const t = strengthTrend(s, id);
      if (t.length !== 1) return null;
      const m = t[0]!.max;
      const value = Math.round(ex.isHold ? m * P.hold.secondsPerRep : ex.weighted && units === "imperial" ? m * 2.2046 : m);
      const unit = ex.weighted ? (units === "imperial" ? "lb" : "kg") : ex.isHold ? "sec" : ex.unilateral ? "reps each side" : "reps";
      return { name: ex.name, value, unit, ts: t[0]!.ts };
    })
    .filter((x): x is StartRow & { ts: number } => x !== null)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit)
    .map(({ ts: _, ...row }) => row);
}

/** SVG path for a 64 × 28 sparkline. */
export function sparkPath(points: number[]): { d: string; end: [number, number] } {
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const xy = points.map((v, i): [number, number] => [
    2 + (60 * i) / Math.max(1, points.length - 1),
    hi === lo ? 14 : 25 - (22 * (v - lo)) / (hi - lo),
  ]);
  return { d: xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" "), end: xy.at(-1)! };
}

// ---------- programs ----------

export const UPPER: Region[] = ["chest", "upper_back", "front_delt", "side_rear_delt", "biceps", "triceps"];
export const LOWER: Region[] = ["quads", "glutes", "hamstrings", "calves"];
export const CORE: Region[] = ["abs", "lower_back"];
const emph = (p: Program, ms: Region[]) => ms.reduce((a, m) => a + (p.emphasis[m] ?? 1), 0) / ms.length;
export interface Meter { label: string; frac: number; color: string; word: string }
export function programMeters(p: Program): Meter[] {
  return ([["Upper body", UPPER], ["Lower body", LOWER], ["Core", CORE]] as const).map(([label, ms]) => {
    const f = emph(p, [...ms]);
    const more = f > 1.05;
    const less = f < 0.95;
    return { label, frac: Math.min(1, f / 1.4), color: more ? WORK[2] : less ? WORK[0] : WORK[1], word: more ? "More" : less ? "Maintenance" : "Standard" };
  });
}
/** Figure shade per region for a program: 0.6 is standard, darker where it trains more. */
export const programValues = (p: Program): Partial<Record<Region, number>> =>
  Object.fromEntries(REGIONS.map((m) => [m, Math.max(0.15, Math.min(0.95, 0.6 + ((p.emphasis[m] ?? 1) - 1) * 1.2))]));

// ---------- the one program ----------

/** The only program for now: Balanced, shown as the 12-week program. */
export const PROGRAM_ID = "balanced";
export const PROGRAM_NAME = "12-week program";

// ---------- starting level (onboarding) ----------

/** The two questions, as range tiles; each answer is a rep count inside its range, scored on the catalog norms. */
export const LEVEL_ASKS = {
  push: { exercise: "push_up_standard", label: "Push-ups in a row", note: "Full push-ups, chest to the floor.", answers: [["None yet", 1], ["1–9", 6], ["10–24", 16], ["25+", 32]] },
  squat: { exercise: "squat_bodyweight", label: "Squats in a row", note: "Body weight, thighs to parallel.", answers: [["Under 15", 10], ["15–29", 22], ["30–49", 38], ["50+", 55]] },
} as const satisfies Record<string, { exercise: string; label: string; note: string; answers: readonly (readonly [string, number])[] }>;
export type LevelAsk = keyof typeof LEVEL_ASKS;

/**
 * A starting level score (0 beginner .. 2 advanced) from the answers: each answer is placed on that exercise's norms
 * (scoreObservation, as calibration does with a real set), weighted by how much the norms tell apart. Null with no answer.
 */
export function levelFromAnswers(s: EngineState, answers: Partial<Record<LevelAsk, number>>): { score: number; experience: Experience } | null {
  const obs = (Object.keys(LEVEL_ASKS) as LevelAsk[]).flatMap((k) => {
    const i = answers[k];
    const norm = s.catalog.byId[LEVEL_ASKS[k].exercise]?.defaultM;
    if (i === undefined || !norm) return [];
    return [scoreObservation(norm, LEVEL_ASKS[k].answers[i]![1])];
  });
  const w = obs.reduce((a, o) => a + o.weight, 0);
  if (!w) return null;
  const score = obs.reduce((a, o) => a + o.score * o.weight, 0) / w;
  return { score, experience: levelName(score) };
}

export interface LevelRow { label: string; value: string }
/** What the level changes on day one, read from the engine: the first push-up and squat, effort, weekly sets. */
export function startingPoint(s: EngineState, now: number): LevelRow[] {
  const owned = new Set<string>(s.profile?.equipment ?? []);
  const first = (ladder: string) => {
    const cands = s.catalog.exercises.filter((e) => e.ladderId === ladder && e.equipment.every((t) => owned.has(t)));
    return cands.length ? currentLevels(s, cands, now)[0]?.name ?? null : null;
  };
  const rir = targetRir(s, now);
  const sets = Math.round(weeklyTarget(s, "chest"));
  return [
    { label: "First push-up", value: first("push_up") ?? "Push-up" },
    { label: "First squat", value: first("squat") ?? "Squat" },
    { label: "Each set ends", value: rir === 0 ? "At failure" : `${rir} rep${rir === 1 ? "" : "s"} short of failure` },
    { label: "Sets per muscle", value: `${sets} a week` },
  ];
}

// ---------- a finished workout ----------

export interface DoneExercise { id: string; name: string; region: Region; sets: string[]; total: string }
export interface DoneDay { exercises: DoneExercise[]; regions: Region[]; minutes: number; sets: number; reps: number; kcal: number | null }

/** Everything logged on one day, exercise by exercise in the order done: each set's reps (and weight), for the workout view. */
export function doneDay(s: EngineState, events: readonly EngineEvent[], day: number, units: "metric" | "imperial" = "metric"): DoneDay | null {
  const sessions = sessionsOn(s, day);
  if (!sessions.length) return null;
  const keys = new Set(sessions.map((x) => x.key));
  const logged = events.filter((e) => e.type === "set_logged" && keys.has((e.payload as { sessionId: string }).sessionId) && !(e.payload as { isWarmup: boolean }).isWarmup)
    .map((e) => e.payload as { exerciseId: string; reps?: number; holdSeconds?: number; weightKg?: number });
  const by = new Map<string, typeof logged>();
  for (const p of logged) by.set(p.exerciseId, [...(by.get(p.exerciseId) ?? []), p]);
  const kg = (w: number) => (units === "metric" ? `${+w.toFixed(1)} kg` : `${Math.round(w * 2.2046)} lb`);
  const exercises = [...by].flatMap(([id, ps]) => {
    const ex = s.catalog.byId[id];
    if (!ex) return [];
    const region = primary(s, id)[0] ?? "chest";
    const sets = ps.map((p) => (p.holdSeconds !== undefined ? `${p.holdSeconds}s` : p.weightKg ? `${kg(p.weightKg)} × ${p.reps}` : String(p.reps ?? 0)));
    const reps = ps.reduce((a, p) => a + (p.reps ?? 0), 0);
    const secs = ps.reduce((a, p) => a + (p.holdSeconds ?? 0), 0);
    return [{ id, name: ex.name, region, sets, total: secs && !reps ? `${secs}s held` : `${reps} rep${reps === 1 ? "" : "s"}` }];
  });
  const regions = REGIONS.filter((m) => exercises.some((x) => s.catalog.byId[x.id]?.contributions[m] === 1));
  const minutes = Math.max(1, Math.round(sessions.reduce((a, x) => a + ((x.end ?? x.lastTs) - x.start), 0) / 60_000));
  const kcals = sessions.map((x) => sessionCalories(s, x)?.totalKcal ?? null);
  const kcal = kcals.every((k) => k === null) ? null : Math.round(kcals.reduce<number>((a, k) => a + (k ?? 0), 0));
  return { exercises, regions, minutes, sets: logged.length, reps: logged.reduce((a, p) => a + (p.reps ?? 0), 0), kcal };
}
