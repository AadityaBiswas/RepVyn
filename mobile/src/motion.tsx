// In-app motion, on React Native's Animated.
// Springs are described the way Apple describes them (damping ratio + response in seconds) and converted once here.
// Every move is a spring that starts from the current on-screen value, so anything can be interrupted and turned round.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

export const native = Platform.OS !== "web";

/** Apple's two spring knobs: damping ratio (1 = no overshoot) and response (seconds to get there). */
const apple = (damping: number, response: number) => {
  const stiffness = (2 * Math.PI / response) ** 2;
  return { stiffness, damping: 4 * Math.PI * damping / response, mass: 1 };
};
type Spring = ReturnType<typeof apple>;
/** Arrives and stops: pages, sheets, panels, pills. */
export const SMOOTH = apple(1, 0.4);
/** Quick and settled: controls following a finger, small state changes. */
export const SNAP = apple(1, 0.26);
/** A sheet carried by a throw: a hint of overshoot, only after a gesture with momentum. */
export const THROWN = apple(0.86, 0.34);
/** Something the user just earned: a little overshoot. */
export const LIVELY = apple(0.74, 0.4);
/** Press feedback: in on touch-down, back on release. */
const PRESS = apple(1, 0.16);
const OUT = Easing.bezier(0.16, 1, 0.3, 1);

let reduced = false;
void AccessibilityInfo.isReduceMotionEnabled?.().then((r) => { reduced = r; }).catch(() => {});
AccessibilityInfo.addEventListener?.("reduceMotionChanged", (r) => { reduced = r; });
export const still = () => reduced;

export const spring = (v: Animated.Value, to: number, cfg: Spring = SMOOTH, delay = 0, velocity = 0) =>
  Animated.spring(v, { toValue: to, ...cfg, velocity, delay, useNativeDriver: native, restDisplacementThreshold: 0.01, restSpeedThreshold: 0.01 });
export const tween = (v: Animated.Value, to: number, ms: number, delay = 0, easing = OUT) =>
  Animated.timing(v, { toValue: to, duration: ms, delay, easing, useNativeDriver: native });

/** Where a flick would come to rest (Apple's projection, the scroll-deceleration curve). `v` in px/s. */
export const project = (v: number, rate = 0.998) => (v / 1000) * rate / (1 - rate);
/** Progressive resistance past a boundary instead of a hard stop. */
export const rubberband = (over: number, size: number, c = 0.55) => (over * size * c) / (size + c * Math.abs(over));

/** The pushed page's offset, in px from resting (0) to off screen on the right (screen width). The page under it reads it too. */
export const pageX = new Animated.Value(10_000);

/** Where an entering element starts; it moves to rest (opacity 1, no offset, scale 1). */
export interface From { opacity?: number; x?: number; y?: number; scale?: number }
export const FADE: From = { opacity: 0 };
/** An options panel dropping from the control that opened it. */
export const POP: From = { opacity: 0, y: -8, scale: 0.98 };
/** The workout panel rising for a new set. */
export const LIFT: From = { opacity: 0, y: 16 };
export const TIMER: From = { opacity: 0, scale: 0.88 };
export const SWAP: From = { opacity: 0, scale: 0.97 };
export const UP: From = { opacity: 0, y: 18 };
export const FIG: From = { opacity: 0, scale: 0.92 };
export const BADGE: From = { opacity: 0, scale: 0.6 };
export const PULSE: From = { scale: 1.18 };
/** A list row arriving: it slides in from the right. */
export const ROW: From = { opacity: 0, x: 20 };
export const NAV_ICON: From = { scale: 0.86 };

/**
 * Plays an enter move once, when it mounts (a new `key` plays it again). A spring by default; `ms` makes it an eased tween.
 * With reduced motion it only fades, and only if it was going to fade anyway.
 */
