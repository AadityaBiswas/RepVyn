// In-app motion, on Motion (motion.dev). Only transform, opacity, clip-path and one stroke move, each as a whole value,
// so Motion hands them to the compositor. Pages and sheets are springs: a move starts from wherever the last one had got to.
import { animate } from "motion";
import { useLayoutEffect, useReducer, useRef } from "preact/hooks";
import type { RefObject } from "preact";

export const still = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Arrives and stops: pages, sheets, panels. */
const SMOOTH = { type: "spring", visualDuration: 0.4, bounce: 0 } as const;
/** Something the user just earned: a little overshoot. */
const LIVELY = { type: "spring", visualDuration: 0.45, bounce: 0.25 } as const;
/** A control following the finger. */
const SNAP = { type: "spring", visualDuration: 0.25, bounce: 0.15 } as const;
const OUT = [0.23, 1, 0.32, 1] as const;
const QUICK = { duration: 0.2, ease: OUT } as const;
const FADE = { opacity: [0, 1] };

type El = HTMLElement | SVGElement;
type Frames = Record<string, [string | number, string | number]>;

/**
 * An enter move, for use as `ref={lift}`. Each is one stable function, so Preact calls it once, when the element mounts.
 * `data-delay="520"` on the element holds it at its first frame for that many ms. With reduced motion it only fades.
 */
function enter(frames: Frames, options: object) {
  return (el: El | null) => {
    if (!el) return;
    if (still()) {
      if ("opacity" in frames) animate(el, FADE, QUICK);
      return;
    }
    for (const k in frames) (el.style as unknown as Record<string, string>)[k] = String(frames[k]![0]);
    animate(el, frames, { ...options, delay: Number(el.dataset.delay ?? 0) / 1000 });
  };
}

export const fade = enter({ opacity: [0, 1] }, QUICK);
/** An options panel dropping from the control that opened it. */
export const pop = enter({ opacity: [0, 1], transform: ["translateY(-6px)", "translateY(0px)"] }, QUICK);
/** The workout panel rising for a new set. */
export const lift = enter({ opacity: [0, 1], transform: ["translateY(16px)", "translateY(0px)"] }, SMOOTH);
export const timerIn = enter({ opacity: [0, 1], transform: ["scale(0.88)", "scale(1)"] }, SMOOTH);
export const nextIn = enter({ opacity: [0, 1], transform: ["translateY(18px)", "translateY(0px)"] }, SMOOTH);
/** The program figures swapping. */
export const swap = enter({ opacity: [0, 1], transform: ["scale(0.96)", "scale(1)"] }, SMOOTH);
/** Today's capsule filling after a workout. */
export const capfill = enter({ opacity: [0.35, 1], transform: ["scale(0.8)", "scale(1)"] }, LIVELY);

// The finish sequence: the red floods up, the check draws, the words rise from behind a mask, the figures light up.
export const fFlood = enter({ clipPath: ["circle(0% at 50% 90%)", "circle(150% at 50% 90%)"] }, { duration: 0.82, ease: [0.32, 0.72, 0, 1] });
export const fLine = enter({ transform: ["translateY(110%)", "translateY(0%)"] }, { type: "spring", visualDuration: 0.6, bounce: 0 });
export const fUp = enter({ opacity: [0, 1], transform: ["translateY(18px)", "translateY(0px)"] }, { type: "spring", visualDuration: 0.5, bounce: 0 });
export const fFig = enter({ opacity: [0, 1], transform: ["scale(0.9)", "scale(1)"] }, { type: "spring", visualDuration: 0.7, bounce: 0 });
export const fLit = enter({ opacity: [0, 1] }, { duration: 0.9, ease: OUT });
/** A stroke drawing itself: the element's dash length is its `stroke-dasharray`; `data-ms` sets how long it takes. */
export const fDraw = (el: SVGElement | null) => {
  if (!el || still()) return;
  const len = parseFloat(getComputedStyle(el).strokeDasharray);
  el.style.strokeDashoffset = String(len);
  animate(el, { strokeDashoffset: [len, 0] }, { duration: Number(el.dataset.ms ?? 600) / 1000, ease: [0.65, 0, 0.35, 1], delay: Number(el.dataset.delay ?? 0) / 1000 });
};

/** Runs 0 to 1 over `seconds` after `delay`, calling `on` every frame. Returns the stop function. */
export function ramp(seconds: number, delay: number, on: (k: number) => void): () => void {
  const a = animate(0, 1, { duration: seconds, delay, ease: "linear", onUpdate: on });
  return () => a.stop();
}

