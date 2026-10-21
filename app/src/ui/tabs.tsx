// The four tabs: Today, Body, Progress, Profile.
import { useRef, useState } from "preact/hooks";
import { EQUIPMENT, REGIONS, REGION_NAMES, type Equipment, type Muscle as MuscleId, type Plan, type Region } from "../../../src/engine";
import { figure } from "../figure";
import { catalog } from "../env";
import {
  WORK, WORK_INK, activity, isLegsDay, planValues, needsCheckin, planRegions, planRows, planTitle, planWhy, programWeek, sparkPath,
  strengthRows, trainedToday, weekMuscles, weekStrip, weightLabel,
  nudgeWeight, startingPoints, H, PROGRAM_NAME, STRAIN, addDays, dayStart, planWeeks, readyAt, strain, strainColour, strainFigure, strainRows, type StrainRow,
} from "../model";
import { ownedFromChoice } from "./dumbbells";
import { AccountSection } from "./account";
import type { App } from "./app";
import { capfill, pop, tick } from "./motion";
import { Clock, EQUIP_NAMES, EquipAvatar, EquipInline, EquipStack, Layers, ListIcon } from "./icons";
import type { ComponentChildren } from "preact";
import { Card, Check, Chevron, Faint, Figures, H1, Muscle, Opt, OptGrid, Paint, Row, Scroll, Section, Stepper, useFigures } from "./kit";
import { DumbbellPicker } from "./dumbbells";

export { EQUIP_NAMES };
const EQUIP_ORDER: Equipment[] = ["dumbbell", "bench", "resistance_band", "pullup_bar", "table", "chair"];
export const equipLabel = (eq: Equipment[]) => (eq.length === 0 ? "Bodyweight" : eq.length === 1 ? `Bodyweight + ${EQUIP_NAMES[eq[0]!].toLowerCase()}` : `Bodyweight + ${eq.length} items`);
/**
 * Bodyweight and every item as tiles with their pictures, three to a row. Bodyweight is always on, because bodyweight moves are in
 * every plan; picking an item adds it. A chosen tile is the dark one, with nothing else to mark it.
 */
export function EquipOptions({ value, set }: { value: Equipment[]; set: (eq: Equipment[]) => void }) {
  const tile = (item: Equipment | "bodyweight", label: string, on: boolean, pick: () => void) => (
    <button key={item} type="button" class="tab pick" onClick={() => { tick(); pick(); }} aria-pressed={on ? "true" : "false"}
      style={`min-height: 80px; flex-direction: column; gap: 8px; padding-top: 6px; border: 0; border-radius: 20px; cursor: pointer; background: ${on ? "var(--ink)" : "var(--bg)"}; color: ${on ? "var(--bg)" : "var(--ink)"}; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; letter-spacing: -0.01em; transition: background 200ms ease, color 200ms ease;`}>
      <EquipAvatar item={item} size={38} />
      {label}
    </button>
  );
  return (
    <OptGrid cols={3} label="Equipment">
      {tile("bodyweight", "Bodyweight", true, () => {})}
      {EQUIP_ORDER.filter((e) => EQUIPMENT.includes(e)).map((e) => tile(e, EQUIP_NAMES[e], value.includes(e), () => set(value.includes(e) ? value.filter((x) => x !== e) : [...value, e])))}
    </OptGrid>
  );
}

const FEEL = [["fresh", "Fresh"], ["normal", "Normal"], ["beat_up", "Worn out"]] as const;

// ---------- Today ----------

