// The screens after "Workout done": what RepVyn learned from today, what grew since day 1, and the card to share.
// Contour lines on the figure always mean the same thing: the muscle to notice (most worked today, or grown most since day 1).
import { useMemo, useState } from "preact/hooks";
import { REGIONS, type Muscle as MuscleId, type Region } from "../../../src/engine";
import { draw, figure, type Theme } from "../figure";
import { growth, learnedLine, learnedRows, mostWorked, muscleName, type Dir, type GrowthRow, type LearnedRow } from "../finish";
import { planTitle, planWeeks, programWeek, weekMuscles, weekStart, weekWorkouts } from "../model";
import { stateWith } from "../store";
import { repsDone, toEvents, type Run } from "../workout";
import type { App } from "./app";
import { Faint, Fig, Mark, Muscle, Scroll, useFigures } from "./kit";
import { fFig, fUp, tick, useMove } from "./motion";

const BIG = "height: 60px; font-size: 17px; border: 0; border-radius: 999px; font-weight: 700; letter-spacing: -0.01em; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer;";
const clock = (t: number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
const LINE_ON_RED = "#C4223A";

const ShareIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"></path><path d="M5 12.5v6A2 2 0 0 0 7 20.5h10a2 2 0 0 0 2-2v-6"></path></svg>;
const ARROWS: Record<Dir, preact.JSX.Element> = {
  up: <path d="M12 19V5M6 11l6-6 6 6"></path>,
  down: <path d="M12 5v14M6 13l6 6 6-6"></path>,
  same: <path d="M6 12h12"></path>,
};
const Arrow = ({ dir }: { dir: Dir }) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ARROWS[dir]}</svg>;

