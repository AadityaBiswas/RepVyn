// The Today tab, after Today, HeroCard and DoneCard in app/src/ui/tabs.tsx (without the body figure for now).
import { useMemo } from "react";
import { View } from "react-native";
import { REGIONS, type Muscle, type Plan } from "../../../src/engine";
import { Fig } from "../figure";
import { describe } from "../figureCore";
import { Enter, LIVELY, POP, Press } from "../motion";
import { WORK, WORK_INK, dayStart, isLegsDay, planRegions, planValues, needsCheckin, planRows, planTitle, planWhy, programWeek, trainedToday, weekStrip } from "../../../app/src/model";
import { useApp } from "../app";
import { Arrow, Card, Check, Chevron, Clock, EquipStack, Faint, Grid, H1, H2, Layers, ListIcon, MuscleDot, Opt, Page, T, shadow, useFit } from "../kit";
import { cssVar } from "../theme";

const FEEL = [["fresh", "Fresh"], ["normal", "Normal"], ["beat_up", "Worn out"]] as const;

export function Today() {
  const app = useApp();
  const { s, now, saved, ui, c } = app;
  const week = programWeek(saved.programStart, now);
  const doneWeeks = week - 1;
  const { strip, doneToday, ask } = useMemo(() => ({ strip: weekStrip(s, now, saved.createdAt), doneToday: trainedToday(s, now), ask: needsCheckin(s, now) }), [s, now, saved.createdAt]);
  const plan = app.todayPlan;
  const rows = useMemo(() => (plan.kind === "workout" ? planRows(s, plan, saved.settings.units) : []), [s, plan, saved.settings.units]);
  return (
    <Page bottom={120}>
      <H1>Week {week} <Faint>of 12</Faint></H1>
      <View style={{ marginTop: 14, flexDirection: "row", gap: 4 }}>
        {Array.from({ length: 12 }, (_, i) => <View key={i} style={{ flex: 1, height: 6, borderRadius: 999, backgroundColor: i < doneWeeks ? c.ink : i === doneWeeks ? c.accent : c.track }} />)}
      </View>

      <View style={{ marginTop: 18, flexDirection: "row", gap: 6 }}>
        {strip.map((d) => {
          const done = d.kind === "done" || d.kind === "todayDone";
          const look = d.kind === "done" ? { backgroundColor: cssVar(WORK[d.work - 1]!, c) }
            : d.kind === "rest" ? { borderWidth: 1.5, borderColor: c.line }
            : d.kind === "today" ? { borderWidth: 2, borderColor: c.accent, backgroundColor: c.surface, ...shadow(0.25, c.accent) }
            : d.kind === "todayDone" ? { borderWidth: 2, borderColor: c.accent, backgroundColor: c.accent }
            : { backgroundColor: c.surface };
          const ink = d.kind === "done" ? cssVar(WORK_INK[d.work - 1]!, c) : d.kind === "todayDone" ? c.onAccent : d.kind === "rest" || d.kind === "before" ? c.muted : c.ink;
          const fill = d.kind === "todayDone" && ui.justFinished;
          return (
            <Enter key={d.day + (fill ? "f" : "")} from={fill ? { opacity: 0.4, scale: 0.9 } : {}} cfg={LIVELY} delay={fill ? 560 : 0} style={{ flex: 1 }}>
              <Press disabled={!done} onPress={() => app.openDone(d.day)} accessibilityLabel={d.label}
                style={[{ height: 84, borderRadius: 22, alignItems: "center", justifyContent: "center", gap: 6 }, look]}>
                <T w={600} size={11} color={d.kind === "upcoming" || d.kind === "before" ? c.muted : ink}>{d.letter}</T>
                <View style={{ height: 18, justifyContent: "center" }}>{done ? <Check color={ink} /> : <T w={700} size={17} color={ink}>{d.date}</T>}</View>
              </Press>
            </Enter>
          );
        })}
      </View>

      {ask && (
        <Enter from={POP} ms={220}><View style={{ marginTop: 20, padding: 16, borderRadius: 24, backgroundColor: c.surface, gap: 12 }}>
          <T w={700} size={17}>{ui.feel ? "Anything sore?" : "How do you feel today?"}</T>
          {ui.feel
            ? <Grid cols={2}>{[<Opt key="n" label="Nothing" on={false} pick={() => app.checkin([])} />, <Opt key="y" label="Yes" on={false} pick={app.openSore} />]}</Grid>
            : <Grid cols={3}>{FEEL.map(([k, l]) => <Opt key={k} label={l} on={false} pick={() => app.set({ feel: k })} />)}</Grid>}
        </View></Enter>
      )}

      {doneToday.length ? <DoneCard next={plan} /> : <HeroCard plan={plan} />}
      {doneToday.length > 0 && plan.kind === "workout" && (
        <Press onPress={app.openSetup} style={{ marginTop: 12, minHeight: 64, paddingHorizontal: 20, borderRadius: 24, backgroundColor: c.surface, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ gap: 2 }}><T w={600} size={13} color={c.muted}>Train again</T><T w={700} size={17}>{planTitle(plan)}</T></View>
          <Chevron size={18} color={c.ink} />
        </Press>
      )}

      {!doneToday.length && plan.kind === "workout" && (
        <View style={{ marginTop: 32, gap: 12 }}>
          <H2>Today's plan</H2>
          <Card>
            {rows.map((r, i, a) => (
              <View key={r.id} style={{ minHeight: 80, flexDirection: "row", alignItems: "center", gap: 14, borderBottomWidth: i < a.length - 1 ? 1 : 0, borderBottomColor: c.soft }}>
                <MuscleDot region={r.region} levels={r.levels} />
                <View style={{ flex: 1, gap: 3 }}>
                  <T w={700} size={17}>{r.name}</T>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <T color={c.muted}>{r.detail}</T>
                    {(s.catalog.byId[r.id]?.equipment.length ?? 0) > 0 && <EquipStack items={s.catalog.byId[r.id]!.equipment} size={20} ring={c.surface} />}
                  </View>
                </View>
              </View>
            ))}
          </Card>
        </View>
      )}
    </Page>
  );
}

