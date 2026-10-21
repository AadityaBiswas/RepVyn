// The screens after "Workout done": what RepVyn learned from today, what grew since day 1, the week-on-plan moment,
// and the card to share. Contour lines on the figure always mean the muscle to notice (most worked, or grown most).
import { useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { REGIONS, type Muscle, type Region } from "../../../src/engine";
import { growth, learnedLine, learnedRows, mostWorked, muscleName, type Dir, type GrowthRow, type LearnedRow } from "../../../shared/finish";
import { planTitle, planWeeks, programWeek, weekMuscles, weekStart, weekWorkouts } from "../../../shared/model";
import { stateWith } from "../../../shared/store";
import { repsDone, toEvents, type Run } from "../../../shared/workout";
import { useApp } from "../app";
import { Fig } from "../figure";
import { Faint, H1, MuscleDot, Page, T, shadow, tap, useSide } from "../kit";
import { Enter, FIG, Press, UP, type From } from "../motion";
import { Mark } from "./mark";

const clock = (t: number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
const LINE_ON_RED = "#C4223A";
const IN: From = { opacity: 0, x: 40 };
const WHITE_SOFT = "rgba(255,255,255,0.86)";
const WHITE_MUTED = "rgba(255,255,255,0.74)";

export interface WeekWin { n: number; title: number; sets: number; reps: number; run: number; values: Partial<Record<Muscle, number>>; lines: Region[] }
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
  /** Set when this workout put the week on plan. */
  week: WeekWin | null;
}

/** Everything the recap shows, worked out once from today's sets as if they were already saved. */
export function useRecap(run: Run): Recap {
  const app = useApp();
  return useMemo(() => {
    const now = Date.now();
    const evs = toEvents(run, "recap", now);
    const after = stateWith(app.saved, evs);
    const units = app.saved.settings.units;
    const rows = learnedRows(after, run, now, units);
    const most = mostWorked(app.s, run);
    const list = rows.map((r): [string, string] => {
      const done = run.done.filter((d) => d.exerciseId === r.id);
      const sec = done[0]?.seconds !== undefined;
      return [r.name, `${done.reduce((t, d) => t + (d.seconds ?? d.reps ?? 0), 0)}${sec ? " sec" : ""}`];
    });
    const target = app.saved.settings.days;
    let week: WeekWin | null = null;
    if (weekWorkouts(app.s, now) < target && weekWorkouts(after, now) >= target) {
      const mon = weekStart(now);
      const sets = [...app.saved.events, ...evs].filter((e) => e.type === "set_logged" && e.ts >= mon) as { payload: { reps?: number } }[];
      const top = (Object.entries(weekMuscles(after, now).values) as [Region, number][]).sort((a, b) => b[1] - a[1]);
      week = {
        n: target, title: programWeek(app.saved.programStart, now), sets: sets.length, reps: sets.reduce((t, e) => t + (e.payload.reps ?? 0), 0),
        run: planWeeks(after, now, target, app.saved.createdAt).run,
        values: Object.fromEntries(top.map(([m, x]) => [m, x >= 0.5 ? 1 : 0.5])), lines: top.slice(0, 1).map(([m]) => m),
      };
    }
    return {
      week, rows, line: learnedLine(rows), grew: growth(after, units), worked: most.order, lines: most.lines,
      title: app.setupPlan.kind === "workout" ? planTitle(app.setupPlan) : "Workout",
      when: `${new Date(now).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · Week ${programWeek(app.saved.programStart, now)}`,
      totals: { time: clock(run.elapsed), sets: run.done.length, reps: repsDone(run) }, list,
    };
  }, []);
}

const names = (ms: readonly Region[]) => {
  const n = [...new Set(ms.map(muscleName))];
  return (n.length <= 1 ? (n[0] ?? "") : `${n.slice(0, -1).join(", ")} and ${n.at(-1)}`).toLowerCase();
};

const ShareIcon = ({ color }: { color: string }) => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M12 15V3.5M7.5 8 12 3.5 16.5 8" /><Path d="M5 12.5v6A2 2 0 0 0 7 20.5h10a2 2 0 0 0 2-2v-6" /></Svg>
);
const ARROWS: Record<Dir, string> = { up: "M12 19V5M6 11l6-6 6 6", down: "M12 5v14M6 13l6 6 6-6", same: "M6 12h12" };
const DirArrow = ({ dir, color }: { dir: Dir; color: string }) => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><Path d={ARROWS[dir]} /></Svg>
);
/** A patch of contour lines: the legend for the lines on the figure. */
const Swatch = ({ size = 18 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 22 22">
    <Rect width={22} height={22} rx={7} fill="#FFFFFF" />
    <Rect x={2.4} y={2.4} width={17.2} height={17.2} rx={4.5} fill="none" stroke={LINE_ON_RED} strokeWidth={2.2} />
    <Rect x={6.4} y={6.4} width={9.2} height={9.2} rx={2} fill="none" stroke={LINE_ON_RED} strokeWidth={2.2} />
  </Svg>
);
const Legend = ({ children }: { children: string }) => (
  <View style={{ marginTop: 8, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8 }}><Swatch /><T w={600} size={13} color={WHITE_SOFT}>{children}</T></View>
);

/** Share, and the way on. Pinned to the bottom like BottomCta. */
function Bottom({ share, next, label, onRed }: { share: () => void; next: () => void; label: string; onRed?: boolean }) {
  const { c } = useApp();
  const ins = useSafeAreaInsets();
  const side = useSide();
  return (
    <View style={{ position: "absolute", zIndex: 3, left: side, right: side, bottom: Math.max(28, ins.bottom + 12), flexDirection: "row", gap: 10 }}>
      <Press onPress={() => { tap(); share(); }} accessibilityLabel="Share workout" style={{ width: 64, height: 64, borderRadius: 999, backgroundColor: onRed ? "rgba(255,255,255,0.18)" : c.surface, alignItems: "center", justifyContent: "center" }}>
        <ShareIcon color={onRed ? "#FFFFFF" : c.ink} />
      </Press>
      <Press onPress={() => { tap(); next(); }} scale={0.98} style={{ flex: 1, minHeight: 64, borderRadius: 999, backgroundColor: onRed ? "#FFFFFF" : c.accent, alignItems: "center", justifyContent: "center", ...(onRed ? {} : shadow(0.3, c.accent)) }}>
        <T w={700} size={17} color={onRed ? c.hero : c.onAccent}>{label}</T>
      </Press>
    </View>
  );
}

function Layer({ z, bg, children }: { z: number; bg?: string; children: React.ReactNode }) {
  const { c } = useApp();
  return <Enter from={IN} style={[StyleSheet.absoluteFill, { zIndex: z, backgroundColor: bg ?? c.bg }]}>{children}</Enter>;
}

/** Today, exercise by exercise: what you did and what RepVyn set for next time from it. */
export function Learned({ recap, share, next, last }: { recap: Recap; share: () => void; next: () => void; last: boolean }) {
  const { c } = useApp();
  const n = recap.rows.length;
  return (
    <Layer z={10}>
      <Page bottom={120}>
        <T w={600} color={c.muted}>{recap.title} · {n} exercise{n === 1 ? "" : "s"} · {recap.totals.reps} reps</T>
        <H1 style={{ marginTop: 6 }}>What RepVyn <Faint>learned</Faint></H1>
        <T color={c.muted} style={{ marginTop: 10, lineHeight: 20 }}>{recap.line}</T>
        <View style={{ marginTop: 14, flexDirection: "row", justifyContent: "space-between", paddingLeft: 72, paddingRight: 16, paddingBottom: 6 }} importantForAccessibility="no-hide-descendants">
          <T w={600} size={13} color={c.muted}>Today</T><T w={600} size={13} color={c.muted}>Next time</T>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 4 }}>
          {recap.rows.map((r, i) => (
            <Enter key={r.id} from={UP} delay={120 + i * 60}>
              <View accessible accessibilityLabel={`${r.name}: today ${r.today}, next time ${r.next}`} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9, ...(i < n - 1 ? { borderBottomWidth: 1, borderBottomColor: c.soft } : {}) }}>
                <MuscleDot region={r.region} size={44} radius={13} />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <T w={700} size={16} lines={1}>{r.name}</T>
                  <T size={14} color={c.muted} lines={1}>{r.today}</T>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <DirArrow dir={r.dir} color={r.dir === "up" ? c.accentText : c.muted} />
                  <T w={700} color={r.dir === "same" ? c.muted : c.ink}>{r.next}</T>
                </View>
              </View>
            </Enter>
          ))}
        </View>
      </Page>
      <Bottom share={share} next={next} label={last ? "Finish" : "Next"} />
    </Layer>
  );
}