/** A patch of contour lines: the legend for the lines on the figure. */
export const Swatch = ({ bg = "#FFFFFF", line = LINE_ON_RED, size = 18 }: { bg?: string; line?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true" style="flex-shrink: 0;"><rect width="22" height="22" rx="7" fill={bg}></rect>{[4, 8].map((i) => <rect key={i} x={i - 1.6} y={i - 1.6} width={25.2 - 2 * i} height={25.2 - 2 * i} rx={Math.max(1.5, 7 - i / 1.6)} fill="none" stroke={line} stroke-width="2.2"></rect>)}</svg>
);

/** Everything the finish screens show, worked out once from today's sets. */
export interface Recap {
  rows: LearnedRow[];
  line: string;
  grew: GrowthRow[];
  worked: Region[];
  lines: Region[];
  title: string;
  when: string;
  totals: { time: string; sets: number; reps: number };
  list: [string, string][];
  /** Set when this workout put the week on plan: the numbers for the short full-screen moment. */
  week: WeekWin | null;
}
export interface WeekWin { n: number; title: number; sets: number; reps: number; run: number; values: Partial<Record<MuscleId, number>>; lines: Region[] }
export function useRecap(app: App, run: Run): Recap {
  return useMemo(() => {
    const now = Date.now();
    const after = stateWith(app.saved, toEvents(run, "recap", now));
    const units = app.saved.settings.units;
    const rows = learnedRows(after, run, now, units);
    const most = mostWorked(app.s, run);
    const pweek = programWeek(app.saved.programStart, now);
    const list = rows.map((r): [string, string] => {
      const done = run.done.filter((d) => d.exerciseId === r.id);
      const sec = done[0]?.seconds !== undefined;
      return [r.name, `${done.reduce((t, d) => t + (d.seconds ?? d.reps ?? 0), 0)}${sec ? " sec" : ""}`];
    });
    const target = app.saved.settings.days;
    let week: WeekWin | null = null;
    if (weekWorkouts(app.s, now) < target && weekWorkouts(after, now) >= target) {
      const mon = weekStart(now);
      const sets = [...app.saved.events, ...toEvents(run, "recap", now)].filter((e) => e.type === "set_logged" && e.ts >= mon) as { payload: { reps?: number } }[];
      const v = weekMuscles(after, now).values;
      const top = (Object.entries(v) as [Region, number][]).sort((a, b) => b[1] - a[1]);
      week = {
        n: target, title: programWeek(app.saved.programStart, now), sets: sets.length, reps: sets.reduce((t, e) => t + (e.payload.reps ?? 0), 0),
        run: planWeeks(after, now, target, app.saved.createdAt).run,
        values: Object.fromEntries(top.map(([m, x]) => [m, x >= 0.5 ? 1 : 0.5])), lines: top.slice(0, 1).map(([m]) => m),
      };
    }
    return {
      week, rows, line: learnedLine(rows), grew: growth(after, units), worked: most.order, lines: most.lines,
      title: app.setupPlan.kind === "workout" ? planTitle(app.setupPlan) : "Workout",
      when: `${new Date(now).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · Week ${pweek}`,
      totals: { time: clock(run.elapsed), sets: run.done.length, reps: repsDone(run) }, list,
    };
  }, []);
}
const names = (ms: readonly Region[]) => {
  const n = [...new Set(ms.map(muscleName))];
  return n.length <= 1 ? (n[0] ?? "") : `${n.slice(0, -1).join(", ")} and ${n.at(-1)}`.toLowerCase().replace(/^./, (c) => c.toUpperCase());
};

function Bottom({ share, next, label }: { share: () => void; next: () => void; label: string }) {
  return (
    <div style="position: absolute; left: 20px; right: 20px; bottom: var(--bottom); display: flex; gap: 10px;">
      <button type="button" class="press" onClick={() => { tick(); share(); }} aria-label="Share workout" style={`${BIG} flex: 0 0 60px; background: var(--surface); color: var(--ink);`}><ShareIcon /></button>
      <button type="button" class="press" onClick={() => { tick(); next(); }} style={`${BIG} flex: 1 1 0; background: var(--accent); color: #FFFFFF; box-shadow: var(--hero-shadow);`}>{label}</button>
    </div>
  );
}

/** Today, exercise by exercise: what you did and what RepVyn set for next time from it. */
export function Learned({ app, recap, share, next, last }: { app: App; recap: Recap; share: () => void; next: () => void; last: boolean }) {
  const reps = recap.totals.reps;
  return (
    <div ref={useMove("page-in")} role="dialog" aria-label="What RepVyn learned" style="position: absolute; inset: 0; z-index: 6; background: var(--bg); color: var(--ink);">
      <Scroll bottom={120}>
        <span style="font-size: 15px; font-weight: 600; color: var(--muted);">{recap.title} · {recap.rows.length} exercise{recap.rows.length === 1 ? "" : "s"} · {reps} reps</span>
        <h1 style="margin: 6px 0 0; font-size: 34px; line-height: 1; font-weight: 800; letter-spacing: -0.035em;">What RepVyn <Faint>learned</Faint></h1>
        <p style="margin: 10px 0 0; font-size: 15px; line-height: 1.35; color: var(--muted);">{recap.line}</p>
        <div aria-hidden="true" style="margin-top: 14px; display: flex; justify-content: space-between; padding: 0 16px 6px 72px; font-size: 13px; font-weight: 600; color: var(--muted);"><span>Today</span><span>Next time</span></div>
        <ul style="margin: 0; padding: 4px 16px; list-style: none; background: var(--surface); border-radius: 24px;">
          {recap.rows.map((r, i) => (
            <li key={r.id} ref={fUp} data-delay={120 + i * 60} aria-label={`${r.name}: today ${r.today}, next time ${r.next}`} style={`display: flex; align-items: center; gap: 12px; padding: 9px 0; ${i === recap.rows.length - 1 ? "" : "border-bottom: 1px solid var(--soft);"}`}>
              <Muscle region={r.region} theme={app.theme} size={44} radius={13} />
              <span style="flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 2px;"><span style="font-size: 16px; font-weight: 700; letter-spacing: -0.015em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{r.name}</span><span style="font-size: 14px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{r.today}</span></span>
              <span style={`flex-shrink: 0; white-space: nowrap; display: flex; align-items: center; gap: 5px; font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; text-align: right; color: ${r.dir === "same" ? "var(--muted)" : "var(--ink)"};`}><span style={`display: flex; color: ${r.dir === "up" ? "var(--accent-text)" : "var(--muted)"};`}><Arrow dir={r.dir} /></span>{r.next}</span>
            </li>
          ))}
        </ul>
      </Scroll>
      <Bottom share={share} next={next} label={last ? "Finish" : "Next"} />
    </div>
  );
}

/** From the second week: the muscles that grew since day 1, lined on the body, with the numbers behind each. */
export function Growth({ app, recap, share, next, last = true }: { app: App; recap: Recap; share: () => void; next: () => void; last?: boolean }) {
  const grown = recap.grew.map((g) => g.region);
  const all = Object.fromEntries(REGIONS.map((m) => [m, 1])) as Partial<Record<MuscleId, number>>;
  return (
    <div ref={useMove("page-in")} role="dialog" aria-label="Growth since day 1" style="position: absolute; inset: 0; z-index: 7; background: var(--bg); color: var(--ink);">
      <Scroll bottom={120}>
        <span style="font-size: 15px; font-weight: 600; color: var(--muted);">Since day 1</span>
        <h1 style="margin: 6px 0 0; font-size: 34px; line-height: 1; font-weight: 800; letter-spacing: -0.035em;">Your {muscleName(grown[0]!).toLowerCase()} <Faint>grew most</Faint></h1>
        <div ref={fUp} data-delay="100" style="margin-top: 16px; border-radius: 28px; background: var(--hero); box-shadow: var(--hero-card-shadow); padding: 18px 10px 14px; display: flex; flex-direction: column; align-items: center;">
          <div style="width: 100%; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px;">
            <Fig view="front" kind="hero" values={all} lines={grown} theme={app.theme} h={260} alt={`Front of the body. Lines mark where you grew most: ${names(grown)}.`} />
            <Fig view="back" kind="hero" values={all} lines={grown} theme={app.theme} h={260} alt="Back of the body." />
          </div>
          <span style="margin-top: 10px; display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.86);"><Swatch />Lines mark where you grew most</span>
        </div>
        <ul style="margin: 14px 0 0; padding: 0 18px; list-style: none; background: var(--surface); border-radius: 24px;">
          {recap.grew.map((g, i) => (
            <li key={g.name} ref={fUp} data-delay={260 + i * 70} style={`display: flex; align-items: center; gap: 12px; padding: 11px 0; ${i ? "border-top: 1px solid var(--soft);" : ""}`}>
              <span style="flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 2px;"><span style="font-size: 16px; font-weight: 700; letter-spacing: -0.015em;">{g.name}</span><span style="font-size: 14px; color: var(--muted);">{g.how}</span></span>
              <span style="font-family: var(--mono); font-size: 22px; font-weight: 600; letter-spacing: -0.03em;">+{g.pct}%</span>
            </li>
          ))}
        </ul>
      </Scroll>
      <Bottom share={share} next={next} label={last ? "Finish" : "Next"} />
    </div>
  );
}

/** The week as a ring: one segment per planned workout. */
function Ring({ n, size, stroke }: { n: number; size: number; stroke: number }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, gap = 0.035 * c, seg = c / n - gap;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style="transform: rotate(-90deg); flex-shrink: 0;">
      {Array.from({ length: n }, (_, i) => (
        <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#FFFFFF" stroke-width={stroke} stroke-linecap="round"
          stroke-dasharray={`${seg} ${c - seg}`} stroke-dashoffset={-i * (seg + gap) - gap / 2}></circle>
      ))}
    </svg>
  );
}