/** The red card: a display title, why, two stats and the round open button. */
function HeroShell({ title, why, meta, onOpen, regions }: { title: string; why: string; meta: [React.ReactNode, string][] | null; onOpen: (() => void) | null; regions: Partial<Record<Muscle, number>> }) {
  const { c, theme } = useApp();
  const ms = REGIONS.filter((m) => regions[m]);
  const legs = isLegsDay(ms);
  // Always the front, so the pose never changes; only a legs day with no quads in it turns round.
  const view = legs && !ms.includes("quads") ? "back" : "front";
  // As on the web card: the title wraps beside the figure in a 196 pt column, as large as its longest word allows.
  const k = useFit();
  const longest = Math.max(...title.split(" ").map((w) => w.length));
  const size = Math.round((longest <= 5 && title.split(" ").length <= 2 ? 60 : longest <= 8 ? 44 : 36) * k);
  return (
    <Press disabled={!onOpen} onPress={onOpen ?? undefined} scale={0.985} style={{ marginTop: 18, minHeight: 340, borderRadius: 32, backgroundColor: c.hero, padding: 24, overflow: "hidden", ...shadow(0.4, c.hero) }}>
      <Fig label={describe(regions, "Today's muscles", "front")} view={view} kind="hero" values={regions} theme={theme} h={legs ? 395 : 500} part={legs ? "legs" : "all"} style={legs ? { position: "absolute", right: 12, bottom: -22 } : { position: "absolute", right: -72, top: 14 }} />
      <T w={800} size={size} color={c.onAccent} style={{ maxWidth: Math.round(196 * k), lineHeight: size * 0.96, letterSpacing: -0.04 * size, marginLeft: -2 }}>{title}</T>
      <T w={500} color="rgba(255,255,255,0.92)" style={{ marginTop: 14, maxWidth: Math.round(160 * k), lineHeight: 21 }}>{why}</T>
      {meta && (
        <View style={{ marginTop: 16, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {meta.map(([icon, text]) => (
            <View key={text} style={{ minHeight: 34, paddingVertical: 4, paddingLeft: 9, paddingRight: 12, borderRadius: 999, backgroundColor: "rgba(72,6,18,0.34)", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", flexDirection: "row", alignItems: "center", gap: 6 }}>
              {icon}<T w={700} color={c.onAccent}>{text}</T>
            </View>
          ))}
        </View>
      )}
      {onOpen && (
        <View style={{ marginTop: "auto", paddingTop: 20 }}>
          <View style={{ width: 56, height: 56, borderRadius: 999, backgroundColor: c.onAccent, alignItems: "center", justifyContent: "center", ...shadow(0.3) }}><Arrow color={c.hero} /></View>
        </View>
      )}
    </Press>
  );
}

function HeroCard({ plan }: { plan: Plan }) {
  const app = useApp();
  const { c } = app;
  const n = plan.exercises.length;
  return (
    <HeroShell regions={planValues(planRegions(app.s, plan), plan.template)} title={planTitle(plan)} why={planWhy(app.s, plan, app.now)}
      meta={plan.kind === "workout" ? [[<Clock key="c" size={17} color={c.onAccent} />, `${Math.max(5, Math.round(plan.estMinutes / 5) * 5)} min`], [<ListIcon key="l" size={17} color={c.onAccent} />, `${n} exercise${n === 1 ? "" : "s"}`]] : null}
      onOpen={plan.kind === "workout" ? app.openSetup : null} />
  );
}

/** After today's workout: what was done, and what comes next. */
function DoneCard({ next }: { next: Plan }) {
  const app = useApp();
  const { c } = app;
  const sessions = trainedToday(app.s, app.now);
  const ids = new Set(sessions.flatMap((x) => x.log.map((l) => l.exerciseId)));
  const regions = Object.fromEntries(REGIONS.filter((m) => [...ids].some((id) => app.s.catalog.byId[id]?.contributions[m] === 1)).map((m) => [m, 1]));
  const sets = sessions.reduce((a, x) => a + x.log.filter((l) => !l.isWarmup).length, 0);
  const mins = Math.max(1, Math.round(sessions.reduce((a, x) => a + ((x.end ?? x.lastTs) - x.start), 0) / 60_000));
  const why = next.kind === "workout" ? `Next up: ${planTitle(next).toLowerCase()}, if you want more.` : "Rest now. Your next workout will be ready tomorrow.";
  return <HeroShell regions={regions} title="Done for today" why={why} meta={[[<Clock key="c" size={17} color={c.onAccent} />, `${mins} min`], [<Layers key="l" size={17} color={c.onAccent} />, `${sets} set${sets === 1 ? "" : "s"}`]]} onOpen={() => app.openDone(dayStart(app.now))} />;
}