/** From the second week: the muscles that grew since day 1, lined on the body, with the numbers behind each. */
export function Growth({ recap, share, next, last }: { recap: Recap; share: () => void; next: () => void; last: boolean }) {
  const { c, theme } = useApp();
  const { width } = useWindowDimensions();
  const grown = recap.grew.map((g) => g.region);
  const all = useMemo(() => Object.fromEntries(REGIONS.map((m) => [m, 1])) as Partial<Record<Muscle, number>>, []);
  const h = Math.min(260, Math.round((Math.min(width, 600) - 60) / 2 * 1.9));
  return (
    <Layer z={11}>
      <Page bottom={120}>
        <T w={600} color={c.muted}>Since day 1</T>
        <H1 style={{ marginTop: 6 }}>Your {muscleName(grown[0]!).toLowerCase()} <Faint>grew most</Faint></H1>
        <Enter from={UP} delay={100} style={{ marginTop: 16, borderRadius: 28, backgroundColor: c.hero, paddingTop: 18, paddingBottom: 14, paddingHorizontal: 10, ...shadow(0.25, c.hero) }}>
          <View accessible accessibilityLabel={`Body figures. Lines mark where you grew most: ${names(grown)}.`} style={{ flexDirection: "row", justifyContent: "center", gap: 6 }}>
            <Fig view="front" kind="hero" values={all} lines={grown} theme={theme} h={h} />
            <Fig view="back" kind="hero" values={all} lines={grown} theme={theme} h={h} />
          </View>
          <Legend>Lines mark where you grew most</Legend>
        </Enter>
        <View style={{ marginTop: 14, backgroundColor: c.surface, borderRadius: 24, paddingHorizontal: 18 }}>
          {recap.grew.map((g, i) => (
            <Enter key={g.name} from={UP} delay={260 + i * 70}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, ...(i ? { borderTopWidth: 1, borderTopColor: c.soft } : {}) }}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}><T w={700} size={16}>{g.name}</T><T size={14} color={c.muted}>{g.how}</T></View>
                <T mono size={22}>+{g.pct}%</T>
              </View>
            </Enter>
          ))}
        </View>
      </Page>
      <Bottom share={share} next={next} label={last ? "Finish" : "Next"} />
    </Layer>
  );
}