/** After the week's last planned workout: a short red moment. The ring fills, the week is named, and the body shows the week. */
export function WeekMoment({ app, week, share, done }: { app: App; week: WeekWin; share: () => void; done: () => void }) {
  return (
    <div ref={useMove("page-in")} role="dialog" aria-label={`Week ${week.title} on plan`} style="position: absolute; inset: 0; z-index: 8; background: var(--hero); color: #FFFFFF;">
      <div style="height: 100%; box-sizing: border-box; padding: var(--top) 20px var(--bottom); display: flex; flex-direction: column;">
        <div ref={fFig} data-delay="200" style="position: relative; align-self: center; margin-top: 8px;">
          <Ring n={week.n} size={176} stroke={16} />
          <span style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;"><span style="font-family: var(--mono); font-size: 46px; line-height: 1; font-weight: 600; letter-spacing: -0.04em;">{week.n}/{week.n}</span><span style="margin-top: 4px; font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.74);">workouts</span></span>
        </div>
        <h1 ref={fUp} data-delay="700" style="margin: 24px 0 0; font-size: 56px; line-height: 0.94; font-weight: 800; letter-spacing: -0.04em; text-align: center;">Week {week.title}<br /><span style="color: rgba(255,255,255,0.62);">on plan</span></h1>
        <p ref={fUp} data-delay="820" style="margin: 14px 0 0; text-align: center; font-size: 15px; font-weight: 600; color: rgba(255,255,255,0.86);">{week.sets} sets · {week.reps} reps · {week.run} {week.run === 1 ? "week" : "weeks"} on plan</p>
        <div ref={fUp} data-delay="940" style="margin-top: 16px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px;">
          <Fig view="front" kind="hero" values={week.values} lines={week.lines} theme={app.theme} h={220} alt={`Front of the body with this week's muscles lit. Lines mark the most worked: ${names(week.lines).toLowerCase()}.`} />
          <Fig view="back" kind="hero" values={week.values} lines={week.lines} theme={app.theme} h={220} alt="Back of the body." />
        </div>
        {week.lines.length > 0 && <span style="margin-top: 8px; align-self: center; display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.86);"><Swatch />Most worked this week: {names(week.lines).toLowerCase()}</span>}
        <div style="flex: 1 1 0; min-height: 12px;"></div>
        <div style="display: flex; gap: 10px;">
          <button type="button" class="press" onClick={() => { tick(); share(); }} aria-label="Share workout" style={`${BIG} flex: 0 0 60px; background: rgba(255,255,255,0.18); color: #FFFFFF;`}><ShareIcon /></button>
          <button type="button" class="press" onClick={() => { tick(); done(); }} style={`${BIG} flex: 1 1 0; background: #FFFFFF; color: var(--hero);`}>Done</button>
        </div>
      </div>
    </div>
  );
}

