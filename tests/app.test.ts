// The app's screen logic (app/src): what Today, Progress and the workout show, driven through the real engine replay.
import { describe, expect, it } from "vitest";
import { activation, activity, addDays, nudgeWeight, startingPoints, strengthRows, dayStart, exerciseDetail, isLegsDay, makePlan, needsCheckin, planRows, planValues, planWhy, programWeek, recovering, red, regionWords, streakWeeks, trainedToday, weekStart, weekStrip } from "../app/src/model";
import { DEFAULT_SETTINGS, append, engineState, fresh, load, setFeedback, unitsFor, withProfile, type Saved } from "../app/src/store";
import { doneDay, levelFromAnswers, planWeeks, readyAt, startingPoint, strain, strainBand, strainRows } from "../app/src/model";
import { growth, learnedLine, learnedRows, mostWorked } from "../app/src/finish";
import { REST_SECONDS, answer, asksLeft, fromPlan, isAllOut, nextSet, setDone, start, tick, toEvents, type Run, type RunExercise } from "../app/src/workout";

const H = 3_600_000;
const MON = new Date(2026, 9, 5, 18).getTime(); // a Monday, 18:00 local

function user(now = MON): Saved {
  const s = fresh(now);
  return withProfile({ ...s, onboarded: true, programStart: now, settings: { ...DEFAULT_SETTINGS, equipment: ["dumbbell"] } }, now);
}

/** Plays a whole workout as the screen would: every set at its target, answering "2" whenever asked. */
function playWorkout(s: Saved, now: number): { saved: Saved; run: Run; asked: number[] } {
  const state = engineState(s);
  const plan = makePlan(state, now, { minutes: 30, intensity: "normal", equipment: s.settings.equipment });
  let r = start(fromPlan(state, plan), now);
  let t = now;
  const asked: number[] = [];
  while (r.phase !== "done") {
    t += 40_000;
    r = setDone(r, t);
    if (asksLeft(r)) {
      asked.push(r.done.length - 1);
      r = answer(r, "2");
    }
    if (r.phase === "ask") r = { ...r, phase: "done" };
    else if (r.phase === "rest") r = nextSet(r);
  }
  return { saved: append(s, toEvents(r, crypto.randomUUID(), t + 1000)), run: r, asked };
}

describe("words", () => {
  it("folds whole areas and picks the verb", () => {
    expect(regionWords(["quads", "glutes", "hamstrings", "calves", "chest"])).toEqual(["legs and chest", true]);
    expect(regionWords(["abs", "lower_back"])).toEqual(["core", false]);
    expect(regionWords(["biceps"])[1]).toBe(true);
  });
  it("says 1 rep, not 1 reps", () => {
    const s = engineState(user());
    const plan = makePlan(s, MON, { minutes: 30, intensity: "normal", equipment: ["dumbbell"] });
    const x = plan.exercises.find((e) => e.sets[0]?.reps !== undefined)!;
    const one = { ...x, sets: x.sets.map((y) => ({ ...y, reps: 1 })) };
    expect(exerciseDetail(s, one)).toMatch(/\b1 rep\b/);
  });
});

describe("Today", () => {
  it("first workout gets its own sentence", () => {
    const s = engineState(user());
    const plan = makePlan(s, MON, { minutes: 30, intensity: "normal", equipment: ["dumbbell"] });
    expect(plan.exercises.length).toBeGreaterThan(0);
    expect(planWhy(s, plan, MON)).toMatch(/first workout/i);
  });

  it("week strip marks days before the account, today, and upcoming", () => {
    const wed = MON + 2 * 24 * H;
    const strip = weekStrip(engineState(user(wed)), wed, wed);
    expect(strip.map((d) => d.kind)).toEqual(["before", "before", "today", "upcoming", "upcoming", "upcoming", "upcoming"]);
    expect(strip[0]!.letter).toBe("M");
  });

  it("a logged workout shows as done today and a rest day after", () => {
    const { saved } = playWorkout(user(), MON);
    const s = engineState(saved);
    expect(trainedToday(s, MON + H).length).toBe(1);
    expect(weekStrip(s, MON + H, MON)[0]!.kind).toBe("todayDone");
    const wed = MON + 2 * 24 * H;
    const strip = weekStrip(s, wed, MON);
    expect(strip[0]!.kind).toBe("done");
    expect(strip[0]!.work).toBeGreaterThan(0);
    expect(strip[1]!.kind).toBe("rest");
  });

  it("asks for a check-in only after recent training, once a day", () => {
    const s0 = user();
    expect(needsCheckin(engineState(s0), MON + 24 * H)).toBe(false);
    const { saved } = playWorkout(s0, MON);
    expect(needsCheckin(engineState(saved), MON + H)).toBe(false); // trained today
    const tue = MON + 20 * H;
    expect(needsCheckin(engineState(saved), tue)).toBe(true);
    const answered = append(saved, [{ ts: tue, type: "checkin", payload: { feel: "normal", soreRegions: [], sorenessChecked: true } } as never]);
    expect(needsCheckin(engineState(answered), tue + H)).toBe(false);
    expect(needsCheckin(engineState(saved), MON + 6 * 24 * H)).toBe(false); // too long ago
  });

  it("program week runs 1 to 12", () => {
    expect(programWeek(null, MON)).toBe(1);
    expect(programWeek(MON, addDays(MON, 6))).toBe(1);
    expect(programWeek(MON, addDays(MON, 7))).toBe(2);
    expect(programWeek(MON, addDays(MON, 400))).toBe(12);
  });
});

