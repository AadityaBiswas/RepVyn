// The Body, Progress and Profile tabs (without the body figures for now).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, PanResponder, ScrollView, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { REGIONS, REGION_NAMES, ownedWeights } from "../../../src/engine";
import {
  H, PROGRAM_NAME, STRAIN, WORK, activity, addDays, dayStart, nudgeWeight, planWeeks, programWeek, readyAt, sparkPath,
  startingPoints, strain, strainColour, strainFigure, strainRows, strengthRows, weekMuscles, weightLabel, type StrainRow,
} from "../../../shared/model";
import { dumbbellsOf } from "../../../shared/store";
import { useApp } from "../app";
import { Card, Chevron, Clock, EquipStack, Faint, Grid, H1, H2, MuscleDot, Opt, Page, Stepper, T, shadow, tick, tap } from "../kit";
import { cssVar } from "../theme";
import { Figures } from "../figure";
import { Enter, Later, POP, Press, SMOOTH, SNAP, THROWN, project, still } from "../motion";
import { DAYS, DURATIONS, GOALS, bodyWeight } from "./onboard";
import { DumbbellPicker, EquipOptions, equipLabel } from "../pickers";
import { AccountSection } from "./account";

/** Reminder times; "Off" is its own pill. */
const REMINDERS = ["6:30 am", "12:30 pm", "6:30 pm", "9:00 pm"];

export const Section = ({ title, children, top = 32 }: { title: ReactNode; children: ReactNode; top?: number }) => (
  <View style={{ marginTop: top, gap: 12 }}><H2>{title}</H2>{children}</View>
);

// ---------- Body ----------

/** "Quads are ready Mon 2 pm." for the muscle that takes longest. */
const readyLine = (rows: StrainRow[], now: number) => {
  const left = rows.filter((r) => r.strain > 0);
  if (!left.length) return "Everything is ready.";
  const last = left.reduce((a, r) => (r.hours > a.hours ? r : a));
  const [day, time] = readyAt(last.hours, now).split(", ");
  const when = day === "Today" || day === "Tonight" ? `${day!.toLowerCase()} at ${time}` : `${day} ${time}`;
  return `${last.name} ${/s$/.test(last.name) ? "are" : "is"} ready ${when}.`;
};

/** Where the slider's labels sit, in hours from now. */
function sliderTicks(now: number, span: number): [string, number][] {
  const h = (ts: number) => (ts - now) / H;
  const out: [string, number][] = [["Now", 0]];
  const tonight = h(dayStart(now) + 21 * H);
  if (tonight > 1.5) out.push(["Tonight", tonight]);
  out.push(["Tomorrow", h(addDays(now, 1) + 9 * H)]);
  out.push([new Date(now + span * H).toLocaleDateString("en-GB", { weekday: "short" }), span]);
  return out.filter(([, x], i, all) => x <= span && (i === all.length - 1 || all.slice(i + 1).every(([, y]) => y - x > span * 0.16)));
}

/** A counter-clockwise arrow: back to the start. */
const Rewind = ({ color }: { color: string }) => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M4 12a8 8 0 1 0 2.6-5.9" /><Path d="M4 4.5v4.6h4.6" />
  </Svg>
);

/** Room the refresh button takes beside the bar once the time has moved (44 button + 8 gap). */
const ROOM = 52;

/**
 * The time slider. At now the bar runs the full width. The moment it is dragged forward it gives way: the bar shortens
 * towards the left (a layout animation) while the refresh button scales and turns into the space it leaves, one
 * orchestrated move on one spring. The knob stays under the finger throughout (1:1, measured against the bar's length at
 * that instant). Near the moment a muscle turns ready the knob is pulled onto it with a tick; let go near one and it springs
 * there, carrying the finger's speed. Refresh spins its arrow, rewinds the knob (and the body) to now, then the bar
 * grows back to full. The page only redraws when the time shown crosses an hour.
 */