/** What the share card marks: the muscle that grew most since day 1, or today's most worked before there is any growth. */
const highlight = (r: Recap): { lines: Region[]; text: string; growth: boolean } =>
  r.grew[0] ? { lines: [r.grew[0].region], text: `${r.grew[0].name} +${r.grew[0].pct}% since day 1`, growth: true } : { lines: r.lines, text: "Lines mark the most worked", growth: false };
/** Today's muscles on the card: the three worked most in white, the rest of what was trained in pink. */
const cardValues = (r: Recap) => ({ ...Object.fromEntries(r.worked.map((m, i) => [m, i < 3 ? 1 : 0.5])), ...Object.fromEntries(highlight(r).lines.map((m) => [m, 1])) }) as Partial<Record<MuscleId, number>>;

function ShareCard({ recap, theme }: { recap: Recap; theme: Theme }) {
  const h = highlight(recap);
  const values = cardValues(recap);
  return (
    <div style="width: min(334px, 100%); aspect-ratio: 9 / 16; margin: 0 auto; border-radius: 28px; background: var(--hero); color: #FFFFFF; box-shadow: var(--hero-card-shadow); padding: 20px 20px 18px; box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden;">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;"><span style="display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 15px; letter-spacing: -0.01em;"><Mark size={24} />RepVyn</span><span style="font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.74);">{recap.when}</span></div>
      <h2 style="margin: 14px 0 0; font-size: 40px; line-height: 0.95; font-weight: 800; letter-spacing: -0.04em;">{recap.title}</h2>
      <span style="margin-top: 6px; font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.8);">Most work: {names(recap.worked.slice(0, 3)).toLowerCase()}</span>
      <div style="margin-top: 10px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px;">
        <Fig view="front" kind="hero" values={values} lines={h.lines} theme={theme} h={172} alt="" />
        <Fig view="back" kind="hero" values={values} lines={h.lines} theme={theme} h={172} alt="" />
      </div>
      <span style="margin-top: 8px; align-self: center; display: flex; align-items: center; gap: 8px; padding: 6px 12px 6px 7px; border-radius: 999px; background: rgba(72,6,18,0.3); font-size: 13px; font-weight: 700;"><Swatch />{h.text}</span>
      <ul style="margin: 14px 0 0; padding: 0; list-style: none; display: grid; grid-template-columns: 1fr auto; column-gap: 12px; row-gap: 4px; font-size: 13px; font-weight: 600;">
        {recap.list.slice(0, 7).map(([n, r]) => <><span style="color: rgba(255,255,255,0.86); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{n}</span><span style="font-variant-numeric: tabular-nums; font-weight: 700; text-align: right;">{r}</span></>)}
      </ul>
      <div style="flex: 1 1 0;"></div>
      <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.22); display: flex; justify-content: space-between;">
        {[[recap.totals.time, "time"], [String(recap.totals.sets), "sets"], [String(recap.totals.reps), "reps"]].map(([v, l]) => <div key={l} style="display: flex; flex-direction: column;"><span style="font-family: var(--mono); font-size: 24px; line-height: 1; font-weight: 600; letter-spacing: -0.03em;">{v}</span><span style="margin-top: 3px; font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.74);">{l}</span></div>)}
      </div>
    </div>
  );
}