/** How each pushed page, the page under it, and the workout sheet move. A single value is a target reached from the current position. */
const MOVES: Record<string, Record<string, string | number | (string | number)[]>> = {
  "page-in": { transform: ["translateX(100%)", "translateX(0%)"] },
  "page-out": { transform: "translateX(100%)" },
  "page-fwd": { transform: "translateX(-30%)", opacity: 0 },
  "under-in": { transform: "translateX(-28%)", opacity: 0.55 },
  "under-out": { transform: "translateX(0%)", opacity: 1 },
  "under-fwd": { transform: ["translateX(100%)", "translateX(0%)"] },
  "sheet-in": { transform: ["translateY(100%)", "translateY(0%)"] },
  "sheet-out": { transform: "translateY(100%)" },
  pane: FADE,
};
/** With reduced motion a page fades in and leaves at once; these are the ones that arrive. */
const ARRIVES = ["page-in", "under-fwd", "sheet-in", "pane"];

/** Runs the named move on its element each time the name changes. */
export function useMove<T extends HTMLElement = HTMLDivElement>(name: string) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const m = MOVES[name];
    if (!el || !m) return;
    if (name === "pane" || still()) {
      if (ARRIVES.includes(name)) animate(el, FADE, QUICK);
      return;
    }
    animate(el, m, SMOOTH);
  }, [name]);
  return ref;
}

/** Slides its element to `x` px with a quick spring, as a knob follows a finger. It is simply placed on the first render. */
export function useSlide<T extends HTMLElement = HTMLSpanElement>(x: number) {
  const ref = useRef<T>(null);
  const placed = useRef(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const to = `translateX(${x}px)`;
    if (!placed.current || still()) el.style.transform = to;
    else animate(el, { transform: to }, SNAP);
    placed.current = true;
  }, [x]);
  return ref;
}

/** A light tick on Android when a choice lands. iOS browsers ignore it; it is never used on plain taps. */
export const tick = () => { try { if (!still()) navigator.vibrate?.(8); } catch { /* not supported */ } };

/** A check or count badge that has just been earned. */
export const badgeIn = enter({ opacity: [0, 1], transform: ["scale(0.4)", "scale(1)"] }, LIVELY);
/** A count that just changed: it swells and settles with a little overshoot. */
export const pulse = enter({ transform: ["scale(1.45)", "scale(1)"] }, { type: "spring", visualDuration: 0.5, bounce: 0.45 });
/** A value that has just changed rolls in from the side it moved towards: up when it grew, down when it shrank. */
export const rollUp = enter({ opacity: [0, 1], transform: ["translateY(70%)", "translateY(0%)"] }, SNAP);
export const rollDown = enter({ opacity: [0, 1], transform: ["translateY(-70%)", "translateY(0%)"] }, SNAP);

/**
 * A pill that slides under whichever child is selected, for the tab bar and segmented switches.
 * Returns refs for the container and the pill; the pill is placed, not moved, the first time.
 */
export function useThumb<B extends HTMLElement = HTMLDivElement>(key: unknown, selector = '[aria-pressed="true"]') {
  const box = useRef<B>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const last = useRef<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const b = box.current;
    const p = pill.current;
    if (!b || !p) return;
    const on = b.querySelector<HTMLElement>(selector);
    if (!on) { p.style.opacity = "0"; last.current = null; return; }
    const to = { x: on.offsetLeft, w: on.offsetWidth };
    p.style.top = `${on.offsetTop}px`;
    p.style.height = `${on.offsetHeight}px`;
    p.style.opacity = "1";
    if (!last.current || still()) {
      p.style.transform = `translateX(${to.x}px)`;
      p.style.width = `${to.w}px`;
    } else {
      animate(p, { transform: [`translateX(${last.current.x}px)`, `translateX(${to.x}px)`], width: [`${last.current.w}px`, `${to.w}px`] }, { type: "spring", visualDuration: 0.38, bounce: 0.18 });
    }
    last.current = to;
  }, [key]);
  return [box, pill] as const;
}

/**
 * Slides each child of `box` from where it was to where it is now, when `key` changes (a FLIP).
 * Used where one item grows and its neighbours make room, so nothing jumps. Children marked `data-fixed` are left alone.
 */
export function useShiftInto(box: RefObject<HTMLElement>, key: unknown) {
  const last = useRef<number[]>([]);
  useLayoutEffect(() => {
    const kids = [...(box.current?.children ?? [])].filter((k) => !k.hasAttribute("data-fixed")) as HTMLElement[];
    const now = kids.map((k) => k.offsetLeft);
    if (last.current.length === now.length && !still()) {
      kids.forEach((k, i) => {
        const dx = last.current[i]! - now[i]!;
        if (dx) animate(k, { transform: [`translateX(${dx}px)`, "translateX(0px)"] }, { type: "spring", visualDuration: 0.38, bounce: 0.18 });
      });
    }
    last.current = now;
  }, [key]);
}