describe("Progress", () => {
  it("counts consecutive weeks, including last week while this one is empty", () => {
    let s = user(MON - 21 * 24 * H);
    for (const w of [3, 2, 1]) s = playWorkout(s, MON - w * 7 * 24 * H).saved;
    expect(streakWeeks(engineState(s), MON)).toBe(3);
    s = playWorkout(s, MON).saved;
    expect(streakWeeks(engineState(s), MON + H)).toBe(4);
    expect(weekStart(MON + 3 * 24 * H)).toBe(dayStart(MON));
  });
});

describe("workout", () => {
  const ex = (o: Partial<RunExercise> & { sets: RunExercise["sets"] }): RunExercise =>
    ({ id: "x", name: "X", unilateral: false, hold: false, weighted: false, pair: false, ...o });

  it("asks once per exercise: after the last set, or before an all-out last set", () => {
    const plain = ex({ id: "a", sets: [{ reps: 10, isAmrap: false, targetRir: 2 }, { reps: 10, isAmrap: false, targetRir: 2 }] });
    const allOut = ex({ id: "b", sets: [{ reps: 8, isAmrap: false, targetRir: 2 }, { reps: 8, isAmrap: false, targetRir: 2 }, { reps: 8, isAmrap: true, targetRir: 2 }] });
    expect(isAllOut(allOut)).toBe(true);
    let r = start([allOut, plain], 0);
    const seen: string[] = [];
    while (r.phase !== "done") {
      r = setDone(r, r.done.length + 1);
      seen.push(`${r.ex}.${r.set}:${asksLeft(r) ? "ask" : "-"}`);
      if (r.phase === "rest") r = nextSet(r);
      else if (r.phase === "ask") r = { ...r, phase: "done" };
    }
    expect(seen).toEqual(["0.1:-", "0.2:ask", "0.3:-", "1.1:-", "1.2:ask"]);
  });

  it("an all-out set opens on target plus reps in reserve, and ends without a question", () => {
    const e = ex({ sets: [{ reps: 8, isAmrap: true, targetRir: 2 }] });
    const r = start([e], 0);
    expect(r.amount).toBe(10);
    expect(setDone(r, 1).phase).toBe("done");
  });

  it("rest counts down and moves on; holds count down too", () => {
    const hold = ex({ hold: true, sets: [{ seconds: 3, isAmrap: false, targetRir: 2 }, { seconds: 3, isAmrap: false, targetRir: 2 }] });
    let r = start([hold], 0);
    r = { ...r, hold: { ...r.hold, mode: "run" } };
    for (let i = 0; i < 3; i++) r = tick(r);
    expect(r.hold.mode).toBe("over");
    r = setDone(r, 5);
    expect(r.phase).toBe("rest");
    expect(r.rest).toBe(REST_SECONDS);
    for (let i = 0; i < REST_SECONDS; i++) r = tick(r);
    expect(r.phase).toBe("work");
    expect(r.set).toBe(2);
    expect(r.done[0]).toMatchObject({ seconds: 3, isAmrap: false });
  });

  it("5+ is recorded as 5 on the set just done", () => {
    let r = start([ex({ sets: [{ reps: 10, isAmrap: false, targetRir: 2 }] })], 0);
    r = answer(setDone(r, 1), "5+");
    expect(r.done[0]!.rir).toBe(5);
  });

  it("logs nothing when no set was done", () => {
    expect(toEvents(start([ex({ sets: [{ reps: 5, isAmrap: false, targetRir: 2 }] })], 0), "s", 1)).toEqual([]);
  });

  it("a played workout replays into one session with an answer per exercise", () => {
    const { saved, run, asked } = playWorkout(user(), MON);
    const s = engineState(saved);
    expect(s.sessions.length).toBe(1);
    expect(s.sessions[0]!.log.length).toBe(run.done.length);
    const answered = run.done.filter((x) => x.rir !== undefined);
    expect(answered.length).toBe(asked.length);
    expect(new Set(answered.map((x) => x.exerciseId)).size).toBe(asked.length);
    for (const x of run.done.filter((x) => x.isAmrap)) expect(x.rir).toBeUndefined();
  });

  it("an abandoned workout still saves the sets done", () => {
    const s0 = user();
    const state = engineState(s0);
    let r = start(fromPlan(state, makePlan(state, MON, { minutes: 30, intensity: "normal", equipment: ["dumbbell"] })), MON);
    r = setDone(r, MON + 30_000);
    const s = engineState(append(s0, toEvents(r, "abandoned", MON + 60_000)));
    expect(s.sessions[0]!.log.length).toBe(1);
  });
});

