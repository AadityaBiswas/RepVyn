// Demo UI: log workouts in plain language; the engine learns from every set, check-in and exercise rating.
// Recovery body map and "what I learned" after each workout; a Progress tab shows everything it knows.  npm run demo
import rawCatalog from "../catalog/library";
import rawPrograms from "../catalog/programs.json";
import rawParams from "../params/default.params.json";
import {
  aboutYou, cleanObservationCount, goodSets, insights, predictRange, sessionCalories, ladderName, level, levelName, loadCatalog, parseParams, planSession, predictionAccuracy,
  priorDrop, readiness, replay, soreness, strengthTrend, systemic, weeklyNeed,
  REGION_NAMES, REGION_PLURAL, REGIONS, SORENESS_NAMES, type EngineEvent, type EngineState, type Equipment, type Insight, type Plan,
  type ReadinessState, type Region,
} from "../src/engine";

const catalog = loadCatalog(rawCatalog, rawPrograms);
const params = parseParams(rawParams);
const H = 3_600_000;
const DAY = 24 * H;
const SET_GAP = 2 * 60_000;
const T0 = Date.UTC(2026, 0, 5, 18); // Monday 18:00
const DEFAULT_PLAN_H = 48;
/** Only ask about soreness when something was trained this recently. */
const CHECKIN_WINDOW_H = 96;
/** A typical home setup; the planner only picks exercises this equipment allows. */
const EQUIPMENT: Equipment[] = ["pullup_bar", "resistance_band", "chair"];

type Feel = "fresh" | "normal" | "beat_up";
/** amount = reps (or seconds for holds); amrap = the planned all-out set; edited = the user changed it (show how it compared). */
type WSet = { amount: number; rir: number; amrap?: boolean; edited?: boolean };
type Feedback = { liked?: boolean; pain?: boolean };
type Entry = { exerciseId: string; sets: WSet[]; plan?: string; note?: string; feedback?: Feedback };
type Checkin = { feel: Feel; sore: Region[] };
/** fromPlan: fill the planned workout as soon as the check-in is done (the plan respects today's soreness). */
type Workout = { start: number; entries: Entry[]; checkin?: Checkin; checkinSkipped?: boolean; fromPlan?: boolean };
type Body = { bodyMassKg: number; heightCm?: number; ageYears?: number; sex?: "female" | "male" };
type Store = { done: Workout[]; current: Workout | null; hoursAfter: number; programId: string; tab: "train" | "progress"; body?: Body };

// ---------- copy ----------

const NAME = Object.fromEntries(REGIONS.map((m) => [m, REGION_NAMES[m].toLowerCase()])) as Record<Region, string>;
const FEELS = ["", "a bit sore", "sore", "very sore"] as const;
const AREAS: [string, Region[]][] = [
  ["legs", ["quads", "glutes", "hamstrings", "calves"]],
  ["pushing muscles", ["chest", "front_delt", "triceps"]],
  ["pulling muscles", ["upper_back", "biceps", "side_rear_delt"]],
  ["core", ["abs", "lower_back"]],
];
/** Reps left in the tank, 0..5 (5 = "5+", open-ended). */
const EFFORT_WORD = ["All out", "Very hard", "Hard", "Solid", "Moderate", "Easy"] as const;
const effortName = (rir: number) => EFFORT_WORD[Math.min(5, rir)]!;
const STATE: Record<ReadinessState, string> = { ready: "Ready", recovering: "Recovering", fatigued: "Needs rest" };
const FEEL: [Feel, string][] = [["fresh", "Fresh"], ["normal", "Normal"], ["beat_up", "Beat up"]];
const CONF: Record<string, string> = { calibrating: "early guess", low: "getting there", medium: "fairly sure", high: "sure" };

const cap = (x: string) => x[0]!.toUpperCase() + x.slice(1);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const join = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
/** Region list in words, collapsing whole areas: "your chest, triceps and legs". */
function names(ms: Region[]): string {
  const left = new Set(ms);
  const out: string[] = [];
  for (const [area, rs] of AREAS) {
    if (rs.every((m) => left.has(m))) {
      out.push(area);
      rs.forEach((m) => left.delete(m));
    }
  }
  for (const m of REGIONS) if (left.has(m)) out.push(NAME[m]);
  return out.length ? `your ${join(out)}` : "";
}
/** Verb agreement for a region list: one singular muscle ("chest is"), anything else plural ("glutes are"). */
const plural = (ms: Region[], one: string, many: string) => (ms.length === 1 && !REGION_PLURAL[ms[0]!] ? one : many);
function humanH(h: number): string {
  if (h < 1) return "under an hour";
  if (h < 20) return `${Math.round(h)} hours`;
  if (h < 36) return "about a day";
  return `about ${Math.round(h / 24)} days`;
}
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function when(ts: number, from: number): string {
  const h = new Date(ts).getUTCHours();
  const part = h < 5 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 22 ? "evening" : "night";
  // Before 5 am still counts as the previous day's night.
  const d = new Date(h < 5 ? ts - 5 * H : ts);
  const days = Math.floor(d.getTime() / DAY) - Math.floor(from / DAY);
  return days === 0 ? (part === "night" ? "tonight" : `this ${part}`) : days === 1 ? `tomorrow ${part}` : `${DAYS[d.getUTCDay()]} ${part}`;
}
const unitOf = (id: string) => (catalog.byId[id]!.isHold ? "s" : "");
const toDisplay = (id: string, repsEq: number) => Math.round(catalog.byId[id]!.isHold ? repsEq * params.hold.secondsPerRep : repsEq);

// ---------- store & events ----------

const KEY = "fatigue-demo-v4";
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let st: Store = load();
function load(): Store {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (s?.done) return { tab: "train", ...s };
  } catch {}
  return fresh(catalog.programs[0]!.id);
}
function fresh(programId: string): Store {
  return { done: [], current: { start: T0, entries: [] }, hoursAfter: 0, programId, tab: "train" };
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {}
}

const nSets = (w: Workout) => w.entries.reduce((n, e) => n + e.sets.length, 0);
const endOf = (w: Workout) => w.start + (nSets(w) + 1) * SET_GAP;
const last = () => st.current ?? st.done[st.done.length - 1]!;
const lastDone = () => st.done[st.done.length - 1];