/** The week as a ring: one segment per planned workout. */
function Ring({ n, size, stroke }: { n: number; size: number; stroke: number }) {
  const r = (size - stroke) / 2, cf = 2 * Math.PI * r, gap = 0.035 * cf, seg = cf / n - gap;
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
      {Array.from({ length: n }, (_, i) => (
        <Circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#FFFFFF" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${seg} ${cf - seg}`} strokeDashoffset={-i * (seg + gap) - gap / 2} />
      ))}
    </Svg>
  );
}

/** After the week's last planned workout: a short red moment. The ring, the week named, and the body showing the week. */
export function WeekMoment({ week, share, done }: { week: WeekWin; share: () => void; done: () => void }) {
  const { c, theme } = useApp();
  const ins = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const fh = Math.max(150, Math.min(220, height - 620));
  return (
    <Layer z={12} bg={c.hero}>
      <View style={{ flex: 1, paddingTop: Math.max(56, ins.top + 12), paddingHorizontal: 20 }}>
        <Enter from={FIG} delay={200} style={{ alignSelf: "center", marginTop: 8 }}>
          <Ring n={week.n} size={176} stroke={16} />
          <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
            <T mono size={46} color="#FFFFFF" style={{ lineHeight: 50 }}>{week.n}/{week.n}</T>
            <T w={600} size={13} color={WHITE_MUTED}>workouts</T>
          </View>
        </Enter>
        <Enter from={UP} delay={700} style={{ marginTop: 24, alignItems: "center" }}>
          <T w={800} size={56} color="#FFFFFF" style={{ lineHeight: 54, letterSpacing: -2.2, textAlign: "center" }}>Week {week.title}</T>
          <T w={800} size={56} color="rgba(255,255,255,0.62)" style={{ lineHeight: 58, letterSpacing: -2.2, textAlign: "center" }}>on plan</T>
        </Enter>
        <Enter from={UP} delay={820} style={{ marginTop: 14 }}>
          <T w={600} color={WHITE_SOFT} style={{ textAlign: "center" }}>{week.sets} sets · {week.reps} reps · {week.run} {week.run === 1 ? "week" : "weeks"} on plan</T>
        </Enter>
        <Enter from={UP} delay={940} style={{ marginTop: 16 }}>
          <View accessible accessibilityLabel={`Body figures with this week's muscles lit. Lines mark the most worked: ${names(week.lines)}.`} style={{ flexDirection: "row", justifyContent: "center", gap: 4 }}>
            <Fig view="front" kind="hero" values={week.values} lines={week.lines} theme={theme} h={fh} />
            <Fig view="back" kind="hero" values={week.values} lines={week.lines} theme={theme} h={fh} />
          </View>
          {week.lines.length > 0 && <Legend>{`Most worked this week: ${names(week.lines)}`}</Legend>}
        </Enter>
      </View>
      <Bottom share={share} next={done} label="Done" onRed />
    </Layer>
  );
}