function TimeSlider({ t, span, snaps, now, set }: { t: number; span: number; snaps: number[]; now: number; set: (t: number) => void }) {
  const { c } = useApp();
  const [w, setW] = useState(0);
  const pos = useRef(new Animated.Value(t / span)).current;       // knob, 0 (now) .. 1 (end)
  const room = useRef(new Animated.Value(t > 0 ? 1 : 0)).current; // 0 full bar .. 1 bar shortened, button shown
  const spin = useRef(new Animated.Value(0)).current;
  const cur = useRef(t / span);
  const roomNow = useRef(t > 0 ? 1 : 0);
  const opened = useRef(t > 0);
  const held = useRef<number | null>(null);
  const shown = useRef(t);
  const dragging = useRef(false);
  const springTo = (v: Animated.Value, to: number, cfg = SMOOTH, velocity = 0) => {
    if (still()) { v.setValue(to); return Animated.delay(0); }
    return Animated.spring(v, { toValue: to, ...cfg, velocity, useNativeDriver: false, restDisplacementThreshold: 0.001, restSpeedThreshold: 0.001 });
  };
  const openRoom = (open: boolean) => {
    if (opened.current === open) return;
    opened.current = open;
    springTo(room, open ? 1 : 0, THROWN).start();
  };
  // One place turns the knob's position into the time shown, for drags, snaps and the rewind alike.
  useEffect(() => {
    const a = pos.addListener(({ value }) => {
      cur.current = value;
      // Moving forward opens the room; coming to rest at now (a rewind, a step, a drag let go there) closes it.
      if (value > 0.004) openRoom(true);
      else if (value < 0.0005 && !dragging.current) openRoom(false);
      const hours = held.current ?? Math.round(value * span);
      if (hours !== shown.current) { shown.current = hours; set(hours); }
    });
    const b = room.addListener(({ value }) => { roomNow.current = value; });
    return () => { pos.removeListener(a); room.removeListener(b); };
  }, [span]);
  /** How far the knob can travel right now: the bar's length less the knob, less the button's room as it opens. */
  const travel = () => Math.max(1, w - 44 - ROOM * roomNow.current);
  const near = (hours: number) => snaps.find((h) => Math.abs(h - hours) < span * 0.04);
  const place = (f: number) => {
    const v = Math.max(0, Math.min(1, f));
    const snap = near(v * span);
    if (snap !== undefined && held.current !== snap) tick();
    if ((v === 0 || v === 1) && cur.current !== v) tick();
    held.current = snap ?? null;
    pos.setValue(snap !== undefined ? snap / span : v);
  };
  // The finger's position along the bar, in points from the knob's resting spot.
  const grab = useRef(0);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => { dragging.current = false; if (cur.current < 0.0005) openRoom(false); },
    onPanResponderGrant: (e) => { dragging.current = true; pos.stopAnimation(); grab.current = e.nativeEvent.locationX - 22; place(grab.current / travel()); },
    onPanResponderMove: (_, g) => place((grab.current + g.dx) / travel()),
    onPanResponderRelease: (_, g) => {
      dragging.current = false;
      if (cur.current < 0.0005) { openRoom(false); return; }
      const v = g.vx * 1000;
      const landing = Math.max(0, Math.min(1, cur.current + project(v, 0.99) / travel())) * span;
      const snap = near(landing);
      if (snap === undefined || snap === held.current) return;
      held.current = null;
      tick();
      springTo(pos, snap / span, SNAP, v / travel()).start(() => { held.current = snap; });
    },
  }), [span, snaps.join(), w]);
  const back = () => {
    if (cur.current === 0) return;
    tap();
    held.current = null;
    spin.setValue(0);
    springTo(spin, 1, SMOOTH).start();
    // The knob rewinds first; once it is home the bar grows back to full and the button leaves.
    springTo(pos, 0, SMOOTH).start(() => { pos.setValue(0); });
  };
  const step = (dir: 1 | -1) => {
    const stops = [0, ...snaps, span].sort((x, y) => x - y);
    const at = cur.current * span;
    const next = dir > 0 ? stops.find((h) => h > at + 0.01) : [...stops].reverse().find((h) => h < at - 0.01);
    if (next === undefined) return;
    tick();
    held.current = next;
    springTo(pos, next / span, SNAP).start(() => { if (next === 0) pos.setValue(0); });
  };
  // Geometry, all from the two springs: the bar's length, the knob along it, the light fill behind the knob.
  const bar = Animated.subtract(w, Animated.multiply(room, ROOM));
  const knob = Animated.multiply(pos, Animated.subtract(bar, 44));
  const label = t === 0 ? "Drag to see later" : (() => { const d = new Date(now + t * H); const hh = d.getHours(); return `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${hh % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${hh < 12 ? "am" : "pm"}`; })();
  return (
    <View style={{ marginTop: 16 }}>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: 44 }}>
        <Animated.View {...pan.panHandlers}
          accessible accessibilityRole="adjustable" accessibilityLabel="Time shown" accessibilityValue={{ text: t === 0 ? "Now" : label }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]} onAccessibilityAction={(e) => step(e.nativeEvent.actionName === "increment" ? 1 : -1)}
          style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: w ? bar : "100%", borderRadius: 999, backgroundColor: c.fill, overflow: "hidden" }}>
          <Animated.View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: Animated.add(knob, 44), borderRadius: 999, backgroundColor: c.surface }} />
          <Animated.View pointerEvents="none" style={{ position: "absolute", top: 4, left: 4, width: 36, height: 36, borderRadius: 999, backgroundColor: c.ink, alignItems: "center", justifyContent: "center", transform: [{ translateX: knob }], ...shadow(0.3) }}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={c.bg} strokeWidth={2.6} strokeLinecap="round"><Path d="M9 7l-4 5 4 5M15 7l4 5-4 5" /></Svg>
          </Animated.View>
        </Animated.View>
        {/* The refresh button grows and turns into the room the bar gives up. */}
        <Animated.View pointerEvents={t > 0 ? "auto" : "none"}
          style={{ position: "absolute", right: 0, top: 0, width: 44, height: 44, opacity: room.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.6, 1], extrapolate: "clamp" }),
            transform: [{ scale: room.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }, { rotate: room.interpolate({ inputRange: [0, 1], outputRange: ["-140deg", "0deg"] }) }] }}>
          <Press scale={0.88} onPress={back} accessibilityLabel="Back to now"
            style={{ flex: 1, borderRadius: 999, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", ...shadow(0.12) }}>
            <Animated.View style={{ transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-360deg"] }) }] }}>
              <Rewind color={c.ink} />
            </Animated.View>
          </Press>
        </Animated.View>
      </View>
      <Animated.View style={{ height: 16, marginTop: 8, marginLeft: 4, paddingRight: Animated.multiply(room, ROOM) }}>
        <View style={{ flex: 1 }}>
          {sliderTicks(now, span).map(([l, h]) => (
            <T key={l} w={600} size={12} color={c.muted} style={{ position: "absolute", left: `${(h / span) * 100}%`, transform: [{ translateX: h === 0 ? 0 : h >= span ? -36 : -24 }] }}>{l}</T>
          ))}
        </View>
      </Animated.View>
      <T w={700} style={{ marginTop: 8, textAlign: "center" }}>{label}</T>
    </View>
  );
}

export function Body() {
  const { s, now, theme, c } = useApp();
  const all = useMemo(() => strainRows(s, now), [s, now]);
  const span = Math.min(96, Math.max(48, Math.ceil((Math.max(0, ...all.map((r) => r.hours)) + 2) / 12) * 12));
  const [t, setT] = useState(0);
  const rows = t === 0 ? all : strainRows(s, now, now + t * H);
  return (
    <Page bottom={120}>
      <H1>Body</H1>
      <T color={c.muted} style={{ marginTop: 8 }}>{readyLine(rows, now)}</T>
      <View style={{ marginTop: 12 }}><Later height={262}><Figures lead="Still recovering" kind="level" values={strainFigure(strain(s, now + t * H))} theme={theme} h={262} /></Later></View>
      <View style={{ marginTop: 8, flexDirection: "row", justifyContent: "center", gap: 14 }}>
        {([["High", STRAIN[theme][2]], ["Medium", STRAIN[theme][1]], ["Low", STRAIN[theme][0]], ["Ready", c.idle]] as const).map(([l, col]) => (
          <View key={l} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: col }} /><T w={600} size={12} color={c.muted}>{l}</T></View>
        ))}
      </View>
      {all.length > 0 && <TimeSlider t={t} span={span} snaps={all.map((r) => r.hours).filter((h) => h > 0 && h < span)} now={now} set={setT} />}
      <Card style={{ marginTop: 16 }}>
        {all.length ? rows.map((r, i) => {
          const on = r.strain > 0;
          const col = on ? strainColour(r.strain, theme) : c.idle;
          return (
            <View key={r.region} style={{ minHeight: 72, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 14, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: c.soft }}>
              <MuscleDot region={r.region} color={on ? col : theme === "dark" ? "#636366" : "#AEAEB2"} size={48} radius={14} />
              <View style={{ flex: 1, gap: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <T w={700} size={17} style={{ flexShrink: 1 }}>{r.name}</T>
                  <T color={c.muted}>{on ? readyAt(r.hours, now) : "Ready"}</T>
                </View>
                {on && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={{ flex: 1, height: 8, borderRadius: 999, backgroundColor: c.track, overflow: "hidden" }}><View style={{ height: "100%", width: `${r.strain * 100}%`, borderRadius: 999, backgroundColor: col }} /></View>
                    <T mono size={13} color={c.muted} style={{ width: 40, textAlign: "right" }}>{`${Math.round(r.strain * 100)}%`}</T>
                  </View>
                )}
              </View>
            </View>
          );
        }) : <View style={{ minHeight: 60, justifyContent: "center" }}><T w={700} size={17}>Everything is ready</T></View>}
      </Card>
    </Page>
  );
}

// ---------- Progress ----------

export function Progress() {
  const { s, now, theme, saved, c } = useApp();
  const target = saved.settings.days;
  const units = saved.settings.units;
  // The engine's numbers for this tab, worked out again only when the log, the hour or these settings change.
  const { plan, wk, strength, starts, grid, weeks } = useMemo(() => {
    const strength = strengthRows(s, 5, units);
    const grid = activity(s, now, 20, saved.createdAt);
    return {
      plan: planWeeks(s, now, target, saved.createdAt), wk: weekMuscles(s, now, theme),
      strength, starts: strength.length ? [] : startingPoints(s, 5, units), grid,
      weeks: Array.from({ length: grid.months.length }, (_, w) => grid.cells.slice(w * 7, w * 7 + 7)),
    };
  }, [s, now, theme, target, units, saved.createdAt]);
  const strip = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const work = (n: number) => cssVar(WORK[n - 1]!, c);
  return (
    <Page bottom={120}>
      <H1>Progress</H1>

      <Section top={24} title={<>Weeks on plan <Faint>· {plan.run} in a row</Faint></>}>
        <View style={{ flexDirection: "row", gap: 8, marginRight: -20 }}>
          <View style={{ paddingTop: 22, gap: 6 }}>
            {["M", "", "W", "", "F", "", "S"].map((l, i) => <View key={i} style={{ height: 30, justifyContent: "center" }}><T w={600} size={11} color={c.muted}>{l}</T></View>)}
          </View>
          <ScrollView ref={strip} horizontal showsHorizontalScrollIndicator={false} onContentSizeChange={() => strip.current?.scrollToEnd({ animated: false })} contentContainerStyle={{ paddingRight: 26, paddingLeft: 4, gap: 6 }}>
            {weeks.map((col, w) => (
              <View key={w} style={{ gap: 6 }}>
                <View style={{ height: 16, width: 30 }}><T w={600} size={11} color={c.muted} style={{ width: 40 }}>{grid.months[w]}</T></View>
                {col.map((cell, d) => (
                  <View key={d} style={{ width: 30, height: 30, borderRadius: 8, borderWidth: cell.today ? 2.5 : cell.before ? 1.5 : 0, borderColor: cell.today ? c.ink : c.track,
                    backgroundColor: cell.future || cell.before ? "transparent" : cell.work ? work(cell.work) : cell.today ? "transparent" : c.track }} />
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 5 }}>
          <T w={500} size={12} color={c.muted} style={{ marginRight: 3 }}>Rest</T>
          {[c.track, work(1), work(2), work(3)].map((col) => <View key={col} style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: col }} />)}
          <T w={500} size={12} color={c.muted} style={{ marginLeft: 3 }}>Hard</T>
        </View>
      </Section>

      <Section title="Muscles this week">
        <View style={{ marginTop: 4 }}><Later height={260}><Figures lead="Worked this week, most first" values={wk.values} theme={theme} h={260} /></Later></View>
        <Card style={{ paddingHorizontal: 20 }}>
          {wk.rows.map((r, i) => (
            <View key={r.name} style={{ minHeight: 60, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: i < wk.rows.length - 1 ? 1 : 0, borderBottomColor: c.soft }}>
              <View style={{ width: 16, height: 16, borderRadius: 5, backgroundColor: r.color ?? c.idle }} />
              <T w={600} size={16} style={{ flex: 1 }}>{r.name}</T>
              <T mono size={13} color={c.muted}><T mono size={15}>{r.done}</T>/{r.target} sets</T>
            </View>
          ))}
        </Card>
      </Section>

      {(starts.length > 0 || strength.length > 0) && (
        <Section title="Strength">
          <Card>
            {starts.map((r, i) => (
              <View key={r.name} style={{ minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: i < starts.length - 1 ? 1 : 0, borderBottomColor: c.soft }}>
                <View style={{ flex: 1, gap: 2 }}><T w={600} size={16} lines={1}>{r.name}</T><T size={13} color={c.muted}><T mono size={13}>{r.value}</T> {r.unit}</T></View>
                <View style={{ height: 28, paddingHorizontal: 10, borderRadius: 999, backgroundColor: c.soft, justifyContent: "center" }}><T w={600} size={13} color={c.muted}>First</T></View>
              </View>
            ))}
            {strength.map((r, i) => {
              const up = r.delta >= 0, flat = r.delta === 0;
              const col = flat ? c.muted : up ? c.up : c.down;
              const sp = sparkPath(r.points);
              return (
                <View key={r.name} style={{ minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: i < strength.length - 1 ? 1 : 0, borderBottomColor: c.soft }}>
                  <View style={{ flex: 1, gap: 2 }}><T w={600} size={16} lines={1}>{r.name}</T><T size={13} color={c.muted}><T mono size={13}>{`${r.from} → ${r.to}`}</T> {r.unit}</T></View>
                  <Svg width={64} height={28} viewBox="0 0 64 28"><Path d={sp.d} fill="none" stroke={col} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /><Circle cx={sp.end[0]} cy={sp.end[1]} r={3} fill={col} /></Svg>
                  <View style={{ minWidth: 44, height: 28, paddingHorizontal: 10, borderRadius: 999, backgroundColor: flat ? c.soft : up ? c.upBg : c.downBg, alignItems: "center", justifyContent: "center" }}>
                    <T mono size={13} color={col}>{flat ? "0" : `${up ? "↑" : "↓"}${Math.abs(r.delta)}`}</T>
                  </View>
                </View>
              );
            })}
          </Card>
          {starts.length > 0 && <T size={13} color={c.muted} style={{ paddingHorizontal: 4 }}>Each one gets a trend the next time you do it.</T>}
        </Section>
      )}
    </Page>
  );
}

// ---------- Profile ----------

const LEVELS = [["auto", "Auto"], ["beginner", "Beginner"], ["intermediate", "Intermediate"], ["advanced", "Advanced"]] as const;

/** A settings row: label, current value, and its options underneath when open. */
export function Row({ id, label, value, last, children }: { id: string; label: string; value: ReactNode; last?: boolean; children: ReactNode }) {
  const app = useApp();
  const { c, ui } = app;
  const open = ui.edit === id;
  return (
    <View style={{ borderBottomWidth: last ? 0 : 1, borderBottomColor: c.soft }}>
      <Press onPress={() => app.set({ edit: open ? null : id })} accessibilityState={{ expanded: open }} style={{ minHeight: 60, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <T w={600} size={16} style={{ flexGrow: 1 }}>{label}</T>
        {typeof value === "string" ? <T size={16} color={c.muted}>{value}</T> : value}
        <Chevron color={c.faint} rot={open ? 90 : 0} />
      </Press>
      {open && <Enter from={POP} ms={200} style={{ paddingBottom: 16 }}>{children}</Enter>}
    </View>
  );
}

export function Profile() {
  const app = useApp();
  const { saved, theme, c, now } = app;
  const st = saved.settings;
  const db = dumbbellsOf(st.dumbbells);
  const owned = db ? ownedWeights({ dumbbells: db } as never) : [];
  const dbLabel = owned.length ? (owned.length === 1 ? weightLabel(owned[0]!, "metric") : `${owned[0]}–${owned.at(-1)} kg`) : "None";
  return (
    <Page bottom={120}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <View style={{ width: 64, height: 64, borderRadius: 999, backgroundColor: c.ink, alignItems: "center", justifyContent: "center" }}>
          <Svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke={c.bg} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Circle cx={12} cy={8.5} r={3.5} /><Path d="M5 19.5c1.2-3.2 3.8-4.8 7-4.8s5.8 1.6 7 4.8" /></Svg>
        </View>
        <H1>Profile</H1>
      </View>

      <View style={{ marginTop: 24, borderRadius: 32, backgroundColor: c.surface, padding: 24, paddingBottom: 20, ...shadow(0.1) }}>
        <T w={700} size={24}>{PROGRAM_NAME}</T>
        <T color={c.muted} style={{ marginTop: 8, lineHeight: 21 }}>Week {programWeek(saved.programStart, now)} of 12. Every muscle, trained evenly.</T>
        <Press onPress={app.openPrograms} style={{ marginTop: 20, height: 52, borderRadius: 999, backgroundColor: c.ink, alignItems: "center", justifyContent: "center" }}><T w={600} size={16} color={c.bg}>View program</T></Press>
      </View>

      <Section title="Training">
        <Card style={{ paddingHorizontal: 20 }}>
          <Row id="days" label="Days per week" value={String(st.days)}>
            <Grid cols={5}>{DAYS.map((d) => <Opt key={d} label={String(d)} on={st.days === d} pick={() => app.settings({ days: d })} />)}</Grid>
          </Row>
          <Row id="length" label="Workout length" value={<View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Clock size={16} color={c.muted} /><T size={16} color={c.muted}>{st.minutes} min</T></View>}>
            <Grid cols={4}>{DURATIONS.map((m) => <Opt key={m} label={`${m} min`} on={st.minutes === m} pick={() => app.settings({ minutes: m })} />)}</Grid>
          </Row>
          <Row id="equip" label="Equipment" value={<View accessibilityLabel={equipLabel(st.equipment)}><EquipStack items={st.equipment} size={28} body ring={c.surface} /></View>}>
            <EquipOptions value={st.equipment} set={(equipment) => app.settings({ equipment })} />
          </Row>
          {st.equipment.includes("dumbbell") && (
            <Row id="dumbbells" label="Dumbbells" value={dbLabel}>
              <DumbbellPicker value={st.dumbbells} set={(dumbbells) => app.settings({ dumbbells })} />
            </Row>
          )}
          <Row id="avoid" label="Muscles to avoid" value={st.avoid.length ? String(st.avoid.length) : "None"} last>
            <Grid cols={2}>{REGIONS.map((m) => <Opt key={m} label={REGION_NAMES[m]} on={st.avoid.includes(m)} pick={() => app.settings({ avoid: st.avoid.includes(m) ? st.avoid.filter((x) => x !== m) : [...st.avoid, m] })} />)}</Grid>
          </Row>
        </Card>
      </Section>

      <Section title="About you">
        <Card style={{ paddingHorizontal: 20 }}>
          <Row id="goal" label="Goal" value={GOALS.find((g) => g[0] === st.goal)![1]}>
            <View style={{ gap: 8 }}>
              {GOALS.map(([k, l, sub]) => {
                const on = st.goal === k;
                return (
                  <Press key={k} onPress={() => app.settings({ goal: k })} style={{ minHeight: 62, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 18, justifyContent: "center", gap: 2, backgroundColor: on ? c.ink : c.bg }}>
                    <T w={700} color={on ? c.bg : c.ink}>{l}</T><T size={13} color={on ? c.bg : c.ink} style={{ opacity: 0.72 }}>{sub}</T>
                  </Press>
                );
              })}
            </View>
          </Row>
          <Row id="level" label="Level" value={LEVELS.find((l) => l[0] === st.level)![1]}>
            <Grid cols={2}>{LEVELS.map(([k, l]) => <Opt key={k} label={l} on={st.level === k} pick={() => app.settings({ level: k })} />)}</Grid>
          </Row>
          <Row id="weight" label="Body weight" value={bodyWeight(st.kg, st.units)} last>
            <Stepper value={bodyWeight(st.kg, st.units)} dec={() => app.settings({ kg: nudgeWeight(st.kg, st.units, -1) })} inc={() => app.settings({ kg: nudgeWeight(st.kg, st.units, 1) })} decLabel="Lower body weight" incLabel="Raise body weight" />
          </Row>
        </Card>
      </Section>

      <Section title="App">
        <Card style={{ paddingHorizontal: 20 }}>
          <Row id="units" label="Units" value={st.units === "metric" ? "Metric" : "Imperial"}>
            <Grid cols={2}>{(["metric", "imperial"] as const).map((u) => <Opt key={u} label={u === "metric" ? "Metric" : "Imperial"} on={st.units === u} pick={() => app.settings({ units: u })} />)}</Grid>
          </Row>
          <Row id="remind" label="Reminders" value={st.remind}>
            <View style={{ gap: 8 }}>
              <Opt label="Off" on={st.remind === "Off"} pick={() => app.settings({ remind: "Off" })} />
              <Grid cols={2}>{REMINDERS.map((r) => <Opt key={r} label={r} on={st.remind === r} pick={() => app.settings({ remind: r })} />)}</Grid>
            </View>
          </Row>
          <Row id="look" label="Appearance" value={st.look === "system" ? "System" : theme === "dark" ? "Dark" : "Light"} last>
            <Grid cols={3}>{(["system", "light", "dark"] as const).map((l) => <Opt key={l} label={l === "system" ? "System" : l === "light" ? "Light" : "Dark"} on={st.look === l} pick={() => app.settings({ look: l })} />)}</Grid>
          </Row>
        </Card>
      </Section>

      <AccountSection />
    </Page>
  );
}