const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="344" height="344" viewBox="0 0 344 344"><rect width="344" height="344" rx="77" fill="#DE223D"/><g fill="#fff" transform="translate(50.7 70.2) scale(1.7833)"><path d="M8.6 8.4H73A22 22 0 0 1 95 30.4Q95 38 91.5 43.5L80.5 60.4Q69.9 76.7 59.4 60L50 44.5H63A7.15 7.15 0 0 0 63 30.2H25Q20.2 30.2 17.9 26Z"/><path d="M127.9 39.2H111Q103.5 39.2 98.6 46.9L69.4 92.4 44 50.8Q37.2 39.5 27 39.5H24Q8 39.5 15.2 52.8L45.5 99Q50.1 106.1 58 106.1H82Q90.6 106.1 94.8 98.7Z"/></g></svg>`;

/** The share card as a 1080 × 1920 story image, painted directly (the figures come from the same renderer as the screen). */
async function storyImage(recap: Recap): Promise<Blob> {
  await document.fonts?.ready;
  const W = 1080, H = 1920, k = W / 334, P = 20 * k;
  const c = document.createElement("canvas");
  [c.width, c.height] = [W, H];
  const g = c.getContext("2d")!;
  g.fillStyle = "#C4223A";
  g.fillRect(0, 0, W, H);
  const font = (w: number, px: number, mono = false) => { g.font = `${w} ${px * k}px ${mono ? "'Geist Mono', ui-monospace" : "Geist, system-ui"}, sans-serif`; };
  const text = (t: string, x: number, y: number, colour = "#FFFFFF", align: CanvasTextAlign = "left") => { g.fillStyle = colour; g.textAlign = align; g.fillText(t, x, y); };
  const mark = new Image();
  mark.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(MARK_SVG)}`;
  await mark.decode().catch(() => {});
  let y = P;
  g.drawImage(mark, P, y, 24 * k, 24 * k);
  font(800, 15); g.textBaseline = "middle"; text("RepVyn", P + 32 * k, y + 12 * k);
  font(600, 13); text(recap.when, W - P, y + 12 * k, "rgba(255,255,255,0.74)", "right");
  g.textBaseline = "alphabetic";
  y += 24 * k + 14 * k + 36 * k;
  font(800, 40); text(recap.title, P, y);
  y += 24 * k; font(600, 13); text(`Most work: ${names(recap.worked.slice(0, 3)).toLowerCase()}`, P, y, "rgba(255,255,255,0.8)");
  y += 14 * k;
  const h = highlight(recap), values = cardValues(recap), fh = 172 * k, colW = (W - 2 * P - 4 * k) / 2;
  for (const [i, view] of (["front", "back"] as const).entries()) {
    const d = figure(view, "light", "hero", values, fh / (globalThis.devicePixelRatio || 1), "all", h.lines);
    if (!d) continue;
    const t = document.createElement("canvas");
    [t.width, t.height] = [d.w, d.h];
    draw(t, d);
    const fw = (d.w / d.h) * fh;
    g.drawImage(t, P + i * (colW + 4 * k) + (colW - fw) / 2, y, fw, fh);
  }
  y += fh + 8 * k;
  font(700, 13);
  const pillW = g.measureText(h.text).width + 45 * k, pillH = 30 * k, px = (W - pillW) / 2;
  g.fillStyle = "rgba(72,6,18,0.3)"; g.beginPath(); g.roundRect(px, y, pillW, pillH, pillH / 2); g.fill();
  const sw = new Image();
  sw.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><rect width="22" height="22" rx="7" fill="#fff"/><rect x="2.4" y="2.4" width="17.2" height="17.2" rx="4.5" fill="none" stroke="${LINE_ON_RED}" stroke-width="2.2"/><rect x="6.4" y="6.4" width="9.2" height="9.2" rx="2" fill="none" stroke="${LINE_ON_RED}" stroke-width="2.2"/></svg>`)}`;
  await sw.decode().catch(() => {});
  g.drawImage(sw, px + 7 * k, y + 6 * k, 18 * k, 18 * k);
  g.textBaseline = "middle"; text(h.text, px + 33 * k, y + pillH / 2); g.textBaseline = "alphabetic";
  y += pillH + 14 * k + 13 * k;
  font(600, 13);
  for (const [n, r] of recap.list.slice(0, 7)) {
    text(n, P, y, "rgba(255,255,255,0.86)");
    font(700, 13); text(r, W - P, y, "#FFFFFF", "right"); font(600, 13);
    y += 20 * k;
  }
  const by = H - P - 40 * k;
  g.fillStyle = "rgba(255,255,255,0.22)"; g.fillRect(P, by - 12 * k, W - 2 * P, Math.max(1, k));
  const stats: [string, string, CanvasTextAlign, number][] = [[recap.totals.time, "time", "left", P], [String(recap.totals.sets), "sets", "center", W / 2], [String(recap.totals.reps), "reps", "right", W - P]];
  for (const [v, l, a, x] of stats) { font(600, 24, true); text(v, x, by + 20 * k, "#FFFFFF", a); font(600, 12); text(l, x, by + 37 * k, "rgba(255,255,255,0.74)", a); }
  return new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("no image"))), "image/png"));
}