/** What the share card marks: the muscle that grew most since day 1, or today's most worked before there is any growth. */
const highlight = (r: Recap): { lines: Region[]; text: string } =>
  r.grew[0] ? { lines: [r.grew[0].region], text: `${r.grew[0].name} +${r.grew[0].pct}% since day 1` } : { lines: r.lines, text: "Lines mark the most worked" };
/** Today's muscles on the card: the three worked most in white, the rest of what was trained in pink. */
const cardValues = (r: Recap) => ({ ...Object.fromEntries(r.worked.map((m, i) => [m, i < 3 ? 1 : 0.5])), ...Object.fromEntries(highlight(r).lines.map((m) => [m, 1])) }) as Partial<Record<Muscle, number>>;

/** The story card, 9:16, laid out at 334 pt wide and scaled by `k`. */
function ShareCard({ recap, k }: { recap: Recap; k: number }) {
  const { theme } = useApp();
  const h = highlight(recap);
  const values = useMemo(() => cardValues(recap), []);
  const s = (n: number) => Math.round(n * k * 10) / 10;
  return (
    <View style={{ width: s(334), height: s(334 * 16 / 9), borderRadius: s(28), backgroundColor: LINE_ON_RED, padding: s(20), paddingBottom: s(18), overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: s(8) }}><Mark size={s(24)} /><T w={800} size={s(15)} color="#FFFFFF" maxScale={1}>RepVyn</T></View>
        <T w={600} size={s(13)} color={WHITE_MUTED} maxScale={1}>{recap.when}</T>
      </View>
      <T w={800} size={s(40)} color="#FFFFFF" lines={1} maxScale={1} style={{ marginTop: s(14), lineHeight: s(42), letterSpacing: -1.6 * k }}>{recap.title}</T>
      <T w={600} size={s(13)} color="rgba(255,255,255,0.8)" lines={1} maxScale={1} style={{ marginTop: s(6) }}>Most work: {names(recap.worked.slice(0, 3))}</T>
      <View style={{ marginTop: s(10), flexDirection: "row", justifyContent: "center", gap: s(4) }}>
        <Fig view="front" kind="hero" values={values} lines={h.lines} theme={theme} h={s(172)} />
        <Fig view="back" kind="hero" values={values} lines={h.lines} theme={theme} h={s(172)} />
      </View>
      <View style={{ marginTop: s(8), alignSelf: "center", flexDirection: "row", alignItems: "center", gap: s(8), paddingVertical: s(6), paddingLeft: s(7), paddingRight: s(12), borderRadius: 999, backgroundColor: "rgba(72,6,18,0.3)" }}>
        <Swatch size={s(18)} /><T w={700} size={s(13)} color="#FFFFFF" maxScale={1}>{h.text}</T>
      </View>
      <View style={{ marginTop: s(14), gap: s(4) }}>
        {recap.list.slice(0, 7).map(([n, r]) => (
          <View key={n} style={{ flexDirection: "row", justifyContent: "space-between", gap: s(12) }}>
            <T w={600} size={s(13)} color={WHITE_SOFT} lines={1} maxScale={1} style={{ flex: 1 }}>{n}</T>
            <T w={700} size={s(13)} color="#FFFFFF" maxScale={1}>{r}</T>
          </View>
        ))}
      </View>
      <View style={{ flex: 1 }} />
      <View style={{ paddingTop: s(12), borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.22)", flexDirection: "row", justifyContent: "space-between" }}>
        {([[recap.totals.time, "time"], [String(recap.totals.sets), "sets"], [String(recap.totals.reps), "reps"]] as const).map(([v, l]) => (
          <View key={l}><T mono size={s(24)} color="#FFFFFF" maxScale={1} style={{ lineHeight: s(26) }}>{v}</T><T w={600} size={s(12)} color={WHITE_MUTED} maxScale={1} style={{ marginTop: s(3) }}>{l}</T></View>
        ))}
      </View>
    </View>
  );
}

/** The card, and Share: the phone's share sheet with the card as a 1080 × 1920 image (saving is one of its targets). */
export function ShareSheet({ recap, close }: { recap: Recap; close: () => void }) {
  const { c } = useApp();
  const ins = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const card = useRef<React.ComponentRef<typeof View>>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const top = Math.max(16, ins.top + 4);
  // As wide as fits: 334 pt at most, leaving room for the header and the button.
  const w = Math.min(334, Math.min(width, 600) - 40, ((height - top - Math.max(28, ins.bottom + 12) - 44 - 64 - 40) * 9) / 16);
  const share = async () => {
    if (busy) return;
    tap();
    setBusy(true);
    setErr(null);
    try {
      if (Platform.OS === "web" || !(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this device.");
      const uri = await captureRef(card, { format: "png", result: "tmpfile", width: 1080, height: 1920 });
      await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "My RepVyn workout" });
    } catch (e) {
      setErr((e as Error).message || "Couldn't share. Try again.");
    } finally { setBusy(false); }
  };
  return (
    <Layer z={13}>
      <View style={{ flex: 1, paddingTop: top, paddingHorizontal: 20, paddingBottom: Math.max(28, ins.bottom + 12) }}>
        <View style={{ height: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Press scale={0.92} onPress={close} accessibilityLabel="Back" style={{ width: 44, height: 44, borderRadius: 999, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" }}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 18l-6-6 6-6" /></Svg>
          </Press>
          <T w={600} color={c.muted}>Share your workout</T>
          <View style={{ width: 44 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <Enter from={UP} delay={60}><View ref={card} collapsable={false}><ShareCard recap={recap} k={w / 334} /></View></Enter>
          {err && <T color={c.accentText}>{err}</T>}
        </View>
        <Press onPress={() => void share()} disabled={busy} scale={0.98} style={{ minHeight: 64, borderRadius: 999, backgroundColor: c.ink, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center", opacity: busy ? 0.6 : 1 }}>
          <ShareIcon color={c.bg} /><T w={700} size={17} color={c.bg}>{busy ? "One moment" : "Share"}</T>
        </Press>
      </View>
    </Layer>
  );
}
