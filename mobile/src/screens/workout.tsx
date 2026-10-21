// The in-workout screen, after app/src/ui/workout.tsx: the current set, the rest ring, the reps-left question and a done screen.
// The web app's recap screens (learned, growth, week, share) come in a later pass.
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { REGIONS } from "../../../src/engine";
import { mostWorked, muscleName } from "../../../app/src/finish";
import { Fig } from "../figure";
import { BADGE, Enter, FIG, LIFT, LIVELY, SNAP, THROWN, TIMER, UP, spring, still, tween, useRamp, Press } from "../motion";

const ACircle = Animated.createAnimatedComponent(Circle);
import { asksLeft, current, isAllOut, kgOf, repsDone, setsTotal, toEvents, type Run } from "../../../app/src/workout";
import { activation, primary } from "../../../app/src/model";
import { caloriesWith } from "../../../app/src/store";
import { useApp } from "../app";
import { Check, Close, MuscleDot, Pause, Play, T, shadow, tick, success, tap, thud, useSide } from "../kit";

const clock = (t: number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
// Reps left in the tank after a set: 0 is too hard, 5+ is too easy.
const LEFT = [["0", "#7A0E1E", "#FFFFFF", "0 more, too hard"], ["1", "#D91E36", "#FFFFFF", "1 more"], ["2", "#E8596B", "#FFFFFF", "2 more"], ["3", "#EE8794", "#1C1C1E", "3 more"], ["4", "#F7CDD2", "#1C1C1E", "4 more"], ["5+", "", "", "5 or more, too easy"]] as const;

/**
 * One exercise on the progress bar. Every move is a transform or an opacity, for the native driver: the fill is a
 * full-width bar slid into view (with a little overshoot), the set-complete red is a second bar that fades back over
 * 1.4 s, and the thickening is a vertical scale.
 */
function Segment({ done, hot }: { done: number; hot: boolean }) {
  const { c } = useApp();
  const [w, setW] = useState(0);
  const x = useRef(new Animated.Value(-1)).current;
  const thick = useRef(new Animated.Value(0)).current;
  const heat = useRef(new Animated.Value(0)).current;
  useEffect(() => { spring(x, done - 1, THROWN).start(); }, [done]);
  useEffect(() => {
    spring(thick, hot ? 1 : 0, SNAP).start();
    if (hot) heat.setValue(1);
    else tween(heat, 0, 1400, 0, Easing.out(Easing.quad)).start();
  }, [hot]);
  const slide = { transform: [{ translateX: Animated.multiply(x, w) }] };
  return (
    <Animated.View onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={{ flex: 1, height: 4, borderRadius: 999, backgroundColor: c.vTrack, overflow: "hidden", transform: [{ scaleY: thick.interpolate({ inputRange: [0, 1], outputRange: [1, 2] }) }] }}>
      <Animated.View style={[{ position: "absolute", left: 0, top: 0, bottom: 0, width: "100%", borderRadius: 999, backgroundColor: c.vFill }, slide]} />
      <Animated.View style={[{ position: "absolute", left: 0, top: 0, bottom: 0, width: "100%", borderRadius: 999, backgroundColor: c.accent, opacity: heat }, slide]} />
    </Animated.View>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  const { c } = useApp();
  const ins = useSafeAreaInsets();
  const side = useSide(16);
  return <Enter from={LIFT} style={{ position: "absolute", zIndex: 2, left: side, right: side, bottom: Math.max(28, ins.bottom + 12), paddingVertical: 16, paddingHorizontal: 20, borderRadius: 39, backgroundColor: c.frost, ...shadow(0.3) }}>{children}</Enter>;
}
function Big({ onPress, bg, fg, children, flex, w }: { onPress: () => void; bg: string; fg: string; children: React.ReactNode; flex?: boolean; w?: number }) {
  return (
    <Press onPress={onPress} scale={0.98} style={{ minHeight: 64, paddingVertical: 10, borderRadius: 999, backgroundColor: bg, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center", ...(flex ? { flex: 1 } : {}), ...(w ? { width: w } : {}) }}>
      {typeof children === "string" ? <T w={700} size={17} color={fg}>{children}</T> : children}
    </Press>
  );
}

function Question({ run }: { run: Run }) {
  const app = useApp();
  const { c } = app;
  return (
    <View style={{ gap: 10 }}>
      <T w={600} size={13} color={c.glassMuted}>How many more reps could you do?</T>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {LEFT.map(([label, bg, fg, aria]) => {
          const on = run.effort === label;
          const dim = run.effort !== null && !on;
          return (
            <Press key={label} onPress={() => { tick(); app.answer(label); }} accessibilityLabel={aria} accessibilityState={{ selected: on }}
              style={{ flex: 1, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: bg || c.glassBtn, borderWidth: 3, borderColor: on ? c.glassInk : "transparent", opacity: dim ? 0.4 : 1 }}>
              <T mono size={16} color={fg || c.glassInk}>{label}</T>
            </Press>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T w={500} size={12} color={c.glassMuted}>Too hard</T><T w={500} size={12} color={c.glassMuted}>Too easy</T></View>
    </View>
  );
}

function WorkPanel({ run }: { run: Run }) {
  const app = useApp();
  const { c } = app;
  const e = current(run);
  const allOutNow = isAllOut(e) && run.set === e.sets.length;
  const unit = e.hold ? "sec" : "reps";
  const m = run.hold.mode;
  const idle = m === "idle";
  const red = c.accent;
  let big: number, sub: string, cta: string, act: () => void, bg: string, fg: string, icon: React.ReactNode, stepVis = true, bar = false;
  const p = app.patchRun;
  if (!e.hold) {
    [big, sub, cta, act, bg, fg, icon] = [run.amount, allOutNow ? `max ${unit}` : unit, "Set done", app.setDone, red, c.onAccent, <Check key="i" size={22} color={c.onAccent} />];
  } else {
    stepVis = idle;
    bar = m === "run" || m === "paused" || m === "over";
    big = m === "ready" ? run.hold.ready : idle ? run.amount : run.hold.left;
    if (idle) [sub, cta, act, bg, fg, icon] = ["seconds", "Start timer", () => p({ hold: { mode: "ready", ready: 3, left: run.amount } }), red, c.onAccent, <Play key="i" size={22} color={c.onAccent} />];
    else if (m === "ready") [sub, cta, act, bg, fg, icon] = ["get ready", "Cancel", () => p({ hold: { ...run.hold, mode: "idle" } }), c.glassBtn, c.glassInk, null];
    else if (m === "run") [sub, cta, act, bg, fg, icon] = ["seconds left", "Pause timer", () => p({ hold: { ...run.hold, mode: "paused" } }), c.glassBtn, c.glassInk, <Pause key="i" color={c.glassInk} />];
    else if (m === "paused") [sub, cta, act, bg, fg, icon] = ["paused", "Resume timer", () => p({ hold: { ...run.hold, mode: "run" } }), red, c.onAccent, <Play key="i" size={22} color={c.onAccent} />];
    else [sub, cta, act, bg, fg, icon] = ["done", "Set done", app.setDone, red, c.onAccent, <Check key="i" size={22} color={c.onAccent} />];
  }
  const step = (d: number) => () => {
    tick();
    if (!e.hold) app.patchRun({ amount: Math.max(0, run.amount + d) });
    else if (idle) { const t = Math.max(5, run.amount + d * 5); app.patchRun({ amount: t, hold: { ...run.hold, left: t } }); }
  };
  const kg = kgOf(run);
  const owned = app.owned;
  const at = kg === undefined ? -1 : owned.findIndex((w) => Math.abs(w - kg) < 5e-4);
  const toKg = (i: number) => () => { tick(); if (owned[i] !== undefined) app.patchRun({ kg: { ...run.kg, [run.ex]: owned[i]! } }); };
  const small = { width: 36, height: 36, borderRadius: 999, backgroundColor: c.glassStep, alignItems: "center", justifyContent: "center" } as const;
  const half = { width: 52, height: 56, alignItems: "center", justifyContent: "center" } as const;
  return (
    <Panel key={`${run.ex}-${run.set}`}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <MuscleDot region={primary(app.s, e.id)[0]} levels={activation(app.s, e.id)} size={48} radius={14} />
        <View style={{ flex: 1 }}>
          <T w={800} size={e.name.length > 16 ? 22 : 28} color={c.glassInk} style={{ lineHeight: (e.name.length > 16 ? 22 : 28) * 1.08 }}>{e.name}</T>
          <T w={600} size={13} color={c.glassMuted} style={{ marginTop: 5 }}>Set {run.set} of {e.sets.length}{e.unilateral ? " · each side" : ""}</T>
        </View>
        <View style={{ alignSelf: "flex-start", paddingTop: 8, flexDirection: "row", gap: 4 }}>
          {e.sets.map((_, i) => <View key={i} style={{ width: 18, height: 5, borderRadius: 999, backgroundColor: i < run.set - 1 ? c.glassInk : i === run.set - 1 ? c.accent : c.glassBtn }} />)}
        </View>
      </View>
      {e.weighted && kg !== undefined && (
        <View style={{ marginTop: 12, height: 48, paddingLeft: 18, paddingRight: 6, borderRadius: 999, backgroundColor: c.fill, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <T w={600} color={c.glassInk} style={{ flexGrow: 1 }}>{`${Math.round(kg * 10) / 10} kg `}<T w={500} color={c.glassMuted}>{e.pair ? "each hand" : ""}</T></T>
          <Press hitSlop={8} onPress={toKg(at - 1)} accessibilityLabel="Lighter dumbbell" style={small}><T size={20} color={c.glassInk}>−</T></Press>
          <Press hitSlop={8} onPress={toKg(at + 1)} accessibilityLabel="Heavier dumbbell" style={small}><T size={20} color={c.glassInk}>+</T></Press>
        </View>
      )}
      <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <T w={800} size={String(big).length > 2 ? 80 : 104} color={c.glassInk} style={{ marginLeft: -4, lineHeight: (String(big).length > 2 ? 80 : 104) * 0.98, letterSpacing: -4 }}>{big}</T>
        <T w={700} size={17} color={c.glassInk} style={{ alignSelf: "flex-end", marginBottom: 16 }}>{sub}</T>
        <View style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", borderRadius: 999, backgroundColor: c.fill, opacity: stepVis ? 1 : 0 }} pointerEvents={stepVis ? "auto" : "none"}>
          <Press onPress={step(-1)} accessibilityLabel={e.hold ? "5 seconds less" : "One fewer"} style={half}><T size={24} color={c.glassInk}>−</T></Press>
          <View style={{ width: 1, height: 22, backgroundColor: c.line }} />
          <Press onPress={step(1)} accessibilityLabel={e.hold ? "5 seconds more" : "One more"} style={half}><T size={24} color={c.glassInk}>+</T></Press>
        </View>
      </View>
      {bar && <View style={{ marginTop: 14, height: 6, borderRadius: 999, backgroundColor: c.fill, overflow: "hidden" }}><View style={{ height: 6, borderRadius: 999, backgroundColor: c.accent, width: `${(run.hold.left / Math.max(1, run.amount)) * 100}%` }} /></View>}
      <View style={{ marginTop: 14 }}><Big onPress={act} bg={bg} fg={fg}>{icon}<T w={700} size={17} color={fg}>{cta}</T></Big></View>
    </Panel>
  );
}

function RestView({ run }: { run: Run }) {
  const app = useApp();
  const { c } = app;
  const q = asksLeft(run);
  const e = current(run);
  const next = run.set === e.sets.length ? run.exercises[run.ex + 1] : undefined;
  const R = 126, L = 2 * Math.PI * R;
  const left = run.rest / run.restTotal;
  const off = useRef(new Animated.Value(L * (1 - left))).current;
  useEffect(() => { Animated.timing(off, { toValue: L * (1 - Math.max(0, (run.rest - 1) / run.restTotal)), duration: 1000, easing: Easing.linear, useNativeDriver: false }).start(); }, [run.rest, run.restTotal]);
  return (
    <>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: q ? 300 : 180 }}>
        <Enter from={TIMER} style={{ width: 300, height: 300, alignItems: "center", justifyContent: "center" }}>
          <Svg width={300} height={300} viewBox="0 0 310 310" style={[StyleSheet.absoluteFill, { transform: [{ rotate: "-90deg" }] }]}>
            <Circle cx={155} cy={155} r={R} stroke={c.vTrack} strokeWidth={14} fill="none" />
            <ACircle cx={155} cy={155} r={R} stroke={c.accent} strokeWidth={14} fill="none" strokeLinecap="round" strokeDasharray={`${L} ${L}`} strokeDashoffset={off} />
          </Svg>
          <T w={600} color={c.vMuted}>Rest</T>
          <T w={800} size={88} color={c.vInk} style={{ letterSpacing: -3.5 }}>{clock(run.rest)}</T>
          {next && <T w={600} size={13} color={c.vMuted}>Up next: {next.name}</T>}
        </Enter>
      </View>
      <Panel>
        {q && <Question run={run} />}
        <View style={{ marginTop: q ? 18 : 0, flexDirection: "row", gap: 8 }}>
          <Big w={112} onPress={() => { tick(); app.patchRun({ rest: run.rest + 15, restTotal: run.restTotal + 15 }); }} bg={c.glassBtn} fg={c.glassInk}>+15 sec</Big>
          <Big flex onPress={app.skipRest} bg={c.glassInk} fg={c.glassInv}>Skip rest</Big>
        </View>
      </Panel>
    </>
  );
}

/** Finished: the red floods up from the bottom, the check draws, the words rise, the numbers count up, the trained muscles light up. */
function Finished({ run }: { run: Run }) {
  const app = useApp();
  const { c, theme } = app;
  const ins = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const kcal = useMemo(() => caloriesWith(app.saved, toEvents(run, "done-preview", Date.now())), []);
  const trained = useMemo(() => Object.fromEntries(REGIONS.filter((m) => run.done.some((d) => app.s.catalog.byId[d.exerciseId]?.contributions[m] === 1)).map((m) => [m, 1])), []);
  // The contour lines mark the muscle worked most today.
  const most = useMemo(() => mostWorked(app.s, run).lines, []);
  const k = useRamp(1100, 950);
  const ease = 1 - Math.pow(1 - k, 3);
  const flood = useRef(new Animated.Value(still() ? 1 : 0)).current;
  const lit = useRef(new Animated.Value(still() ? 1 : 0)).current;
  useEffect(() => {
    if (still()) return;
    tween(flood, 1, 820, 0, Easing.bezier(0.32, 0.72, 0, 1)).start();
    tween(lit, 1, 900, 1750).start();
  }, []);
  const R = Math.hypot(width, height) * 1.05;
  const stats: [string, string][] = [[clock(Math.round(run.elapsed * ease)), "time"], ...(kcal ? [[String(Math.round(kcal.kcal * ease)), "active kcal"] as [string, string]] : []), [String(Math.round(run.done.length * ease)), "sets"], [String(Math.round(repsDone(run) * ease)), "reps"]];
  const fig = (view: "front" | "back") => (
    <View>
      <Fig view={view} kind="hero" values={{}} theme={theme} h={230} />
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: lit }]}><Fig view={view} kind="hero" values={{ ...trained, ...Object.fromEntries(most.map((m) => [m, 1])) }} lines={most} theme={theme} h={230} /></Animated.View>
    </View>
  );
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}>
      <Animated.View style={{ position: "absolute", width: 2 * R, height: 2 * R, borderRadius: R, left: width / 2 - R, top: height * 0.9 - R, backgroundColor: c.hero, transform: [{ scale: flood }] }} />
      <View style={{ flex: 1, paddingTop: Math.max(56, ins.top + 12), paddingBottom: Math.max(28, ins.bottom + 12), paddingHorizontal: 20 }}>
        <Enter from={BADGE} cfg={LIVELY} delay={380}>
          <View style={{ width: 64, height: 64, borderRadius: 999, borderWidth: 5, borderColor: c.onAccent, alignItems: "center", justifyContent: "center" }}><Check size={30} color={c.onAccent} /></View>
        </Enter>
        <View style={{ marginTop: 22, overflow: "hidden" }}><Enter from={{ y: 70 }} delay={520}><T w={800} size={64} color={c.onAccent} style={{ lineHeight: 64, letterSpacing: -2.6 }}>Workout</T></Enter></View>
        <View style={{ overflow: "hidden" }}><Enter from={{ y: 70 }} delay={610}><T w={800} size={64} color="rgba(255,255,255,0.62)" style={{ lineHeight: 66, letterSpacing: -2.6 }}>done</T></Enter></View>
        <View style={{ marginTop: 18, flexDirection: "row", flexWrap: "wrap", rowGap: 16 }}>
          {stats.map(([v, l], i) => (
            <Enter key={l} from={UP} delay={900 + i * 50} style={{ width: "50%", gap: 4 }}><T mono size={34} color={c.onAccent}>{v}</T><T w={500} size={13} color="rgba(255,255,255,0.74)">{l}</T></Enter>
          ))}
        </View>
        <Enter from={FIG} delay={1150} style={{ marginTop: 18, flexDirection: "row", justifyContent: "center", gap: 4 }}>{fig("front")}{fig("back")}</Enter>
        {most.length > 0 && (
          <Enter from={UP} delay={2200} style={{ marginTop: 10, alignSelf: "center" }}>
            <T w={600} size={13} color="rgba(255,255,255,0.86)">Most worked: {most.map((m) => muscleName(m).toLowerCase()).join(" and ")}</T>
          </Enter>
        )}
        <View style={{ flex: 1, minHeight: 12 }} />
        <Enter from={UP} delay={2500}><Big onPress={app.finishWorkout} bg={c.onAccent} fg={c.hero}>Done</Big></Enter>
      </View>
    </View>
  );
}

export function Workout({ run }: { run: Run }) {
  const app = useApp();
  const { c } = app;
  const ins = useSafeAreaInsets();
  const was = useRef(run);
  useEffect(() => {
    const p = was.current;
    was.current = run;
    if (p.phase === "rest" && run.phase === "work") tap();
    if (run.hold.mode === "ready" && run.hold.ready !== p.hold.ready) tick();
    if (p.hold.mode === "ready" && run.hold.mode === "run") thud();
    if (p.hold.mode === "run" && run.hold.mode === "over") success();
    if (p.phase !== "done" && run.phase === "done") success();
  }, [run]);
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 8, backgroundColor: c.bg }]}>
      {run.phase !== "done" && (
        <>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: c.video, alignItems: "center", justifyContent: "center", paddingBottom: 240, opacity: run.phase === "work" ? 1 : 0.55 }]}>
            {run.phase === "work" && <T w={600} size={13} color={c.videoInk}>Exercise video</T>}
          </View>
          <View style={{ zIndex: 2, marginTop: Math.max(16, ins.top + 4), paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Press onPress={app.endWorkout} accessibilityLabel="End workout" style={{ width: 44, height: 44, borderRadius: 999, backgroundColor: c.frost, alignItems: "center", justifyContent: "center", ...shadow(0.15) }}><Close color={c.glassInk} /></Press>
            <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: setsTotal(run), now: run.done.length }} style={{ flex: 1, flexDirection: "row", gap: 4 }}>
              {run.exercises.map((x, i) => {
                const done = run.phase === "ask" || i < run.ex ? 1 : i > run.ex ? 0 : (run.phase === "work" ? run.set - 1 : run.set) / x.sets.length;
                return <Segment key={i} done={done} hot={run.flash && i === run.ex} />;
              })}
            </View>
            <View style={{ height: 44, paddingHorizontal: 14, borderRadius: 999, backgroundColor: c.frost, justifyContent: "center", ...shadow(0.15) }}><T mono color={c.glassInk}>{clock(run.elapsed)}</T></View>
          </View>
        </>
      )}
      {run.phase === "work" && <WorkPanel run={run} />}
      {run.phase === "rest" && <RestView run={run} />}
      {run.phase === "ask" && (
        <Panel>
          <T w={800} size={20} color={c.glassInk} style={{ marginBottom: 14 }}>Last set done</T>
          <Question run={run} />
        </Panel>
      )}
      {run.phase === "done" && <Finished run={run} />}
    </View>
  );
}