/** Save image downloads the card; Share opens the phone's share sheet with it (or saves it where sharing files is not supported). */
export function ShareSheet({ app, recap, close }: { app: App; recap: Recap; close: () => void }) {
  useFigures();
  const [busy, setBusy] = useState(false);
  const file = async () => new File([await storyImage(recap)], `repvyn-${new Date().toISOString().slice(0, 10)}.png`, { type: "image/png" });
  const save = (f: File) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const run = (share: boolean) => async () => {
    if (busy) return;
    tick();
    setBusy(true);
    try {
      const f = await file();
      if (share && navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], title: "My RepVyn workout" }).catch(() => {});
      else save(f);
    } finally { setBusy(false); }
  };
  return (
    <div ref={useMove("sheet-in")} role="dialog" aria-label="Share your workout" style="position: absolute; inset: 0; z-index: 9; background: var(--bg); color: var(--ink); box-sizing: border-box; padding: var(--top-tight) 20px var(--bottom); display: flex; flex-direction: column;">
      <div style="display: flex; align-items: center; justify-content: space-between; min-height: 44px;">
        <button type="button" class="press" onClick={close} aria-label="Back" style="width: 44px; height: 44px; border: 0; border-radius: 999px; background: var(--surface); color: var(--ink); display: flex; align-items: center; justify-content: center; cursor: pointer;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"></path></svg></button>
        <span style="font-size: 15px; font-weight: 600; color: var(--muted);">Share your workout</span>
        <span style="width: 44px;"></span>
      </div>
      <div ref={fUp} data-delay="60" style="flex: 1 1 0; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 12px 0;"><ShareCard recap={recap} theme={app.theme} /></div>
      <div style="display: flex; gap: 10px;">
        <button type="button" class="press" disabled={busy} onClick={run(false)} style={`${BIG} flex: 1 1 0; background: var(--surface); color: var(--ink);`}>Save image</button>
        <button type="button" class="press" disabled={busy} onClick={run(true)} style={`${BIG} flex: 1 1 0; background: var(--ink); color: var(--bg);`}><ShareIcon />Share</button>
      </div>
    </div>
  );
}