export function Today({ app }: { app: App }) {
  const { s, now, saved, ui } = app;
  const week = programWeek(saved.programStart, now);
  const doneWeeks = week - 1;
  const strip = weekStrip(s, now, saved.createdAt);
  const doneToday = trainedToday(s, now);
  const plan = app.todayPlan;
  const ask = needsCheckin(s, now);
  return (
    <Scroll cls="pane">
      <header style="display: flex; flex-direction: column;">
        <button type="button" class="press" onClick={app.openPrograms} aria-label={`${PROGRAM_NAME}, view program`} style="align-self: flex-start; margin: 0 0 6px -1px; min-height: 32px; padding: 0; border: 0; background: transparent; cursor: pointer; display: flex; align-items: center; gap: 2px; font-size: 15px; font-weight: 600; white-space: nowrap; color: var(--muted);">
          {PROGRAM_NAME}<Chevron />
        </button>
        <H1>Week {week} <Faint>of 12</Faint></H1>
        <div role="progressbar" aria-label="Weeks completed" aria-valuemin={0} aria-valuemax={12} aria-valuenow={doneWeeks} style="margin-top: 14px; display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 4px;">
          {Array.from({ length: 12 }, (_, i) => <span key={i} style={`height: 6px; border-radius: 999px; background: ${i < doneWeeks ? "var(--ink)" : i === doneWeeks ? "var(--accent)" : "var(--track)"};`}></span>)}
        </div>
      </header>

      <div role="list" aria-label="This week" style="margin-top: 18px; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px;">
        {strip.map((d) => {
          const base = "height: 64px; border-radius: 999px; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;";
          // Today is the one raised day.
          const look = d.kind === "done" ? `background: ${WORK[d.work - 1]}; color: ${WORK_INK[d.work - 1]};`
            : d.kind === "rest" ? "border: 1.5px solid var(--line); color: var(--muted);"
            : d.kind === "today" ? "border: 2px solid var(--accent); background: var(--surface); color: var(--ink); box-shadow: var(--today-shadow);"
            : d.kind === "todayDone" ? "border: 2px solid var(--accent); background: var(--accent); color: #FFFFFF;"
            : d.kind === "before" ? "background: var(--surface); color: var(--muted);"
            : "background: var(--surface); color: var(--ink);";
          const done = d.kind === "done" || d.kind === "todayDone";
          return (
            <div key={d.date} ref={d.kind === "todayDone" && ui.justFinished ? capfill : undefined} data-delay="560" role="listitem" aria-label={d.label} style={base + look + (done ? " padding: 0;" : "")}>
              {done ? (
                <button type="button" class="press" onClick={() => app.openDone(d.day)} aria-label={`${d.label}. See the workout`} style="width: 100%; height: 100%; padding: 0; border: 0; border-radius: inherit; background: transparent; color: inherit; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; cursor: pointer;">
                  <span aria-hidden="true" style="font-size: 11px; line-height: 1; font-weight: 600;">{d.letter}</span>
                  <span aria-hidden="true" style="height: 18px; display: flex; align-items: center;"><Check /></span>
                </button>
              ) : (<>
                <span aria-hidden="true" style={`font-size: 11px; line-height: 1; font-weight: 600; ${d.kind === "upcoming" || d.kind === "before" ? "color: var(--muted);" : ""}`}>{d.letter}</span>
                <span aria-hidden="true" style="height: 18px; display: flex; align-items: center; font-size: 17px; line-height: 1; font-weight: 700; letter-spacing: -0.02em;">{d.date}</span>
              </>)}
            </div>
          );
        })}
      </div>

      {ask && (
        <section ref={pop} aria-label="Daily check-in" style="margin-top: 20px; padding: 16px; border-radius: 24px; background: var(--surface); display: flex; flex-direction: column; gap: 12px;">
          <h2 style="margin: 0; font-size: 17px; line-height: 1.2; font-weight: 700; letter-spacing: -0.015em;">{ui.feel ? "Anything sore?" : "How do you feel today?"}</h2>
          {ui.feel
            ? <OptGrid cols={2} label="Anything sore?"><Opt label="Nothing" on={false} pick={() => app.checkin([])} /><Opt label="Yes" on={false} pick={app.openSore} /></OptGrid>
            : <OptGrid cols={3} label="How do you feel today?">{FEEL.map(([k, l]) => <Opt key={k} label={l} on={false} pick={() => app.set({ feel: k })} />)}</OptGrid>}
        </section>
      )}

      {doneToday.length ? <DoneCard app={app} next={plan} /> : <HeroCard app={app} plan={plan} />}
      {doneToday.length > 0 && plan.kind === "workout" && (
        <button type="button" class="press" onClick={app.openSetup} style="margin-top: 12px; width: 100%; min-height: 64px; padding: 0 20px; border: 0; border-radius: 24px; background: var(--surface); color: var(--ink); display: flex; align-items: center; justify-content: space-between; gap: 12px; cursor: pointer; text-align: left;">
          <span style="display: flex; flex-direction: column; gap: 2px;"><span style="font-size: 13px; font-weight: 600; color: var(--muted);">Train again</span><span style="font-size: 17px; font-weight: 700; letter-spacing: -0.015em;">{planTitle(plan)}</span></span>
          <Chevron size={18} />
        </button>
      )}

      {!doneToday.length && plan.kind === "workout" && (
        <Section title="Today's plan">
          <ol style="margin: 0; padding: 0 16px; list-style: none; background: var(--surface); border-radius: 24px; display: flex; flex-direction: column;">
            {planRows(s, plan, saved.settings.units).map((r, i, a) => (
              <li key={r.id} style={`min-height: 80px; box-sizing: border-box; display: flex; align-items: center; gap: 14px; ${i < a.length - 1 ? "border-bottom: 1px solid var(--soft);" : ""}`}>
                <Muscle region={r.region} levels={r.levels} theme={app.theme} />
                <span style="flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px;"><span style="font-size: 17px; line-height: 1.2; font-weight: 700; letter-spacing: -0.015em;">{r.name}</span><span style="font-size: 15px; line-height: 1.3; color: var(--muted);">{r.detail}<EquipInline items={s.catalog.byId[r.id]?.equipment ?? []} /></span></span>
              </li>
            ))}
          </ol>
        </Section>
      )}
    </Scroll>
  );
}

const Arrow = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>;

