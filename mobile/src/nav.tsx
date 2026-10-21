// The floating tab bar. The chosen tab widens to show its name, the others slide
// aside, and the dark pill glides under it. Everything that moves is a transform or an opacity, so on the phone it runs on
// the native driver and never waits for JavaScript: tab positions are worked out from the chosen index, the icon and its
// name slide to the tab's centre, and the touch targets (invisible) simply take their new widths.
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { useApp, useTab, type Tab } from "./app";
import { T, shadow, tick } from "./kit";
import { Enter, LIVELY, NAV_ICON, SMOOTH, SNAP, spring } from "./motion";

const ICONS: Record<Tab, React.ReactNode> = {
  today: <Path d="M7 7v10M17 7v10M3.5 9.5v5M20.5 9.5v5M7 12h10" />,
  body: <><Circle cx={12} cy={5} r={2.2} /><Path d="M6 9.5c2 .8 4 1.2 6 1.2s4-.4 6-1.2M12 10.7V15M12 15l-3 5.5M12 15l3 5.5" /></>,
  progress: <><Path d="M4 19.5h16M6.5 15l3.5-4 3 2.5L17.5 7" /><Path d="M14 7h3.5v3.5" /></>,
  profile: <><Circle cx={12} cy={8.5} r={3.5} /><Path d="M5 19.5c1.2-3.2 3.8-4.8 7-4.8s5.8 1.6 7 4.8" /></>,
};
const TABS: [Tab, string][] = [["today", "Today"], ["body", "Body"], ["progress", "Progress"], ["profile", "Profile"]];
const PAD = 6, GAP = 2, SMALL = 56, H = 52;
/** The bar is 332 wide, or the screen less its gutters on a narrow phone; the chosen tab takes what the others leave. */
const barOf = (screen: number) => Math.min(332, screen - 32);
const wideOf = (bar: number) => bar - 2 * PAD - 3 * GAP - 3 * SMALL;
/** Where tab `i` starts, and how wide it is, when tab `at` is chosen. */
const leftOf = (i: number, at: number, wide: number) => PAD + i * (SMALL + GAP) + (i > at ? wide - SMALL : 0);
const widthOf = (i: number, at: number, wide: number) => (i === at ? wide : SMALL);
const ICON = 22, LABEL_GAP = 8;

function Icon({ k, ink }: { k: Tab; ink: string }) {
  return <Svg width={ICON} height={ICON} viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{ICONS[k]}</Svg>;
}

function TabButton({ k, label, i, at, wide, pick }: { k: Tab; label: string; i: number; at: number; wide: number; pick: () => void }) {
  const { c } = useApp();
  const on = i === at;
  const centre = leftOf(i, at, wide) + widthOf(i, at, wide) / 2;
  const cx = useRef(new Animated.Value(centre)).current;
  const p = useRef(new Animated.Value(on ? 1 : 0)).current;
  const [labelW, setLabelW] = useState(0);
  useEffect(() => {
    spring(cx, centre, SMOOTH).start();
    spring(p, on ? 1 : 0, on ? SMOOTH : SNAP).start();
  }, [at, wide]);
  // The icon sits left of the centre by half the name beside it, so icon and name together are centred.
  const x = Animated.subtract(cx, Animated.add(ICON / 2, Animated.multiply(p, (labelW + LABEL_GAP) / 2)));
  return (
    <>
      <Animated.View pointerEvents="none" style={{ position: "absolute", left: 0, top: PAD, height: H, flexDirection: "row", alignItems: "center", transform: [{ translateX: x }] }}>
        <View style={{ width: ICON, height: ICON }}>
          <Animated.View style={{ position: "absolute", opacity: p.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }}><Icon k={k} ink={c.navInk} /></Animated.View>
          <Animated.View style={{ position: "absolute", opacity: p }}>
            <Enter key={on ? "on" : "off"} from={on ? NAV_ICON : {}} cfg={LIVELY}><Icon k={k} ink={c.navOnInk} /></Enter>
          </Animated.View>
        </View>
        <Animated.View onLayout={(e) => setLabelW(e.nativeEvent.layout.width)}
          style={{ marginLeft: LABEL_GAP, opacity: p, transform: [{ translateX: p.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] }}>
          <T w={600} color={c.navOnInk} lines={1} maxScale={1.3}>{label}</T>
        </Animated.View>
      </Animated.View>
      <Pressable onPress={pick} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: on }}
        style={{ position: "absolute", left: leftOf(i, at, wide), top: PAD, width: widthOf(i, at, wide), height: H, borderRadius: 999 }} />
    </>
  );
}

export function Nav() {
  const app = useApp();
  const { c, ui } = app;
  const ins = useSafeAreaInsets();
  const tab = useTab();
  const at = TABS.findIndex(([k]) => k === tab);
  const { width } = useWindowDimensions();
  const bar = barOf(width), wide = wideOf(bar);
  const pill = useRef(new Animated.Value(leftOf(at, at, wide))).current;
  useEffect(() => { spring(pill, leftOf(at, at, wide), SMOOTH).start(); }, [at, wide]);
  return (
    <View style={{ position: "absolute", zIndex: 3, bottom: Math.max(28, ins.bottom + 12), left: 0, right: 0, alignItems: "center" }} pointerEvents="box-none">
      <View accessibilityRole="tablist" style={{ width: bar, height: H + 2 * PAD, borderRadius: 999, backgroundColor: c.nav, ...shadow(0.18) }}>
        <Animated.View pointerEvents="none" style={{ position: "absolute", top: PAD, left: 0, width: wide, height: H, borderRadius: 999, backgroundColor: c.navOn, transform: [{ translateX: pill }], ...shadow(0.25) }} />
        {TABS.map(([k, label], i) => (
          <TabButton key={k} k={k} label={label} i={i} at={at} wide={wide} pick={() => { if (tab === k) return; tick(); app.set(ui.edit ? { tab: k, edit: null } : { tab: k }); }} />
        ))}
      </View>
    </View>
  );
}
