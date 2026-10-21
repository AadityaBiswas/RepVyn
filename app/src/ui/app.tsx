// The app shell: state, navigation (push pages, the workout sheet), and every action the screens call.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { ownedWeights, type EngineState, type Plan, type Region } from "../../../src/engine";
import { attach, enablePush, requestSync } from "../cloud";
import { isEmpty, outbox, stampDoc } from "../cloud/syncCore";
import { track } from "../cloud/telemetry";
import { allowedEquipment, needsPro, offerDue } from "../entitlements";
import { makePlan, PROGRAM_ID, type LevelAsk, type PlanChoice } from "../model";
import { append, engineState, load, save, setFeedback, withProfile, type Saved, type Settings } from "../store";
import { AccountPage, ProPage, useAccess } from "./account";
import * as W from "../workout";
import { Done, Onboard, Programs, Setup, Sore } from "./pages";
import { Body, Profile, Progress, Today } from "./tabs";
import { navIcon, navLabel, tick, useMove, useShiftInto, useThumb } from "./motion";
import { Workout } from "./workout";

type Tab = "today" | "body" | "progress" | "profile";
type Page = null | "setup" | "done" | "programs" | "onboard" | "sore" | "account" | "pro";
type Feel = "fresh" | "normal" | "beat_up";
export interface Ui {
  tab: Tab;
  page: Page;
  /** How the pushed page is animating; "first" = the first-run picker with no page under it. */
  move: null | "in" | "out" | "fwd" | "first";
  open: null | "duration" | "intensity" | "equip";
  edit: string | null;
  ob: number;
  row: string | null;
  pick: string;
  sheet: null | "in" | "out";
  run: W.Run | null;
  justFinished: boolean;
  feel: Feel | null;
  sore: Region[];
  choice: PlanChoice;
  planAt: number;
  /** The day the finished-workout page shows (local midnight). */
  day: number;
  /** Onboarding level answers: the index of the tile picked per question. */
  lv: Partial<Record<LevelAsk, number>>;
}

