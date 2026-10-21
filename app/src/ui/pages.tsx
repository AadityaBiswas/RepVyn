// Pages pushed over the tabs: the workout page, a finished workout, the soreness list, the program and first-run set-up.
import { REGIONS, REGION_NAMES, level } from "../../../src/engine";
import { catalog } from "../env";
import { CORE, LEVEL_ASKS, PROGRAM_ID, PROGRAM_NAME, UPPER, dayStart, doneDay, isLegsDay, levelFromAnswers, nudgeWeight, planActivation, planRegions, planRows, planTitle, programValues, programWeek, regionWords, startingPoint, type LevelAsk } from "../model";
import type { App } from "./app";
import { badgeIn, fade, fFig, fUp, pop, pulse, rollDown, rollUp, rowIn, rowOut, swap, tick, useMove, usePresence } from "./motion";
import { Clock, EquipInline, EquipStack, IntensityIcon } from "./icons";
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { DumbbellPicker } from "./dumbbells";
import { BackButton, BottomCta, Faint, Roll, Fig, Figures, H1, Mark, Muscle, Opt, OptGrid, Scroll, Section, Seg, Segmented, Stepper, ThumbDown, ThumbUp } from "./kit";
import { bodyWeight, equipLabel, EquipOptions } from "./tabs";

const DURATIONS = [20, 30, 40, 50];
const INTENSITY = [["easy", "Easy"], ["normal", "Normal"], ["hard", "Hard"]] as const;

// ---------- workout page ----------

