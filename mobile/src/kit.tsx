// Small shared pieces, after app/src/ui/kit.tsx and icons.tsx: text, option pills, segmented switch, stepper, back button, bottom action, icons.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, PanResponder, ScrollView, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { Press, Roll, SNAP, THROWN, pageX, project, rubberband, spring, still, tween } from "./motion";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import type { Equipment, Muscle, Region } from "../../src/engine";
import { Thumb } from "./figure";
import { useApp } from "./app";
import { FONT } from "./theme";

export { success, tap, thud, tick } from "./haptics";
import { tap, tick } from "./haptics";

/** The widest a page's content gets (a tablet shows a centred column, not a stretched phone). */
export const COLUMN = 600;
/** The side inset that keeps a full-width control inside the column: 20 on a phone, more on a tablet. */
export function useSide(gutter = 20): number {
  const { width } = useWindowDimensions();
  return Math.max(gutter, (width - COLUMN) / 2 + gutter);
}

/** How much big type and pictures shrink on a narrow phone (designed at 390 pt wide). */
export function useFit(): number {
  const { width } = useWindowDimensions();
  return Math.max(0.82, Math.min(1, width / 390));
}

/** Text in Geist, the ink colour unless told otherwise. */
export function T({ w = 400, size = 15, color, style, children, mono, lines, maxScale }: { w?: 400 | 500 | 600 | 700 | 800; size?: number; color?: string; style?: StyleProp<TextStyle>; children: ReactNode; mono?: boolean; lines?: number; maxScale?: number }) {
  const { c } = useApp();
  return <Text numberOfLines={lines} selectable={false} maxFontSizeMultiplier={maxScale ?? (size >= 24 ? 1.2 : 2)} style={[{ fontFamily: mono ? FONT.mono : FONT[w], fontSize: size, color: color ?? c.ink, letterSpacing: size >= 17 ? -0.015 * size : 0 }, style]}>{children}</Text>;
}
export function H1({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const k = useFit();
  return <T w={800} size={Math.round(34 * k)} style={[{ lineHeight: Math.round(36 * k), letterSpacing: -1.2 * k }, style]}>{children}</T>;
}
export const H2 = ({ children }: { children: ReactNode }) => <T w={700} size={20} style={{ letterSpacing: -0.4 }}>{children}</T>;
export function Faint({ children }: { children: ReactNode }) {
  const { c } = useApp();
  return <Text selectable={false} style={{ color: c.faint }}>{children}</Text>;
}

/** A scrolling page body with the canvas gutters, clear of the status bar and the bottom action. */
export function Page({ children, top = 0, bottom = 136 }: { children: ReactNode; top?: number; bottom?: number }) {
  const ins = useSafeAreaInsets();
  const head = Math.max(56, ins.top + 12);
  return (
    <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: head + top, paddingHorizontal: 20, paddingBottom: bottom + ins.bottom, width: "100%", maxWidth: COLUMN, alignSelf: "center" }} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
      {/* Under a back button or step bar the fade reaches past them; on a tab page it only clears the status bar. */}
      <EdgeFade edge="top" size={top > 0 ? head + top - 6 : ins.top + 20} />
      <EdgeFade edge="bottom" size={Math.round(bottom * 0.78) + ins.bottom} />
    </>
  );
}

/**
 * A scroll edge effect: the ground colour, solid at the screen edge and clear at `size`, so content dissolves where it
 * meets floating controls instead of colliding with them. Held at the edge's colour for the first third, so text never
 * shows through the controls themselves.
 */