/** The red card: a display title and the figure, big, cut by the card. A legs day shows the legs alone; any other day the whole figure runs off the right and bottom edges. */
function HeroShell({ app, title, why, regions, meta, onOpen, label, openLabel = "View workout" }: { app: App; title: string; why: string; regions: Partial<Record<MuscleId, number>>; meta: [ComponentChildren, string][] | null; onOpen: (() => void) | null; label: string; openLabel?: string }) {
  useFigures();
  const ms = REGIONS.filter((m) => regions[m]);
  const legs = isLegsDay(ms);
  // The title is as large as its longest word lets it be beside the figure: "Lower body" at 64, "Glutes and hamstrings" at 36.
  const longest = Math.max(...title.split(" ").map((w) => w.length));
  const size = longest <= 5 && title.split(" ").length <= 2 ? "min(64px, 15.6vw)" : longest <= 8 ? "44px" : "36px";
  // Always the front, so the pose never changes; only a legs day with no quads in it (glutes and hamstrings) turns round.
  const view = legs && !ms.includes("quads") ? "back" : "front";
  return (
    <section class={onOpen ? "press" : ""} onClick={onOpen ?? undefined} aria-label={label} style={`position: relative; overflow: hidden; margin-top: 18px; min-height: 340px; box-sizing: border-box; border-radius: 32px; background: var(--hero); color: var(--hero-ink); padding: 24px; display: flex; flex-direction: column; ${onOpen ? "cursor: pointer;" : ""} box-shadow: var(--hero-card-shadow);`}>
      <Paint d={figure(view, app.theme, "hero", regions, legs ? 395 : 500, legs ? "legs" : "all")} style={`position: absolute; ${legs ? "right: 12px; bottom: -22px; height: 395px;" : "right: -72px; top: 14px; height: 500px;"}`} />
      <span aria-hidden="true" style="position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22); pointer-events: none;"></span>
      <h2 style={`position: relative; margin: 0 0 0 -3px; max-width: 196px; font-size: ${size}; line-height: 0.94; font-weight: 800; letter-spacing: -0.04em;`}>{title}</h2>
      <p style="position: relative; margin: 14px 0 0; max-width: 15ch; font-size: 15px; line-height: 1.4; font-weight: 500; color: rgba(255, 255, 255, 0.92); text-wrap: pretty;">{why}</p>
      {meta && (
        <ul aria-label="About this workout" style="position: relative; margin: 16px 0 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 8px;">
          {meta.map(([icon, text]) => (
            <li key={text} class="stat" style="height: 34px; padding: 0 12px 0 9px; box-sizing: border-box; border-radius: 999px; background: rgba(72, 6, 18, 0.34); -webkit-backdrop-filter: blur(14px) saturate(140%); backdrop-filter: blur(14px) saturate(140%); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16); display: flex; align-items: center; gap: 6px; font-size: 15px; font-weight: 700; letter-spacing: -0.015em; color: #FFFFFF; white-space: nowrap;">{icon}{text}</li>
          ))}
        </ul>
      )}
      {onOpen && (
        <div style="position: relative; margin-top: auto; padding-top: 20px;">
          <button type="button" class="press" onClick={(e) => { e.stopPropagation(); onOpen(); }} aria-label={openLabel} style="width: 56px; height: 56px; flex-shrink: 0; padding: 0; border: 0; border-radius: 999px; background: #FFFFFF; color: var(--hero); display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 12px 18px -10px rgba(0, 0, 0, 0.5);"><Arrow /></button>
        </div>
      )}
    </section>
  );
}

function HeroCard({ app, plan }: { app: App; plan: Plan }) {
  const { s, now } = app;
  const regions = planValues(planRegions(s, plan), plan.template);
  const n = plan.exercises.length;
  return (
    <HeroShell app={app} label="Today's workout" title={planTitle(plan)} why={planWhy(s, plan, now)} regions={regions}
      meta={plan.kind === "workout" ? [[<Clock size={17} />, `${Math.max(5, Math.round(plan.estMinutes / 5) * 5)} min`], [<ListIcon size={17} />, `${n} exercise${n === 1 ? "" : "s"}`]] : null}
      onOpen={plan.kind === "workout" ? app.openSetup : null} />
  );
}

/** After today's workout: what was trained, and what comes next. */
function DoneCard({ app, next }: { app: App; next: Plan }) {
  const { s, now } = app;
  const sessions = trainedToday(s, now);
  const ids = new Set(sessions.flatMap((x) => x.log.map((l) => l.exerciseId)));
  const regions = Object.fromEntries(REGIONS.filter((m) => [...ids].some((id) => s.catalog.byId[id]?.contributions[m] === 1)).map((m) => [m, 1]));
  const sets = sessions.reduce((a, x) => a + x.log.filter((l) => !l.isWarmup).length, 0);
  const mins = Math.max(1, Math.round(sessions.reduce((a, x) => a + ((x.end ?? x.lastTs) - x.start), 0) / 60_000));
  const why = next.kind === "workout" ? `Next up: ${planTitle(next).toLowerCase()}, if you want more.` : "Rest now. Your next workout will be ready tomorrow.";
  return <HeroShell app={app} label="Today's workout, done" title="Done for today" why={why} regions={regions} meta={[[<Clock size={17} />, `${mins} min`], [<Layers size={17} />, `${sets} set${sets === 1 ? "" : "s"}`]]} onOpen={() => app.openDone(dayStart(now))} openLabel="See today's workout" />;
}

// ---------- Body ----------

