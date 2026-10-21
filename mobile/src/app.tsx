// The app shell: state, pushed pages, the workout sheet, and every action the screens call.
// Sign-in and sync are in cloud.ts, reminders in reminders.ts; no Pro gating or telemetry yet.
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, BackHandler, Dimensions, useColorScheme } from "react-native";
import { predictiveBack } from "../modules/predictive-back";
import { THROWN, pageX, spring } from "./motion";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ownedWeights, type EngineState, type Plan, type Region } from "../../src/engine";
import { dayStart, makePlan, PROGRAM_ID, type LevelAsk, type PlanChoice } from "../../shared/model";
import { append, engineState, fresh, parse, setFeedback, STORE_KEY, withProfile, type Saved, type Settings } from "../../shared/store";
import { isEmpty, outbox, stampDoc } from "../../shared/syncCore";
import { attach, requestSync } from "./cloud";
import * as W from "../../shared/workout";
import { THEMES, type Colors, type ThemeName } from "./theme";
import { tap, thud } from "./haptics";
import { scheduleReminders } from "./reminders";

export type Page = null | "setup" | "done" | "programs" | "onboard" | "sore" | "account";
export type Feel = "fresh" | "normal" | "beat_up";
export type Tab = "today" | "body" | "progress" | "profile";
export interface Ui {
  /** The open Profile row. */
  edit: string | null;
  page: Page;
  /** The program page shown as the last step of first-run set-up. */
  first: boolean;
  open: null | "duration" | "intensity" | "equip";
  ob: number;
  row: string | null;
  feel: Feel | null;
  sore: Region[];
  choice: PlanChoice;
  planAt: number;
  day: number;
  lv: Partial<Record<LevelAsk, number>>;
  /** The pushed page is sliding away (it is removed once it has gone). */
  leaving: boolean;
  /** The workout sheet is sliding down. */
  sheetOut: boolean;
  /** A workout was just saved: Today's capsule fills. */
  justFinished: boolean;
}

/** Pass `tab` to set() to change the tab; it lives in its own context (useTab). */
type UiPatch = Partial<Ui> & { tab?: Tab };

export interface App {
  s: EngineState;
  saved: Saved;
  ui: Ui;
  now: number;
  theme: ThemeName;
  c: Colors;
  todayPlan: Plan;
  setupPlan: Plan;
  owned: number[];
  set: (p: UiPatch) => void;
  settings: (p: Partial<Settings>) => void;
  choose: (p: Partial<PlanChoice>) => void;
  feedback: (exerciseId: string, liked: boolean | null) => void;
  swap: (exerciseId: string) => void;
  checkin: (sore: Region[]) => void;
  openSore: () => void;
  openSetup: () => void;
  openDone: (day: number) => void;
  openPrograms: () => void;
  openAccount: () => void;
  afterSignIn: () => void;
  back: () => void;
  /** The page is already off screen (swiped away): drop it now. */
  gone: () => void;
  startProgram: () => void;
  finishOnboarding: () => void;
  startWorkout: () => void;
  patchRun: (p: Partial<W.Run>) => void;
  setDone: () => void;
  answer: (label: string) => void;
  skipRest: () => void;
  endWorkout: () => void;
  finishWorkout: () => void;
}

/** A page is taken away once its spring has carried it off screen. */
export const PAGE_MS = 420;

const Ctx = createContext<App | null>(null);
export const useApp = (): App => useContext(Ctx)!;
/** The workout in progress. Its own context, so the once-a-second tick redraws the workout and nothing under it. */
/** The chosen tab. Its own context too: a tab switch then changes nothing the screens read, so revealing a kept tab costs nothing. */
const TabCtx = createContext<Tab>("today");
export const useTab = (): Tab => useContext(TabCtx);
const RunCtx = createContext<W.Run | null>(null);
export const useRun = (): W.Run | null => useContext(RunCtx);

const REST_PLAN: Omit<Plan, "program"> = { kind: "rest", template: null, exercises: [], skippedRegions: [], deloadActive: false, calibrating: true, estMinutes: 0, reasons: [], focus: null, short: null } as never;

/** A workout in progress, kept on the phone as it runs, with the wall-clock time its clock last caught up to. */
const RUN_KEY = `${STORE_KEY}-run`;
interface KeptRun { run: W.Run; clock: number }
/** The clock catches up at most this far after the app was away (a phone left on the bench overnight ends the rest, not the day). */
const MAX_CATCH_UP_S = 4 * 3600;