export interface App {
  s: EngineState;
  saved: Saved;
  ui: Ui;
  now: number;
  theme: "light" | "dark";
  todayPlan: Plan;
  setupPlan: Plan;
  owned: number[];
  set: (p: Partial<Ui>) => void;
  settings: (p: Partial<Settings>) => void;
  choose: (p: Partial<PlanChoice>) => void;
  feedback: (exerciseId: string, liked: boolean | null) => void;
  /** Swap an exercise out of the workout being set up: the engine picks the next best. */
  swap: (exerciseId: string) => void;
  checkin: (sore: Region[]) => void;
  openSore: () => void;
  openSetup: () => void;
  /** A finished workout: every set logged that day. */
  openDone: (day: number) => void;
  openPrograms: () => void;
  openAccount: () => void;
  openPro: () => void;
  /** Called by the sign-in page once the account is ready. */
  signedIn: () => void;
  back: () => void;
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

const OFFER_KEY = "repvyn-pro-offer";
const offerShownAt = (): number | null => {
  try { return Number(localStorage.getItem(OFFER_KEY)) || null; } catch { return null; }
};
const markOfferShown = () => {
  try { localStorage.setItem(OFFER_KEY, String(Date.now())); } catch { /* ignore */ }
};

/** A page is taken away once its spring has carried it off screen. */
const PAGE_MS = 450;
const still = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const systemDark = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;

export function AppRoot() {
  const [saved, setSaved] = useState<Saved>(() => load(Date.now()));
  const [ui, setUi] = useState<Ui>(() => ({
    tab: "today", page: saved.onboarded ? null : "onboard", move: saved.onboarded ? null : "first", open: null, edit: null, ob: 0, row: null,
    pick: saved.settings.programId, sheet: null, run: null, justFinished: false, feel: null, sore: [],
    choice: { minutes: saved.settings.minutes, intensity: "normal", equipment: saved.settings.equipment }, planAt: Date.now(), day: 0, lv: {},
  }));
  const [dark, setDark] = useState(systemDark);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const flash = useRef<ReturnType<typeof setTimeout>>();
  const [now, setNow] = useState(Date.now());

  // Re-read the clock once a minute so "today" rolls over while the app is open.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => setDark(mq.matches);
    mq.addEventListener("change", on);
    return () => { clearInterval(id); mq.removeEventListener("change", on); };
  }, []);

  // Every change goes through `latest`, updated at once, so a change made before the next render (cloud sync
  // runs several in a row) always builds on the one before it.
  const latest = useRef(saved);
  const commit = (f: (x: Saved) => Saved) => {
    const x = latest.current;
    const y = stampDoc(x, f(x), Date.now());
    if (y === x) return;
    latest.current = y;
    save(y);
    setSaved(y);
    // Only for something to upload: a sync's own bookkeeping must not schedule the next one.
    if (!isEmpty(outbox(y))) requestSync();
  };
  useEffect(() => attach(() => latest.current, commit), []);
  useEffect(() => track("app_opened", { onboarded: saved.onboarded }), []);
  const set = (p: Partial<Ui>) => setUi((u) => ({ ...u, ...p }));
  const s = engineState(saved);
  const st = saved.settings;
  const theme: "light" | "dark" = st.look === "system" ? (dark ? "dark" : "light") : st.look;
  const owned = useMemo(() => ownedWeights(s.profile), [s.profile]);
  // Free vs Pro (entitlements.ts). Everything is open until billing is live, and for the first week.
  const acc = useAccess({ saved, now });
  const full = acc.full;
  // When access changes (Pro bought or ended, preview week over) the engine's profile follows. So does it when
  // the settings arrive from the account (a second phone signing in): otherwise the engine would keep planning
  // from that phone's quick setup while the Profile tab shows the account's settings.
  useEffect(() => { if (saved.onboarded) commit((x) => withProfile(x, Date.now(), full)); }, [full, saved.settings]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#000000" : "#F2F2F7");
  }, [theme]);

  const hasProfile = s.profile !== null;
  const planOrRest = (at: number, c: PlanChoice): Plan =>
    hasProfile ? makePlan(s, at, { ...c, equipment: allowedEquipment(c.equipment, full) }) : { kind: "rest", template: null, program: st.programId, exercises: [], skippedRegions: [], deloadActive: false, calibrating: true, estMinutes: 0, reasons: [], focus: null, short: null };
  const todayPlan = useMemo(() => planOrRest(now, { minutes: st.minutes, intensity: "normal", equipment: st.equipment }), [saved.events, now]);
  const setupPlan = useMemo(() => planOrRest(ui.planAt, ui.choice), [saved.events, ui.planAt, ui.choice]);

  // The workout clock.
  const running = !!ui.run && ui.run.phase !== "done";
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setUi((u) => (u.run ? { ...u, run: W.tick(u.run) } : u)), 1000);
    return () => clearInterval(id);
  }, [running]);

  const push = (page: Page, extra: Partial<Ui> = {}) => { clearTimeout(timer.current); set({ page, move: "in", open: null, ...extra }); };
  const leave = (move: "out" | "fwd", extra: Partial<Ui> = {}) => {
    if (!ui.page || ui.move === "out" || ui.move === "fwd") return;
    set({ move, ...extra });
    timer.current = setTimeout(() => set({ page: null, move: null }), still() ? 0 : PAGE_MS);
  };
  const settings = (p: Partial<Settings>) => {
    if (needsPro(p, full)) return push("pro");
    commit((x) => withProfile({ ...x, settings: { ...x.settings, ...p } }, Date.now(), full));
    // Reminders: ask for notification permission inside the tap, as browsers require.
    if (p.remind && p.remind !== "Off") void enablePush().catch(() => {});
  };
  const patchRun = (p: Partial<W.Run>) => setUi((u) => (u.run ? { ...u, run: { ...u.run, ...p } } : u));
  const closeSheet = (extra: Partial<Ui> = {}) => {
    set({ sheet: "out" });
    timer.current = setTimeout(() => set({ sheet: null, run: null, ...extra }), still() ? 0 : PAGE_MS);
  };
  /** Saves what was done as one session (nothing if no set was logged). */
  const logRun = (run: W.Run) => {
    const evs = W.toEvents(run, crypto.randomUUID(), Date.now());
    if (evs.length) commit((x) => append(x, evs));
  };

  const app: App = {
    s, saved, ui, now, theme, todayPlan, setupPlan, owned,
    set, settings, patchRun,
    // A new focus starts the swaps over: they were picked against the old plan.
    choose: (p) => (p.equipment && needsPro({ equipment: p.equipment }, full) ? push("pro") : set({ choice: { ...ui.choice, ...(p.focus ? { skip: [] } : {}), ...p } })),
    swap: (id) => set({ row: null, choice: { ...ui.choice, skip: [...(ui.choice.skip ?? []), id] } }),
    feedback: (id, liked) => { commit((x) => setFeedback(x, id, liked, Date.now())); set({ row: null }); },
    checkin: (sore) => {
      commit((x) => append(x, [{ ts: Date.now(), type: "checkin", payload: { feel: ui.feel ?? "normal", soreRegions: sore, sorenessChecked: true } } as never]));
      if (ui.page === "sore") leave("out", { feel: null, sore: [] });
      else set({ feel: null, sore: [] });
    },
    openSore: () => push("sore", { sore: [] }),
    openSetup: () => push("setup", { row: null, planAt: Date.now(), choice: { minutes: st.minutes, intensity: "normal", equipment: st.equipment } }),
    openDone: (day) => push("done", { day }),
    openPrograms: () => push("programs", { pick: PROGRAM_ID, edit: null }),
    openAccount: () => push("account", { edit: null }),
    openPro: () => { track("paywall_viewed", { reason: acc.reason }); push("pro", { edit: null }); },
    signedIn: () => leave("out"),
    back: () => leave("out"),
    startProgram: () => {
      const first = ui.move === "first";
      // One program for now, so this starts it on first run and otherwise only closes the page.
      const changed = PROGRAM_ID !== st.programId;
      commit((x) => withProfile({ ...x, onboarded: true, programStart: first || changed || x.programStart === null ? Date.now() : x.programStart, settings: { ...x.settings, programId: PROGRAM_ID } }, Date.now(), full));
      if (first) track("onboarding_done", { program: PROGRAM_ID, days: st.days, minutes: st.minutes, level: st.level });
      leave(first ? "fwd" : "out", { tab: "today" });
    },
    finishOnboarding: () => set({ page: "programs", move: "first", pick: PROGRAM_ID }),
    startWorkout: () => {
      if (setupPlan.kind !== "workout") return;
      set({ sheet: "in", run: W.start(W.fromPlan(s, setupPlan), Date.now()) });
    },
    setDone: () => {
      if (!ui.run) return;
      const run = W.setDone(ui.run, Date.now());
      set({ run });
      clearTimeout(flash.current);
      flash.current = setTimeout(() => patchRun({ flash: false }), 1100);
    },
    answer: (label) => {
      if (!ui.run) return;
      const run = W.answer(ui.run, label);
      set({ run });
      if (run.phase === "ask") {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setUi((u) => (u.run?.phase === "ask" ? { ...u, run: { ...u.run, phase: "done" } } : u)), 520);
      }
    },
    skipRest: () => ui.run && set({ run: W.nextSet(ui.run) }),
    endWorkout: () => { if (ui.run) logRun(ui.run); closeSheet(); },
    finishWorkout: () => {
      if (ui.run) logRun(ui.run);
      track("workout_finished", { sets: ui.run ? W.toEvents(ui.run, "x", Date.now()).filter((e) => e.type === "set_logged").length : 0, day: Math.floor((Date.now() - saved.createdAt) / 86_400_000) });
      closeSheet({ page: null, move: null, tab: "today", justFinished: true });
      setTimeout(() => set({ justFinished: false }), 2400 + PAGE_MS);
      // The Pro offer, once, after the first workout past the free week (the launch plan's day-7 offer).
      if (offerDue(acc, offerShownAt(), Date.now())) {
        markOfferShown();
        setTimeout(() => app.openPro(), 2400 + 2 * PAGE_MS);
      }
    },
  };

  const pageCls = (page: Page) => (ui.page !== page ? "" : ui.move === "in" ? "page-in" : ui.move === "out" ? "page-out" : ui.move === "fwd" ? "page-fwd" : "");
  const baseCls = ui.move === "in" ? "under-in" : ui.move === "out" ? "under-out" : ui.move === "fwd" ? "under-fwd" : "";
  // The tab bar keeps one width. The chosen tab widens to show its name, the others slide aside, and the dark pill glides under it.
  const nav = (key: Tab, label: string, icon: preact.JSX.Element) => {
    const on = ui.tab === key;
    return (
      <button key={key} type="button" class="tab navbtn" onClick={() => { if (!on) tick(); set({ tab: key, edit: null }); }} aria-current={on ? "page" : "false"} aria-label={label}
        style={`position: relative; z-index: 1; height: 52px; ${on ? "flex: 1 1 auto;" : "flex: 0 0 56px;"} min-width: 0; padding: 0 16px; border: 0; border-radius: 999px; cursor: pointer; background: transparent; color: ${on ? "var(--nav-on-ink)" : "var(--nav-ink)"}; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 15px; font-weight: 600; letter-spacing: -0.01em; white-space: nowrap;`}>
        <span key={on ? "on" : "off"} ref={on ? navIcon : undefined} style="display: flex;">{icon}</span>
        {on && <span ref={navLabel}>{label}</span>}
      </button>
    );
  };
  const [navBox, navPill] = useThumb<HTMLElement>(ui.tab, '[aria-current="page"]');
  useShiftInto(navBox, ui.tab);
  const under = useMove(baseCls);
  const I = (d: preact.JSX.Element) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{d}</svg>;

  return (
    <div class="v2">
      <div ref={under} style="position: absolute; inset: 0;">
        {/* Content fades out under the floating bar. */}
        <div aria-hidden="true" style="position: absolute; z-index: 2; left: 0; right: 0; bottom: 0; height: 104px; pointer-events: none; background: linear-gradient(transparent, var(--bg) 46%);"></div>
        <nav ref={navBox} aria-label="Main" class="frost" style="position: absolute; z-index: 3; left: 50%; bottom: var(--bottom); transform: translateX(-50%); width: min(calc(100% - 40px), 332px); box-sizing: border-box; padding: 6px; border-radius: 999px; display: flex; gap: 2px;">
          <span ref={navPill} data-fixed aria-hidden="true" style="position: absolute; left: 0; top: 6px; border-radius: 999px; background: var(--nav-on); box-shadow: 0 8px 14px -8px rgba(0, 0, 0, 0.5); opacity: 0; pointer-events: none;"></span>
          {nav("today", "Today", I(<path d="M7 7v10M17 7v10M3.5 9.5v5M20.5 9.5v5M7 12h10"></path>))}
          {nav("body", "Body", I(<><circle cx="12" cy="5" r="2.2"></circle><path d="M6 9.5c2 .8 4 1.2 6 1.2s4-.4 6-1.2M12 10.7V15M12 15l-3 5.5M12 15l3 5.5"></path></>))}
          {nav("progress", "Progress", I(<><path d="M4 19.5h16M6.5 15l3.5-4 3 2.500L17.500 7"></path><path d="M14 7h3.500v3.500"></path></>))}
          {nav("profile", "Profile", I(<><circle cx="12" cy="8.500" r="3.500"></circle><path d="M5 19.500c1.200-3.200 3.800-4.800 7-4.800s5.800 1.600 7 4.800"></path></>))}
        </nav>
        {hasProfile && ui.tab === "today" && <Today key="today" app={app} />}
        {hasProfile && ui.tab === "body" && <Body key="body" app={app} />}
        {hasProfile && ui.tab === "progress" && <Progress key="progress" app={app} />}
        {hasProfile && ui.tab === "profile" && <Profile key="profile" app={app} />}
      </div>
      {ui.page === "setup" && <Setup app={app} cls={pageCls("setup")} />}
      {ui.page === "done" && <Done app={app} cls={pageCls("done")} />}
      {ui.page === "sore" && <Sore app={app} cls={pageCls("sore")} />}
      {ui.page === "programs" && <Programs app={app} cls={ui.move === "first" ? "pane" : pageCls("programs")} first={ui.move === "first" || ui.move === "fwd"} />}
      {ui.page === "onboard" && <Onboard app={app} />}
      {ui.page === "account" && <AccountPage app={app} cls={pageCls("account")} />}
      {ui.page === "pro" && <ProPage app={app} cls={pageCls("pro")} />}
      {ui.sheet && ui.run && <Workout app={app} run={ui.run} cls={ui.sheet === "out" ? "sheet-out" : "sheet-in"} />}
    </div>
  );
}