/** "Quads are ready Mon 2 pm." for the muscle that takes longest: one line, no more. */
const readyLine = (rows: StrainRow[], now: number) => {
  const left = rows.filter((r) => r.strain > 0);
  if (!left.length) return "Everything is ready.";
  const last = left.reduce((a, r) => (r.hours > a.hours ? r : a));
  const [day, time] = readyAt(last.hours, now).split(", ");
  const when = day === "Today" || day === "Tonight" ? `${day!.toLowerCase()} at ${time}` : `${day} ${time}`;
  return `${last.name} ${/s$/.test(last.name) ? "are" : "is"} ready ${when}.`;
};

/** Where the slider's labels sit, in hours from now: Now, Tonight (9 pm), Tomorrow (9 am), then the last day's name at the end. */
function sliderTicks(now: number, span: number): [string, number][] {
  const h = (ts: number) => (ts - now) / H;
  const out: [string, number][] = [["Now", 0]];
  const tonight = h(dayStart(now) + 21 * H);
  if (tonight > 1.5) out.push(["Tonight", tonight]);
  out.push(["Tomorrow", h(addDays(now, 1) + 9 * H)]);
  out.push([new Date(now + span * H).toLocaleDateString("en-GB", { weekday: "short" }), span]);
  return out.filter(([, x], i, all) => x <= span && (i === all.length - 1 || all.slice(i + 1).every(([, y]) => y - x > span * 0.16)));
}

/**
 * The time slider: the original pill, knob and labels. Dragging moves the body forward in time. The knob snaps to the moment
 * each muscle turns ready, with a light haptic, but nothing on the track marks those moments.
 */