export function Enter({ from, delay = 0, cfg = SMOOTH, ms, style, children, pointerEvents }: { from: From; delay?: number; cfg?: Spring; ms?: number; style?: StyleProp<ViewStyle>; children: ReactNode; pointerEvents?: "box-none" | "none" | "auto" }) {
  const quiet = still();
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = quiet ? tween(p, 1, from.opacity !== undefined ? 200 : 0, 0) : ms ? tween(p, 1, ms, delay) : spring(p, 1, cfg, delay);
    a.start();
    return () => a.stop();
  }, []);
  const lerp = (a: number) => p.interpolate({ inputRange: [0, 1], outputRange: [a, 1], extrapolate: "clamp" });
  const move = (a: number) => p.interpolate({ inputRange: [0, 1], outputRange: [a, 0] });
  const grow = (a: number) => p.interpolate({ inputRange: [0, 1], outputRange: [a, 1] });
  const t: object[] = [];
  if (!quiet) {
    if (from.x !== undefined) t.push({ translateX: move(from.x) });
    if (from.y !== undefined) t.push({ translateY: move(from.y) });
    if (from.scale !== undefined) t.push({ scale: grow(from.scale) });
  }
  return (
    <Animated.View pointerEvents={pointerEvents} style={[style, { opacity: from.opacity !== undefined ? lerp(from.opacity) : 1, transform: t as never }]}>
      {children}
    </Animated.View>
  );
}

/**
 * A pressable that answers on touch-down: it settles in to `scale` the instant a finger lands and springs back on release,
 * so feedback never waits for the tap to finish. Use it for every tappable surface.
 */
export function Press({ scale = 0.97, style, children, onPressIn, onPressOut, accessibilityRole = "button", hitSlop = 4, ...rest }: Omit<PressableProps, "style" | "children"> & { scale?: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const s = useRef(new Animated.Value(1)).current;
  const to = (v: number) => Animated.spring(s, { toValue: v, ...PRESS, useNativeDriver: native }).start();
  return (
    <APressable {...rest} accessibilityRole={accessibilityRole} hitSlop={hitSlop} unstable_pressDelay={0}
      onPressIn={(e: GestureResponderEvent) => { if (!rest.disabled && !still()) to(scale); onPressIn?.(e); }}
      onPressOut={(e: GestureResponderEvent) => { to(1); onPressOut?.(e); }}
      style={[style, { transform: [{ scale: s }] }]}>
      {children}
    </APressable>
  );
}
const APressable = Animated.createAnimatedComponent(Pressable);

/** A value that has just changed rolls in from the side it moved towards: up when it grew, down when it shrank. */
export function Roll({ value, children }: { value: number | string; children: ReactNode }) {
  const was = useRef(value);
  const moved = was.current !== value;
  const up = typeof value === "number" && typeof was.current === "number" ? value >= was.current : true;
  useEffect(() => { was.current = value; });
  return moved ? <Enter key={String(value)} from={{ opacity: 0, y: up ? 14 : -14 }} cfg={SNAP}>{children}</Enter> : <>{children}</>;
}

/** 0 to 1 over `ms` after `delay`, as state, for numbers that count up. Eased out, so the count slows as it lands. */
export function useRamp(ms: number, delay: number): number {
  const [k, setK] = useState(still() ? 1 : 0);
  useEffect(() => {
    if (still()) return;
    const v = new Animated.Value(0);
    // 30 steps, not one per frame: the count still reads as smooth, and the screen redraws 30 times instead of ~70.
    const id = v.addListener(({ value }) => setK((k) => { const q = Math.round(value * 30) / 30; return q === k ? k : q; }));
    const a = Animated.timing(v, { toValue: 1, duration: ms, delay, easing: OUT, useNativeDriver: false });
    a.start();
    return () => { a.stop(); v.removeListener(id); };
  }, []);
  return k;
}

/** False until a page pushed with it has slid in (SMOOTH's response), so heavy pictures do not cost the slide's frames. */
export function useSettled(ms = 400): boolean {
  const [ok, setOk] = useState(still());
  useEffect(() => {
    if (ok) return;
    const t = setTimeout(() => setOk(true), ms);
    return () => clearTimeout(t);
  }, []);
  return ok;
}

/** Holds its space at `height` and fades its picture in once the page has settled. */
export function Later({ height, children }: { height: number; children: ReactNode }) {
  const ok = useSettled();
  return <Animated.View style={{ height }}>{ok && <Enter from={SWAP} ms={260}>{children}</Enter>}</Animated.View>;
}