export function Setup({ app, cls }: { app: App; cls: string }) {
  const { s, ui, theme } = app;
  const plan = app.setupPlan;
  const c = ui.choice;
  // Which way each value moved since the last render, so its new label rolls in from that side.
  const was = useRef(c);
  const dir = (a: number, b: number) => (a >= b ? rollUp : rollDown);
  const LEVEL = { easy: 0, normal: 1, hard: 2 } as const;
  const chip = (key: "duration" | "intensity" | "equip", label: string, icon: ComponentChildren, value: ComponentChildren, enter: (el: HTMLElement | null) => void) => {
    const on = ui.open === key;
    // Time and intensity share the row; the equipment chip is exactly as wide as its avatars.
    const fit = key === "equip";
    return (
      <button type="button" class="tab" onClick={() => app.set({ open: on ? null : key })} aria-expanded={on ? "true" : "false"} aria-label={`${key === "duration" ? "Duration" : key === "intensity" ? "Intensity" : "Equipment"}: ${label}`}
        style={`${fit ? "flex: 0 0 auto; padding: 0 8px 0 9px;" : "flex: 1 1 0; padding: 0 8px 0 10px;"} min-width: 0; height: 48px; border: 0; border-radius: 999px; cursor: pointer; background: ${on ? "var(--ink)" : "var(--surface)"}; color: ${on ? "var(--bg)" : "var(--ink)"}; display: flex; align-items: center; justify-content: space-between; gap: 5px; font-size: 15px; font-weight: 600; letter-spacing: -0.01em; white-space: nowrap;`}>
        <span style="display: flex; align-items: center; gap: 5px; min-width: 0;">
          {icon}
          {value !== null && <span style="display: block; overflow: hidden;"><span key={label} ref={enter} style="display: block;">{value}</span></span>}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style={`flex-shrink: 0; transform: rotate(${on ? 180 : 0}deg); transition: transform 200ms cubic-bezier(0.23,1,0.32,1);`}><path d="M6 9l6 6 6-6"></path></svg>
      </button>
    );
  };
  const panel = "margin-top: 10px; padding: 16px; background: var(--surface); border-radius: 24px; display: flex; flex-direction: column; gap: 12px;";
  const regions = planRegions(s, plan);
  // A legs day shows the legs alone, front and back, in place of two whole figures.
  const legs = isLegsDay(regions);
  const [words] = regionWords(regions);
  const rows = planRows(s, plan, app.saved.settings.units);
  const list = usePresence(plan.kind === "workout" ? rows : [], (r) => r.id);
  const count = rows.length;
  // Rows arriving together land one after another.
  const order = new Map(list.rows.filter((r) => r.state === "in").map((r, i) => [r.key, i]));
  // When a choice changes the plan, the count on the Start button rolls and pops, so the change shows without scrolling;
  // the list itself opens new rows and closes removed ones. New rows keep a "New" tag for a moment.
  const [change, setChange] = useState<{ id: number; fresh: string[] } | null>(null);
  const shown = useRef<string[] | null>(null);
  useEffect(() => {
    const ids = plan.kind === "workout" ? rows.map((r) => r.id) : [];
    const before = shown.current;
    shown.current = ids;
    if (!before) return;
    const fresh = ids.filter((id) => !before.includes(id));
    if (!fresh.length && before.every((id) => ids.includes(id))) return;
    tick();
    setChange({ id: Date.now(), fresh });
  }, [rows.map((r) => r.id).join()]);
  useEffect(() => {
    if (!change) return;
    const t = setTimeout(() => setChange(null), 2400);
    return () => clearTimeout(t);
  }, [change?.id]);
  useEffect(() => { was.current = c; });
  const prev = was.current;
  return (
    <div class={cls} ref={useMove(cls)} role="dialog" aria-label="Today's workout" style="position: absolute; inset: 0; z-index: 5; background: var(--bg);">
      <Scroll top="calc(var(--top) + 64px)" bottom={150}>
        <H1>{planTitle(plan)}</H1>
        {plan.kind === "workout"
          ? <p style="margin: 10px 0 0; font-size: 15px; line-height: 1.4; color: var(--muted);">{words[0]?.toUpperCase()}{words.slice(1)}</p>
          : <p style="margin: 10px 0 0; font-size: 15px; line-height: 1.4; color: var(--muted);">{plan.reasons[0] ?? ""}</p>}
        <div style="margin-top: 16px;">
          <Figures key={regions.join()} enter={swap} kind="level" values={planActivation(s, plan)} theme={theme} h={legs ? 280 : 310} part={legs ? "legs" : "all"} gap={legs ? 8 : 0}
            alt={[`Front of the body with ${words || "nothing"} highlighted.`, `Back of the body with ${words || "nothing"} highlighted.`]} />
        </div>

        <div style="margin-top: 20px; display: flex; gap: 8px;">
          {chip("duration", `${c.minutes} min`, <Clock size={18} />, `${c.minutes} min`, dir(c.minutes, prev.minutes))}
          {chip("intensity", INTENSITY.find((i) => i[0] === c.intensity)![1], <IntensityIcon level={c.intensity} size={18} />, INTENSITY.find((i) => i[0] === c.intensity)![1], dir(LEVEL[c.intensity], LEVEL[prev.intensity]))}
          {chip("equip", equipLabel(c.equipment), <EquipStack items={c.equipment} size={30} max={3} body ring={ui.open === "equip" ? "var(--ink)" : "var(--surface)"} />, null, dir(c.equipment.length, prev.equipment.length))}
        </div>
        {ui.open === "duration" && (
          <div ref={pop} role="group" aria-label="Duration" style={panel}>
            <span style="font-size: 13px; font-weight: 600; color: var(--muted);">Duration</span>
            <Segmented>{DURATIONS.map((m) => <Seg key={m} label={`${m} min`} on={c.minutes === m} pick={() => app.choose({ minutes: m })} />)}</Segmented>
          </div>
        )}
        {ui.open === "intensity" && (
          <div ref={pop} role="group" aria-label="Intensity" style={panel}>
            <span style="font-size: 13px; font-weight: 600; color: var(--muted);">Intensity</span>
            <Segmented>{INTENSITY.map(([k, l]) => <Seg key={k} label={l} icon={<IntensityIcon level={k} size={16} />} on={c.intensity === k} pick={() => app.choose({ intensity: k })} />)}</Segmented>
          </div>
        )}
        {ui.open === "equip" && (
          <div ref={pop} role="group" aria-label="Equipment" style={panel}>
            <span style="font-size: 13px; font-weight: 600; color: var(--muted);">Equipment</span>
            <EquipOptions value={c.equipment} set={(equipment) => app.choose({ equipment })} />
          </div>
        )}

        {plan.kind === "workout" && (
          <section style="margin-top: 32px; display: flex; flex-direction: column; gap: 12px; scroll-margin-top: calc(var(--top) + 72px);">
            <h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em;"><Roll value={count} /> exercise{count === 1 ? "" : "s"}</h2>
            <ol style="margin: 0; padding: 0 16px; list-style: none; background: var(--surface); border-radius: 24px; display: flex; flex-direction: column;">
              {list.rows.map(({ item: x, key, state }, i) => {
                const mark = app.saved.feedback[x.id]?.liked;
                const open = ui.row === x.id;
                const flag = (liked: boolean) => () => app.feedback(x.id, mark === liked ? null : liked);
                const pill = (on: boolean) => `height: 48px; padding: 0; border: 0; border-radius: 999px; cursor: pointer; font-size: 15px; font-weight: 600; letter-spacing: -0.01em; display: flex; align-items: center; justify-content: center; gap: 8px; background: ${on ? "var(--ink)" : "var(--bg)"}; color: ${on ? "var(--bg)" : "var(--ink)"};`;
                return (
                  <li key={key} data-delay={String((order.get(key) ?? 0) * 70)} ref={state === "in" ? rowIn : state === "out" ? (el: HTMLElement | null) => el && rowOut(el, () => list.gone(key)) : undefined}
                    aria-hidden={state === "out" ? "true" : undefined}
                    style={`position: relative; display: flex; flex-direction: column; border-top: 1px solid ${i === 0 ? "transparent" : "var(--soft)"};`}>
                    <span data-wash aria-hidden="true" style="position: absolute; inset: 0 -16px; opacity: 0; pointer-events: none; background: linear-gradient(90deg, var(--accent-wash), transparent 85%);"></span>
                    <div data-row style="position: relative; display: flex; flex-direction: column;">
                    <button type="button" class="press" onClick={() => app.set({ row: open ? null : x.id })} aria-expanded={open ? "true" : "false"} aria-label={x.name + (mark === true ? ", liked" : mark === false ? ", disliked" : "")}
                      style="min-height: 80px; padding: 0; border: 0; background: transparent; color: var(--ink); display: flex; align-items: center; gap: 14px; text-align: left; cursor: pointer;">
                      <Muscle region={x.region} levels={x.levels} theme={theme} />
                      <span style="flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px;"><span style="font-size: 17px; line-height: 1.2; font-weight: 700; letter-spacing: -0.015em;">{x.name}</span><span style="font-size: 15px; line-height: 1.3; color: var(--muted);">{x.detail}<EquipInline items={s.catalog.byId[x.id]?.equipment ?? []} /></span></span>
                      {change?.fresh.includes(x.id) && <span ref={badgeIn} data-delay="260" class="new-tag" style="flex-shrink: 0; padding: 4px 9px; border-radius: 999px; background: var(--accent); color: #FFFFFF; font-size: 12px; font-weight: 700; letter-spacing: 0.01em;">New</span>}
                      {!change?.fresh.includes(x.id) && (mark === true ? <ThumbUp /> : mark === false ? <span style="color: var(--muted); display: flex;"><ThumbDown /></span>
                        : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="flex-shrink: 0; color: var(--faint);"><circle cx="5" cy="12" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="19" cy="12" r="1.8"></circle></svg>)}
                    </button>
                    {open && (
                      <div ref={pop} style="padding: 0 0 16px; display: flex; flex-direction: column; gap: 12px;">
                        <p style="margin: 0; font-size: 15px; line-height: 1.4; color: var(--muted);">
                          {x.why && <>{x.why.replace(/\.$/, "")}. </>}{x.muscles}{x.kcal !== null && ` About ${x.kcal} kcal.`}
                        </p>
                        <div role="group" aria-label="Your take on this exercise" style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px;">
                          <button type="button" class="tab" onClick={flag(true)} aria-pressed={mark === true ? "true" : "false"} style={pill(mark === true)}><ThumbUp size={18} />Like</button>
                          <button type="button" class="tab" onClick={flag(false)} aria-pressed={mark === false ? "true" : "false"} style={pill(mark === false)}><ThumbDown size={18} />Dislike</button>
                          <button type="button" class="tab" onClick={() => app.swap(x.id)} aria-label={`Swap ${x.name} for another exercise`} style={pill(false)}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h13l-3-3M20 16H7l3 3"></path></svg>Swap
                          </button>
                        </div>
                      </div>
                    )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </Scroll>
      <BackButton onClick={app.back} label="Back to home" />
      <BottomCta onClick={app.startWorkout} disabled={plan.kind !== "workout"}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 4.5v15l12-7.5z"></path></svg>
        {plan.kind === "workout" ? (
          <span style="display: flex; align-items: center; gap: 0.3em;">Start
            <span key={change?.id ?? 0} ref={change ? pulse : undefined} style="display: inline-flex; min-width: 30px; height: 30px; padding: 0 8px; box-sizing: border-box; border-radius: 999px; background: rgba(255, 255, 255, 0.22); align-items: center; justify-content: center;"><Roll value={count} /></span>
            exercise{count === 1 ? "" : "s"}</span>
        ) : "Start workout"}
      </BottomCta>
    </div>
  );
}

// ---------- soreness ----------

export function Sore({ app, cls }: { app: App; cls: string }) {
  const { ui } = app;
  return (
    <div class={cls} ref={useMove(cls)} role="dialog" aria-label="Sore muscles" style="position: absolute; inset: 0; z-index: 5; background: var(--bg);">
      <Scroll top="calc(var(--top) + 64px)" bottom={132}>
        <H1>What's <Faint>sore</Faint></H1>
        <div role="group" aria-label="Muscles" style="margin-top: 24px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px;">
          {REGIONS.map((m) => (
            <Opt key={m} label={REGION_NAMES[m]} on={ui.sore.includes(m)} off="var(--surface)" style="height: 52px; font-size: 15px;"
              pick={() => app.set({ sore: ui.sore.includes(m) ? ui.sore.filter((x) => x !== m) : [...ui.sore, m] })} />
          ))}
        </div>
      </Scroll>
      <BackButton onClick={app.back} />
      <BottomCta onClick={() => app.checkin(ui.sore)}>Done</BottomCta>
    </div>
  );
}

// ---------- the program ----------

/** One program for now. On first run this is the hand-off into it; later it is a look at where you are in it. */
export function Programs({ app, cls, first }: { app: App; cls: string; first: boolean }) {
  const { saved, theme, now } = app;
  const st = saved.settings;
  const sel = catalog.programs.find((p) => p.id === PROGRAM_ID) ?? catalog.programs[0]!;
  const week = first ? 0 : programWeek(saved.programStart, now) - 1;
  const lvl = level(app.s).experience;
  return (
    <div class={cls} ref={useMove(cls)} role="dialog" aria-label={PROGRAM_NAME} style="position: absolute; inset: 0; z-index: 6; background: var(--bg);">
      <Scroll top={first ? "var(--top)" : "calc(var(--top) + 64px)"} bottom={132}>
        {first ? <H1>You're starting<br /><Faint>the 12-week program</Faint></H1> : <H1>Your <Faint>program</Faint></H1>}
        <section aria-label={PROGRAM_NAME} style="margin-top: 22px; border-radius: 32px; background: var(--surface); padding: 20px 20px 22px; display: flex; flex-direction: column; box-shadow: var(--card-shadow);">
          <Figures values={programValues(sel)} theme={theme} h={232} gap={4}
            alt={["Front of the body, every muscle in the same red: the whole body trained evenly.", "Back of the body, every muscle in the same red: the whole body trained evenly."]} />
          <h2 style="margin: 14px 0 0; font-size: 30px; line-height: 1.08; font-weight: 800; letter-spacing: -0.03em;">{PROGRAM_NAME}</h2>
          <p style="margin: 6px 0 0; font-size: 15px; line-height: 1.4; color: var(--muted); text-wrap: pretty;">
            Every muscle, {st.days} days a week, set for {/^[aeiou]/.test(lvl) ? "an" : "a"} {lvl}. Each workout is built from what's ready that day.
          </p>
          <div role="progressbar" aria-label="Weeks completed" aria-valuemin={0} aria-valuemax={12} aria-valuenow={week} style="margin-top: 18px; display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 4px;">
            {Array.from({ length: 12 }, (_, i) => <span key={i} style={`height: 6px; border-radius: 999px; background: ${i < week ? "var(--ink)" : i === week ? "var(--accent)" : "var(--track)"};`}></span>)}
          </div>
          <div style="margin-top: 8px; display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; color: var(--muted);"><span>{first ? "Starts today" : `Week ${week + 1}`}</span><span>Week 12</span></div>
        </section>
        <p style="margin: 20px 4px 0; display: flex; align-items: center; gap: 10px; font-size: 15px; line-height: 1.35; color: var(--muted);">
          <span style="flex-shrink: 0; padding: 4px 9px; border-radius: 999px; background: var(--ink); color: var(--bg); font-size: 12px; font-weight: 700; letter-spacing: 0.01em;">Soon</span>
          More programs are on the way.
        </p>
      </Scroll>
      {!first && <BackButton onClick={app.back} />}
      <BottomCta onClick={first ? app.startProgram : app.back}>{first ? "Start the 12-week program" : "Done"}</BottomCta>
    </div>
  );
}

// ---------- a finished workout ----------

const dayName = (day: number, now: number) =>
  day === dayStart(now) ? "Today" : new Date(day).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });

/** The workout as it was done: what was trained, and every set of every exercise. */
export function Done({ app, cls }: { app: App; cls: string }) {
  const { s, ui, saved, theme, now } = app;
  const d = doneDay(s, saved.events, ui.day, saved.settings.units);
  const regions = d?.regions ?? [];
  const legs = isLegsDay(regions);
  const [words] = regionWords(regions);
  const title = !regions.length ? "Workout" : legs ? "Legs" : regions.every((m) => UPPER.includes(m) || CORE.includes(m)) ? "Upper body" : "Full body";
  const stats: [string, string][] = d ? [[`${d.minutes}`, "min"], [`${d.sets}`, d.sets === 1 ? "set" : "sets"], [`${d.reps}`, "reps"], ...(d.kcal !== null ? [[`${d.kcal}`, "kcal"] as [string, string]] : [])] : [];
  return (
    <div class={cls} ref={useMove(cls)} role="dialog" aria-label="Finished workout" style="position: absolute; inset: 0; z-index: 5; background: var(--bg);">
      <Scroll top="calc(var(--top) + 64px)" bottom={150}>
        <span style="display: block; margin-bottom: 8px; font-size: 15px; font-weight: 600; color: var(--muted);">{dayName(ui.day, now)}</span>
        <H1>{title} <Faint>done</Faint></H1>
        {words && <p style="margin: 10px 0 0; font-size: 15px; line-height: 1.4; color: var(--muted);">{words[0]?.toUpperCase()}{words.slice(1)}</p>}
        <div style="margin-top: 16px;">
          <Figures kind="level" values={Object.fromEntries(regions.map((m) => [m, 1]))} theme={theme} h={legs ? 280 : 310} part={legs ? "legs" : "all"} gap={legs ? 8 : 0}
            alt={[`Front of the body with ${words || "nothing"} highlighted.`, `Back of the body with ${words || "nothing"} highlighted.`]} />
        </div>
        <ul aria-label="Totals" style={`margin: 20px 0 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(${stats.length || 1}, minmax(0, 1fr)); gap: 8px;`}>
          {stats.map(([v, l]) => (
            <li key={l} style="height: 72px; border-radius: 22px; background: var(--surface); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;">
              <span style="font-size: 24px; line-height: 1; font-weight: 800; letter-spacing: -0.03em; font-variant-numeric: tabular-nums;">{v}</span>
              <span style="font-size: 13px; font-weight: 600; color: var(--muted);">{l}</span>
            </li>
          ))}
        </ul>
        {d && (
          <section style="margin-top: 32px; display: flex; flex-direction: column; gap: 12px;">
            <h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">{d.exercises.length} exercise{d.exercises.length === 1 ? "" : "s"}</h2>
            <ol style="margin: 0; padding: 0 16px; list-style: none; background: var(--surface); border-radius: 24px; display: flex; flex-direction: column;">
              {d.exercises.map((x, i) => (
                <li key={x.id} style={`min-height: 80px; padding: 12px 0; box-sizing: border-box; display: flex; align-items: center; gap: 14px; border-top: 1px solid ${i === 0 ? "transparent" : "var(--soft)"};`}>
                  <Muscle region={x.region} theme={theme} />
                  <span style="flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px;">
                    <span style="font-size: 17px; line-height: 1.2; font-weight: 700; letter-spacing: -0.015em;">{x.name}</span>
                    <span aria-label={`Sets: ${x.sets.join(", ")}`} style="display: flex; flex-wrap: wrap; gap: 4px;">
                      {x.sets.map((r, j) => <span key={j} style="min-width: 28px; height: 26px; padding: 0 8px; box-sizing: border-box; border-radius: 999px; background: var(--bg); display: inline-flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums;">{r}</span>)}
                    </span>
                  </span>
                  <span style="flex-shrink: 0; font-size: 13px; font-weight: 600; color: var(--muted); white-space: nowrap;">{x.total}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </Scroll>
      <BackButton onClick={app.back} label="Back to home" />
      <BottomCta onClick={app.back}>Done</BottomCta>
    </div>
  );
}

// ---------- first-run set-up ----------

const GOALS = [["muscle", "Build muscle", "Full weekly volume"], ["general_fitness", "General fitness", "Lighter weeks"]] as const;
const STEPS = 5;

export function Onboard({ app }: { app: App }) {
  const { ui, saved } = app;
  const st = saved.settings;
  // ui.ob 0 is the welcome; 1..5 are the questions; 6 is the starting level the answers give.
  const step = ui.ob - 1;
  const box = "padding: 16px; background: var(--surface); border-radius: 24px; display: flex; flex-direction: column; gap: 12px;";
  const cap = (t: string) => <span style="font-size: 13px; font-weight: 600; color: var(--muted);">{t}</span>;
  const answer = (k: LevelAsk, i: number) => {
    const lv = { ...ui.lv, [k]: i };
    app.set({ lv });
    const est = levelFromAnswers(app.s, lv);
    app.settings({ level: est ? est.experience : "auto" });
  };
  const est = levelFromAnswers(app.s, ui.lv);
  const result = step === STEPS;
  return (
    <div role="dialog" aria-label="Set up" style="position: absolute; inset: 0; z-index: 7; background: var(--bg);">
      {step < 0 && (
        <div key="welcome" ref={fade} style="position: absolute; inset: 0;">
          <div style="position: absolute; top: var(--top); left: 20px; display: flex; align-items: center; gap: 10px; font-size: 20px; font-weight: 800; letter-spacing: -0.02em;"><Mark />RepVyn</div>
          <Fig view="front" kind="level" values={{ quads: 0.5, calves: 0.5 }} theme={app.theme} h={400} alt="A body with the legs in red: the muscles RepVyn would train today."
            style="position: absolute; right: -10px; top: calc(var(--top) + 52px); width: 240px;" />
          <div style="position: absolute; left: 20px; right: 20px; bottom: 132px;">
            <H1>You train.<br /><Faint>RepVyn plans.</Faint></H1>
            <p style="margin: 16px 0 0; max-width: 330px; font-size: 17px; line-height: 1.4; color: var(--muted);">Log your sets. RepVyn works out which muscles are ready and builds today's workout around them.</p>
          </div>
        </div>
      )}
      {step >= 0 && <Scroll top="calc(var(--top) + 76px)" bottom={132}>
        {step === 0 && (
          <div key="0" ref={fade} style="display: flex; flex-direction: column;">
            <H1>Your <Faint>goal</Faint></H1>
            <div role="group" aria-label="Goal" style="margin-top: 24px; display: flex; flex-direction: column; gap: 8px;">
              {GOALS.map(([k, l, sub]) => (
                <button key={k} type="button" class="tab" onClick={() => app.settings({ goal: k })} aria-pressed={st.goal === k ? "true" : "false"} style={`min-height: 76px; padding: 12px 20px; border: 0; border-radius: 24px; cursor: pointer; text-align: left; background: ${st.goal === k ? "var(--ink)" : "var(--surface)"}; color: ${st.goal === k ? "var(--bg)" : "var(--ink)"}; display: flex; flex-direction: column; justify-content: center; gap: 3px;`}>
                  <span style="font-size: 17px; font-weight: 700; letter-spacing: -0.015em;">{l}</span><span style="font-size: 14px; opacity: 0.72;">{sub}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {step === 1 && (
          <div key="1" ref={fade} style="display: flex; flex-direction: column;">
            <H1>Your <Faint>week</Faint></H1>
            <div style={`margin-top: 24px; ${box}`}>{cap("Days per week")}
              <OptGrid cols={5} label="Days per week">{[2, 3, 4, 5, 6].map((d) => <Opt key={d} label={String(d)} on={st.days === d} pick={() => app.settings({ days: d })} />)}</OptGrid>
            </div>
            <div style={`margin-top: 12px; ${box}`}>{cap("Workout length")}
              <OptGrid cols={4} label="Workout length">{DURATIONS.map((m) => <Opt key={m} label={`${m} min`} on={st.minutes === m} pick={() => app.settings({ minutes: m })} />)}</OptGrid>
            </div>
          </div>
        )}
        {step === 2 && (
          <div key="2" ref={fade} style="display: flex; flex-direction: column;">
            <H1>Your <Faint>equipment</Faint></H1>
            <div style={`margin-top: 24px; ${box}`}><EquipOptions value={st.equipment} set={(equipment) => app.settings({ equipment })} /></div>
            {st.equipment.includes("dumbbell") && (
              <div ref={pop} style={`margin-top: 12px; ${box}`}>{cap("Dumbbells")}<DumbbellPicker value={st.dumbbells} set={(dumbbells) => app.settings({ dumbbells })} /></div>
            )}
          </div>
        )}
        {step === 3 && (
          <div key="3" ref={fade} style="display: flex; flex-direction: column;">
            <H1>Your <Faint>level</Faint></H1>
            <p style="margin: 12px 0 0; font-size: 15px; line-height: 1.4; color: var(--muted);">Your best guess is fine. RepVyn checks it against your first sets.</p>
            {(Object.keys(LEVEL_ASKS) as LevelAsk[]).map((k, n) => (
              <div key={k} style={`margin-top: ${n ? 12 : 20}px; ${box}`}>
                <span style="display: flex; flex-direction: column; gap: 2px;"><span style="font-size: 17px; font-weight: 700; letter-spacing: -0.015em;">{LEVEL_ASKS[k].label}</span><span style="font-size: 13px; color: var(--muted);">{LEVEL_ASKS[k].note}</span></span>
                <OptGrid cols={2} label={LEVEL_ASKS[k].label}>{LEVEL_ASKS[k].answers.map(([l], i) => <Opt key={l} label={l} on={ui.lv[k] === i} pick={() => answer(k, i)} />)}</OptGrid>
              </div>
            ))}
          </div>
        )}
        {step === 4 && (
          <div key="4" ref={fade} style="display: flex; flex-direction: column;">
            <H1>About <Faint>you</Faint></H1>
            <div style={`margin-top: 24px; ${box}`}>{cap("Units")}
              <OptGrid cols={2} label="Units">{(["metric", "imperial"] as const).map((u) => <Opt key={u} label={u === "metric" ? "kg" : "lb"} on={st.units === u} pick={() => app.settings({ units: u })} />)}</OptGrid>
            </div>
            <div style={`margin-top: 12px; ${box}`}>{cap("Body weight")}
              <div role="group" aria-label="Body weight">
                <Stepper size={28} value={bodyWeight(st.kg, st.units)} dec={() => app.settings({ kg: nudgeWeight(st.kg, st.units, -1) })} inc={() => app.settings({ kg: nudgeWeight(st.kg, st.units, 1) })} decLabel="Lower body weight" incLabel="Raise body weight" />
              </div>
            </div>
          </div>
        )}
        {result && <LevelResult app={app} score={est?.score ?? null} />}
      </Scroll>}
      {step > 0 && <BackButton onClick={() => app.set({ ob: ui.ob - 1 })} />}
      {step >= 0 && <div role="progressbar" aria-label="Set-up steps" aria-valuemin={1} aria-valuemax={STEPS} aria-valuenow={Math.min(step + 1, STEPS)} style={`position: absolute; z-index: 3; top: calc(var(--top) + 21px); left: ${step > 0 ? 84 : 20}px; right: 20px; display: grid; grid-template-columns: repeat(${STEPS}, minmax(0, 1fr)); gap: 4px; transition: left 280ms cubic-bezier(0.23,1,0.32,1);`}>
        {Array.from({ length: STEPS }, (_, i) => i).map((i) => <span key={i} style={`height: 6px; border-radius: 999px; background: ${i <= step ? "var(--ink)" : "var(--track)"}; transition: background-color 280ms ease;`}></span>)}
      </div>}
      <BottomCta onClick={() => (step < STEPS ? app.set({ ob: ui.ob + 1 }) : app.finishOnboarding())}>{step < 0 ? "Get started" : step === 3 && !est ? "Skip for now" : "Continue"}</BottomCta>
    </div>
  );
}

const LEVEL_WORDS = ["Beginner", "Intermediate", "Advanced"] as const;

/** The level the answers give, on a three-part meter, and what it changes on day one (read from the engine). */
function LevelResult({ app, score }: { app: App; score: number | null }) {
  const x = Math.max(0, Math.min(2, score ?? 1)) / 2;
  const name = LEVEL_WORDS[score === null ? 1 : score < 0.5 ? 0 : score < 1.5 ? 1 : 2];
  const rows = startingPoint(app.s, app.now);
  return (
    <div key="5" ref={fade} style="display: flex; flex-direction: column;">
      <H1>Your starting <Faint>level</Faint></H1>
      <section aria-label={`Starting level: ${name}`} style="position: relative; overflow: hidden; margin-top: 24px; border-radius: 32px; background: var(--hero); color: var(--hero-ink); padding: 24px; box-shadow: var(--hero-card-shadow);">
        <span aria-hidden="true" style="position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22); pointer-events: none;"></span>
        <h2 ref={fUp} style="position: relative; margin: 0 0 0 -2px; font-size: 48px; line-height: 0.95; font-weight: 800; letter-spacing: -0.04em;">{name}</h2>
        <p style="position: relative; margin: 12px 0 0; font-size: 15px; line-height: 1.4; font-weight: 500; color: rgba(255, 255, 255, 0.92); text-wrap: pretty;">
          {score === null ? "A middle start. Your first sets will show where you really are." : "From your push-ups and squats. It moves with every set you log."}
        </p>
        <div role="meter" aria-label="Level" aria-valuemin={0} aria-valuemax={2} aria-valuenow={+(x * 2).toFixed(2)} style="position: relative; margin-top: 22px; height: 30px;">
          <div aria-hidden="true" style="position: absolute; left: 0; right: 0; top: 11px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px;">
            {LEVEL_WORDS.map((w) => <span key={w} style={`height: 8px; border-radius: 999px; background: ${w === name ? "#FFFFFF" : "rgba(255, 255, 255, 0.3)"};`}></span>)}
          </div>
          <span aria-hidden="true" ref={fFig} style={`position: absolute; top: 3px; left: calc(${x.toFixed(3)} * (100% - 24px)); width: 24px; height: 24px; box-sizing: border-box; border-radius: 999px; background: #FFFFFF; border: 5px solid var(--hero); box-shadow: 0 0 0 2px #FFFFFF;`}></span>
        </div>
        <div aria-hidden="true" style="position: relative; margin-top: 6px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; font-size: 12px; font-weight: 700;">
          {LEVEL_WORDS.map((w, i) => <span key={w} style={`text-align: ${["left", "center", "right"][i]}; color: ${w === name ? "#FFFFFF" : "rgba(255, 255, 255, 0.7)"};`}>{w}</span>)}
        </div>
      </section>
      <Section title="Where you start" top={28}>
        <ul aria-label="Where you start" style="margin: 0; padding: 0 16px; list-style: none; background: var(--surface); border-radius: 24px;">
          {rows.map((r, i) => (
            <li key={r.label} style={`min-height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-top: 1px solid ${i ? "var(--soft)" : "transparent"}; font-size: 15px;`}>
              <span style="color: var(--muted);">{r.label}</span><span style="font-weight: 700; letter-spacing: -0.01em; text-align: right;">{r.value}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
