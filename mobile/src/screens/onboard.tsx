// First-run set-up and the program hand-off, after Onboard, LevelResult and Programs in app/src/ui/pages.tsx.
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { level } from "../../../src/engine";
import { LEVEL_ASKS, PROGRAM_ID, PROGRAM_NAME, programValues, levelFromAnswers, nudgeWeight, programWeek, startingPoint, type LevelAsk } from "../../../app/src/model";
import { useApp } from "../app";
import { BackButton, BottomCta, Box, Cap, Card, Faint, Grid, H1, H2, Opt, Page, Sheet, Stepper, T, shadow } from "../kit";
import { DumbbellPicker, EquipOptions } from "../pickers";
import { Mark } from "./mark";
import { Fig, Figures } from "../figure";
import { Enter, FADE, POP, SWAP, UP, Press } from "../motion";
import { catalog } from "../../../app/src/env";
import { useCloud } from "../cloud";

const GOALS = [["muscle", "Build muscle", "Full weekly volume"], ["general_fitness", "General fitness", "Lighter weeks"]] as const;
const DURATIONS = [20, 30, 40, 50];
const STEPS = 5;
export const bodyWeight = (kg: number, units: "metric" | "imperial") => (units === "metric" ? `${Math.round(kg)} kg` : `${Math.round(kg * 2.2046)} lb`);

