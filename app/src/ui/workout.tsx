// The in-workout screen: video placeholder, frosted panel, rest ring, the reps-left question and the finish sequence.
import { useEffect, useMemo, useState } from "preact/hooks";
import { REGIONS } from "../../../src/engine";
import { asksLeft, current, isAllOut, kgOf, repsDone, setsTotal, toEvents, type Run } from "../workout";
import { caloriesWith } from "../store";
import type { App } from "./app";
import { fDraw, fFig, fFlood, fLine, fLit, fUp, lift, nextIn, ramp, timerIn, useMove } from "./motion";
import { activation, primary } from "../model";
import { Fig, Muscle } from "./kit";
import { mostWorked, muscleName } from "../finish";
import { Growth, Learned, ShareSheet, Swatch, WeekMoment, useRecap } from "./finish";

const clock = (t: number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
// Reps left in the tank after a set: 0 is too hard, 5+ is too easy. Colours follow the work scale.
const LEFT = [["0", "#7A0E1E", "#FFFFFF", "0 more, too hard"], ["1", "#D91E36", "#FFFFFF", "1 more"], ["2", "#E8596B", "#FFFFFF", "2 more"], ["3", "#EE8794", "#1C1C1E", "3 more"], ["4", "#F7CDD2", "#1C1C1E", "4 more"], ["5+", "var(--glass-btn)", "var(--glass-ink)", "5 or more, too easy"]] as const;
// One frosted material over the video; the panel is the bigger surface, so it blurs more and casts a deeper shadow.
const GLASS = "background: var(--frost); backdrop-filter: blur(44px) saturate(180%); -webkit-backdrop-filter: blur(44px) saturate(180%); box-shadow: var(--panel-shadow); color: var(--glass-ink);";
const PANEL = `position: absolute; z-index: 2; left: 16px; right: 16px; bottom: var(--bottom); box-sizing: border-box; padding: 16px 20px; border-radius: 39px; ${GLASS} display: flex; flex-direction: column;`;
const CHROME = "height: 44px; flex-shrink: 0; border: 0; border-radius: 999px; background: var(--frost); color: var(--glass-ink); backdrop-filter: blur(28px) saturate(180%); -webkit-backdrop-filter: blur(28px) saturate(180%); box-shadow: var(--frost-shadow); display: flex; align-items: center; justify-content: center;";
const BIG_BTN = "height: 64px; font-size: 17px; flex-shrink: 0; border: 0; border-radius: 999px; font-weight: 700; letter-spacing: -0.01em; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer;";

function Question({ app, run }: { app: App; run: Run }) {
  return (
    <div role="group" aria-label="Reps left in the tank" style="display: flex; flex-direction: column; gap: 10px;">
      <span style="font-size: 13px; font-weight: 600; letter-spacing: 0.01em; color: var(--glass-muted);">How many more reps could you do?</span>
      <div style="display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px;">
        {LEFT.map(([label, bg, fg, aria]) => {
          const on = run.effort === label;
          const dim = run.effort !== null && !on;
          return (
            <button key={label} type="button" class="press" onClick={() => app.answer(label)} aria-pressed={on ? "true" : "false"} aria-label={aria}
              style={`height: 52px; padding: 0; border: 0; border-radius: 14px; cursor: pointer; font-weight: 600; background: ${bg}; color: ${fg}; box-shadow: 0 0 0 3px ${on ? "var(--glass-ink)" : "transparent"}; opacity: ${dim ? 0.4 : 1}; transition: opacity 200ms ease, box-shadow 200ms ease, transform 160ms cubic-bezier(0.23,1,0.32,1); font-family: var(--mono); font-size: 16px;`}>{label}</button>
          );
        })}
      </div>
      <div aria-hidden="true" style="display: flex; justify-content: space-between; font-size: 12px; line-height: 15px; font-weight: 500; color: var(--glass-muted);"><span>Too hard</span><span>Too easy</span></div>
    </div>
  );
}

const Play = () => <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M8 4.5v15l12-7.5z"></path></svg>;
const Pause = () => <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><rect x="6" y="5" width="4.5" height="14" rx="1.5"></rect><rect x="13.5" y="5" width="4.5" height="14" rx="1.5"></rect></svg>;
const Tick = () => <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>;

function WorkPanel({ app, run }: { app: App; run: Run }) {
  const e = current(run);
  const allOutNow = isAllOut(e) && run.set === e.sets.length;
  const unit = (e.hold ? "sec" : "reps") + (e.unilateral ? " each side" : "");
  const red = "background: var(--accent); color: #FFFFFF; box-shadow: 0 8px 16px -10px rgba(217, 30, 54, 0.7);";
  const quiet = "background: var(--glass-btn); color: var(--glass-ink);";
  const m = run.hold.mode;
  const idle = m === "idle";
  let big: number, sub: string, cta: string, act: () => void, look: string, icon: preact.JSX.Element | null, stepVis = true, bar = false;
  if (!e.hold) {
    [big, sub, cta, act, look, icon] = [run.amount, allOutNow ? `max ${unit}` : unit, "Set done", app.setDone, red, <Tick />];
  } else {
    stepVis = idle;
    bar = m === "run" || m === "paused" || m === "over";
    big = m === "ready" ? run.hold.ready : idle ? run.amount : run.hold.left;
    const p = app.patchRun;
    if (idle) [sub, cta, act, look, icon] = ["seconds", "Start timer", () => p({ hold: { mode: "ready", ready: 3, left: run.amount } }), red, <Play />];
    else if (m === "ready") [sub, cta, act, look, icon] = ["get ready", "Cancel", () => p({ hold: { ...run.hold, mode: "idle" } }), quiet, null];
    else if (m === "run") [sub, cta, act, look, icon] = ["seconds left", "Pause timer", () => p({ hold: { ...run.hold, mode: "paused" } }), quiet, <Pause />];
    else if (m === "paused") [sub, cta, act, look, icon] = ["paused", "Resume timer", () => p({ hold: { ...run.hold, mode: "run" } }), red, <Play />];
    else [sub, cta, act, look, icon] = ["done", "Set done", app.setDone, red, <Tick />];
  }
  const step = (d: number) => () => {
    if (!e.hold) app.patchRun({ amount: Math.max(0, run.amount + d) });
    else if (idle) { const t = Math.max(5, run.amount + d * 5); app.patchRun({ amount: t, hold: { ...run.hold, left: t } }); }
  };
  const kg = kgOf(run);
  const owned = app.owned;
  const at = kg === undefined ? -1 : owned.findIndex((w) => Math.abs(w - kg) < 5e-4);
  const toKg = (i: number) => () => { if (owned[i] !== undefined) app.patchRun({ kg: { ...run.kg, [run.ex]: owned[i]! } }); };
  const small = "width: 36px; height: 36px; flex-shrink: 0; padding: 0; border: 0; border-radius: 999px; background: var(--glass-step); color: var(--glass-ink); display: flex; align-items: center; justify-content: center; cursor: pointer;";
  const [unit1, unit2] = sub.endsWith(" each side") ? [sub.slice(0, -10), "each side"] : [sub, ""];
  const half = "width: 52px; height: 56px; padding: 0; border: 0; border-radius: 999px; background: transparent; color: var(--glass-ink); display: flex; align-items: center; justify-content: center; cursor: pointer;";
  return (
    <section key={`${run.ex}-${run.set}`} class="frost" ref={lift} aria-label="Current set" style={PANEL}>
      <div style="display: flex; align-items: center; gap: 12px;">
        <Muscle region={primary(app.s, e.id)[0]} levels={activation(app.s, e.id)} theme={app.theme} size={48} radius={14} />
        <div style="flex: 1 1 0; min-width: 0;">
          <h1 style={`margin: 0; font-size: ${e.name.length > 16 ? 22 : 28}px; line-height: 1.05; font-weight: 800; letter-spacing: -0.035em; text-wrap: balance;`}>{e.name}</h1>
          <p style="margin: 5px 0 0; font-size: 13px; line-height: 1.2; font-weight: 600; color: var(--glass-muted);">Set {run.set} of {e.sets.length}</p>
        </div>
        {/* The sets of this exercise, in the same code as the program bar: done is ink, now is red. */}
        <span aria-hidden="true" style="align-self: flex-start; padding-top: 8px; display: flex; gap: 4px;">{e.sets.map((_, i) => <span key={i} style={`width: 18px; height: 5px; border-radius: 999px; background: ${i < run.set - 1 ? "var(--glass-ink)" : i === run.set - 1 ? "var(--accent)" : "var(--glass-btn)"};`}></span>)}</span>
      </div>
      {e.weighted && kg !== undefined && (
        <div role="group" aria-label="Dumbbell weight" style="margin-top: 12px; height: 48px; box-sizing: border-box; padding: 0 6px 0 18px; border-radius: 999px; background: var(--fill); display: flex; align-items: center; gap: 6px;">
          <span style="flex-grow: 1; font-size: 15px; font-weight: 600; letter-spacing: -0.01em;"><span style="font-family: var(--mono);">{Math.round(kg * 10) / 10}</span> kg <span style="font-weight: 500; color: var(--glass-muted);">{e.pair ? "each hand" : ""}</span></span>
          <button type="button" class="press" onClick={toKg(at - 1)} aria-label="Lighter dumbbell" style={small}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"></path></svg></button>
          <button type="button" class="press" onClick={toKg(at + 1)} aria-label="Heavier dumbbell" style={small}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12M12 6v12"></path></svg></button>
        </div>
      )}
      <div role="group" aria-label={e.hold ? "Hold time" : "Reps done"} style="margin-top: 10px; display: flex; align-items: center; gap: 10px;">
        <b style={`margin-left: -4px; font-size: ${String(big).length > 2 ? 80 : 104}px; line-height: 0.86; font-weight: 800; letter-spacing: -0.04em;`}>{big}</b>
        <p style="align-self: flex-end; margin: 0 0 12px; display: flex; flex-direction: column; gap: 1px; white-space: nowrap; font-size: 15px; line-height: 1.2; font-weight: 500; color: var(--glass-muted);"><strong style="font-size: 17px; font-weight: 700; letter-spacing: -0.015em; color: var(--glass-ink);">{unit1}</strong>{unit2}</p>
        <div style={`margin-left: auto; display: flex; align-items: center; border-radius: 999px; background: var(--fill); visibility: ${stepVis ? "visible" : "hidden"};`}>
          <button type="button" class="press" onClick={step(-1)} aria-label={e.hold ? "5 seconds less" : "One fewer"} style={half}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"></path></svg></button>
          <span aria-hidden="true" style="width: 1px; height: 22px; background: var(--line);"></span>
          <button type="button" class="press" onClick={step(1)} aria-label={e.hold ? "5 seconds more" : "One more"} style={half}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12M12 6v12"></path></svg></button>
        </div>
      </div>
      {bar && <span aria-hidden="true" style="margin-top: 14px; height: 6px; border-radius: 999px; background: var(--fill); overflow: hidden;"><span class="holdbar" style={`display: block; height: 6px; border-radius: 999px; background: var(--accent); transform: scaleX(${(run.hold.left / Math.max(1, run.amount)).toFixed(3)});`}></span></span>}
      <button type="button" class="press tab" onClick={act} style={`margin-top: 14px; ${BIG_BTN} ${look}`}>{icon}<span>{cta}</span></button>
    </section>
  );
}

function RestView({ app, run }: { app: App; run: Run }) {
  const e = current(run);
  const q = asksLeft(run);
  const newEx = run.set === e.sets.length;
  const next = run.exercises[run.ex + 1];
  const off = (791.7 * (1 - run.rest / run.restTotal)).toFixed(1);
  const knob = ((360 * run.rest) / run.restTotal).toFixed(1);
  return (
    <>
      <div style={`position: relative; z-index: 2; flex: 1 1 0; min-height: 0; display: flex; align-items: center; justify-content: center; padding-bottom: ${newEx ? 299 : q ? 213 : 90}px;`}>
        <div ref={timerIn} role="timer" aria-label="Rest time left" style="position: relative; width: 310px; height: 310px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: var(--v-ink);">
          <svg width="310" height="310" viewBox="0 0 310 310" fill="none" aria-hidden="true" style="position: absolute; inset: 0; rotate: -90deg;">
            <circle cx="155" cy="155" r="149" stroke="var(--v-track)" stroke-width="9" stroke-dasharray="2 13.603"></circle>
            <circle cx="155" cy="155" r="126" stroke="var(--v-track)" stroke-width="14"></circle>
            <circle class="ring" cx="155" cy="155" r="126" stroke="var(--accent)" stroke-width="14" stroke-linecap="round" stroke-dasharray="791.700" stroke-dashoffset={off}></circle>
            <g class="knob" style={`rotate: ${knob}deg;`}><circle cx="281" cy="155" r="12" fill="#FFFFFF" stroke="var(--accent)" stroke-width="6"></circle></g>
          </svg>
          <span style="font-size: 15px; font-weight: 600; letter-spacing: 0.01em; color: var(--v-muted);">Rest</span>
          <span style="font-size: 92px; line-height: 0.95; font-weight: 800; letter-spacing: -0.04em;">{clock(run.rest)}</span>
        </div>
      </div>
      {newEx && next && (
        <div class="frost" ref={nextIn} data-delay="200" role="group" aria-label="Up next" style={`position: absolute; z-index: 2; right: 12px; bottom: 251px; width: max-content; max-width: calc(100% - 24px); box-sizing: border-box; padding: 10px 18px 10px 10px; border-radius: 18px; ${GLASS} display: flex; align-items: center; gap: 12px;`}>
          <span role="img" aria-label="Exercise photo placeholder" style="width: 44px; height: 44px; flex-shrink: 0; border-radius: 10px; background: var(--glass-btn); color: var(--glass-muted); display: flex; align-items: center; justify-content: center;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="3"></rect><circle cx="9" cy="10" r="1.6"></circle><path d="M20.5 15.5l-4.5-4.5-8.5 8.5"></path></svg></span>
          <span style="min-width: 0; display: flex; flex-direction: column; gap: 2px;"><span style="font-size: 12px; font-weight: 600; letter-spacing: 0.01em; color: var(--glass-muted);">Up next</span><span style="font-size: 16px; line-height: 1.15; font-weight: 700; letter-spacing: -0.015em; white-space: nowrap;">{next.name}</span></span>
        </div>
      )}
      <section class="frost" ref={lift} aria-label="Rest" style={PANEL}>
        {q && <Question app={app} run={run} />}
        <div style={`margin-top: ${q ? 18 : 0}px; display: flex; gap: 8px;`}>
          <button type="button" class="press" onClick={() => app.patchRun({ rest: run.rest + 15, restTotal: run.restTotal + 15 })} style={`width: 112px; ${BIG_BTN} background: var(--glass-btn); color: var(--glass-ink);`}>+15 sec</button>
          <button type="button" class="press" onClick={app.skipRest} style={`flex: 1 1 0; ${BIG_BTN} background: var(--glass-ink); color: var(--glass-inv);`}>Skip rest</button>
        </div>
      </section>
    </>
  );
}

/** Finished: the red floods up, the numbers count up, the trained muscles light up. */
function Done({ app, run }: { app: App; run: Run }) {
  const quick = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [k, setK] = useState(quick ? 1 : 0);
  useEffect(() => {
    if (quick) return;
    return ramp(1.1, 0.95, setK);
  }, []);
  const ease = 1 - Math.pow(1 - k, 3);
  // Active calories for what was done, worked out as if it were already saved (null without body weight).
  const kcal = useMemo(() => caloriesWith(app.saved, toEvents(run, "done-preview", Date.now())), []);
  const trained = Object.fromEntries(REGIONS.filter((m) => run.done.some((d) => app.s.catalog.byId[d.exerciseId]?.contributions[m] === 1)).map((m) => [m, 1]));
  // The contour lines mark the muscle worked most today, as they mark the one grown most on the screens after.
  const most = useMemo(() => mostWorked(app.s, run).lines, []);
  const recap = useRecap(app, run);
  const [step, setStep] = useState<"done" | "learned" | "growth" | "week">("done");
  const [sharing, setSharing] = useState(false);
  const stat = (v: string, label: string, delay: number) => (
    <div ref={fUp} data-delay={delay} style="display: flex; flex-direction: column; gap: 4px;"><span style="font-family: var(--mono); font-size: 34px; line-height: 1; font-weight: 600; letter-spacing: -0.03em;">{v}</span><span style="font-size: 13px; font-weight: 500; color: rgba(255, 255, 255, 0.74);">{label}</span></div>
  );
  const fig = (view: "front" | "back", delay: number) => (
    <div style="position: relative;">
      <Fig view={view} kind="hero" values={{}} theme={app.theme} h={250} alt={`${view === "front" ? "Front" : "Back"} of the body with the trained muscles lit. Lines mark the most worked: ${most.map(muscleName).join(" and ")}.`} />
      <div ref={fLit} data-delay={delay} style="position: absolute; inset: 0;"><Fig view={view} kind="hero" values={{ ...trained, ...Object.fromEntries(most.map((m) => [m, 1])) }} lines={most} theme={app.theme} h={250} alt="" /></div>
    </div>
  );
  const growthNext = recap.grew.length > 0;
  const week = recap.week;
  return (
    <div style="position: absolute; inset: 0; z-index: 4; color: #FFFFFF;">
      <div ref={fFlood} aria-hidden="true" style="position: absolute; inset: 0; background: var(--hero);"></div>
      <div style="position: relative; height: 100%; box-sizing: border-box; padding: var(--top) 20px var(--bottom); display: flex; flex-direction: column;">
        <svg width="64" height="64" viewBox="0 0 72 72" fill="none" stroke="#FFFFFF" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="transform: rotate(-90deg); flex-shrink: 0;"><circle ref={fDraw} cx="36" cy="36" r="33" stroke-width="5" data-delay="380" data-ms="640" style="stroke-dasharray: 208;"></circle><path ref={fDraw} d="M22 36.500l9.500 9.500 19-20" stroke-width="6" transform="rotate(90 36 36)" data-delay="900" data-ms="340" style="stroke-dasharray: 44;"></path></svg>
        <h1 style="margin: 22px 0 0; font-size: 64px; line-height: 0.94; font-weight: 800; letter-spacing: -0.04em;"><span style="display: block; overflow: hidden; padding-bottom: 0.06em;"><span ref={fLine} data-delay="520" style="display: block;">Workout</span></span><span style="display: block; overflow: hidden; padding-bottom: 0.12em;"><span ref={fLine} data-delay="610" style="display: block; color: rgba(255, 255, 255, 0.62);">done</span></span></h1>
        {/* Four numbers in two rows: time and calories, then sets and reps. Calories are one figure, the engine's best estimate. */}
        <div style="margin-top: 18px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 12px;">
          {stat(clock(Math.round(run.elapsed * ease)), "time", 900)}
          {kcal ? stat(String(Math.round(kcal.kcal * ease)), "active kcal", 940) : stat(String(Math.round(repsDone(run) * ease)), "reps", 940)}
          {stat(String(Math.round(run.done.length * ease)), "sets", 980)}
          {kcal && stat(String(Math.round(repsDone(run) * ease)), "reps", 1060)}
        </div>
        <div ref={fFig} data-delay="1150" style="margin-top: 18px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px;">
          {fig("front", 1750)}{fig("back", 1900)}
        </div>
        {most.length > 0 && <span ref={fUp} data-delay="2200" style="margin-top: 10px; align-self: center; display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.86);"><Swatch />Most worked: {most.map((m) => muscleName(m).toLowerCase()).join(" and ")}</span>}
        <div style="flex: 1 1 0; min-height: 12px;"></div>
        <button type="button" class="press" ref={fUp} data-delay="2500" onClick={() => setStep("learned")} style={`${BIG_BTN} background: #FFFFFF; color: var(--hero);`}>Next</button>
      </div>
      {step !== "done" && <Learned app={app} recap={recap} share={() => setSharing(true)} next={() => (growthNext ? setStep("growth") : week ? setStep("week") : app.finishWorkout())} last={!growthNext && !week} />}
      {(step === "growth" || (step === "week" && growthNext)) && <Growth app={app} recap={recap} share={() => setSharing(true)} next={() => (week ? setStep("week") : app.finishWorkout())} last={!week} />}
      {step === "week" && week && <WeekMoment app={app} week={week} share={() => setSharing(true)} done={app.finishWorkout} />}
      {sharing && <ShareSheet app={app} recap={recap} close={() => setSharing(false)} />}
    </div>
  );
}

export function Workout({ app, run, cls }: { app: App; run: Run; cls: string }) {
  return (
    <div ref={useMove(cls)} role="dialog" aria-label="Workout in progress" style="position: absolute; inset: 0; z-index: 8; overflow: hidden; background: var(--bg); box-sizing: border-box; padding: var(--top-tight) 20px 28px; display: flex; flex-direction: column;">
      {run.phase !== "done" && (
        <>
          <div role="img" aria-label="Exercise video placeholder" style={`position: absolute; inset: 0; z-index: 0; background: var(--video); color: var(--video-ink); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding-bottom: 240px; box-sizing: border-box; font-size: 13px; font-weight: 600; opacity: ${run.phase === "work" ? 1 : 0.55}; transition: opacity 400ms ease;`}>
            <span style={`display: flex; flex-direction: column; align-items: center; gap: 10px; opacity: ${run.phase === "work" ? 1 : 0};`}><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="5.5" width="13" height="13" rx="3"></rect><path d="M15.5 10.5l6-3v9l-6-3"></path></svg>Exercise video</span>
          </div>
          <div style="position: relative; z-index: 2; display: flex; align-items: center; gap: 14px;">
            <button type="button" class="press" onClick={app.endWorkout} aria-label="End workout" style={`width: 44px; padding: 0; cursor: pointer; ${CHROME}`}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg></button>
            <div role="progressbar" aria-label="Workout progress" aria-valuemin={0} aria-valuemax={setsTotal(run)} aria-valuenow={run.done.length} style="flex: 1 1 0; display: flex; gap: 4px;">
              {run.exercises.map((x, i) => {
                const hot = run.flash && i === run.ex;
                const done = run.phase === "ask" || i < run.ex ? 1 : i > run.ex ? 0 : (run.phase === "work" ? run.set - 1 : run.set) / x.sets.length;
                return (
                  <span key={i} class="seg" style={`flex: 1 1 0; height: 4px; border-radius: 999px; background: var(--v-track); overflow: hidden; transform: scaleY(${hot ? 2.2 : 1});`}>
                    <span class="fill" style={`display: block; height: 4px; border-radius: 999px; background-color: ${hot ? "var(--accent)" : "var(--v-fill)"}; transform: scaleX(${done}); transition-duration: 800ms, ${hot ? 0 : 1400}ms;`}></span>
                  </span>
                );
              })}
            </div>
            <span aria-label="Time elapsed" style={`padding: 0 14px; font-family: var(--mono); font-size: 15px; font-weight: 600; ${CHROME}`}>{clock(run.elapsed)}</span>
          </div>
        </>
      )}
      {run.phase === "work" && <WorkPanel app={app} run={run} />}
      {run.phase === "rest" && <RestView app={app} run={run} />}
      {run.phase === "ask" && (
        <section class="frost" ref={lift} aria-label="Last set" style={PANEL}>
          <p style="margin: 0 0 14px; font-size: 20px; line-height: 1.15; font-weight: 800; letter-spacing: -0.02em;">Last set done</p>
          <Question app={app} run={run} />
        </section>
      )}
      {run.phase === "done" && <Done app={app} run={run} />}
    </div>
  );
}
