// Everything the app keeps: the user's settings and the engine's event log, saved in localStorage.
// The engine state is always a replay of the log, so nothing derived is ever stored.
import { replay, sessionCalories, type DayIntensity, type Dumbbells, type EngineEvent, type EngineState, type Equipment, type Experience, type Goal, type Profile, type Region } from "../../src/engine";
import { effectiveSettings } from "./entitlements";
import { catalog, params } from "./env";

export interface DumbbellChoice { type: "fixed" | "adjustable"; fixed: number[]; min: number; max: number; step: number }
export interface Settings {
  goal: Goal;
  days: number;
  minutes: number;
  equipment: Equipment[];
  dumbbells: DumbbellChoice;
  avoid: Region[];
  level: "auto" | Experience;
  kg: number;
  units: "metric" | "imperial";
  remind: string;
  look: "system" | "light" | "dark";
  programId: string;
}
export interface Saved {
  v: 1;
  userId: string;
  createdAt: number;
  onboarded: boolean;
  /** When the current program started (week 1). */
  programStart: number | null;
  settings: Settings;
  events: EngineEvent[];
  /** Like / dislike per exercise, as shown on the rows; the matching event id so a toggle-off can be undone. */
  feedback: Record<string, { liked: boolean; eventId: string }>;
  /** Cloud sync bookkeeping (ADR-0003); untouched while signed out. */
  sync: SyncMeta;
}
export interface SyncMeta {
  /** The signed-in account, or null on a device-only install. */
  account: { id: string; email: string | null } | null;
  /** Last server_seq pulled. */
  cursor: number;
  /** Event ids the server holds alive. */
  known: string[];
  /** When settings, onboarding or feedback marks last changed here (ms), and when that was last uploaded. */
  docAt: number;
  docPushedAt: number;
  lastSyncAt: number | null;
  /** App build that last pulled; a new build re-pulls everything once so newly understood events arrive. */
  appVersion: string | null;
  /** Just signed in: the account's settings win; this device's are uploaded only if the account has none. */
  seedDoc: boolean;
}
export const EMPTY_SYNC: SyncMeta = { account: null, cursor: 0, known: [], docAt: 0, docPushedAt: 0, lastSyncAt: null, appVersion: null, seedDoc: false };

export const DEFAULT_SETTINGS: Settings = {
  goal: "muscle", days: 4, minutes: 40, equipment: [], dumbbells: { type: "fixed", fixed: [5, 10], min: 2, max: 20, step: 2 },
  avoid: [], level: "auto", kg: 72, units: "metric", remind: "6:30 pm", look: "system", programId: "balanced",
};

const KEY = "home-v2";
const uuid = () => crypto.randomUUID();

/** Pounds where people weigh themselves in pounds (the US), kilograms everywhere else, India included. */
export function unitsFor(locale: string | undefined): Settings["units"] {
  const region = locale?.match(/[-_]([A-Za-z]{2})\b/)?.[1]?.toUpperCase();
  return region === "US" ? "imperial" : "metric";
}
const deviceLocale = () => (typeof navigator === "undefined" ? undefined : navigator.language);

export function fresh(now: number, locale = deviceLocale()): Saved {
  return { v: 1, userId: uuid(), createdAt: now, onboarded: false, programStart: null, settings: { ...DEFAULT_SETTINGS, units: unitsFor(locale) }, events: [], feedback: {}, sync: EMPTY_SYNC };
}
/** The saved JSON (from localStorage here, AsyncStorage in the phone app) back into a Saved, or a fresh one. */
export function parse(raw: string | null, now: number): Saved {
  try {
    const s = JSON.parse(raw ?? "null") as Saved | null;
    // Balanced (the 12-week program) is the only program for now, so a saved pick of another one is moved onto it.
    if (s?.v === 1 && Array.isArray(s.events)) return { ...fresh(now), ...s, settings: { ...DEFAULT_SETTINGS, ...s.settings, programId: DEFAULT_SETTINGS.programId }, sync: { ...EMPTY_SYNC, ...s.sync } };
  } catch {}
  return fresh(now);
}
export function load(now: number): Saved {
  try {
    return parse(localStorage.getItem(KEY), now);
  } catch {}
  return fresh(now);
}
export function save(s: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}
export const STORE_KEY = KEY;