function TimeSlider({ t, span, snaps, now, set }: { t: number; span: number; snaps: number[]; now: number; set: (t: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const last = useRef<number | null>(null);
  const x = t / span;
  const to = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    let v = Math.max(0, Math.min(1, (clientX - r.left - 22) / (r.width - 44))) * span;
    const near = snaps.find((h) => Math.abs(h - v) < span * 0.035);
    if (near !== undefined) {
      v = near;
      if (last.current !== near) tick();
    }
    last.current = near ?? null;
    set(v);
  };
  const step = (dir: 1 | -1) => {
    const stops = [0, ...snaps, span].sort((a, b) => a - b);
    const next = dir > 0 ? stops.find((h) => h > t + 0.01) : [...stops].reverse().find((h) => h < t - 0.01);
    if (next !== undefined) { tick(); set(next); }
  };
  const label = t === 0 ? "Drag to see later" : (() => { const d = new Date(now + t * H); const m = d.getMinutes(); const hh = d.getHours(); return `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${hh % 12 || 12}:${String(m).padStart(2, "0")} ${hh < 12 ? "am" : "pm"}`; })();
  return (
    <div style="margin-top: 16px;">
      <div ref={track} role="slider" tabIndex={0} aria-label="Time shown" aria-valuemin={0} aria-valuemax={Math.round(span)} aria-valuenow={Math.round(t)} aria-valuetext={t === 0 ? "Now" : label}
        onKeyDown={(e) => { if (e.key === "ArrowRight") { e.preventDefault(); step(1); } else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); } }}
        onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); to(e.clientX); }}
        onPointerMove={(e) => { if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) to(e.clientX); }}
        style="position: relative; height: 44px; border-radius: 999px; background: var(--fill); touch-action: none; cursor: ew-resize;">
        <span aria-hidden="true" style={`position: absolute; left: 0; top: 0; bottom: 0; width: calc(${x} * (100% - 44px) + 44px); border-radius: 999px; background: var(--surface); box-shadow: 0 1px 2px rgba(0,0,0,0.06);`}></span>
        <span aria-hidden="true" style={`position: absolute; top: 4px; left: calc(${x} * (100% - 44px) + 4px); width: 36px; height: 36px; border-radius: 999px; background: var(--ink); color: var(--bg); box-shadow: 0 6px 12px -6px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M9 7l-4 5 4 5M15 7l4 5-4 5"></path></svg>
        </span>
      </div>
      <div aria-hidden="true" style="position: relative; height: 16px; margin: 8px 4px 0; font-size: 12px; font-weight: 600; color: var(--muted);">
        {sliderTicks(now, span).map(([l, h]) => <span key={l} style={`position: absolute; left: ${(h / span) * 100}%; transform: translateX(-${(h / span) * 100}%); white-space: nowrap;`}>{l}</span>)}
      </div>
      <p aria-live="polite" style="margin: 8px 0 0; text-align: center; font-size: 15px; font-weight: 700; letter-spacing: -0.01em;">{label}</p>
    </div>
  );
}

export function Body({ app }: { app: App }) {
  const { s, now, theme } = app;
  const all = strainRows(s, now);
  // Two days ahead, or as far as the slowest muscle needs (up to four).
  const span = Math.min(96, Math.max(48, Math.ceil((Math.max(0, ...all.map((r) => r.hours)) + 2) / 12) * 12));
  const [t, setT] = useState(0);
  const at = now + t * H;
  const rows = t === 0 ? all : strainRows(s, now, at);
  const st = strain(s, at);
  return (
    <Scroll cls="pane">
      <div style="display: flex; justify-content: space-between; align-items: baseline;">
        <H1>Body</H1>
        {t > 0 && <button type="button" class="press" onClick={() => { tick(); setT(0); }} style="border: 0; background: none; padding: 8px 0; font-size: 15px; font-weight: 700; color: var(--accent-text); cursor: pointer;">Back to now</button>}
      </div>
      <p style="margin: 8px 0 0; font-size: 15px; color: var(--muted);">{readyLine(rows, now)}</p>
      <div style="margin-top: 12px;">
        <Figures kind="level" values={strainFigure(st)} theme={theme} h={262}
          alt={[`Front of the body. ${rows.filter((r) => r.strain > 0).map((r) => r.name).join(", ") || "Nothing"} still strained, the rest is ready.`, "Back of the body, coloured the same way."]} />
      </div>
      <div aria-hidden="true" style="margin-top: 8px; display: flex; justify-content: center; gap: 14px; font-size: 12px; font-weight: 600; color: var(--muted);">
        {([["High", STRAIN[theme][2]], ["Medium", STRAIN[theme][1]], ["Low", STRAIN[theme][0]], ["Ready", "var(--idle)"]] as const).map(([l, c]) => (
          <span key={l} style="display: flex; align-items: center; gap: 5px;"><span style={`width: 9px; height: 9px; border-radius: 3px; background: ${c};`}></span>{l}</span>
        ))}
      </div>
      {all.length > 0 && <TimeSlider t={t} span={span} snaps={all.map((r) => r.hours).filter((h) => h > 0 && h < span)} now={now} set={setT} />}
      <ul style="margin: 16px 0 0; padding: 0 16px; list-style: none; background: var(--surface); border-radius: 24px; display: flex; flex-direction: column;">
        {all.length ? rows.map((r, i) => {
          const on = r.strain > 0;
          return (
            <li key={r.region} style={`min-height: 72px; box-sizing: border-box; padding: 10px 0; display: flex; align-items: center; gap: 14px; ${i < rows.length - 1 ? "border-bottom: 1px solid var(--soft);" : ""}`}>
              <Muscle region={r.region} theme={theme} color={on ? strainColour(r.strain, theme) : theme === "dark" ? "#636366" : "#AEAEB2"} size={48} radius={14} />
              <span style="flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 8px;">
                <span style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px;">
                  <span style="min-width: 0; font-size: 17px; font-weight: 700; line-height: 1.2; letter-spacing: -0.015em; text-wrap: balance;">{r.name}</span>
                  <span style="flex-shrink: 0; font-size: 15px; color: var(--muted);">{on ? readyAt(r.hours, now) : "Ready"}</span>
                </span>
                {on && (
                  <span aria-label={`${Math.round(r.strain * 100)}% strained`} style="display: flex; align-items: center; gap: 10px;">
                    <span style="flex: 1 1 0; height: 8px; border-radius: 999px; background: var(--track); overflow: hidden;"><span style={`display: block; height: 100%; width: ${r.strain * 100}%; border-radius: 999px; background: ${strainColour(r.strain, theme)}; transition: width 0.25s ease-out, background-color 0.25s;`}></span></span>
                    <span style="width: 36px; text-align: right; font-family: var(--mono); font-size: 13px; font-weight: 600; color: var(--muted);">{Math.round(r.strain * 100)}%</span>
                  </span>
                )}
              </span>
            </li>
          );
        }) : (
          <li style="min-height: 60px; display: flex; align-items: center; font-size: 17px; font-weight: 700; letter-spacing: -0.015em;">Everything is ready</li>
        )}
      </ul>
    </Scroll>
  );
}

// ---------- Progress ----------

/** Soft edges on a sideways strip: it fades into the page at both ends instead of cutting off. */
const FADE = "-webkit-mask-image: linear-gradient(to right, transparent 0, #000 44px, #000 calc(100% - 28px), transparent 100%); mask-image: linear-gradient(to right, transparent 0, #000 44px, #000 calc(100% - 28px), transparent 100%);";
/** A heading over a card, like the other sections, and the card itself. */
const CARD = "padding: 18px; border-radius: 24px; background: var(--surface);";
const CardHead = ({ label, value, of }: { label: string; value: number; of?: number }) => (
  <div style="display: flex; justify-content: space-between; align-items: baseline;">
    <span style="font-size: 17px; font-weight: 700; letter-spacing: -0.015em;">{label}</span>
    <span style="font-family: var(--mono); font-size: 17px; font-weight: 600;">{value}{of !== undefined && <span style="color: var(--faint);">/{of}</span>}</span>
  </div>
);

export function Progress({ app }: { app: App }) {
  const { s, now, theme, saved } = app;
  const target = saved.settings.days;
  const days = weekStrip(s, now, saved.createdAt);
  const plan = planWeeks(s, now, target, saved.createdAt);
  const wk = weekMuscles(s, now, theme);
  const strength = strengthRows(s, 5, saved.settings.units);
  const starts = strength.length ? [] : startingPoints(s, 5, saved.settings.units);
  const done = days.filter((d) => d.work > 0).length;
  const grid = activity(s, now, 20, saved.createdAt);
  const workouts = grid.cells.filter((c) => c.work).length;
  const cell = (c: (typeof grid.cells)[number], i: number) => (
    <span key={i} style={`width: 30px; height: 30px; box-sizing: border-box; border-radius: 8px; ${c.today ? "border: 2.5px solid var(--ink);" : ""} ${c.future ? "" : c.before ? "box-shadow: inset 0 0 0 1.5px var(--track);" : c.work ? `background: ${WORK[c.work - 1]};` : c.today ? "" : "background: var(--track);"}`}></span>
  );
  return (
    <Scroll cls="pane">
      <H1>Progress</H1>

      <Section title="This week" top={24}>
        <div style={CARD}>
          <CardHead label="Workouts" value={done} of={target} />
          <div role="img" aria-label={days.map((d) => d.label).join(". ")} style="margin-top: 14px; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px;">
            {days.map((d, i) => {
              const today = d.kind === "today" || d.kind === "todayDone";
              return (
                <span key={i} aria-hidden="true" style="display: flex; flex-direction: column; align-items: center; gap: 6px;">
                  <span style={`width: 100%; height: 40px; box-sizing: border-box; border-radius: 10px; ${d.work ? `background: ${WORK[d.work - 1]};` : d.kind === "before" ? "box-shadow: inset 0 0 0 1.5px var(--track);" : "background: var(--fill);"} ${today ? "box-shadow: inset 0 0 0 2px var(--ink);" : ""}`}></span>
                  <span style={`font-size: 12px; font-weight: 700; color: ${today ? "var(--ink)" : "var(--faint)"};`}>{d.letter}</span>
                </span>
              );
            })}
          </div>
        </div>
      </Section>

      {/* Every day as a square, weeks as columns, newest on the right. The strip scrolls sideways; both edges fade out so it never hard-cuts. */}
      <Section title={<>Weeks on plan <Faint>· {plan.run} in a row</Faint></>}>
        <div role="img" aria-label={`Workout history, one square per day, for the last 20 weeks: ${workouts} workouts. ${plan.run} weeks on plan in a row.`} style="margin: 4px -20px 0 0; display: flex; gap: 8px;">
          <div aria-hidden="true" style="flex-shrink: 0; padding-top: 22px; display: flex; flex-direction: column; gap: 6px;">
            {["M", "", "W", "", "F", "", "S"].map((l, i) => <span key={i} style="height: 30px; display: flex; align-items: center; font-size: 11px; font-weight: 600; color: var(--muted);">{l}</span>)}
          </div>
          <div class="scroll" aria-hidden="true" style={`flex: 1 1 0; min-width: 0; overflow-x: auto; scrollbar-width: none; direction: rtl; ${FADE}`}>
            <div style="direction: ltr; width: max-content; padding: 0 26px 0 20px; display: flex; flex-direction: column; gap: 6px;">
              <div style="height: 16px; display: flex; gap: 6px;">{grid.months.map((m, i) => <span key={i} style="width: 30px; font-size: 11px; font-weight: 600; color: var(--muted); white-space: nowrap;">{m}</span>)}</div>
              <div style="display: grid; grid-auto-flow: column; grid-template-rows: repeat(7, 30px); gap: 6px;">{grid.cells.map(cell)}</div>
            </div>
          </div>
        </div>
        <div aria-hidden="true" style="display: flex; align-items: center; justify-content: flex-end; gap: 5px; font-size: 12px; font-weight: 500; color: var(--muted);">
          <span style="margin-right: 3px;">Rest</span>
          {["var(--track)", ...WORK].map((c) => <span key={c} style={`width: 12px; height: 12px; border-radius: 4px; background: ${c};`}></span>)}
          <span style="margin-left: 3px;">Hard</span>
        </div>
      </Section>

      <Section title="Muscles this week">
        <div style="margin-top: 4px;"><Figures values={wk.values} theme={theme} h={260} alt={["Front of the body, darker red where more sets were done this week.", "Back of the body, darker red where more sets were done this week."]} /></div>
        <ul style="margin: 8px 0 0; padding: 4px 20px; list-style: none; background: var(--surface); border-radius: 24px; display: flex; flex-direction: column;">
          {wk.rows.map((r, i) => (
            <li key={r.name} style={`min-height: 60px; box-sizing: border-box; display: flex; align-items: center; gap: 12px; ${i < wk.rows.length - 1 ? "border-bottom: 1px solid var(--soft);" : ""}`}>
              <span aria-hidden="true" style={`width: 16px; height: 16px; flex-shrink: 0; border-radius: 5px; background: ${r.color ?? "var(--idle)"};`}></span>
              <span style="flex: 1 1 0; min-width: 0; font-size: 16px; font-weight: 600; letter-spacing: -0.01em;">{r.name}</span>
              <span style="flex-shrink: 0; font-family: var(--mono); font-size: 13px; color: var(--muted);"><span style="font-size: 15px; font-weight: 600; color: var(--ink);">{r.done}</span>/{r.target} sets</span>
            </li>
          ))}
        </ul>
      </Section>

      {starts.length > 0 && (
        <Section title="Strength">
          <Card>
            {starts.map((r, i) => (
              <li key={r.name} style={`min-height: 64px; box-sizing: border-box; display: flex; align-items: center; gap: 12px; ${i < starts.length - 1 ? "border-bottom: 1px solid var(--soft);" : ""}`}>
                <span style="flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;"><span style="font-size: 16px; font-weight: 600; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{r.name}</span><span style="font-size: 13px; color: var(--muted);"><span style="font-family: var(--mono); font-weight: 600; color: var(--ink);">{r.value}</span> {r.unit}</span></span>
                <span style="flex-shrink: 0; height: 28px; padding: 0 10px; border-radius: 999px; background: var(--soft); color: var(--muted); display: flex; align-items: center; font-size: 13px; font-weight: 600;">First</span>
              </li>
            ))}
          </Card>
          <p style="margin: 0; padding: 0 4px; font-size: 13px; color: var(--muted);">Each one gets a trend the next time you do it.</p>
        </Section>
      )}

      {strength.length > 0 && (
        <Section title="Strength">
          <Card>
            {strength.map((r, i) => {
              const up = r.delta >= 0;
              const flat = r.delta === 0;
              const sp = sparkPath(r.points);
              return (
                <li key={r.name} style={`min-height: 64px; box-sizing: border-box; display: flex; align-items: center; gap: 12px; ${i < strength.length - 1 ? "border-bottom: 1px solid var(--soft);" : ""}`}>
                  <span style="flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;"><span style="font-size: 16px; font-weight: 600; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{r.name}</span><span style="font-size: 13px; color: var(--muted);"><span style="font-family: var(--mono); font-weight: 600; color: var(--ink);">{r.from} → {r.to}</span> {r.unit}</span></span>
                  <svg width="64" height="28" viewBox="0 0 64 28" aria-hidden="true" style={`flex-shrink: 0; overflow: visible; color: ${flat ? "var(--muted)" : up ? "var(--up)" : "var(--down)"};`}><path d={sp.d} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><circle cx={sp.end[0]} cy={sp.end[1]} r="3" fill="currentColor"></circle></svg>
                  <span aria-label={flat ? "No change" : `${up ? "Up" : "Down"} ${Math.abs(r.delta)}`} style={`flex-shrink: 0; min-width: 44px; box-sizing: border-box; height: 28px; padding: 0 10px; border-radius: 999px; background: ${flat ? "var(--soft)" : up ? "var(--up-bg)" : "var(--down-bg)"}; color: ${flat ? "var(--muted)" : up ? "var(--up)" : "var(--down)"}; display: flex; align-items: center; justify-content: center; gap: 3px; font-family: var(--mono); font-size: 13px; font-weight: 600;`}>
                    {!flat && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style={`transform: rotate(${up ? 0 : 180}deg);`}><path d="M12 19V5M6 11l6-6 6 6"></path></svg>}{Math.abs(r.delta)}
                  </span>
                </li>
              );
            })}
          </Card>
        </Section>
      )}
    </Scroll>
  );
}

// ---------- Profile ----------

const GOALS = [["muscle", "Build muscle", "Full weekly volume"], ["general_fitness", "General fitness", "Lighter weeks"]] as const;
const LEVELS = [["auto", "Auto"], ["beginner", "Beginner"], ["intermediate", "Intermediate"], ["advanced", "Advanced"]] as const;
export const REMINDERS = ["Off", "6:30 am", "12:30 pm", "6:30 pm", "9:00 pm"];

export const bodyWeight = (kg: number, units: "metric" | "imperial") => (units === "metric" ? `${Math.round(kg)} kg` : `${Math.round(kg * 2.2046)} lb`);

export function Profile({ app }: { app: App }) {
  const { saved, ui, theme } = app;
  const st = saved.settings;
  const row = (key: string) => ({ open: ui.edit === key, toggle: () => app.set({ edit: ui.edit === key ? null : key }) });
  const owned = ownedFromChoice(st.dumbbells);
  const dbLabel = owned.length ? (owned.length === 1 ? weightLabel(owned[0]!, "metric") : `${owned[0]}–${owned.at(-1)} kg`) : "None";
  return (
    <Scroll cls="pane">
      <header style="display: flex; align-items: center; gap: 16px;">
        <span aria-hidden="true" style="width: 64px; height: 64px; flex-shrink: 0; border-radius: 999px; background: var(--ink); color: var(--bg); display: flex; align-items: center; justify-content: center;">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8.500" r="3.500"></circle><path d="M5 19.500c1.200-3.200 3.800-4.800 7-4.800s5.800 1.600 7 4.800"></path></svg>
        </span>
        <H1>Profile</H1>
      </header>

      <section aria-label="Your program" style="margin-top: 24px; border-radius: 32px; background: var(--surface); padding: 24px 24px 20px; display: flex; flex-direction: column; box-shadow: var(--card-shadow);">
        <h2 style="margin: 0; font-size: 24px; line-height: 1.15; font-weight: 700; letter-spacing: -0.02em;">{PROGRAM_NAME}</h2>
        <p style="margin: 8px 0 0; font-size: 15px; line-height: 1.4; color: var(--muted); text-wrap: pretty;">Week {programWeek(saved.programStart, app.now)} of 12. Every muscle, trained evenly.</p>
        <button type="button" class="press" onClick={app.openPrograms} style="margin-top: 20px; height: 52px; border: 0; border-radius: 999px; background: var(--ink); color: var(--bg); font-size: 16px; font-weight: 600; letter-spacing: -0.01em; cursor: pointer;">View program</button>
      </section>

      <Section title="Training">
        <Card>
          <Row label="Days per week" value={String(st.days)} {...row("days")}>
            <OptGrid cols={5} label="Days per week">{[2, 3, 4, 5, 6].map((d) => <Opt key={d} label={String(d)} on={st.days === d} pick={() => app.settings({ days: d })} />)}</OptGrid>
          </Row>
          <Row label="Workout length" value={<span style="display: flex; align-items: center; gap: 6px;"><Clock size={16} />{st.minutes} min</span>} {...row("length")}>
            <OptGrid cols={4} label="Workout length">{[20, 30, 40, 50].map((m) => <Opt key={m} label={`${m} min`} on={st.minutes === m} pick={() => app.settings({ minutes: m })} />)}</OptGrid>
          </Row>
          <Row label="Equipment" value={<span style="display: flex; align-items: center; gap: 8px;"><span class="sr">{equipLabel(st.equipment)}</span><EquipStack items={st.equipment} size={28} body /></span>} {...row("equip")}>
            <EquipOptions value={st.equipment} set={(equipment) => app.settings({ equipment })} />
          </Row>
          {st.equipment.includes("dumbbell") && (
            <Row label="Dumbbells" value={dbLabel} {...row("dumbbells")}>
              <DumbbellPicker value={st.dumbbells} set={(dumbbells) => app.settings({ dumbbells })} />
            </Row>
          )}
          <Row label="Muscles to avoid" value={st.avoid.length ? String(st.avoid.length) : "None"} last {...row("avoid")}>
            <OptGrid cols={2} label="Muscles to avoid">
              {REGIONS.map((m) => <Opt key={m} label={REGION_NAMES[m]} on={st.avoid.includes(m)} pick={() => app.settings({ avoid: st.avoid.includes(m) ? st.avoid.filter((x) => x !== m) : [...st.avoid, m] })} />)}
            </OptGrid>
          </Row>
        </Card>
      </Section>

      <Section title="About you">
        <Card>
          <Row label="Goal" value={GOALS.find((g) => g[0] === st.goal)![1]} {...row("goal")}>
            <div ref={pop} role="group" aria-label="Goal" style="display: flex; flex-direction: column; gap: 8px;">
              {GOALS.map(([k, l, sub]) => (
                <button key={k} type="button" class="tab" onClick={() => app.settings({ goal: k })} aria-pressed={st.goal === k ? "true" : "false"} style={`min-height: 62px; padding: 10px 16px; border: 0; border-radius: 18px; cursor: pointer; text-align: left; background: ${st.goal === k ? "var(--ink)" : "var(--bg)"}; color: ${st.goal === k ? "var(--bg)" : "var(--ink)"}; display: flex; flex-direction: column; justify-content: center; gap: 2px;`}>
                  <span style="font-size: 15px; font-weight: 700; letter-spacing: -0.01em;">{l}</span><span style="font-size: 13px; opacity: 0.72;">{sub}</span>
                </button>
              ))}
            </div>
          </Row>
          <Row label="Level" value={LEVELS.find((l) => l[0] === st.level)![1]} {...row("level")}>
            <OptGrid cols={2} label="Level">{LEVELS.map(([k, l]) => <Opt key={k} label={l} on={st.level === k} pick={() => app.settings({ level: k })} />)}</OptGrid>
          </Row>
          <Row label="Body weight" value={bodyWeight(st.kg, st.units)} last {...row("weight")}>
            <div ref={pop} role="group" aria-label="Body weight">
              <Stepper value={bodyWeight(st.kg, st.units)} dec={() => app.settings({ kg: nudgeWeight(st.kg, st.units, -1) })} inc={() => app.settings({ kg: nudgeWeight(st.kg, st.units, 1) })} decLabel="Lower body weight" incLabel="Raise body weight" />
            </div>
          </Row>
        </Card>
      </Section>

      <Section title="App">
        <Card>
          <Row label="Units" value={st.units === "metric" ? "Metric" : "Imperial"} {...row("units")}>
            <OptGrid cols={2} label="Units">{(["metric", "imperial"] as const).map((u) => <Opt key={u} label={u === "metric" ? "Metric" : "Imperial"} on={st.units === u} pick={() => app.settings({ units: u })} />)}</OptGrid>
          </Row>
          <Row label="Reminders" value={st.remind} {...row("remind")}>
            <OptGrid cols={2} label="Reminders">{REMINDERS.map((r, i) => <Opt key={r} label={r} on={st.remind === r} pick={() => app.settings({ remind: r })} span={i === 0 ? "1 / -1" : undefined} />)}</OptGrid>
          </Row>
          <Row label="Appearance" value={theme === "dark" ? "Dark" : "Light"} last {...row("look")}>
            <OptGrid cols={2} label="Appearance">{(["light", "dark"] as const).map((l) => <Opt key={l} label={l === "light" ? "Light" : "Dark"} on={theme === l} pick={() => app.settings({ look: l })} />)}</OptGrid>
          </Row>
        </Card>
      </Section>

      <AccountSection app={app} />
    </Scroll>
  );
}