/** Reads the saved log and any workout in progress once, then renders the app. Null until storage answers (a frame or two). */
export function AppProvider({ children }: { children: (ready: boolean) => React.ReactNode }) {
  const [boot, setBoot] = useState<{ saved: Saved; kept: KeptRun | null } | null>(null);
  useEffect(() => {
    const read = (k: string) => AsyncStorage.getItem(k).catch(() => null);
    void Promise.all([read(STORE_KEY), read(RUN_KEY)]).then(([raw, rawRun]) => {
      let kept: KeptRun | null = null;
      try { const k = JSON.parse(rawRun ?? "null") as KeptRun | null; if (k?.run?.exercises?.length) kept = k; } catch { /* a damaged copy is dropped */ }
      setBoot({ saved: parse(raw, Date.now()), kept });
    });
  }, []);
  if (!boot) return <>{children(false)}</>;
  return <Loaded initial={boot.saved} kept={boot.kept}>{children(true)}</Loaded>;
}

function Loaded({ initial, kept, children }: { initial: Saved; kept: KeptRun | null; children: React.ReactNode }) {
  const [saved, setSaved] = useState(initial);
  const [ui, setUi] = useState<Ui>(() => ({
    edit: null, page: initial.onboarded ? null : "onboard", first: !initial.onboarded, open: null, ob: 0, row: null, feel: null, sore: [],
    choice: { minutes: initial.settings.minutes, intensity: "normal", equipment: initial.settings.equipment }, planAt: Date.now(), day: 0, lv: {}, leaving: false, sheetOut: false, justFinished: false,
  }));
  const scheme = useColorScheme();
  const [now, setNow] = useState(Date.now());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flash = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Re-read the clock when the app comes back to the front, and check it once a minute; it only moves (re-planning and
  // redrawing everything) when the hour turns, since nothing shown is finer than an hour.
  useEffect(() => {
    const hour = (x: number) => { const d = new Date(x); return `${d.toDateString()} ${d.getHours()}`; };
    const id = setInterval(() => {
      const t = Date.now();
      setNow((n) => (hour(t) === hour(n) ? n : t));
    }, 60_000);
    const sub = AppState.addEventListener("change", (st) => st === "active" && setNow(Date.now()));
    return () => { clearInterval(id); sub.remove(); };
  }, []);

  // Every change builds on the one before it, even two in one render.
  const latest = useRef(saved);
  const commit = (f: (x: Saved) => Saved) => {
    const x = latest.current;
    const y = stampDoc(x, f(x), Date.now());
    if (y === x) return;
    latest.current = y;
    setSaved(y);
    void AsyncStorage.setItem(STORE_KEY, JSON.stringify(y)).catch(() => {});
    // Only for something to upload: a sync's own bookkeeping must not schedule the next one.
    if (!isEmpty(outbox(y))) requestSync();
  };
  const [tab, setTab] = useState<Tab>("today");
  const set = ({ tab: t, ...p }: UiPatch) => {
    if (t) setTab(t);
    if (Object.keys(p).length) setUi((u) => ({ ...u, ...p }));
  };
  const [run, setRun] = useState<W.Run | null>(kept?.run ?? null);
  const runRef = useRef(run);
  runRef.current = run;
  // Log out and account deletion clear the phone back to first-run set-up.
  useEffect(() => attach({
    get: () => latest.current,
    commit,
    reset: () => {
      const x = fresh(Date.now());
      latest.current = x;
      setSaved(x);
      void AsyncStorage.setItem(STORE_KEY, JSON.stringify(x)).catch(() => {});
      setRun(null);
      setTab("today");
      setUi((u) => ({ ...u, page: "onboard", first: true, ob: 0, edit: null, open: null, row: null, leaving: false }));
    },
  }), []);
  /** Wall-clock time the workout clock has counted up to. */
  const clock = useRef(kept?.clock ?? Date.now());
  const s = engineState(saved);
  const st = saved.settings;
  const theme: ThemeName = st.look === "system" ? (scheme === "dark" ? "dark" : "light") : st.look;
  const owned = useMemo(() => ownedWeights(s.profile), [s.profile]);

  const hasProfile = s.profile !== null;
  const planOrRest = (at: number, ch: PlanChoice): Plan => (hasProfile ? makePlan(s, at, ch) : ({ ...REST_PLAN, program: st.programId } as Plan));
  const todayPlan = useMemo(() => planOrRest(now, { minutes: st.minutes, intensity: "normal", equipment: st.equipment }), [saved.events, now]);
  const setupPlan = useMemo(() => planOrRest(ui.planAt, ui.choice), [saved.events, ui.planAt, ui.choice]);

  // The workout clock counts real seconds from the wall clock, not timer callbacks: Android pauses timers while the phone is
  // locked or the app is in the background, so on return it catches up every second that passed (rest ending, holds running out).
  const running = !!run && run.phase !== "done";
  useEffect(() => {
    if (!running) return;
    const catchUp = () => {
      const due = Math.min(MAX_CATCH_UP_S, Math.floor((Date.now() - clock.current) / 1000));
      if (due <= 0) return;
      clock.current += due * 1000;
      setRun((r) => {
        let x = r;
        for (let i = 0; i < due && x && x.phase !== "done"; i++) x = W.tick(x);
        return x;
      });
    };
    catchUp();
    const id = setInterval(catchUp, 250);
    const sub = AppState.addEventListener("change", (st) => st === "active" && catchUp());
    return () => { clearInterval(id); sub.remove(); };
  }, [running]);
  // Kept on the phone as it runs, so a workout survives Android closing the app; cleared once it is saved or ended.
  useEffect(() => {
    if (run) void AsyncStorage.setItem(RUN_KEY, JSON.stringify({ run, clock: clock.current } satisfies KeptRun)).catch(() => {});
    else void AsyncStorage.removeItem(RUN_KEY).catch(() => {});
  }, [run]);
  // Reminders are rescheduled when the time changes, today gets trained, or a new day starts.
  const today = dayStart(now);
  const trainedToday = s.sessions.some((x) => x.lastTs >= today && x.log.length > 0);
  useEffect(() => { if (saved.onboarded) scheduleReminders(st.remind, trainedToday); }, [saved.onboarded, st.remind, trainedToday, today]);

  const push = (page: Page, extra: UiPatch = {}) => { clearTimeout(timer.current); set({ page, open: null, leaving: false, ...extra }); };
  /** The page slides away, then goes. */
  const leave = (extra: UiPatch = {}) => {
    if (!ui.page || ui.leaving) return;
    set({ leaving: true, ...extra });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => set({ page: null, leaving: false }), PAGE_MS);
  };
  /** The workout sheet slides down, then goes. */
  const closeSheet = (extra: UiPatch = {}) => {
    set({ sheetOut: true });
    setTimeout(() => { setRun(null); set({ sheetOut: false, ...extra }); }, PAGE_MS);
  };
  // The engine plans from the last profile event, so settings arriving from another device (a sync) become one too.
  useEffect(() => { if (saved.onboarded) commit((x) => withProfile(x, Date.now())); }, [saved.settings]);
  const settings = (p: Partial<Settings>) => commit((x) => withProfile({ ...x, settings: { ...x.settings, ...p } }, Date.now()));
  const patchRun = (p: Partial<W.Run>) => setRun((r) => (r ? { ...r, ...p } : r));
  const logRun = (run: W.Run) => {
    const evs = W.toEvents(run, crypto.randomUUID(), Date.now());
    if (evs.length) commit((x) => append(x, evs));
  };

  const app: App = {
    s, saved, ui, now, theme, c: THEMES[theme], todayPlan, setupPlan, owned,
    set, settings, patchRun,
    choose: (p) => set({ choice: { ...ui.choice, ...(p.focus ? { skip: [] } : {}), ...p } }),
    swap: (id) => { tap(); set({ row: null, choice: { ...ui.choice, skip: [...(ui.choice.skip ?? []), id] } }); },
    feedback: (id, liked) => { commit((x) => setFeedback(x, id, liked, Date.now())); set({ row: null }); },
    checkin: (sore) => {
      tap();
      commit((x) => append(x, [{ ts: Date.now(), type: "checkin", payload: { feel: ui.feel ?? "normal", soreRegions: sore, sorenessChecked: true } } as never]));
      if (ui.page === "sore") leave({ feel: null, sore: [] });
      else set({ feel: null, sore: [] });
    },
    openSore: () => push("sore", { sore: [] }),
    openSetup: () => push("setup", { row: null, planAt: Date.now(), choice: { minutes: st.minutes, intensity: "normal", equipment: st.equipment } }),
    openDone: (day) => push("done", { day }),
    openPrograms: () => push("programs", { first: false }),
    openAccount: () => push("account"),
    // Signed in from first-run set-up: an account already set up skips it, a new one carries on with it.
    afterSignIn: () => (latest.current.onboarded ? set({ page: null, first: false, tab: "today" }) : set({ page: "onboard" })),
    back: () => (ui.page === "account" && !saved.onboarded ? set({ page: "onboard" }) : leave()),
    gone: () => { clearTimeout(timer.current); set({ page: null, leaving: false }); },
    startProgram: () => {
      const first = ui.first;
      commit((x) => withProfile({ ...x, onboarded: true, programStart: first || x.programStart === null ? Date.now() : x.programStart, settings: { ...x.settings, programId: PROGRAM_ID } }, Date.now()));
      leave({ tab: "today" });
      setTimeout(() => set({ first: false }), PAGE_MS);
    },
    finishOnboarding: () => set({ page: "programs", first: true }),
    startWorkout: () => {
      if (setupPlan.kind !== "workout") return;
      thud();
      clock.current = Date.now();
      setRun(W.start(W.fromPlan(s, setupPlan), Date.now()));
    },
    setDone: () => {
      const r = runRef.current;
      if (!r) return;
      thud();
      setRun(W.setDone(r, Date.now()));
      clearTimeout(flash.current);
      flash.current = setTimeout(() => patchRun({ flash: false }), 1100);
    },
    answer: (label) => {
      const r = runRef.current;
      if (!r) return;
      const next = W.answer(r, label);
      setRun(next);
      if (next.phase === "ask") {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setRun((x) => (x?.phase === "ask" ? { ...x, phase: "done" } : x)), 520);
      }
    },
    skipRest: () => { tap(); setRun((r) => (r ? W.nextSet(r) : r)); },
    endWorkout: () => { tap(); if (runRef.current) logRun(runRef.current); closeSheet(); },
    finishWorkout: () => { tap(); if (runRef.current) logRun(runRef.current); closeSheet({ page: null, tab: "today", justFinished: true }); setTimeout(() => set({ justFinished: false }), 2400); },
  };

  // Android Back (button and edge gesture): undo the top-most thing, never jump out of the app from inside it.
  const onBack = useRef<() => boolean>(() => false);
  onBack.current = () => {
    const r = runRef.current;
    if (r) {
      if (!ui.sheetOut) (r.phase === "done" ? app.finishWorkout : app.endWorkout)();
      return true;
    }
    if (ui.page === "onboard") {
      if (ui.ob === 0) return false;
      set({ ob: ui.ob - 1 });
      return true;
    }
    if (ui.page === "programs" && ui.first) { set({ page: "onboard" }); return true; }
    if (ui.page) { app.back(); return true; }
    if (ui.edit) { set({ edit: null }); return true; }
    if (tab !== "today") { set({ tab: "today" }); return true; }
    return false;
  };
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => onBack.current());
    return () => sub.remove();
  }, []);

  // Android 14+ predictive back: while a page that slides is open (and no workout covers it), the back gesture drags the
  // page with the finger, the screen under it following, as the edge swipe does; let go and it either finishes (the usual
  // Back, which carries on from where the page is) or springs home. Elsewhere the gesture goes to the handler above.
  const swipeable = !!ui.page && ui.page !== "onboard" && !(ui.page === "programs" && ui.first) && !run && !ui.leaving;
  useEffect(() => { predictiveBack?.setEnabled(swipeable); }, [swipeable]);
  useEffect(() => {
    if (!predictiveBack) return;
    const w = () => Dimensions.get("window").width;
    const subs = [
      predictiveBack.addListener("onBackStart", () => { pageX.stopAnimation(); }),
      predictiveBack.addListener("onBackProgress", ({ progress }) => { pageX.setValue(progress * w() * 0.9); }),
      predictiveBack.addListener("onBackCancel", () => { spring(pageX, 0, THROWN).start(); }),
      predictiveBack.addListener("onBack", () => { tap(); onBack.current(); }),
    ];
    return () => subs.forEach((x) => x.remove());
  }, []);

  // The app object only changes when something it shows changes; a workout tick is not one of them.
  const value = useMemo(() => app, [saved, ui, now, theme, todayPlan, setupPlan, owned]);
  return <Ctx.Provider value={value}><TabCtx.Provider value={tab}><RunCtx.Provider value={run}>{children}</RunCtx.Provider></TabCtx.Provider></Ctx.Provider>;
}
