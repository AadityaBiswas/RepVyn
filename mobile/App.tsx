// RepVyn on the phone: the four tabs, then pages and the workout pushed over them.
import { StatusBar } from "expo-status-bar";
import { Activity, memo, useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, View, useWindowDimensions } from "react-native";
import { pageX, spring, still, tween } from "./src/motion";
import { SafeAreaProvider } from "react-native-safe-area-context";
// Only the weights the app uses, each from its own module, so the other twelve font files stay out of the app.
import { useFonts } from "expo-font";
import { Geist_400Regular } from "@expo-google-fonts/geist/400Regular";
import { Geist_500Medium } from "@expo-google-fonts/geist/500Medium";
import { Geist_600SemiBold } from "@expo-google-fonts/geist/600SemiBold";
import { Geist_700Bold } from "@expo-google-fonts/geist/700Bold";
import { Geist_800ExtraBold } from "@expo-google-fonts/geist/800ExtraBold";
import { GeistMono_600SemiBold } from "@expo-google-fonts/geist-mono/600SemiBold";
import { AppProvider, useApp, useRun, useTab } from "./src/app";
import { Onboard, Programs } from "./src/screens/onboard";
import { DoneDay, Setup, Sore } from "./src/screens/pages";
import { Account } from "./src/screens/account";
import { Today } from "./src/screens/today";
import { Body, Progress, Profile } from "./src/screens/tabs";
import { Nav } from "./src/nav";
import { Workout } from "./src/screens/workout";

function Root() {
  const app = useApp();
  const { ui, c, theme } = app;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      {app.s.profile !== null && (
        <Under>
          <Tabs />
          <Nav />
        </Under>
      )}
      {ui.page === "setup" && <Setup />}
      {ui.page === "done" && <DoneDay />}
      {ui.page === "sore" && <Sore />}
      {ui.page === "programs" && <Programs />}
      {ui.page === "onboard" && <Onboard />}
      {ui.page === "account" && <Account />}
      <WorkoutLayer />
    </View>
  );
}

// Memoised, so a redraw of the root (a tab switch, a page opening) does not redraw the tabs; they follow the app state alone.
const TodayTab = memo(Today), BodyTab = memo(Body), ProgressTab = memo(Progress), ProfileTab = memo(Profile);

function Tabs() {
  const tab = useTab();
  return (
    <>
      <Pane on={tab === "today"}><TodayTab /></Pane>
      <Pane on={tab === "body"}><BodyTab /></Pane>
      <Pane on={tab === "progress"}><ProgressTab /></Pane>
      <Pane on={tab === "profile"}><ProfileTab /></Pane>
    </>
  );
}

/**
 * One tab. Every tab stays mounted: a hidden one is kept by <Activity>, which pauses it and builds its updates in the
 * background at low priority, so switching tabs only reveals one (a 200 ms fade, no movement) and never builds a screen
 * while the tab bar is moving.
 */
function Pane({ on, children }: { on: boolean; children: React.ReactNode }) {
  const o = useRef(new Animated.Value(on ? 1 : 0)).current;
  const [fading, setFading] = useState(false);
  useEffect(() => {
    if (!on) return;
    o.setValue(still() ? 1 : 0);
    setFading(true);
    tween(o, 1, 200).start(() => setFading(false));
  }, [on]);
  return (
    <Activity mode={on ? "visible" : "hidden"}>
      <Animated.View needsOffscreenAlphaCompositing={fading} renderToHardwareTextureAndroid={fading} style={[StyleSheet.absoluteFill, { opacity: o }]}>{children}</Animated.View>
    </Activity>
  );
}

/** The tabs under a pushed page: they slide back a little and dim with it, following the page's own position (pageX),
 * so a swipe back drags them along 1:1. */
function Under({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const k = pageX.interpolate({ inputRange: [0, width], outputRange: [1, 0], extrapolate: "clamp" });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: k.interpolate({ inputRange: [0, 1], outputRange: [1, still() ? 1 : 0.55] }), transform: [{ translateX: k.interpolate({ inputRange: [0, 1], outputRange: [0, still() ? 0 : -0.28 * width] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** The only part that reads the running workout, so its tick redraws this and nothing else. */
function WorkoutLayer() {
  const { ui } = useApp();
  const run = useRun();
  if (!run) return null;
  return <Rise out={ui.sheetOut}>{run.phase === "done" && <StatusBar style="light" />}<Workout run={run} /></Rise>;
}

/** The workout sheet: up from the bottom, and back down when it closes. */
function Rise({ out, children }: { out: boolean; children: React.ReactNode }) {
  const { height } = useWindowDimensions();
  const y = useRef(new Animated.Value(still() ? 0 : height)).current;
  useEffect(() => { spring(y, out ? height : 0).start(); }, [out]);
  return <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 8, transform: [{ translateY: y }] }]}>{children}</Animated.View>;
}

export default function App() {
  const [fonts] = useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold, Geist_800ExtraBold, GeistMono_600SemiBold });
  return (
    <SafeAreaProvider>
      <AppProvider>{(ready) => (ready && fonts ? <Root /> : <View style={{ flex: 1, backgroundColor: "#F2F2F7" }} />)}</AppProvider>
    </SafeAreaProvider>
  );
}