describe("store", () => {
  it("a like can be taken back, leaving no event", () => {
    const s0 = user();
    const liked = setFeedback(s0, "push_up_wall", true, MON);
    expect(liked.events.filter((e) => e.type === "exercise_feedback").length).toBe(1);
    const flipped = setFeedback(liked, "push_up_wall", false, MON + 1);
    expect(flipped.events.filter((e) => e.type === "exercise_feedback").length).toBe(1);
    expect(flipped.feedback.push_up_wall?.liked).toBe(false);
    const cleared = setFeedback(flipped, "push_up_wall", null, MON + 2);
    expect(cleared.events.filter((e) => e.type === "exercise_feedback").length).toBe(0);
    expect(cleared.feedback.push_up_wall).toBeUndefined();
  });

  it("back-to-back setting changes make one profile event", () => {
    let s = user();
    const n = s.events.length;
    s = withProfile({ ...s, settings: { ...s.settings, minutes: 45 } }, MON + 1);
    s = withProfile({ ...s, settings: { ...s.settings, minutes: 50 } }, MON + 2);
    expect(s.events.length).toBe(n);
    expect(withProfile(s, MON + 3)).toBe(s);
  });
});

describe("v3 screens", () => {
  it("shows the legs alone only when every target is a leg or the core", () => {
    expect(isLegsDay(["quads", "glutes", "abs"])).toBe(true);
    expect(isLegsDay(["abs"])).toBe(false);
    expect(isLegsDay(["quads", "chest"])).toBe(false);
    // The card lights a whole half of the body: legs alone, the upper body alone, or both on a full-body day.
    expect(planValues(["quads", "abs"])).toEqual({ quads: 1, glutes: 1, hamstrings: 1, calves: 1, abs: 0.5 });
    const upper = planValues(["chest"]);
    expect([upper.chest, upper.upper_back, upper.biceps, upper.forearms, upper.abs, upper.quads]).toEqual([1, 1, 1, 1, 1, undefined]);
    // An upper-body day with one leg exercise in it is still an upper-body card.
    expect(planValues(["chest", "quads"], "upper").quads).toBeUndefined();
    expect(planValues(["chest", "quads"], "legs").chest).toBeUndefined();
    const full = planValues(["chest", "quads"]);
    expect([full.triceps, full.forearms, full.calves, full.abs]).toEqual([1, 1, 1, 1]);
  });

  it("gives every exercise three levels of activation, helpers included", () => {
    const state = engineState(user());
    expect(activation(state, "push_up_deficit")).toEqual({ chest: 1, triceps: 0.5, front_delt: 0.5, abs: 0.25 });
    for (const e of Object.values(state.catalog.byId)) {
      const a = activation(state, e.id);
      expect(Object.values(a).every((v) => v === 1 || v === 0.5 || v === 0.25)).toBe(true);
      expect(Object.values(a)).toContain(1);
    }
  });

  it("runs the work scale away from the ground in both themes", () => {
    const lum = (hex: string) => [1, 3, 5].reduce((a, i) => a + parseInt(hex.slice(i, i + 2), 16), 0);
    expect(lum(red(1))).toBeLessThan(lum(red(0.2)));
    expect(lum(red(1, "dark"))).toBeGreaterThan(lum(red(0.2, "dark")));
  });

  it("cools the body when it is dragged forward, and still tells readiness from now", () => {
    const { saved } = playWorkout(user(), MON);
    const state = engineState(saved);
    const now = MON + H;
    const today = recovering(state, now);
    const later = recovering(state, now, "light", now + 6 * 24 * H);
    expect(today.length).toBeGreaterThan(0);
    expect(later.length).toBeLessThan(today.length);
    const tomorrow = recovering(state, now, "light", now + 24 * H);
    for (const r of tomorrow) expect(r.when).toBe(today.find((x) => x.region === r.region)!.when);
    expect(planRows(state, makePlan(state, now, { minutes: 30, intensity: "normal", equipment: [] })).every((r) => r.region !== undefined)).toBe(true);
  });
});