export function Onboard() {
  const app = useApp();
  const cl = useCloud();
  const { ui, saved, c } = app;
  const st = saved.settings;
  const ins = useSafeAreaInsets();
  // ui.ob 0 is the welcome; 1..5 are the questions; 6 is the starting level the answers give.
  const step = ui.ob - 1;
  const answer = (k: LevelAsk, i: number) => {
    const lv = { ...ui.lv, [k]: i };
    app.set({ lv });
    const est = levelFromAnswers(app.s, lv);
    app.settings({ level: est ? est.experience : "auto" });
  };
  const est = levelFromAnswers(app.s, ui.lv);
  const top = Math.max(56, ins.top + 12);
  return (
    <Sheet z={7} move="fade">
      {step < 0 && (
        <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: top }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><Mark /><T w={800} size={20}>RepVyn</T></View>
          <Fig view="front" kind="level" values={{ quads: 0.5, calves: 0.5 }} theme={app.theme} h={400} style={{ position: "absolute", right: -10, top: top + 52 }} />
          <View style={{ position: "absolute", left: 20, right: 20, bottom: 132 + ins.bottom }}>
            <H1 style={{ fontSize: 44, lineHeight: 46 }}>You train.{"\n"}<Faint>RepVyn plans.</Faint></H1>
            <T size={17} color={c.muted} style={{ marginTop: 16, maxWidth: 330, lineHeight: 24 }}>Log your sets. RepVyn works out which muscles are ready and builds today's workout around them.</T>
          </View>
        </View>
      )}
      {step >= 0 && (
        <Page top={64}>
          {step === 0 && (
            <Enter key="0" from={FADE} ms={220}>
              <H1>Your <Faint>goal</Faint></H1>
              <View style={{ marginTop: 24, gap: 8 }}>
                {GOALS.map(([k, l, sub]) => {
                  const on = st.goal === k;
                  return (
                    <Press key={k} onPress={() => app.settings({ goal: k })} accessibilityState={{ selected: on }} style={{ minHeight: 76, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, justifyContent: "center", gap: 3, backgroundColor: on ? c.ink : c.surface }}>
                      <T w={700} size={17} color={on ? c.bg : c.ink}>{l}</T><T size={14} color={on ? c.bg : c.ink} style={{ opacity: 0.72 }}>{sub}</T>
                    </Press>
                  );
                })}
              </View>
            </Enter>
          )}
          {step === 1 && (
            <Enter key="1" from={FADE} ms={220}>
              <H1>Your <Faint>week</Faint></H1>
              <Box style={{ marginTop: 24 }}><Cap>Days per week</Cap>
                <Grid cols={5}>{[2, 3, 4, 5, 6].map((d) => <Opt key={d} label={String(d)} on={st.days === d} pick={() => app.settings({ days: d })} />)}</Grid>
              </Box>
              <Box style={{ marginTop: 12 }}><Cap>Workout length</Cap>
                <Grid cols={4}>{DURATIONS.map((m) => <Opt key={m} label={`${m} min`} on={st.minutes === m} pick={() => app.settings({ minutes: m })} />)}</Grid>
              </Box>
            </Enter>
          )}
          {step === 2 && (
            <Enter key="2" from={FADE} ms={220}>
              <H1>Your <Faint>equipment</Faint></H1>
              <Box style={{ marginTop: 24 }}><EquipOptions value={st.equipment} set={(equipment) => app.settings({ equipment })} /></Box>
              {st.equipment.includes("dumbbell") && <Enter from={POP} ms={200}><Box style={{ marginTop: 12 }}><Cap>Dumbbells</Cap><DumbbellPicker value={st.dumbbells} set={(dumbbells) => app.settings({ dumbbells })} /></Box></Enter>}
            </Enter>
          )}
          {step === 3 && (
            <Enter key="3" from={FADE} ms={220}>
              <H1>Your <Faint>level</Faint></H1>
              <T color={c.muted} style={{ marginTop: 12, lineHeight: 21 }}>Your best guess is fine. RepVyn checks it against your first sets.</T>
              {(Object.keys(LEVEL_ASKS) as LevelAsk[]).map((k, n) => (
                <Box key={k} style={{ marginTop: n ? 12 : 20 }}>
                  <View style={{ gap: 2 }}><T w={700} size={17}>{LEVEL_ASKS[k].label}</T><T size={13} color={c.muted}>{LEVEL_ASKS[k].note}</T></View>
                  <Grid cols={2}>{LEVEL_ASKS[k].answers.map(([l], i) => <Opt key={l} label={l} on={ui.lv[k] === i} pick={() => answer(k, i)} />)}</Grid>
                </Box>
              ))}
            </Enter>
          )}
          {step === 4 && (
            <Enter key="4" from={FADE} ms={220}>
              <H1>About <Faint>you</Faint></H1>
              <Box style={{ marginTop: 24 }}><Cap>Units</Cap>
                <Grid cols={2}>{(["metric", "imperial"] as const).map((u) => <Opt key={u} label={u === "metric" ? "kg" : "lb"} on={st.units === u} pick={() => app.settings({ units: u })} />)}</Grid>
              </Box>
              <Box style={{ marginTop: 12 }}><Cap>Body weight</Cap>
                <Stepper size={28} value={bodyWeight(st.kg, st.units)} dec={() => app.settings({ kg: nudgeWeight(st.kg, st.units, -1) })} inc={() => app.settings({ kg: nudgeWeight(st.kg, st.units, 1) })} decLabel="Lower body weight" incLabel="Raise body weight" />
              </Box>
            </Enter>
          )}
          {step === STEPS && <Enter key="5" from={FADE} ms={220}><LevelResult score={est?.score ?? null} /></Enter>}
        </Page>
      )}
      {step > 0 && <BackButton onPress={() => app.set({ ob: ui.ob - 1 })} />}
      {step < 0 && cl.enabled && (
        <Press onPress={app.openAccount} style={{ position: "absolute", zIndex: 3, top: top + 8, right: 20, height: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: c.surface, justifyContent: "center" }}>
          <T w={600}>Sign in</T>
        </Press>
      )}
      {step >= 0 && (
        <View accessibilityRole="progressbar" style={{ position: "absolute", zIndex: 3, top: top + 21, left: step > 0 ? 84 : 20, right: 20, flexDirection: "row", gap: 4 }}>
          {Array.from({ length: STEPS }, (_, i) => <View key={i} style={{ flex: 1, height: 6, borderRadius: 999, backgroundColor: i <= step ? c.ink : c.track }} />)}
        </View>
      )}
      <BottomCta onPress={() => (step < STEPS ? app.set({ ob: ui.ob + 1 }) : app.finishOnboarding())}>{step < 0 ? "Get started" : step === 3 && !est ? "Skip for now" : "Continue"}</BottomCta>
    </Sheet>
  );
}

const LEVEL_WORDS = ["Beginner", "Intermediate", "Advanced"] as const;

