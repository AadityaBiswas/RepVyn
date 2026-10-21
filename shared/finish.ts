// After a workout: what RepVyn learned from it, what grew since day 1, and what was worked most. Pure, so it is tested
// in tests/app.test.ts; the finish screens in ui/workout.tsx only lay these out.
import { prescribe, REGIONS, REGION_NAMES, strengthTrend, type EngineState, type Region } from "../src/engine";
import type { DoneSet, Run } from "./workout";
import { weightLabel } from "./model";

const DAY = 86_400_000;
type Units = "metric" | "imperial";
export type Dir = "up" | "same" | "down";

/** One exercise of today: what was done, and what RepVyn set for next time from it. */
export interface LearnedRow { id: string; name: string; region: Region | undefined; today: string; next: string; dir: Dir }

const amountOf = (x: { reps?: number; seconds?: number }) => x.seconds ?? x.reps ?? 0;
/**
 * "10 reps", "2 × 8 each side", "2 × 30 sec", "8, 7 reps", with " · 22 lb" for a weighted exercise.
 * `bare` drops the words ("10", "8, 7", "2 × 30 sec") for the Next time column, which sits beside the full version.
 */
function sets(list: readonly { reps?: number; seconds?: number; weightKg?: number }[], unilateral: boolean, units: Units, bare = false): string {
  const hold = list[0]?.seconds !== undefined;
  const n = list.map(amountOf);
  const kg = list[0]?.weightKg;
  const w = kg !== undefined ? ` · ${weightLabel(kg, units)}` : "";
  const word = hold ? " sec" : bare ? "" : unilateral ? " each side" : n.length === 1 && n[0] === 1 ? " rep" : " reps";
  if (n.length > 1 && n.every((v) => v === n[0])) return `${n.length} × ${n[0]}${hold ? " sec" : bare || !unilateral ? "" : " each side"}${w}`;
  return `${n.join(", ")}${word}${w}`;
}

/**
 * Every exercise done today, in order, with the prescription RepVyn now has for it (from the state with today's sets in it,
 * two days on, as the next time it comes up). A harder or easier exercise on its ladder shows as the move.
 */
export function learnedRows(after: EngineState, run: Run, now: number, units: Units = "metric"): LearnedRow[] {
  const byEx = new Map<string, DoneSet[]>();
  for (const d of run.done) byEx.set(d.exerciseId, [...(byEx.get(d.exerciseId) ?? []), d]);
  return [...byEx].map(([id, done]) => {
    const ex = after.catalog.byId[id]!;
    const region = REGIONS.find((m) => ex.contributions[m] === 1);
    const today = sets(done, ex.unilateral, units);
    let pr;
    try { pr = prescribe(after, id, done.length, now + 2 * DAY); } catch { pr = null; }
    if (!pr || !pr.sets.length) return { id, name: ex.name, region, today, next: sets(done, ex.unilateral, units, true), dir: "same" as Dir };
    if (pr.exerciseId !== id) {
      const to = after.catalog.byId[pr.exerciseId]!;
      const harder = (to.level ?? 0) > (ex.level ?? 0);
      return { id, name: ex.name, region, today, next: to.name, dir: (harder ? "up" : "down") as Dir };
    }
    const work = pr.sets.filter((x) => !x.isAmrap);
    const next = sets(work.length ? work : pr.sets, ex.unilateral, units, true);
    const a = (done.reduce((t, x) => t + amountOf(x), 0) / done.length) * (done[0]!.weightKg ?? 1);
    const b = (amountOf(pr.sets[0]!) + (pr.sets.length > done.length ? 1 : 0)) * (pr.sets[0]!.weightKg ?? 1);
    const dir: Dir = next === sets(done, ex.unilateral, units, true) ? "same" : b > a + 0.5 || pr.sets.length > done.length ? "up" : b < a - 0.5 || pr.sets.length < done.length ? "down" : "same";
    return { id, name: ex.name, region, today, next, dir };
  });
}

/** One plain sentence over the rows: how many go up, and why one gets easier. */
export function learnedLine(rows: readonly LearnedRow[]): string {
  const up = rows.filter((r) => r.dir === "up").length;
  const down = rows.filter((r) => r.dir === "down");
  const first = up === 0 ? "Next time stays the same, to build on today." : `${up === rows.length ? "Every exercise" : `${up} exercise${up === 1 ? "" : "s"}`} ${up === 1 || up === rows.length ? "goes" : "go"} up next time.`;
  if (!down.length) return first;
  return `${first} ${down.length === 1 ? `${down[0]!.name} was hard, so it gets easier.` : `${down.length} were hard, so they get easier.`}`;
}

/** The muscles today worked most: each muscle's share of every set, top first. `lines` is the one (or two, if close) to mark. */
export function mostWorked(s: EngineState, run: Run): { order: Region[]; lines: Region[] } {
  const sum: Partial<Record<Region, number>> = {};
  for (const d of run.done) {
    const c = s.catalog.byId[d.exerciseId]?.contributions ?? {};
    for (const m of REGIONS) if (c[m]) sum[m] = (sum[m] ?? 0) + c[m]!;
  }
  const order = REGIONS.filter((m) => sum[m]).sort((a, b) => sum[b]! - sum[a]!);
  const top = order[0] ? sum[order[0]]! : 0;
  return { order, lines: order.filter((m, i) => i < 2 && sum[m]! >= top * 0.9) };
}

/** One muscle that grew since day 1: the % and the exercise numbers that show it. */
export interface GrowthRow { region: Region; name: string; pct: number; how: string }
const GROUP: Partial<Record<Region, string>> = { front_delt: "Shoulders", side_rear_delt: "Shoulders", upper_back: "Upper back", lower_back: "Lower back" };
export const muscleName = (m: Region) => GROUP[m] ?? REGION_NAMES[m];

/**
 * Growth since day 1, per muscle: the exercise that works it hardest with at least a week between its first and latest
 * clean measurement, compared first to latest. Only real gains, biggest first. Empty in the first week.
 */
export function growth(s: EngineState, units: Units = "metric", limit = 3): GrowthRow[] {
  const best = new Map<string, GrowthRow>();
  for (const id of Object.keys(s.exposures)) {
    const ex = s.catalog.byId[id];
    if (!ex) continue;
    const t = strengthTrend(s, id);
    if (t.length < 2 || t.at(-1)!.ts - t[0]!.ts < 6 * DAY) continue;
    const [from, to] = [t[0]!.max, Math.max(...t.slice(1).map((x) => x.max))];
    const pct = Math.round((to / from - 1) * 100);
    if (pct < 3) continue;
    const show = (m: number) => (ex.isHold ? `${Math.round(m * s.params.hold.secondsPerRep)} sec` : ex.weighted ? weightLabel(m, units) : `${Math.round(m)}`);
    const unit = ex.isHold || ex.weighted ? "" : " reps";
    for (const m of REGIONS.filter((r) => ex.contributions[r] === 1)) {
      const key = muscleName(m);
      if ((best.get(key)?.pct ?? -1) >= pct) continue;
      best.set(key, { region: m, name: key, pct, how: `${ex.name} ${show(from)} → ${show(to)}${unit}` });
    }
  }
  return [...best.values()].sort((a, b) => b.pct - a.pct).slice(0, limit);
}