/** Timestamp of each set (the same clock the events use), keyed "entry-set". */
function setTimes(w: Workout): Map<string, number> {
  const out = new Map<string, number>();
  let t = w.start;
  w.entries.forEach((e, i) => e.sets.forEach((_, j) => out.set(`${i}-${j}`, (t += SET_GAP))));
  return out;
}

function events(workouts: Workout[], opts: { skipCheckinOf?: Workout } = {}): EngineEvent[] {
  let seq = 0;
  const ev = (ts: number, type: EngineEvent["type"], payload: object) =>
    ({ id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`, userId: "demo", ts, seq: seq++, schemaVersion: 1, type, payload }) as EngineEvent;
  // No experience: the engine infers the level from reps + effort.
  const out = [ev(T0 - H, "profile_set", {
    goal: "muscle", programId: st.programId, equipment: EQUIPMENT, excludeExercises: [], excludeRegions: [], daysPerWeek: 3, sessionMinutes: 45,
    ...st.body,
  })];
  workouts.forEach((w, wi) => {
    const sessionId = `w${wi + 1}`;
    if (w.checkin && w !== opts.skipCheckinOf) {
      out.push(ev(w.start - 10 * 60_000, "checkin", { feel: w.checkin.feel, soreRegions: w.checkin.sore, sorenessChecked: true }));
    }
    if (!w.entries.length) return;
    out.push(ev(w.start, "session_started", { sessionId }));
    const times = setTimes(w);
    w.entries.forEach((e, i) => {
      const hold = catalog.byId[e.exerciseId]!.isHold;
      e.sets.forEach((s, j) => {
        out.push(ev(times.get(`${i}-${j}`)!, "set_logged", {
          sessionId, exerciseId: e.exerciseId, rir: s.amrap ? 0 : s.rir, isWarmup: false, isAmrap: !!s.amrap,
          ...(hold ? { holdSeconds: s.amount } : { reps: s.amount }),
        }));
      });
      if (e.feedback && (e.feedback.liked !== undefined || e.feedback.pain !== undefined) && e.sets.length) {
        out.push(ev(times.get(`${i}-${e.sets.length - 1}`)!, "exercise_feedback", { exerciseId: e.exerciseId, ...e.feedback }));
      }
    });
    out.push(ev(endOf(w), "session_ended", { sessionId }));
  });
  return out;
}
const all = () => (st.current ? [...st.done, st.current] : st.done);
const stateOf = (workouts: Workout[], opts?: { skipCheckinOf?: Workout }) => replay(events(workouts, opts), catalog, params);

// ---------- body map ----------

type Shape = string;
const e = (cx: number, cy: number, rx: number, ry: number) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`;
const pair = (cy: number, dx: number, rx: number, ry: number) => e(60 - dx, cy, rx, ry) + e(60 + dx, cy, rx, ry);
const NEUTRAL: Shape = `<circle cx="60" cy="20" r="13"/><rect x="54" y="31" width="12" height="9" rx="3"/>` +
  `<rect x="34" y="40" width="52" height="84" rx="16"/><rect x="40" y="118" width="40" height="18" rx="8"/>` + pair(108, 39, 6, 15) + pair(214, 11, 7, 22);
const FRONT: [Region, Shape][] = [
  ["front_delt", pair(50, 27, 10, 9)],
  ["chest", pair(59, 11, 12, 10)],
  ["biceps", pair(79, 35, 7, 15)],
  ["abs", `<rect x="48" y="72" width="24" height="46" rx="7"/>`],
  ["quads", pair(160, 11, 11, 27)],
];
const BACK: [Region, Shape][] = [
  ["side_rear_delt", pair(50, 27, 10, 9)],
  ["upper_back", `<path d="M43 44 L77 44 L83 84 L60 96 L37 84 Z"/>`],
  ["triceps", pair(79, 35, 7, 15)],
  ["lower_back", `<rect x="49" y="97" width="22" height="22" rx="6"/>`],
  ["glutes", pair(133, 11, 12, 11)],
  ["hamstrings", pair(167, 11, 10, 22)],
  ["calves", pair(212, 11, 8, 19)],
];

function bodyMap(cls: (m: Region) => string, title: (m: Region) => string, interactive: boolean): string {
  const fig = (label: string, regions: [Region, Shape][]) => `
    <figure class="bm-fig">
      <svg viewBox="0 0 120 240" aria-label="${label} view">
        <g class="bm-n">${NEUTRAL}</g>
        ${regions.map(([m, shape]) => `<g class="bm-r ${cls(m)}" data-m="${m}" data-tip="${esc(title(m))}" ${interactive ? `role="button" tabindex="0" aria-pressed="${cls(m).includes("sel")}"` : `role="img"`} aria-label="${esc(title(m))}">${shape}</g>`).join("")}
      </svg>
      <figcaption>${label}</figcaption>
    </figure>`;
  return `<div class="bm">${fig("Front", FRONT)}${fig("Back", BACK)}</div>`;
}

// ---------- engine views ----------

function snapshot(s: EngineState, now: number) {
  const r = readiness(s, now);
  const sore = soreness(s, now);
  const rows = REGIONS.map((m) => ({ m, ...r[m], sore: sore[m], drop: priorDrop(r[m].fatigue, r[m].tolerance / params.tolerance.ref, params) }));
  const sum = (f: (x: (typeof rows)[0]) => number) => rows.reduce((a, x) => a + f(x), 0);
  return { rows, total: sum((x) => x.fatigue), totalTol: sum((x) => x.tolerance), sys: systemic(s, now) };
}
type Snap = ReturnType<typeof snapshot>;

function headline(snap: Snap): string {
  const rest = snap.rows.filter((x) => x.state === "fatigued").map((x) => x.m);
  const rec = snap.rows.filter((x) => x.state === "recovering").map((x) => x.m);
  if (!rest.length && !rec.length) return "You're fully recovered. Everything is ready to train.";
  const parts: string[] = [];
  if (rest.length) {
    const h = Math.max(...snap.rows.filter((x) => x.state === "fatigued").map((x) => x.hoursToReady));
    parts.push(`${cap(names(rest))} ${plural(rest, "needs", "need")} ${humanH(h)} of rest.`);
  }
  if (rec.length) parts.push(`${cap(names(rec))} ${plural(rec, "is", "are")} nearly there.`);
  if (rest.length + rec.length < 8) parts.push("Everything else is ready.");
  return parts.join(" ");
}

function sorenessForecast(snap: Snap, now: number): string {
  const sore = snap.rows.filter((x) => x.sore.peakLevel >= 1 || x.sore.level >= 1);
  if (!sore.length) return "No soreness expected from this.";
  const groups = [3, 2, 1].map((lv) => sore.filter((x) => Math.max(x.sore.peakLevel, x.sore.level) === lv)).filter((g) => g.length);
  const peakAt = now + Math.max(...sore.map((x) => x.sore.peakInH)) * H;
  const clearAt = now + Math.max(...sore.map((x) => x.sore.clearInH)) * H;
  const lines = groups.map((g) => `${cap(names(g.map((x) => x.m)))} will probably feel ${FEELS[Math.max(g[0]!.sore.peakLevel, g[0]!.sore.level)]}`);
  const rising = sore.some((x) => x.sore.peakInH > 0);
  return `${lines.join(". ")}${rising ? `, worst around ${when(peakAt, now)}` : ""}. It should be gone by ${when(clearAt, now)}.`;
}

const fmt = (x: number) => x.toFixed(2);
const pctOf = (x: number) => `${Math.round(x * 100)}%`;
const READY_AT = params.readiness.readyBelow / params.tolerance.ref;
const REST_AT = params.readiness.fatiguedAbove / params.tolerance.ref;

function numbers(snap: Snap): string {
  const max = Math.max(1.5, ...snap.rows.map((x) => x.load));
  const pct = (v: number) => `${(Math.min(v, max) / max) * 100}%`;
  return `<div class="tiles">
      <div class="tile"><span class="k">Total muscle fatigue</span><span class="v">${pctOf(snap.total / snap.totalTol)}</span><span class="s">${fmt(snap.total)} of ${fmt(snap.totalTol)} units</span></div>
      <div class="tile"><span class="k">Whole-body fatigue</span><span class="v">${pctOf(snap.sys.G / snap.sys.typical)}</span><span class="s">of a typical session</span></div>
    </div>
    <ul class="bars">${[...snap.rows].sort((a, b) => b.load - a.load).map((x) => `
    <li>
      <div class="bar-head"><span class="bar-name">${cap(NAME[x.m])}</span><span class="pill ${x.state}">${STATE[x.state]}</span><span class="num">${pctOf(x.load)}</span></div>
      <div class="track"><div class="fill ${x.state}" style="width:${pct(x.load)}"></div>
        <i class="mark" style="left:${pct(READY_AT)}"></i><i class="mark" style="left:${pct(REST_AT)}"></i><i class="mark full" style="left:${pct(1)}"></i></div>
      <div class="bar-meta"><span>Strength now −${pctOf(x.drop)} · ${fmt(x.fatigue)} of ${fmt(x.tolerance)} units · soreness ${SORENESS_NAMES[x.sore.level]}</span><span>${x.hoursToReady > 0 ? `ready in ${humanH(x.hoursToReady)}` : "ready"}</span></div>
    </li>`).join("")}</ul>
    <p class="legend">100% = what a full, normal session leaves in that muscle at your level. Marks at 30% (ready), 70% (needs rest) and 100%.</p>`;
}

function readinessMap(snap: Snap, now: number): string {
  const byM = Object.fromEntries(snap.rows.map((x) => [x.m, x])) as Record<Region, Snap["rows"][0]>;
  return bodyMap(
    (m) => `st-${byM[m].state}${byM[m].sore.level >= 2 ? " hot" : ""}`,
    (m) => {
      const x = byM[m];
      return `${cap(NAME[m])}: ${STATE[x.state].toLowerCase()}${x.hoursToReady > 0 ? `, ready ${when(now + x.hoursToReady * H, now)}` : ""}${x.sore.level ? `, ${SORENESS_NAMES[x.sore.level]}` : ""}`;
    },
    false,
  ) + `<ul class="key"><li><i class="st-ready"></i>Ready</li><li><i class="st-recovering"></i>Recovering</li><li><i class="st-fatigued"></i>Needs rest</li><li><i class="hot-key"></i>Sore</li></ul>`;
}

const insightList = (xs: Insight[]) => (xs.length ? `<ul class="insights">${xs.map((x) => `<li>${esc(x.text)}</li>`).join("")}</ul>` : "");

function levelCard(s: EngineState): string {
  const l = level(s);
  const c = params.calibration;
  const first = s.sessions[0]?.start;
  const day = first === undefined ? 0 : Math.min(c.calibratingMinDays, Math.floor((s.t - first) / DAY) + 1);
  const obs = Math.min(c.calibratingMinObs, cleanObservationCount(s));
  const fams = Object.entries(l.byLadder).sort((a, b) => b[1].score - a[1].score);
  const chips = fams.map(([id, x]) => `<li><span>${esc(ladderName(catalog, id))}</span><span class="lv ${levelName(x.score)}">${cap(levelName(x.score))}</span></li>`).join("");
  if (l.calibrated) {
    return `<p class="lv-line">You train like ${/^[aeiou]/.test(l.experience) ? "an" : "a"} <b>${l.experience}</b>.</p>
      <p class="muted small">Worked out from your reps and how hard they felt. It keeps updating as you get stronger.</p>
      ${chips ? `<ul class="levels">${chips}</ul>` : ""}`;
  }
  const progress = Math.min(day / c.calibratingMinDays, obs / c.calibratingMinObs);
  return `<p class="lv-line"><b>Getting to know you</b> <span class="muted">· day ${day} of ${c.calibratingMinDays}</span></p>
    <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(100 * progress)}"><i style="width:${pctOf(progress)}"></i></div>
    <p class="muted small">${fams.length ? `So far you look like ${/^[aeiou]/.test(levelName(l.estimate)) ? "an" : "a"} ${levelName(l.estimate)}.` : "Do the first set of each exercise as hard as you can with good form. That's how I learn your level."} Until the first week is done I plan with a middle-of-the-road guess.</p>
    ${chips ? `<ul class="levels">${chips}</ul>` : ""}`;
}

function planCard(plan: Plan, at: number, from: number): string {
  if (plan.kind === "rest") {
    return `<p class="plan-title">Rest ${when(at, from)}</p>
      <p class="muted">${esc(plan.reasons[0] ?? "")}. Move the slider later to plan your next workout.</p>`;
  }
  const program = catalog.programs.find((p) => p.id === plan.program)!;
  const why = (xs: string[]) => (xs.length ? `<p class="why">${esc(xs[0]!)}.</p>${xs.length > 1 ? `<details class="more"><summary>More</summary><ul>${xs.slice(1).map((r) => `<li>${esc(r)}</li>`).join("")}</ul></details>` : ""}` : "");
  return `<p class="plan-title">${esc(cap(plan.template!.replaceAll("_", " ")))} day, ${when(at, from)}</p>
    <p class="muted">${esc(program.name)} · about ${Math.round(plan.estMinutes)} minutes</p>
    <ol class="plan">${plan.exercises.map((x) => {
      const ex = catalog.byId[x.exerciseId]!;
      return `<li>
        <div class="plan-row"><b>${esc(ex.name)}</b><span class="muted">${x.sets.length} set${x.sets.length > 1 ? "s" : ""}</span></div>
        <p class="plan-sets">${x.sets.map((s) => (s.seconds !== undefined ? `${s.seconds}s` : `${s.reps}`)).join(" · ")}${ex.isHold ? "" : " reps"} · <span class="effort-word">${effortName(x.sets[0]!.targetRir)}</span></p>
        ${x.firstSetMode ? `<p class="tag">First set: as many good reps as you can</p>` : ""}
        ${why(x.reasons)}
      </li>`;
    }).join("")}</ol>
    ${plan.reasons.length > 1 ? `<details class="more"><summary>Why this workout</summary><ul>${plan.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></details>` : ""}`;
}

/** Planned workout -> editable entries (planned reps and effort; edit to what you actually did). */
const toEntries = (plan: Plan): Entry[] =>
  plan.exercises.map((x) => ({
    exerciseId: x.exerciseId,
    // The all-out set is pre-filled with the expected max (target reps + the reps normally left), not the target:
    // accepting the pre-fill must not tell the engine "my max is below what you predicted".
    sets: x.sets.map((s) => (s.isAmrap
      ? { amount: s.seconds !== undefined ? s.seconds + s.targetRir * params.hold.secondsPerRep : s.reps! + s.targetRir, rir: 0, amrap: true }
      : { amount: s.seconds ?? s.reps!, rir: s.targetRir })),
    plan: `${x.sets.map((s) => s.seconds ?? s.reps).join(" · ")} at ${effortName(x.sets[0]!.targetRir).toLowerCase()}`,
    note: x.firstSetMode ? "First set: as many good reps as you can. It measures your level." : x.sets.some((s) => s.isAmrap) ? "Last set: until you can't do another rep." : undefined,
  }));

// ---------- check-in (only when something was trained recently) ----------

let draft: Checkin & { map: boolean } = { feel: "normal", sore: [], map: false };
let checkinResult = "";

/** Ask about soreness only if a muscle was trained in the last CHECKIN_WINDOW_H hours. */
function needsCheckin(w: Workout): boolean {
  const prev = stateOf(st.done);
  return REGIONS.some((m) => {
    const t = prev.soreness.lastTs[m];
    return t !== null && w.start - t <= CHECKIN_WINDOW_H * H;
  });
}

function renderCheckin(ask: boolean) {
  const w = st.current!;
  const box = $("checkin");
  box.hidden = !ask;
  if (!ask) return;
  if (!w.checkin && w.checkinSkipped) {
    box.innerHTML = `<div class="ci-done"><p class="muted">No check-in today.</p><button class="plain" id="ci-edit">Check in</button></div>`;
    return;
  }
  if (w.checkin) {
    const c = w.checkin;
    box.innerHTML = `<div class="ci-done"><p>${c.sore.length ? `Sore: ${esc(names(c.sore))}` : "Nothing sore"} · feeling ${FEEL.find(([f]) => f === c.feel)![1].toLowerCase()}</p>
        <button class="plain" id="ci-edit">Change</button></div>${checkinResult}`;
    return;
  }
  const feel = `<div class="seg" role="group" aria-label="Overall feeling">${FEEL.map(([f, l]) => `<button class="chip-btn${draft.feel === f ? " on" : ""}" data-feel="${f}" aria-pressed="${draft.feel === f}">${l}</button>`).join("")}</div>`;
  box.innerHTML = draft.map
    ? `<h3>Tap what feels sore</h3>${feel}
      ${bodyMap((m) => (draft.sore.includes(m) ? "sel" : "idle"), (m) => cap(NAME[m]), true)}
      <p class="muted small">${draft.sore.length ? `Sore: ${esc(names(draft.sore))}` : "Nothing marked yet"}</p>
      <div class="actions"><button class="primary-btn" id="ci-save">Save</button><button class="plain" id="ci-back">Back</button></div>`
    : `<h3>How do you feel today?</h3>${feel}
      <p>Anything sore from last time?</p>
      <div class="actions"><button class="primary-btn" id="ci-none">Nothing's sore</button><button class="outline-sm" id="ci-yes">Yes, show me</button>
      <button class="plain" id="ci-skip">Skip</button></div>`;
}

function saveCheckin() {
  const w = st.current!;
  const before = stateOf(all(), { skipCheckinOf: w });
  const expected = soreness(before, w.start - 10 * 60_000);
  w.checkin = { feel: draft.feel, sore: [...draft.sore] };
  const after = stateOf(all());
  const predicted = REGIONS.filter((m) => expected[m].level >= 1);
  const surprise = draft.sore.filter((m) => !predicted.includes(m));
  const spared = predicted.filter((m) => !draft.sore.includes(m));
  const lines = [
    !surprise.length && !spared.length
      ? predicted.length ? "That's what I expected." : "Good, I didn't expect any soreness either."
      : [surprise.length ? `I didn't expect ${names(surprise)} to be sore.` : "", spared.length ? `I thought ${names(spared)} might be sore.` : "", "Noted. I'll learn from this."].filter(Boolean).join(" "),
    ...insights(before, after).map((x) => x.text),
  ];
  checkinResult = `<ul class="insights">${lines.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
  afterCheckin();
}

function afterCheckin() {
  const w = st.current!;
  if (w.fromPlan && !w.entries.length) fillPlan();
  else show();
}

function fillPlan() {
  const w = st.current!;
  const plan = planSession(stateOf(all()), { now: w.start });
  w.fromPlan = false;
  if (plan.kind === "rest") {
    show();
    $("wsub").textContent = `I'd rest today: ${plan.reasons[0]}.`;
    return;
  }
  w.entries = toEntries(plan);
  show();
}

// ---------- workout view: no body map here, just the sets and how each landed ----------

function renderEntries() {
  const w = st.current!;
  const prev = lastDone();
  $("wtitle").textContent = `Workout ${st.done.length + 1}`;
  $("wsub").textContent = prev
    ? `${cap(when(w.start, endOf(prev)))}, ${humanH((w.start - endOf(prev)) / H)} after your last workout.`
    : "Log each set, or start from the planned workout.";
  const ask = st.done.length > 0 && needsCheckin(w);
  renderCheckin(ask);
  const ready = !ask || !!w.checkin || !!w.checkinSkipped;
  $("fill").hidden = w.entries.length > 0 || !ready;
  $("pick").hidden = !ready;

  // "Before" = everything up to today's check-in; "now" = including the sets logged so far.
  const pre = stateOf([...st.done, { ...w, entries: [] }]);
  const now = stateOf(all());
  const times = setTimes(w);
  $("entries").innerHTML = w.entries.map((x, i) => {
    const ex = catalog.byId[x.exerciseId]!;
    const muscles = Object.entries(ex.contributions).filter(([, c]) => c === 1).map(([m]) => cap(NAME[m as Region])).join(", ");
    const g = goodSets(pre, x.exerciseId, w.start);
    const r = predictRange(pre, x.exerciseId, w.start);
    const first = (v: number) => Math.max(1, toDisplay(x.exerciseId, v - g.targetRir));
    const lastSet = x.sets.length - 1;
    return `<section class="card" data-i="${i}">
      <header class="card-head">
        <div><h3>${esc(ex.name)}</h3><p class="muted small">${esc(muscles)}</p></div>
        <button class="icon" data-act="rm-ex" aria-label="Remove ${esc(ex.name)}">✕</button>
      </header>
      <p class="forecast">Today you have about <b>${g.reps.length} good set${g.reps.length > 1 ? "s" : ""}</b> in you: <span class="num">${g.reps.join(" · ")}${g.seconds ? "s" : ""}</span> at ${effortName(g.targetRir).toLowerCase()}.
        <span class="muted">First set likely ${first(r.low)}–${first(r.high)}${unitOf(x.exerciseId) || ""}.</span></p>
      ${x.note ? `<p class="tag">${esc(x.note)}</p>` : ""}
      <div class="sets">
        ${x.sets.map((s, j) => {
          const logged = now.predictionLog.find((p) => p.ts === times.get(`${i}-${j}`) && p.exerciseId === x.exerciseId);
          const diff = logged ? toDisplay(x.exerciseId, logged.M_obs - logged.M_pred) : 0;
          const verdict = !s.edited || !logged ? "" : Math.abs(diff) < 2
            ? `<span class="verdict ok">Right about what I expected</span>`
            : diff > 0 ? `<span class="verdict up">${diff}${unitOf(x.exerciseId)} more than I expected</span>` : `<span class="verdict down">${-diff}${unitOf(x.exerciseId)} fewer than I expected. Noted</span>`;
          return `<div class="set" data-j="${j}">
          <div class="set-top">
            <span class="set-n">Set ${j + 1}</span>
            <div class="stepper">
              <button class="step" data-act="dec" aria-label="One less">−</button>
              <input id="a-${i}-${j}" type="number" inputmode="numeric" min="1" max="${ex.isHold ? 300 : 100}" value="${s.amount}" data-f="amount" aria-label="${ex.isHold ? "Seconds" : "Reps"} for set ${j + 1}">
              <button class="step" data-act="inc" aria-label="One more">+</button>
            </div>
            <span class="unit">${ex.isHold ? "sec" : "reps"}</span>
            <button class="icon small-x" data-act="rm-set" aria-label="Remove set ${j + 1}">✕</button>
          </div>
          <div class="rir">
            <span class="rir-q">Reps left: <b>${effortName(s.rir)}</b></span>
            <div class="rir-row" role="group" aria-label="How many more could you have done after set ${j + 1}?">
              ${[0, 1, 2, 3, 4, 5].map((r) => `<button class="rir-b${r === Math.min(5, s.rir) ? " on" : ""}" data-act="effort" data-rir="${r}" aria-pressed="${r === Math.min(5, s.rir)}" aria-label="${r === 5 ? "5 or more" : r} left, ${effortName(r)}">${r === 5 ? "5+" : r}</button>`).join("")}
            </div>
          </div>
          ${verdict}
        </div>`;
        }).join("")}
      </div>
      <button class="ghost" data-act="add-set">+ Add set</button>
      ${lastSet >= 0 ? `<div class="fb" role="group" aria-label="How was ${esc(ex.name)}?">
        <span class="muted small">How was it?</span>
        <button class="chip-btn${x.feedback?.liked === true ? " on" : ""}" data-act="like" aria-pressed="${x.feedback?.liked === true}">Liked it</button>
        <button class="chip-btn${x.feedback?.liked === false ? " on" : ""}" data-act="dislike" aria-pressed="${x.feedback?.liked === false}">Not for me</button>
        <button class="chip-btn pain${x.feedback?.pain ? " on" : ""}" data-act="pain" aria-pressed="${!!x.feedback?.pain}">It hurt</button>
      </div>` : ""}
    </section>`;
  }).join("");
  ($("finish") as HTMLButtonElement).disabled = nSets(w) === 0;
}

// ---------- results view: the body map lives here, at the end ----------

let lastInsights: Insight[] = [];
let pendingPlan: { plan: Plan; at: number } | null = null;

function renderResults() {
  const w = last();
  const end = endOf(w);
  const now = end + st.hoursAfter * H;
  const s = stateOf(all());
  const snap = snapshot(s, now);
  const planAt = end + (st.hoursAfter || DEFAULT_PLAN_H) * H;
  const plan = planSession(s, { now: planAt });
  pendingPlan = { plan, at: planAt };
  $("rtitle").textContent = st.hoursAfter === 0 ? `Workout ${st.done.length} done` : cap(when(now, end));
  $("rhead").textContent = headline(snap);
  $("rsore").textContent = sorenessForecast(snapshot(s, end), end);
  $("rinsights").innerHTML = insightList(lastInsights);
  $("rinsights-box").hidden = !lastInsights.length;
  $("rmap").innerHTML = readinessMap(snap, now);
  ($("hours") as HTMLInputElement).value = String(st.hoursAfter);
  $("hours-out").textContent = st.hoursAfter === 0 ? "Right after the workout" : `${cap(when(now, end))} (${humanH(st.hoursAfter)} later)`;
  $("rplan").innerHTML = planCard(plan, planAt, end);
  ($("use-plan") as HTMLButtonElement).hidden = plan.kind === "rest";
  $("rnumbers").innerHTML = numbers(snap);
  renderCalories(s);
}

/** Calories for the latest workout, or a one-time weight prompt. */
function renderCalories(s: EngineState) {
  const sess = s.sessions[s.sessions.length - 1];
  const c = sess && st.body ? sessionCalories(s, sess) : null;
  const form = `<form id="body-form" class="body-form">
      <p class="muted small">${st.body ? "Your details" : "Add your weight to see how many calories this burned. Height, age and sex make it more accurate."}</p>
      <div class="fields">
        <label>Weight <span><input id="b-kg" type="number" inputmode="decimal" min="25" max="350" step="0.1" required value="${st.body?.bodyMassKg ?? ""}"> kg</span></label>
        <label>Height <span><input id="b-cm" type="number" inputmode="numeric" min="100" max="250" value="${st.body?.heightCm ?? ""}"> cm</span></label>
        <label>Age <span><input id="b-age" type="number" inputmode="numeric" min="13" max="100" value="${st.body?.ageYears ?? ""}"></span></label>
        <label>Sex <select id="b-sex"><option value="">Prefer not to say</option><option value="female"${st.body?.sex === "female" ? " selected" : ""}>Female</option><option value="male"${st.body?.sex === "male" ? " selected" : ""}>Male</option></select></label>
      </div>
      <button class="primary-btn" type="submit">Save</button>
    </form>`;
  if (!c) {
    $("rcal").innerHTML = form;
    return;
  }
  $("rcal").innerHTML = `<div class="hero"><span class="hero-n">${Math.round(c.activeKcal)} <small>kcal</small></span>
      <span>burned by this workout, likely ${Math.round(c.low)}–${Math.round(c.high)}. ${Math.round(c.totalKcal)} kcal in total over ${Math.round(c.minutes)} minutes, counting what your body burns at rest.</span></div>
    <ul class="kcal-list">${c.byExercise.map((x) => `<li><span>${esc(catalog.byId[x.exerciseId]!.name)}</span><span class="num">${Math.round(x.kcal)} kcal</span></li>`).join("")}</ul>
    <details class="more"><summary>How I estimate this</summary>
      <p class="small muted">Each set's time (reps × about 3 seconds, both sides for one-sided moves, or the hold time) is multiplied by the energy cost of that kind of exercise at the effort you logged. The costs come from the 2024 Compendium of Physical Activities: 7.5 METs for all-out calisthenics down to 2.8 for light core work. Rest between sets counts as standing (1.3 METs), and 10% is added for the extra oxygen your body uses to recover. ${c.restingMethod === "mifflin_st_jeor" ? "Your resting burn uses the Mifflin–St Jeor equation from your height, age and weight." : "Add height and age for a more accurate resting burn."} Without a heart-rate monitor this is an estimate, so the range matters more than the exact number.</p>
    </details>
    <details class="more"><summary>Edit your details</summary>${form}</details>`;
}

// ---------- progress view: everything the engine has learned ----------

const W = 320;
/** Weekly share of sets predicted within ±2 reps: bars on one 0–100% axis. */
function accuracyChart(s: EngineState): string {
  const log = s.predictionLog;
  if (!log.length) return "";
  const t0 = log[0]!.ts;
  const weeks = new Map<number, { ok: number; n: number }>();
  for (const x of log) {
    const k = Math.floor((x.ts - t0) / (7 * DAY));
    const w = weeks.get(k) ?? { ok: 0, n: 0 };
    w.n++;
    if (Math.abs(x.M_obs - x.M_pred) <= 2) w.ok++;
    weeks.set(k, w);
  }
  const data = [...weeks].sort((a, b) => a[0] - b[0]);
  if (data.length < 2) return "";
  const h = 120, top = 8, bottom = 22, left = 34;
  const bw = Math.min(40, (W - left) / data.length - 6);
  const y = (v: number) => top + (1 - v) * (h - top - bottom);
  const grid = [0, 0.5, 1].map((v) => `<line class="grid" x1="${left}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${left - 6}" y="${y(v) + 4}" text-anchor="end">${v * 100}%</text>`).join("");
  const bars = data.map(([k, w], i) => {
    const v = w.ok / w.n;
    const x = left + 6 + i * ((W - left) / data.length);
    const y0 = y(v);
    const hb = y(0) - y0;
    const r = Math.min(4, hb / 2, bw / 2);
    const tip = `Week ${k + 1}: ${Math.round(v * 100)}% of ${w.n} sets within 2 reps`;
    // Rounded top only; flat at the baseline.
    return `<g data-tip="${tip}" class="hit"><rect x="${x - 3}" y="${top}" width="${bw + 6}" height="${h - top - bottom}" fill="transparent"/>
      <path class="bar" d="M${x},${y(0)} V${y0 + r} Q${x},${y0} ${x + r},${y0} H${x + bw - r} Q${x + bw},${y0} ${x + bw},${y0 + r} V${y(0)} Z"/>
      <text class="axis" x="${x + bw / 2}" y="${h - 6}" text-anchor="middle">W${k + 1}</text></g>`;
  }).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="Share of sets predicted within 2 reps, by week">${grid}${bars}</svg>`;
}

/** Small multiple: clean all-out-quality measurements of one exercise over time, endpoint emphasised. */
function sparkline(id: string, pts: { ts: number; max: number }[]): string {
  const w = 132, h = 40, pad = 5;
  const xs = pts.map((p) => p.ts);
  const vs = pts.map((p) => toDisplay(id, p.max));
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [lo, hi] = [Math.min(...vs), Math.max(...vs)];
  const X = (t: number) => pad + ((t - x0) / Math.max(1, x1 - x0)) * (w - 2 * pad);
  const Y = (v: number) => (hi === lo ? h / 2 : h - pad - ((v - lo) / (hi - lo)) * (h - 2 * pad));
  const d = pts.map((p, i) => `${i ? "L" : "M"}${X(p.ts).toFixed(1)},${Y(vs[i]!).toFixed(1)}`).join(" ");
  const dots = pts.map((p, i) => `<circle class="${i === pts.length - 1 ? "end" : "pt"}" cx="${X(p.ts)}" cy="${Y(vs[i]!)}" r="${i === pts.length - 1 ? 4 : 2.5}" data-tip="${esc(catalog.byId[id]!.name)}: ${vs[i]}${unitOf(id) || " reps"} (${when(p.ts, p.ts)})"/>`).join("");
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(catalog.byId[id]!.name)} max over time"><path class="line" d="${d}"/>${dots}</svg>`;
}

function renderProgress() {
  const s = stateOf(st.done);
  const now = lastDone() ? endOf(lastDone()!) : T0;
  const acc = predictionAccuracy(s);
  $("p-acc").innerHTML = acc.recent === null
    ? `<p class="muted">Log about 20 sets and I'll show how well I predict what you can do. ${acc.sets} so far.</p>`
    : `<div class="hero"><span class="hero-n">${pctOf(acc.recent)}</span><span>of your last 20 sets landed within 2 reps of what I predicted${acc.start === null ? "" : acc.recent > acc.start ? `, up from ${pctOf(acc.start)} in your first 20` : acc.recent < acc.start ? ` (${pctOf(acc.start)} in your first 20)` : ""}.</span></div>${accuracyChart(s)}`;
  const traits = aboutYou(s);
  $("p-about").innerHTML = `<ul class="traits">${traits.map((t) => `<li><div class="trait-head"><b>${esc(t.label)}</b><span class="conf ${t.confidence}">${CONF[t.confidence]}</span></div><p>${esc(t.text)}</p></li>`).join("")}</ul>`;
  const trends = Object.keys(s.capacity).map((id) => ({ id, pts: strengthTrend(s, id) })).filter((x) => x.pts.length >= 2);
  $("p-strength").innerHTML = trends.length
    ? `<ul class="strength">${trends.map(({ id, pts }) => {
        const a = toDisplay(id, pts[0]!.max), b = toDisplay(id, pts.at(-1)!.max);
        const change = a ? Math.round(((b - a) / a) * 100) : 0;
        return `<li><div><b>${esc(catalog.byId[id]!.name)}</b><p class="muted small num">${a} → ${b}${unitOf(id) || " reps"}${change ? ` (${change > 0 ? "+" : ""}${change}%)` : ""}</p></div>${sparkline(id, pts)}</li>`;
      }).join("")}</ul>`
    : `<p class="muted">Your best sets will show up here once you've done an exercise twice.</p>`;
  const need = weeklyNeed(s, now);
  const rows = REGIONS.map((m) => ({ m, done: need[m].done, target: need[m].target })).sort((a, b) => b.target - a.target);
  const max = Math.max(...rows.map((r) => Math.max(r.done, r.target)));
  const behind = rows.filter((r) => r.done < 0.5 * r.target).map((r) => r.m);
  $("p-week").innerHTML = `${behind.length ? `<p>Behind this week: <b>${esc(names(behind).replace(/^your /, ""))}</b>. Your next plans lean toward ${behind.length > 1 ? "them" : "it"}.</p>` : "<p>You're on track for every muscle this week.</p>"}
    <ul class="vol">${rows.map((r) => `<li data-tip="${cap(NAME[r.m])}: ${r.done.toFixed(1)} of ${r.target.toFixed(0)} hard sets">
      <span class="vol-n">${cap(NAME[r.m])}</span>
      <span class="vol-track"><i style="width:${(r.done / max) * 100}%"></i><b style="left:${(r.target / max) * 100}%"></b></span>
      <span class="num small">${r.done.toFixed(0)}/${r.target.toFixed(0)}</span></li>`).join("")}</ul>
    <p class="legend">Bars: hard sets this week (last 7 days). Tick: your weekly target for the program.</p>`;
  $("p-level").innerHTML = levelCard(s);
  const weekKcal = st.body ? s.sessions.filter((x) => x.start > now - 7 * DAY).reduce((a, x) => a + (sessionCalories(s, x)?.activeKcal ?? 0), 0) : null;
  $("p-count").textContent = `${st.done.length} workout${st.done.length === 1 ? "" : "s"} · ${s.predictionLog.length} sets · ${s.sigma.obs} check-in${s.sigma.obs === 1 ? "" : "s"} learned from` +
    (weekKcal !== null ? ` · about ${Math.round(weekKcal)} kcal burned in the last 7 days` : "");
}

// ---------- shell ----------

function show() {
  ($("prog") as HTMLSelectElement).value = st.programId;
  const progress = st.tab === "progress";
  $("tab-train").setAttribute("aria-selected", String(!progress));
  $("tab-progress").setAttribute("aria-selected", String(progress));
  const workout = st.current !== null;
  $("view-workout").hidden = progress || !workout;
  $("view-results").hidden = progress || workout;
  $("view-progress").hidden = !progress;
  if (progress) renderProgress();
  else workout ? renderEntries() : renderResults();
  save();
}

const byPattern = new Map<string, typeof catalog.exercises>();
for (const x of catalog.exercises) byPattern.set(x.pattern, [...(byPattern.get(x.pattern) ?? []), x]);
$("pick").innerHTML = `<option value="">+ Add an exercise</option>` + [...byPattern].map(([p, xs]) =>
  `<optgroup label="${cap(p.replace(/_/g, " "))}">${[...xs].sort((a, b) => a.level - b.level).map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</optgroup>`,
).join("");
$("prog").innerHTML = catalog.programs.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");

$("pick").addEventListener("change", (ev) => {
  const sel = ev.target as HTMLSelectElement;
  if (!sel.value) return;
  const hold = catalog.byId[sel.value]!.isHold;
  st.current!.entries.push({ exerciseId: sel.value, sets: [{ amount: hold ? 30 : 10, rir: 2 }] });
  sel.value = "";
  show();
  $("entries").lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
});
$("fill").addEventListener("click", fillPlan);

$("checkin").addEventListener("click", (ev) => {
  const t = ev.target as Element;
  const w = st.current!;
  const feel = t.closest<HTMLElement>("[data-feel]")?.dataset.feel as Feel | undefined;
  const region = t.closest<SVGGElement>("[data-m]")?.dataset.m as Region | undefined;
  if (feel) draft.feel = feel;
  if (region) draft.sore = draft.sore.includes(region) ? draft.sore.filter((m) => m !== region) : [...draft.sore, region];
  if (t.closest("#ci-none")) {
    draft.sore = [];
    return saveCheckin();
  }
  if (t.closest("#ci-save")) return saveCheckin();
  if (t.closest("#ci-yes")) draft.map = true;
  if (t.closest("#ci-back")) draft.map = false;
  if (t.closest("#ci-skip")) {
    w.checkinSkipped = true;
    return afterCheckin();
  }
  if (t.closest("#ci-edit")) {
    draft = w.checkin ? { ...w.checkin, map: w.checkin.sore.length > 0 } : { feel: "normal", sore: [], map: false };
    w.checkin = undefined;
    w.checkinSkipped = false;
    checkinResult = "";
  }
  if (feel || region || t.closest("#ci-yes, #ci-back, #ci-edit")) show();
});
$("checkin").addEventListener("keydown", (ev) => {
  const g = (ev.target as Element).closest("[data-m]");
  if (g && (ev.key === "Enter" || ev.key === " ")) {
    ev.preventDefault();
    (g as SVGGElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    requestAnimationFrame(() => document.querySelector<SVGGElement>(`#checkin [data-m="${(g as SVGGElement).dataset.m}"]`)?.focus());
  }
});

$("entries").addEventListener("click", (ev) => {
  const btn = (ev.target as HTMLElement).closest("button");
  const card = btn?.closest<HTMLElement>(".card");
  if (!btn || !card) return;
  const x = st.current!.entries[+card.dataset.i!]!;
  const j = btn.closest<HTMLElement>(".set")?.dataset.j;
  const set = j === undefined ? undefined : x.sets[+j];
  const act = btn.dataset.act;
  if (act === "rm-ex") st.current!.entries.splice(+card.dataset.i!, 1);
  if (act === "add-set") x.sets.push({ ...(x.sets[x.sets.length - 1] ?? { amount: 10, rir: 2 }), amrap: false, edited: false });
  if (act === "rm-set" && j !== undefined) {
    x.sets.splice(+j, 1);
    if (!x.sets.length) st.current!.entries.splice(+card.dataset.i!, 1);
  }
  if (set && act === "inc") Object.assign(set, { amount: set.amount + 1, edited: true });
  if (set && act === "dec") Object.assign(set, { amount: Math.max(1, set.amount - 1), edited: true });
  if (set && act === "effort") {
    set.rir = +btn.dataset.rir!;
    set.edited = true;
    if (set.rir > 0) set.amrap = false; // not all-out after all: log it as a normal set
  }
  const fb = (x.feedback ??= {});
  if (act === "like") fb.liked = fb.liked === true ? undefined : true;
  if (act === "dislike") fb.liked = fb.liked === false ? undefined : false;
  if (act === "pain") fb.pain = fb.pain ? undefined : true;
  show();
  if (act === "inc" || act === "dec" || act === "effort") document.querySelector<HTMLElement>(`.card[data-i="${card.dataset.i}"] .set[data-j="${j}"] [data-act="${act}"]${act === "effort" ? `[data-rir="${btn.dataset.rir}"]` : ""}`)?.focus();
});

$("entries").addEventListener("change", (ev) => {
  const el = ev.target as HTMLInputElement;
  const row = el.closest<HTMLElement>(".set");
  const card = el.closest<HTMLElement>(".card");
  if (!row || !card || el.dataset.f !== "amount") return;
  const v = Math.round(Number(el.value));
  if (!Number.isFinite(v) || v < 1) return;
  Object.assign(st.current!.entries[+card.dataset.i!]!.sets[+row.dataset.j!]!, { amount: v, edited: true });
  show();
});

$("finish").addEventListener("click", () => {
  // Compare with the state after today's check-in, so results only show what the workout itself taught.
  const before = stateOf([...st.done, { ...st.current!, entries: [] }]);
  st.done.push(st.current!);
  st.current = null;
  st.hoursAfter = 0;
  lastInsights = insights(before, stateOf(st.done));
  checkinResult = "";
  show();
  window.scrollTo({ top: 0 });
});
$("rcal").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const num = (id: string) => {
    const v = ($(id) as HTMLInputElement).value;
    return v === "" ? undefined : Number(v);
  };
  const kg = num("b-kg");
  if (kg === undefined || !(kg >= 25 && kg <= 350)) return;
  const cm = num("b-cm");
  const age = num("b-age");
  const sex = ($("b-sex") as HTMLSelectElement).value as Body["sex"] | "";
  st.body = {
    bodyMassKg: kg,
    ...(cm !== undefined && cm >= 100 && cm <= 250 ? { heightCm: cm } : {}),
    ...(age !== undefined && age >= 13 && age <= 100 ? { ageYears: Math.round(age) } : {}),
    ...(sex ? { sex } : {}),
  };
  show();
});
$("hours").addEventListener("input", (ev) => {
  st.hoursAfter = +(ev.target as HTMLInputElement).value;
  renderResults();
  save();
});
$("edit").addEventListener("click", () => {
  st.current = st.done.pop()!;
  lastInsights = [];
  show();
});
const startNext = (w: Workout) => {
  st.current = w;
  draft = { feel: "normal", sore: [], map: false };
  checkinResult = "";
  lastInsights = [];
  show();
  window.scrollTo({ top: 0 });
};
$("next").addEventListener("click", () => startNext({ start: endOf(last()) + Math.max(st.hoursAfter, 1) * H, entries: [] }));
$("use-plan").addEventListener("click", () => {
  if (!pendingPlan || pendingPlan.plan.kind === "rest") return;
  startNext({ start: pendingPlan.at, entries: [], fromPlan: true });
});
for (const id of ["reset", "reset2"]) $(id).addEventListener("click", () => {
  st = fresh(st.programId);
  lastInsights = [];
  checkinResult = "";
  draft = { feel: "normal", sore: [], map: false };
  show();
});
$("prog").addEventListener("change", (ev) => {
  st.programId = (ev.target as HTMLSelectElement).value;
  show();
});
for (const [id, tab] of [["tab-train", "train"], ["tab-progress", "progress"]] as const) {
  $(id).addEventListener("click", () => {
    st.tab = tab;
    show();
    window.scrollTo({ top: 0 });
  });
}

// One shared tooltip for every [data-tip] mark (bars, dots, body regions).
const tip = $("tip");
document.addEventListener("pointermove", (ev) => {
  const t = (ev.target as Element).closest?.("[data-tip]");
  if (!t || !(t as HTMLElement).dataset.tip) return void (tip.hidden = true);
  tip.textContent = (t as HTMLElement).dataset.tip!;
  tip.hidden = false;
  const x = Math.min(ev.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
  tip.style.transform = `translate(${Math.max(8, x)}px, ${ev.clientY + 14}px)`;
});
document.addEventListener("pointerleave", () => (tip.hidden = true));

show();