/** The level the answers give, on a three-part meter, and what it changes on day one. */
function LevelResult({ score }: { score: number | null }) {
  const app = useApp();
  const { c } = app;
  const x = Math.max(0, Math.min(2, score ?? 1)) / 2;
  const name = LEVEL_WORDS[score === null ? 1 : score < 0.5 ? 0 : score < 1.5 ? 1 : 2];
  const rows = startingPoint(app.s, app.now);
  return (
    <>
      <H1>Your starting <Faint>level</Faint></H1>
      <View style={{ marginTop: 24, borderRadius: 32, backgroundColor: c.hero, padding: 24, ...shadow(0.35, c.hero) }}>
        <Enter from={UP} delay={120}><T w={800} size={48} color={c.onAccent} style={{ lineHeight: 48, letterSpacing: -1.9 }}>{name}</T></Enter>
        <T w={500} color="rgba(255,255,255,0.92)" style={{ marginTop: 12, lineHeight: 21 }}>
          {score === null ? "A middle start. Your first sets will show where you really are." : "From your push-ups and squats. It moves with every set you log."}
        </T>
        <View style={{ marginTop: 22, height: 30, justifyContent: "center" }}>
          <View style={{ flexDirection: "row", gap: 4 }}>{LEVEL_WORDS.map((w) => <View key={w} style={{ flex: 1, height: 8, borderRadius: 999, backgroundColor: w === name ? c.onAccent : "rgba(255,255,255,0.3)" }} />)}</View>
          <View style={{ position: "absolute", left: `${x * 100}%`, marginLeft: -12 * x * 2, width: 24, height: 24, borderRadius: 999, backgroundColor: c.onAccent, borderWidth: 5, borderColor: c.hero }} />
        </View>
        <View style={{ marginTop: 6, flexDirection: "row" }}>
          {LEVEL_WORDS.map((w, i) => <T key={w} w={700} size={12} color={w === name ? c.onAccent : "rgba(255,255,255,0.7)"} style={{ flex: 1, textAlign: (["left", "center", "right"] as const)[i] }}>{w}</T>)}
        </View>
      </View>
      <View style={{ marginTop: 28, gap: 12 }}>
        <H2>Where you start</H2>
        <Card>
          {rows.map((r, i) => (
            <View key={r.label} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c.soft }}>
              <T color={c.muted}>{r.label}</T><T w={700} style={{ textAlign: "right", flexShrink: 1 }}>{r.value}</T>
            </View>
          ))}
        </Card>
      </View>
    </>
  );
}

/** One program for now. On first run this is the hand-off into it; later it is a look at where you are in it. */
export function Programs() {
  const app = useApp();
  const { saved, now, c, ui } = app;
  const first = ui.first;
  const st = saved.settings;
  const week = first ? 0 : programWeek(saved.programStart, now) - 1;
  const lvl = level(app.s).experience;
  return (
    <Sheet z={6} move={first ? "fade" : "slide"}>
      <Page top={first ? 0 : 64} bottom={132}>
        {first ? <H1>You're starting{"\n"}<Faint>the 12-week program</Faint></H1> : <H1>Your <Faint>program</Faint></H1>}
        <View style={{ marginTop: 22, borderRadius: 32, backgroundColor: c.surface, padding: 20, paddingBottom: 22, ...shadow(0.12) }}>
          <Enter from={SWAP}><Figures lead="Trained evenly" values={programValues(catalog.programs.find((p) => p.id === PROGRAM_ID) ?? catalog.programs[0]!)} theme={app.theme} h={232} gap={4} inset={20} /></Enter>
          <T w={800} size={30} style={{ marginTop: 14, lineHeight: 32, letterSpacing: -0.9 }}>{PROGRAM_NAME}</T>
          <T color={c.muted} style={{ marginTop: 6, lineHeight: 21 }}>
            Every muscle, {st.days} days a week, set for {/^[aeiou]/.test(lvl) ? "an" : "a"} {lvl}. Each workout is built from what's ready that day.
          </T>
          <View style={{ marginTop: 18, flexDirection: "row", gap: 4 }}>
            {Array.from({ length: 12 }, (_, i) => <View key={i} style={{ flex: 1, height: 6, borderRadius: 999, backgroundColor: i < week ? c.ink : i === week ? c.accent : c.track }} />)}
          </View>
          <View style={{ marginTop: 8, flexDirection: "row", justifyContent: "space-between" }}>
            <T w={600} size={13} color={c.muted}>{first ? "Starts today" : `Week ${week + 1}`}</T><T w={600} size={13} color={c.muted}>Week 12</T>
          </View>
        </View>
      </Page>
      {!first && <BackButton onPress={app.back} />}
      <BottomCta onPress={first ? app.startProgram : app.back}>{first ? "Start the 12-week program" : "Done"}</BottomCta>
    </Sheet>
  );
}
