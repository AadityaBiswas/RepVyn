// Pages pushed over the tabs: the workout page, the soreness list, the program picker and first-run set-up.
import { REGIONS, REGION_NAMES } from "../../../src/engine";
import { catalog } from "../env";
import { FOCUS_GROUPS, isLegsDay, leastTrainedLine, nudgeWeight, planActivation, planRegions, planRows, planTitle, programMeters, programValues, regionWords } from "../model";
import type { App } from "./app";
import { badgeIn, fade, pop, pulse, rollDown, rollUp, rowIn, rowOut, swap, tick, useMove, usePresence } from "./motion";
import { Clock, EquipInline, EquipStack, IntensityIcon } from "./icons";
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { DumbbellPicker } from "./dumbbells";
import { BackButton, BottomCta, Faint, Roll, Fig, Figures, H1, Mark, Muscle, Opt, OptGrid, Scroll, Seg, Segmented, Stepper, ThumbDown, ThumbUp } from "./kit";
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
  const chip = (key: "duration" | "intensity" | "equip" | "focus", label: string, icon: ComponentChildren, value: ComponentChildren, enter: (el: HTMLElement | null) => void) => {
    const on = ui.open === key;
    // Time and intensity share the row; the equipment chip is exactly as wide as its avatars.
    const fit = key === "equip";
    return (
      <button type="button" class="tab" onClick={() => app.set({ open: on ? null : key })} aria-expanded={on ? "true" : "false"} aria-label={`${key === "duration" ? "Duration" : key === "intensity" ? "Intensity" : key === "equip" ? "Equipment" : "Muscles to train"}: ${label}`}
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
  const focus = c.focus ?? [];
  const focusWords = regionWords(focus)[0];
  const focusLabel = focus.length ? focusWords[0]!.toUpperCase() + focusWords.slice(1) : "Any muscle";
  const hint = leastTrainedLine(s, app.now);
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
        <div style="margin-top: 8px; display: flex;">
          {chip("focus", focusLabel, <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true" style="flex-shrink: 0;"><circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="3.5"></circle></svg>, focusLabel, rollUp)}
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

        {ui.open === "focus" && (
          <div ref={pop} role="group" aria-label="Muscles to train" style={panel}>
            <span style="font-size: 13px; font-weight: 600; color: var(--muted);">Muscles to train</span>
            {hint && <span style="font-size: 15px; line-height: 1.4; color: var(--muted);">{hint}</span>}
            <OptGrid cols={2} label="Muscles to train">
              <Opt label="Any muscle" on={!focus.length} pick={() => app.choose({ focus: [] })} span="1 / -1" />
              {FOCUS_GROUPS.map(([name, ms]) => {
                const on = ms.every((m) => focus.includes(m));
                return <Opt key={name} label={name} on={on} pick={() => app.choose({ focus: on ? focus.filter((m) => !ms.includes(m)) : [...focus, ...ms.filter((m) => !focus.includes(m))] })} />;
              })}
            </OptGrid>
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

// ---------- program picker ----------

const TAB_NAMES: Record<string, string> = { balanced: "Balanced", upper_body: "Upper body", legs_glutes: "Legs" };

export function Programs({ app, cls, first }: { app: App; cls: string; first: boolean }) {
  const { ui, saved, theme } = app;
  const sel = catalog.programs.find((p) => p.id === ui.pick) ?? catalog.programs[0]!;
  const tab = TAB_NAMES[sel.id] ?? sel.name;
  const cta = first ? `Start ${tab}` : sel.id === saved.settings.programId ? `Keep ${tab}` : `Switch to ${tab}`;
  const values = programValues(sel);
  const most = sel.id === "balanced" ? "the whole body evenly" : regionWords(REGIONS.filter((m) => (sel.emphasis[m] ?? 1) > 1.05))[0];
  return (
    <div class={cls} ref={useMove(cls)} role="dialog" aria-label="Choose a program" style="position: absolute; inset: 0; z-index: 6; background: var(--bg);">
      <Scroll top={first ? "var(--top)" : "calc(var(--top) + 64px)"} bottom={132}>
        <H1>Choose your <Faint>program</Faint></H1>
        <div style="margin-top: 22px;">
          <Segmented bg="var(--surface)" label="Programs">
            {catalog.programs.map((p) => <Seg key={p.id} label={TAB_NAMES[p.id] ?? p.name} on={ui.pick === p.id} pick={() => app.set({ pick: p.id })} h={44} size={15} />)}
          </Segmented>
        </div>
        <section aria-label="Selected program" style="margin-top: 12px; border-radius: 32px; background: var(--surface); padding: 20px 20px 22px; display: flex; flex-direction: column; box-shadow: var(--card-shadow);">
          <Figures key={sel.id} enter={swap} values={values} theme={theme} h={232} gap={4}
            alt={[`Front of the body, darker red where this program trains most: ${most}.`, `Back of the body, darker red where this program trains most: ${most}.`]} />
          <h2 style="margin: 14px 0 0; font-size: 30px; line-height: 1.08; font-weight: 800; letter-spacing: -0.03em;">{sel.name}</h2>
          <p style="margin: 6px 0 0; font-size: 15px; line-height: 1.4; color: var(--muted); text-wrap: pretty;">{sel.description ?? ""}</p>
          <div style="margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--soft); display: flex; flex-direction: column; gap: 12px;">
            {programMeters(sel).map((m) => (
              <div key={m.label} style="display: flex; align-items: center; gap: 12px;">
                <span style="width: 92px; flex-shrink: 0; font-size: 15px; font-weight: 600; letter-spacing: -0.01em;">{m.label}</span>
                <span role="meter" aria-label={`${m.label} emphasis`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(m.frac * 100)} style="flex: 1 1 0; height: 8px; border-radius: 999px; background: var(--track); overflow: hidden;">
                  <span class="fill" style={`display: block; height: 8px; border-radius: 999px; background-color: ${m.color}; transform: scaleX(${m.frac.toFixed(3)}); transition-duration: 600ms, 400ms;`}></span>
                </span>
                <span style="width: 84px; flex-shrink: 0; text-align: right; font-size: 13px; color: var(--muted);">{m.word}</span>
              </div>
            ))}
          </div>
        </section>
      </Scroll>
      {!first && <BackButton onClick={app.back} />}
      <BottomCta onClick={app.startProgram}>{cta}</BottomCta>
    </div>
  );
}

// ---------- first-run set-up ----------

const GOALS = [["muscle", "Build muscle", "Full weekly volume"], ["general_fitness", "General fitness", "Lighter weeks"]] as const;

export function Onboard({ app }: { app: App }) {
  const { ui, saved } = app;
  const st = saved.settings;
  // ui.ob 0 is the welcome; 1..4 are the four questions.
  const step = ui.ob - 1;
  const box = "padding: 16px; background: var(--surface); border-radius: 24px; display: flex; flex-direction: column; gap: 12px;";
  const cap = (t: string) => <span style="font-size: 13px; font-weight: 600; color: var(--muted);">{t}</span>;
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
      </Scroll>}
      {step > 0 && <BackButton onClick={() => app.set({ ob: ui.ob - 1 })} />}
      {step >= 0 && <div role="progressbar" aria-label="Set-up steps" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step + 1} style={`position: absolute; z-index: 3; top: calc(var(--top) + 21px); left: ${step > 0 ? 84 : 20}px; right: 20px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; transition: left 280ms cubic-bezier(0.23,1,0.32,1);`}>
        {[0, 1, 2, 3].map((i) => <span key={i} style={`height: 6px; border-radius: 999px; background: ${i <= step ? "var(--ink)" : "var(--track)"}; transition: background-color 280ms ease;`}></span>)}
      </div>}
      <BottomCta onClick={() => (step < 3 ? app.set({ ob: ui.ob + 1 }) : app.finishOnboarding())}>{step < 0 ? "Get started" : "Continue"}</BottomCta>
    </div>
  );
}