/** Log out: everything kept on this device goes, and the next load starts from onboarding. */
export function erase(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

export function dumbbellsOf(d: DumbbellChoice): Dumbbells | undefined {
  if (d.type === "fixed") return d.fixed.length ? { kind: "fixed", kg: [...d.fixed].sort((a, b) => a - b) } : undefined;
  return { kind: "adjustable", minKg: d.min, maxKg: d.max, stepKg: d.step };
}
export function profileOf(st: Settings, utcOffsetMinutes: number): Profile {
  // The dumbbells go in even when they are not in today's equipment, so picking "Dumbbells" for one workout can plan them;
  // the planner still uses a weighted exercise only when the equipment in use includes dumbbells.
  const db = dumbbellsOf(st.dumbbells);
  return {
    goal: st.goal, programId: st.programId, utcOffsetMinutes, bodyMassKg: st.kg,
    ...(st.level !== "auto" ? { experience: st.level } : {}),
    equipment: st.equipment, ...(db ? { dumbbells: db } : {}),
    excludeExercises: [], excludeRegions: st.avoid, daysPerWeek: st.days, sessionMinutes: st.minutes,
  };
}

/** Appends events with fresh ids, in order, never before the last logged event. */
export function append(s: Saved, evs: Omit<EngineEvent, "id" | "userId" | "seq" | "schemaVersion">[]): Saved {
  const events = s.events.slice();
  let seq = events.length ? events.at(-1)!.seq + 1 : 0;
  let floor = events.length ? events.at(-1)!.ts : 0;
  for (const e of evs) {
    const ts = Math.max(floor, Math.round(e.ts));
    floor = ts;
    events.push({ ...e, ts, id: uuid(), userId: s.userId, seq: seq++, schemaVersion: 1 } as EngineEvent);
  }
  return { ...s, events };
}

/**
 * Records the profile when the settings change. Back-to-back profile changes replace each other, so a run of +/- taps is one event.
 * Without full access (Free tier after the preview week) the engine plans with the free programs and equipment only.
 */
export function withProfile(s: Saved, now: number, full = true): Saved {
  const payload = profileOf(effectiveSettings(s.settings, full), -new Date(now).getTimezoneOffset());
  const prev = [...s.events].reverse().find((e) => e.type === "profile_set");
  if (prev && JSON.stringify(prev.payload) === JSON.stringify(payload)) return s;
  const last = s.events.at(-1);
  const base = last?.type === "profile_set" ? { ...s, events: s.events.slice(0, -1) } : s;
  return append(base, [{ ts: now, type: "profile_set", payload } as never]);
}

export function setFeedback(s: Saved, exerciseId: string, liked: boolean | null, now: number): Saved {
  const prev = s.feedback[exerciseId];
  const feedback = { ...s.feedback };
  let next: Saved = s;
  // Taking a mark back removes the event it added; the engine then sees no opinion, as before.
  if (prev) next = { ...next, events: next.events.filter((e) => e.id !== prev.eventId) };
  delete feedback[exerciseId];
  if (liked !== null) {
    next = append(next, [{ ts: now, type: "exercise_feedback", payload: { exerciseId, liked } } as never]);
    feedback[exerciseId] = { liked, eventId: next.events.at(-1)!.id };
  }
  return { ...next, feedback };
}

let cache: { events: EngineEvent[]; state: EngineState } | null = null;
export function engineState(s: Saved): EngineState {
  if (cache?.events !== s.events) cache = { events: s.events, state: replay(s.events, catalog, params) };
  return cache.state;
}

/** The engine as it will be once a workout is saved: the saved log plus its events, replayed (the finish screens). */
export const stateWith = (s: Saved, evs: Omit<EngineEvent, "id" | "userId" | "seq" | "schemaVersion">[]): EngineState => replay(append(s, evs).events, catalog, params);

/** Calories of a workout before it is saved (the done screen). Null without body weight. */
export function caloriesWith(s: Saved, evs: Omit<EngineEvent, "id" | "userId" | "seq" | "schemaVersion">[]): { kcal: number; low: number; high: number } | null {
  if (!evs.length) return null;
  const st = stateWith(s, evs);
  const sess = st.sessions.at(-1);
  const c = sess ? sessionCalories(st, sess) : null;
  return c ? { kcal: Math.round(c.activeKcal), low: Math.round(c.low), high: Math.round(c.high) } : null;
}

export type { DayIntensity };