/** The chosen tab's icon lands with a small bounce, and its name slides out from behind it. */
export const navIcon = enter({ transform: ["scale(0.72)", "scale(1)"] }, LIVELY);
export const navLabel = enter({ opacity: [0, 1], transform: ["translateX(-8px)", "translateX(0px)"] }, { type: "spring", visualDuration: 0.28, bounce: 0, delay: 0.2 });

export type Presence<T> = { item: T; key: string; state: "in" | "stay" | "out" };
/**
 * A list that remembers rows that have just left, so they can animate out, and marks rows that have just arrived.
 * Leaving rows stay where they were until `gone(key)` is called. Nothing is marked on the first render.
 */
export function usePresence<T>(items: readonly T[], keyOf: (t: T) => string): { rows: Presence<T>[]; gone: (key: string) => void } {
  const prev = useRef<Presence<T>[] | null>(null);
  const done = useRef(new Set<string>());
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const keys = new Set(items.map(keyOf));
  let rows: Presence<T>[];
  if (!prev.current) rows = items.map((item) => ({ item, key: keyOf(item), state: "stay" as const }));
  else {
    const before = prev.current.filter((r) => !(r.state === "out" && done.current.has(r.key)));
    const had = new Set(before.filter((r) => r.state !== "out").map((r) => r.key));
    rows = items.map((item) => {
      const key = keyOf(item);
      return { item, key, state: had.has(key) ? "stay" as const : "in" as const };
    });
    // Put each leaving row back after the row that came before it last time.
    before.forEach((r, i) => {
      if (keys.has(r.key)) return;
      const after = before.slice(0, i).reverse().find((x) => rows.some((y) => y.key === x.key));
      const at = after ? rows.findIndex((y) => y.key === after.key) + 1 : 0;
      rows.splice(at, 0, { item: r.item, key: r.key, state: "out" });
    });
  }
  prev.current = rows;
  for (const k of [...done.current]) if (!rows.some((r) => r.key === k && r.state === "out")) done.current.delete(k);
  return { rows, gone: (key: string) => { done.current.add(key); bump(1); } };
}

/** A row arriving: it opens its own height, slides in, and its picture lands with a small bounce. */
export function rowIn(el: HTMLElement | null) {
  if (!el || el.dataset.shown) return;
  el.dataset.shown = "1";
  if (still()) { animate(el, FADE, QUICK); return; }
  const h = el.offsetHeight;
  const d = Number(el.dataset.delay ?? 0) / 1000;
  el.style.overflow = "hidden";
  el.style.height = "0px";
  animate(el, { height: [0, h], opacity: [0, 1] }, { type: "spring", visualDuration: 0.42, bounce: 0, delay: d }).then(() => { el.style.height = ""; el.style.overflow = ""; });
  const inner = el.querySelector<HTMLElement>("[data-row]");
  if (inner) animate(inner, { transform: ["translateX(28px)", "translateX(0px)"] }, { type: "spring", visualDuration: 0.5, bounce: 0.22, delay: d + 0.05 });
  const pic = el.querySelector<HTMLElement>("canvas, [data-pic]");
  if (pic) animate(pic, { transform: ["scale(0.5) rotate(-8deg)", "scale(1) rotate(0deg)"] }, { type: "spring", visualDuration: 0.5, bounce: 0.4, delay: d + 0.1 });
  const wash = el.querySelector<HTMLElement>("[data-wash]");
  if (wash) animate(wash, { opacity: [0, 1, 0] }, { duration: 1.6, times: [0, 0.15, 1], ease: "easeOut", delay: d });
}
/** A row leaving: it slides out and closes the gap it leaves. Calls `then` when it is gone. */
export function rowOut(el: HTMLElement, then: () => void) {
  if (el.dataset.leaving) return;
  el.dataset.leaving = "1";
  el.style.overflow = "hidden";
  el.style.pointerEvents = "none";
  if (still()) { animate(el, { opacity: 0 }, QUICK).then(then); return; }
  const inner = el.querySelector<HTMLElement>("[data-row]");
  if (inner) animate(inner, { transform: "translateX(-28px)", opacity: 0 }, { duration: 0.18, ease: OUT });
  animate(el, { height: [el.offsetHeight, 0], opacity: [1, 0] }, { type: "spring", visualDuration: 0.36, bounce: 0, delay: 0.08 }).then(then);
}