describe("first run units", () => {
  it("defaults to pounds on US devices and kilograms elsewhere", () => {
    expect(unitsFor("en-US")).toBe("imperial");
    expect(unitsFor("es_us")).toBe("imperial");
    expect(unitsFor("en-IN")).toBe("metric");
    expect(unitsFor("hi-IN")).toBe("metric");
    expect(unitsFor("en-GB")).toBe("metric");
    expect(unitsFor("en")).toBe("metric");
    expect(unitsFor(undefined)).toBe("metric");
    expect(fresh(MON, "en-US").settings.units).toBe("imperial");
    expect(fresh(MON, "en-IN").settings.units).toBe("metric");
  });
  it("steps body weight by one of the shown unit", () => {
    expect(nudgeWeight(72, "metric", 1)).toBe(73);
    const kg = nudgeWeight(72, "imperial", 1);
    expect(Math.round(kg * 2.2046)).toBe(Math.round(72 * 2.2046) + 1);
    let w = 72;
    for (let i = 0; i < 10; i++) w = nudgeWeight(w, "imperial", -1);
    expect(Math.round(w * 2.2046)).toBe(Math.round(72 * 2.2046) - 10);
    expect(nudgeWeight(30, "metric", -1)).toBe(30);
    expect(nudgeWeight(200, "imperial", 1)).toBe(200);
  });
});

describe("first-week Progress", () => {
  it("draws days before the user started as placeholders, not rest days", () => {
    const u = user();
    const { saved } = playWorkout(u, MON + H);
    const g = activity(engineState(saved), MON + 3 * H, 20, u.createdAt);
    const today = g.cells.findIndex((c) => c.today);
    expect(g.cells[today]!.work).toBeGreaterThan(0);
    expect(g.cells[today]!.before).toBe(false);
    expect(g.cells.slice(0, today).every((c) => c.before)).toBe(true);
    // A day after the start with no workout is a rest day, not a placeholder.
    const later = activity(engineState(saved), addDays(MON, 2) + H, 20, u.createdAt);
    const t2 = later.cells.findIndex((c) => c.today);
    expect(later.cells[t2 - 1]!.before).toBe(false);
  });
  it("lists starting points after one workout, then trends after the second", () => {
    const u = user();
    const one = playWorkout(u, MON + H).saved;
    const s1 = engineState(one);
    expect(strengthRows(s1)).toEqual([]);
    const starts = startingPoints(s1);
    expect(starts.length).toBeGreaterThan(0);
    expect(starts.length).toBeLessThanOrEqual(5);
    for (const r of starts) expect(r.value).toBeGreaterThan(0);
    const two = playWorkout(one, addDays(MON, 2) + H).saved;
    const s2 = engineState(two);
    const repeated = new Set(strengthRows(s2, 50).map((r) => r.name));
    for (const r of startingPoints(s2, 50)) expect(repeated.has(r.name)).toBe(false);
  });
});

describe("after a workout", () => {
  it("lists every exercise done, with what is set for next time", () => {
    const { saved, run } = playWorkout(user(), MON);
    const rows = learnedRows(engineState(saved), run, MON + H);
    expect(rows.map((r) => r.id)).toEqual([...new Set(run.done.map((d) => d.exerciseId))]);
    for (const r of rows) {
      expect(r.today).not.toBe("");
      expect(r.next).not.toBe("");
      expect(["up", "same", "down"]).toContain(r.dir);
    }
    expect(learnedLine(rows)).toMatch(/next time/);
  });
  it("says how many go up and which got easier", () => {
    const row = (dir: "up" | "same" | "down", name = "Push-up") => ({ id: name, name, region: undefined, today: "10 reps", next: "12", dir });
    expect(learnedLine([row("up"), row("same", "Squat")])).toBe("1 exercise goes up next time.");
    expect(learnedLine([row("up"), row("up", "Squat")])).toBe("Every exercise goes up next time.");
    expect(learnedLine([row("same"), row("down", "Plank")])).toBe("Next time stays the same, to build on today. Plank was hard, so it gets easier.");
  });
  it("marks the muscle worked most", () => {
    const { saved, run } = playWorkout(user(), MON);
    const { order, lines } = mostWorked(engineState(saved), run);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThanOrEqual(2);
    expect(order[0]).toBe(lines[0]);
  });
  it("shows growth only once a week has passed, from real measurements", () => {
    let s = user();
    expect(growth(engineState(s))).toEqual([]);
    for (let d = 0; d <= 14; d += 2) s = playWorkout(s, MON + d * 24 * H).saved;
    const g = growth(engineState(s));
    expect(g.length).toBeGreaterThan(0);
    for (const x of g) {
      expect(x.pct).toBeGreaterThanOrEqual(3);
      expect(x.how).toMatch(/→/);
    }
    expect(g.map((x) => x.pct)).toEqual([...g.map((x) => x.pct)].sort((a, b) => b - a));
  });
});