export function EdgeFade({ edge, size }: { edge: "top" | "bottom"; size: number }) {
  const { c } = useApp();
  const id = `fade-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const top = edge === "top";
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, height: size, zIndex: 2, ...(top ? { top: 0 } : { bottom: 0 }) }}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1={top ? "0" : "1"} x2="0" y2={top ? "1" : "0"}>
            <Stop offset="0" stopColor={c.bg} stopOpacity={1} />
            <Stop offset="0.34" stopColor={c.bg} stopOpacity={0.94} />
            <Stop offset="0.7" stopColor={c.bg} stopOpacity={0.5} />
            <Stop offset="1" stopColor={c.bg} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
/**
 * A pushed page. `slide`: in from the right and back out the same way, and it can be swiped back from the left edge,
 * tracking the finger 1:1; on release it finishes or springs home by where the swipe was heading, carrying its speed.
 * The page under it follows the same value (pageX). `fade`: the first-run screens, which only cross-fade.
 */
export function Sheet({ children, z = 5, bg, move = "slide" }: { children: ReactNode; z?: number; bg?: string; move?: "slide" | "fade" }) {
  const app = useApp();
  const { c, ui } = app;
  const { width } = useWindowDimensions();
  const slide = move === "slide";
  const o = useRef(new Animated.Value(slide && !still() ? 1 : 0)).current;
  useEffect(() => {
    if (!slide) { tween(o, 1, 240).start(); return; }
    if (still()) { pageX.setValue(0); tween(o, 1, 200).start(); }
    else { pageX.setValue(width); spring(pageX, 0).start(); }
    return () => { pageX.stopAnimation(); pageX.setValue(width); };
  }, []);
  useEffect(() => {
    if (!ui.leaving) return;
    if (!slide || still()) tween(o, 0, 180).start();
    else spring(pageX, width).start();
  }, [ui.leaving]);
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => slide && !still() && g.x0 - g.dx < 28 && g.dx > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderGrant: () => { pageX.stopAnimation(); },
    onPanResponderMove: (_, g) => { pageX.setValue(g.dx >= 0 ? g.dx : rubberband(g.dx, width)); },
    onPanResponderTerminationRequest: () => false,
    onPanResponderRelease: (_, g) => {
      const v = g.vx * 1000;
      if (g.dx + project(v) > width / 2) {
        tap();
        spring(pageX, width, THROWN, 0, v).start(({ finished }) => { if (finished) app.gone(); });
      } else spring(pageX, 0, THROWN, 0, v).start();
    },
    onPanResponderTerminate: () => { spring(pageX, 0).start(); },
  }), [slide, width]);
  return (
    <Animated.View {...(slide ? pan.panHandlers : {})} style={[StyleSheet.absoluteFill, { zIndex: z, backgroundColor: bg ?? c.bg, opacity: o, ...(slide ? { transform: [{ translateX: pageX }] } : {}) }, slide && shadowLeft]}>
      {children}
    </Animated.View>
  );
}
/** The pushed page's leading edge casts a soft shadow onto the page it covers. */
const shadowLeft = { shadowColor: "#000", shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: -6, height: 0 }, elevation: 12 };

/** An option pill: selected is ink, unselected the ground colour (or `off`). */
export function Opt({ label, on, pick, off, style, mono, h = 44 }: { label: string; on: boolean; pick: () => void; off?: string; style?: StyleProp<ViewStyle>; mono?: boolean; h?: number }) {
  const { c } = useApp();
  return (
    <Press onPress={() => { tick(); pick(); }} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={[{ minHeight: h, paddingVertical: 6, borderRadius: 999, alignItems: "center", justifyContent: "center", paddingHorizontal: 6, backgroundColor: on ? c.ink : off ?? c.bg }, style]}>
      <T w={600} size={14} mono={mono} color={on ? c.bg : c.ink}>{label}</T>
    </Press>
  );
}
/** Children in an even grid of `cols` columns. */
export function Grid({ cols, children, gap = 8 }: { cols: number; children: ReactNode[]; gap?: number }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -gap / 2, rowGap: gap }}>
      {children.map((ch, i) => <View key={i} style={{ width: `${100 / cols}%`, paddingHorizontal: gap / 2 }}>{ch}</View>)}
    </View>
  );
}
/** A segmented switch: the ink pill slides to the chosen option. */
export function Segmented({ options, bg }: { options: { key: string; label: string; on: boolean; pick: () => void; icon?: ReactNode }[]; bg?: string }) {
  const { c } = useApp();
  const [w, setW] = useState(0);
  const n = options.length;
  const at = Math.max(0, options.findIndex((o) => o.on));
  const cell = (w - 8 - 2 * (n - 1)) / n;
  // The pill keeps one width and only slides (a transform, so it runs on the native driver).
  const x = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);
  useEffect(() => {
    if (!w) return;
    const to = at * (cell + 2);
    if (!placed.current || still()) { x.setValue(to); placed.current = true; } else spring(x, to, SNAP).start();
  }, [at, w]);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ flexDirection: "row", padding: 4, gap: 2, borderRadius: 999, backgroundColor: bg ?? c.bg }}>
      {w > 0 && options.some((o) => o.on) && <Animated.View pointerEvents="none" style={{ position: "absolute", top: 4, bottom: 4, left: 4, width: cell, borderRadius: 999, backgroundColor: c.ink, transform: [{ translateX: x }] }} />}
      {options.map((o) => (
        <Press key={o.key} scale={0.95} onPress={() => { if (!o.on) tick(); o.pick(); }} accessibilityRole="button" accessibilityState={{ selected: o.on }}
          style={{ flex: 1, minHeight: 44, paddingVertical: 6, borderRadius: 999, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", backgroundColor: w > 0 ? "transparent" : o.on ? c.ink : "transparent" }}>
          {o.icon}
          <T w={600} size={14} color={o.on ? c.bg : c.ink}>{o.label}</T>
        </Press>
      ))}
    </View>
  );
}
/** Minus, value, plus. */
export function Stepper({ value, dec, inc, size = 20, decLabel, incLabel }: { value: string; dec: () => void; inc: () => void; size?: number; decLabel: string; incLabel: string }) {
  const { c } = useApp();
  const b = { width: 44, height: 44, borderRadius: 999, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" } as const;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <Press scale={0.9} onPress={() => { tick(); dec(); }} accessibilityLabel={decLabel} style={b}><T size={22} w={500}>−</T></Press>
      <View style={{ overflow: "hidden" }}><Roll value={value}><T mono size={size}>{value}</T></Roll></View>
      <Press scale={0.9} onPress={() => { tick(); inc(); }} accessibilityLabel={incLabel} style={b}><T size={22} w={500}>+</T></Press>
    </View>
  );
}
/** A round frosted back button, top left. */
export function BackButton({ onPress, label = "Back" }: { onPress: () => void; label?: string }) {
  const { c } = useApp();
  const ins = useSafeAreaInsets();
  return (
    <Press scale={0.92} onPress={onPress} accessibilityLabel={label} style={{ position: "absolute", zIndex: 3, top: Math.max(56, ins.top + 12), left: 20, width: 48, height: 48, borderRadius: 999, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", ...shadow(0.12) }}>
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 18l-6-6 6-6" /></Svg>
    </Press>
  );
}
/** The one red action pinned to the bottom of a page. */
export function BottomCta({ onPress, children, disabled }: { onPress: () => void; children: ReactNode; disabled?: boolean }) {
  const { c } = useApp();
  const ins = useSafeAreaInsets();
  const side = useSide();
  return (
    <Press scale={0.98} onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={{ position: "absolute", zIndex: 3, left: side, right: side, bottom: Math.max(28, ins.bottom + 12), minHeight: 64, paddingVertical: 10, borderRadius: 999, backgroundColor: c.accent, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.5 : 1, ...shadow(0.3, c.accent) }}>
      {typeof children === "string" ? <T w={700} size={17} color={c.onAccent}>{children}</T> : children}
    </Press>
  );
}
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useApp();
  return <View style={[{ backgroundColor: c.surface, borderRadius: 24, paddingHorizontal: 16 }, style]}>{children}</View>;
}
export function Box({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useApp();
  return <View style={[{ padding: 16, backgroundColor: c.surface, borderRadius: 24, gap: 12 }, style]}>{children}</View>;
}
export const Cap = ({ children }: { children: string }) => { const { c } = useApp(); return <T w={600} size={13} color={c.muted}>{children}</T>; };

export const shadow = (o: number, color = "#000") => ({ shadowColor: color, shadowOpacity: o, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: Math.round(o * 20) });

/** The picture for an exercise or a recovering muscle: a close-up of that muscle on the figure. */
export function MuscleDot({ region, size = 56, radius, levels, color, bg }: { region: Region | undefined; size?: number; radius?: number; levels?: Partial<Record<Muscle, number>>; color?: string; bg?: string }) {
  const { c, theme } = useApp();
  return <Thumb region={region} theme={theme} size={size} radius={radius ?? Math.round(size * 0.29)} bg={bg ?? c.bg} paint={levels ?? color} />;
}

// ---------- icons (24 × 24, 2 px round strokes) ----------

const Ico = ({ size = 20, color, children, fill }: { size?: number; color: string; children: ReactNode; fill?: boolean }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? color : "none"} stroke={fill ? "none" : color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{children}</Svg>
);
export const Clock = ({ size, color }: { size?: number; color: string }) => <Ico size={size} color={color}><Circle cx={12} cy={12} r={8.5} /><Path d="M12 7.5V12l3 2" /></Ico>;
export const ListIcon = ({ size, color }: { size?: number; color: string }) => <Ico size={size} color={color}><Path d="M9.5 6.5H20M9.5 12H20M9.5 17.5H20" /><Circle cx={4.75} cy={6.5} r={0.6} /><Circle cx={4.75} cy={12} r={0.6} /><Circle cx={4.75} cy={17.5} r={0.6} /></Ico>;
export const Layers = ({ size, color }: { size?: number; color: string }) => <Ico size={size} color={color}><Path d="M12 3.5l8.5 4.25L12 12 3.5 7.75z" /><Path d="M3.5 12.25 12 16.5l8.5-4.25" /><Path d="M3.5 16.25 12 20.5l8.5-4.25" /></Ico>;
export const Chevron = ({ size = 16, color, rot = 0 }: { size?: number; color: string; rot?: number }) => <View style={{ transform: [{ rotate: `${rot}deg` }] }}><Ico size={size} color={color}><Path d="M9 6l6 6-6 6" /></Ico></View>;
export const Check = ({ size = 16, color }: { size?: number; color: string }) => <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><Path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const Play = ({ size = 18, color }: { size?: number; color: string }) => <Ico size={size} color={color} fill><Path d="M8 4.5v15l12-7.5z" /></Ico>;
export const Pause = ({ size = 22, color }: { size?: number; color: string }) => <Ico size={size} color={color} fill><Rect x={6} y={5} width={4.5} height={14} rx={1.5} /><Rect x={13.5} y={5} width={4.5} height={14} rx={1.5} /></Ico>;
export const Close = ({ size = 22, color }: { size?: number; color: string }) => <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round"><Path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const ThumbUp = ({ size = 20, color }: { size?: number; color: string }) => <Ico size={size} color={color}><Path d="M7 10v12" /><Path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" /></Ico>;
export const ThumbDown = ({ size = 20, color }: { size?: number; color: string }) => <Ico size={size} color={color}><Path d="M17 14V2" /><Path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" /></Ico>;
export const More = ({ size = 20, color }: { size?: number; color: string }) => <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}><Circle cx={5} cy={12} r={1.8} /><Circle cx={12} cy={12} r={1.8} /><Circle cx={19} cy={12} r={1.8} /></Svg>;
export const Swap = ({ size = 18, color }: { size?: number; color: string }) => <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><Path d="M4 8h13l-3-3M20 16H7l3 3" /></Svg>;
export const Arrow = ({ size = 22, color }: { size?: number; color: string }) => <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><Path d="M5 12h14M13 6l6 6-6 6" /></Svg>;
export function IntensityIcon({ level, size = 18, color }: { level: "easy" | "normal" | "hard"; size?: number; color: string }) {
  const n = { easy: 1, normal: 2, hard: 3 }[level];
  return <Svg width={size} height={size} viewBox="0 0 24 24">{[[3.5, 14, 6], [10, 9.5, 10.5], [16.5, 4.5, 15.5]].map(([x, y, h], i) => <Rect key={i} x={x} y={y} width={4} height={h} rx={1.6} fill={color} opacity={i < n ? 1 : 0.28} />)}</Svg>;
}

export const EQUIP_NAMES: Record<Equipment, string> = { dumbbell: "Dumbbells", bench: "Bench", resistance_band: "Band", pullup_bar: "Pull-up bar", table: "Table", chair: "Chair" };
const GLYPHS: Record<Equipment | "bodyweight", (color: string) => ReactNode> = {
  bodyweight: (k) => <><Circle cx={12} cy={4} r={2.4} fill={k} /><Path fill="none" stroke={k} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" d="M12 8.2v6.3M12 9.6 6.2 6M12 9.6 17.8 6M12 14.5l-4.6 6.2M12 14.5l4.6 6.2" /></>,
  dumbbell: (k) => <><Rect x={7} y={10.9} width={10} height={2.2} rx={1.1} fill={k} /><Rect x={4.4} y={6.8} width={3.4} height={10.4} rx={1.3} fill={k} /><Rect x={16.2} y={6.8} width={3.4} height={10.4} rx={1.3} fill={k} /><Rect x={2} y={9.3} width={2.8} height={5.4} rx={1.1} fill={k} /><Rect x={19.2} y={9.3} width={2.8} height={5.4} rx={1.1} fill={k} /></>,
  bench: (k) => <><Rect x={3} y={8.2} width={18} height={3.6} rx={1.8} fill={k} /><Rect x={5.6} y={11} width={2.3} height={6.8} rx={1} fill={k} /><Rect x={16.1} y={11} width={2.3} height={6.8} rx={1} fill={k} /><Rect x={4} y={16.6} width={5.5} height={2.2} rx={1.1} fill={k} /><Rect x={14.5} y={16.6} width={5.5} height={2.2} rx={1.1} fill={k} /></>,
  resistance_band: (k) => <Path fill={k} fillRule="evenodd" transform="rotate(-24 12 12)" d="M3 12a9 5.6 0 1 0 18 0a9 5.6 0 1 0-18 0zM6.9 12a5.1 2.4 0 1 0 10.2 0a5.1 2.4 0 1 0-10.2 0z" />,
  pullup_bar: (k) => <><Rect x={3} y={5.6} width={18} height={2.4} rx={1.2} fill={k} /><Rect x={2.6} y={3.2} width={2.4} height={7.6} rx={1.2} fill={k} /><Rect x={19} y={3.2} width={2.4} height={7.6} rx={1.2} fill={k} /><Rect x={8} y={7.4} width={2.2} height={5.2} rx={1.1} fill={k} /><Rect x={13.8} y={7.4} width={2.2} height={5.2} rx={1.1} fill={k} /></>,
  table: (k) => <><Rect x={2.5} y={6.8} width={19} height={3.2} rx={1.4} fill={k} /><Rect x={4.6} y={9} width={2.4} height={11} rx={1.1} fill={k} /><Rect x={17} y={9} width={2.4} height={11} rx={1.1} fill={k} /><Rect x={5} y={13.6} width={14} height={1.8} rx={0.9} fill={k} /></>,
  chair: (k) => <><Rect x={6} y={2.8} width={2.5} height={18.4} rx={1.25} fill={k} /><Rect x={6} y={11.4} width={12} height={2.8} rx={1.3} fill={k} /><Rect x={15.5} y={12} width={2.5} height={9.2} rx={1.25} fill={k} /><Rect x={6} y={4} width={6.5} height={2.2} rx={1.1} fill={k} /><Rect x={6} y={7.6} width={6.5} height={2.2} rx={1.1} fill={k} /></>,
};
/** One equipment avatar: a solid ink picture on a grey disc. `ring` cuts it out of what sits behind it in a stack. */
export function EquipAvatar({ item, size = 32, ring }: { item: Equipment | "bodyweight"; size?: number; ring?: string }) {
  const { c } = useApp();
  const g = Math.round(size * 0.66);
  return (
    <View style={{ width: size, height: size, borderRadius: 999, backgroundColor: c.avatar, alignItems: "center", justifyContent: "center", borderWidth: ring ? 2 : 0, borderColor: ring }}>
      <Svg width={g} height={g} viewBox="0 0 24 24">{GLYPHS[item](c.ink)}</Svg>
    </View>
  );
}
/** Overlapping avatars, `max` at most, the last one then a count ("+4"). */
export function EquipStack({ items, ring, size = 30, max = 3, body }: { items: readonly Equipment[]; ring: string; size?: number; max?: number; body?: boolean }) {
  const { c } = useApp();
  const all: (Equipment | "bodyweight")[] = body || !items.length ? ["bodyweight", ...items] : [...items];
  const shown = all.length > max ? all.slice(0, max - 1) : all;
  const more = all.length - shown.length;
  const overlap = Math.round(size * 0.42);
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {shown.map((e, i) => <View key={e} style={{ marginLeft: i ? -overlap : 0, zIndex: 10 - i }}><EquipAvatar item={e} size={size} ring={ring} /></View>)}
      {more > 0 && <View style={{ marginLeft: -overlap, width: size, height: size, borderRadius: 999, backgroundColor: c.track, borderWidth: 2, borderColor: ring, alignItems: "center", justifyContent: "center" }}><T w={700} size={Math.round(size * 0.4)}>+{more}</T></View>}
    </View>
  );
}