describe("recovery strain and weeks on plan", () => {
  it("strain shrinks as a muscle recovers and is gone once it is ready", () => {
    const { saved } = playWorkout(user(), MON);
    const s = engineState(saved);
    const rows = strainRows(s, MON + H);
    expect(rows.length).toBeGreaterThan(0);
    const r = rows[0]!;
    const later = strain(s, MON + H + (r.hours / 2) * H)[r.region]!;
    expect(later).toBeLessThan(r.strain);
    expect(strain(s, MON + H + (r.hours + 0.1) * H)[r.region]).toBeUndefined();
    expect(strainRows(s, MON + H, MON + H + (r.hours + 0.1) * H)[0]!.strain).toBe(0);
  });
  it("puts strain in three bands", () => {
    expect([0.8, 0.75, 0.5, 0.3, 0.29, 0.05].map(strainBand)).toEqual([2, 2, 1, 1, 0, 0]);
  });
  it("tells ready times to the hour", () => {
    expect(readyAt(2.5, MON)).toBe("Tonight, 9 pm");
    expect(readyAt(20, MON)).toMatch(/^Tue, 2 pm$/);
  });
  it("counts weeks on plan in a row", () => {
    let s = user(MON - 21 * 24 * H);
    for (const w of [3, 2, 1, 0]) for (const d of [0, 2, 4]) s = playWorkout(s, MON - w * 7 * 24 * H + d * 24 * H).saved;
    const p = planWeeks(engineState(s), MON + 5 * 24 * H, 3, s.createdAt, 8);
    expect(p.weeks).toHaveLength(8);
    expect(p.weeks.at(-1)!.work.every((x) => x > 0)).toBe(true);
    expect(p.run).toBe(4);
    const short = planWeeks(engineState(s), MON + 5 * 24 * H, 4, s.createdAt, 8);
    expect(short.run).toBe(0);
  });
});

describe("final retouches", () => {
  it("places the level answers on the catalog norms", () => {
    const s = engineState(user());
    expect(levelFromAnswers(s, {})).toBeNull();
    expect(levelFromAnswers(s, { push: 0, squat: 0 })!.experience).toBe("beginner");
    expect(levelFromAnswers(s, { push: 2, squat: 2 })!.experience).toBe("intermediate");
    expect(levelFromAnswers(s, { push: 3, squat: 3 })!.experience).toBe("advanced");
    const one = levelFromAnswers(s, { push: 1 })!.score;
    expect(levelFromAnswers(s, { push: 3 })!.score).toBeGreaterThan(one);
  });
  it("starts an advanced user further up the push-up ladder than a beginner", () => {
    const at = (level: "beginner" | "advanced") => {
      const u = user();
      return startingPoint(engineState(withProfile({ ...u, settings: { ...u.settings, equipment: [], level } }, MON)), MON);
    };
    const b = at("beginner"), a = at("advanced");
    expect(b.map((r) => r.label)).toEqual(["First push-up", "First squat", "Each set ends", "Sets per muscle"]);
    expect(a[0]!.value).not.toBe(b[0]!.value);
  });
  it("shows every set of a finished day, in the order done", () => {
    const { saved, run } = playWorkout(user(), MON);
    const d = doneDay(engineState(saved), saved.events, dayStart(MON))!;
    const ids = [...new Set(run.done.map((x) => x.exerciseId))];
    expect(d.exercises.map((x) => x.id)).toEqual(ids);
    expect(d.sets).toBe(d.exercises.reduce((a, x) => a + x.sets.length, 0));
    expect(d.minutes).toBeGreaterThan(0);
    expect(doneDay(engineState(saved), saved.events, addDays(dayStart(MON), 1))).toBeNull();
  });
  it("keeps everyone on the 12-week program", () => {
    const v = JSON.stringify({ ...user(), settings: { ...DEFAULT_SETTINGS, programId: "upper_body" } });
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: () => v, setItem: () => {} };
    try { expect(load(MON).settings.programId).toBe("balanced"); } finally { delete (globalThis as { localStorage?: unknown }).localStorage; }
  });
});
