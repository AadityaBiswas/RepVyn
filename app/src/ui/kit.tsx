// Small shared pieces: icons, option pills, figures, back button, bottom action. Styles follow the canvas "Home Screen v2".
import { toChildArray, type ComponentChildren, type VNode } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Muscle as MuscleId, Region } from "../../../src/engine";
import { fade, pop, rollDown, rollUp, tick, useThumb } from "./motion";
import { draw, figure, ready, thumb, type Drawing, type Kind, type Part, type Theme, type View } from "../figure";

export const Chevron = ({ rot = 0, size = 16 }: { rot?: number; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style={`transform: rotate(${rot}deg); transition: transform 200ms cubic-bezier(0.23,1,0.32,1);`}><path d="M9 6l6 6-6 6"></path></svg>
);
export const Check = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>
);
export const ThumbUp = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink: 0;"><path d="M7 10v12"></path><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"></path></svg>
);
export const ThumbDown = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink: 0;"><path d="M17 14V2"></path><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"></path></svg>
);

export interface OptProps { label: ComponentChildren; on: boolean; pick: () => void; off?: string; span?: string; style?: string; mono?: boolean }
/** An option pill: selected is ink, unselected the ground colour (or `off`). */
export const Opt = ({ label, on, pick, off = "var(--bg)", span, style = "", mono }: OptProps) => (
  <button type="button" class="tab pick" onClick={() => { tick(); pick(); }} aria-pressed={on ? "true" : "false"}
    style={`height: 44px; padding: 0 6px; border: 0; border-radius: 999px; cursor: pointer; font-size: 14px; font-weight: 600; ${mono ? "font-family: var(--mono);" : ""} ${span ? `grid-column: ${span};` : ""} background: ${on ? "var(--ink)" : off}; color: ${on ? "var(--bg)" : "var(--ink)"}; ${style}`}>{label}</button>
);
/** Options in an even grid; a "none / off" first option can take a full row. */
export const OptGrid = ({ cols, label, children, style = "" }: { cols: number; label?: string; children: ComponentChildren; style?: string }) => (
  <div ref={pop} role="group" aria-label={label} style={`display: grid; grid-template-columns: repeat(${cols}, minmax(0, 1fr)); gap: 8px; ${style}`}>{children}</div>
);
/** A segmented switch (Duration, Intensity, program tabs). The ink pill slides to the chosen option. */
export function Segmented({ children, bg = "var(--bg)", label }: { children: ComponentChildren; bg?: string; label?: string }) {
  const at = toChildArray(children).findIndex((c) => (c as VNode<{ on?: boolean }>).props?.on);
  const [box, pill] = useThumb(at);
  return (
    <div ref={box} role="group" aria-label={label} style={`position: relative; padding: 4px; border-radius: 999px; background: ${bg}; display: flex; gap: 2px;`}>
      <span ref={pill} aria-hidden="true" style="position: absolute; left: 0; top: 4px; border-radius: 999px; background: var(--ink); opacity: 0; pointer-events: none;"></span>
      {children}
    </div>
  );
}
export const Seg = ({ label, on, pick, h = 40, size = 14, icon }: { label: string; on: boolean; pick: () => void; h?: number; size?: number; icon?: ComponentChildren }) => (
  <button type="button" class="tab" onClick={() => { if (!on) tick(); pick(); }} aria-pressed={on ? "true" : "false"}
    style={`position: relative; flex: 1 1 0; height: ${h}px; padding: 0; border: 0; border-radius: 999px; cursor: pointer; font-size: ${size}px; font-weight: 600; letter-spacing: -0.01em; background: transparent; color: ${on ? "var(--bg)" : "var(--ink)"}; display: flex; align-items: center; justify-content: center; gap: 6px;`}>{icon}{label}</button>
);

/** A number that rolls to its new value: up when it grew, down when it shrank. */
export function Roll({ value }: { value: number }) {
  const was = useRef(value);
  const moved = was.current !== value;
  const up = value >= was.current;
  useEffect(() => { was.current = value; });
  return (
    <span style="display: inline-block; overflow: hidden; vertical-align: bottom;">
      <span key={value} ref={moved ? (up ? rollUp : rollDown) : undefined} style="display: inline-block; font-variant-numeric: tabular-nums;">{value}</span>
    </span>
  );
}

export const BackButton = ({ onClick, label = "Back" }: { onClick: () => void; label?: string }) => (
  <button type="button" class="press frost" onClick={onClick} aria-label={label} style="position: absolute; z-index: 3; top: var(--top); left: 20px; width: 48px; height: 48px; padding: 0; border: 0; border-radius: 999px; color: var(--ink); display: flex; align-items: center; justify-content: center; cursor: pointer;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg></button>
);
/** The one red action pinned to the bottom of a pushed page, over a fade. */
export const BottomCta = ({ onClick, children, disabled }: { onClick: () => void; children: ComponentChildren; disabled?: boolean }) => (
  <>
    <div aria-hidden="true" style="position: absolute; z-index: 2; left: 0; right: 0; bottom: 0; height: 130px; pointer-events: none; background: linear-gradient(transparent, var(--bg) 60%);"></div>
    <button type="button" class="press" onClick={onClick} disabled={disabled} style={`position: absolute; z-index: 3; left: 20px; right: 20px; bottom: var(--bottom); height: 64px; border: 0; border-radius: 999px; background: var(--accent); color: #FFFFFF; font-size: 17px; font-weight: 700; letter-spacing: -0.01em; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; box-shadow: var(--hero-shadow); opacity: ${disabled ? 0.5 : 1};`}>{children}</button>
  </>
);

export const H1 = ({ children, style = "" }: { children: ComponentChildren; style?: string }) => (
  <h1 style={`margin: 0; font-size: 34px; line-height: 1; font-weight: 800; letter-spacing: -0.035em; ${style}`}>{children}</h1>
);
export const H2 = ({ children }: { children: ComponentChildren }) => (
  <h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">{children}</h2>
);
/** The RepVyn mark, traced from the logo picture (the same paths as the app icon in index.html). */
export const Mark = ({ size = 36 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 344 344" aria-hidden="true"><rect width="344" height="344" rx="77" fill="#DE223D"></rect><g fill="#fff" transform="translate(50.7 70.2) scale(1.7833)"><path d="M8.600 8.400H73A22 22 0 0 1 95 30.400Q95 38 91.500 43.500L80.500 60.400Q69.900 76.700 59.400 60L50 44.500H63A7.150 7.150 0 0 0 63 30.200H25Q20.200 30.200 17.900 26Z"></path><path d="M127.900 39.200H111Q103.500 39.200 98.600 46.900L69.400 92.400 44 50.800Q37.200 39.500 27 39.500H24Q8 39.500 15.200 52.800L45.500 99Q50.100 106.100 58 106.100H82Q90.600 106.100 94.800 98.700Z"></path></g></svg>
);
export const Faint = ({ children }: { children: ComponentChildren }) => <span style="color: var(--faint);">{children}</span>;

/** Scrolling page body with the canvas gutters; `top` is the space above the title. */
export const Scroll = ({ children, top = "var(--top)", bottom = 136, cls = "" }: { children: ComponentChildren; top?: string; bottom?: number; cls?: string }) => (
  <div class="scroll" ref={cls === "pane" ? fade : undefined} style="position: absolute; inset: 0; overflow-y: auto; scrollbar-width: none;">
    <div style={`box-sizing: border-box; padding: ${top} 20px ${bottom}px; display: flex; flex-direction: column;`}>{children}</div>
  </div>
);

let figuresLoaded = false;
/** True once the region maps are decoded; re-renders the caller when they arrive. */
export function useFigures(): boolean {
  const [, setLoaded] = useState(figuresLoaded);
  useEffect(() => {
    if (!figuresLoaded) void ready().then(() => { figuresLoaded = true; setLoaded(true); });
  }, []);
  return figuresLoaded;
}
/** A drawing painted into its own canvas, repainted only when the drawing changes. An empty box until the maps are decoded. */
export function Paint({ d, alt = "", cls = "", style = "" }: { d: Drawing | null; alt?: string; cls?: string; style?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    if (ref.current && d) draw(ref.current, d);
  }, [d?.key]);
  const name = alt ? { role: "img" as const, "aria-label": alt } : { "aria-hidden": "true" as const };
  return d ? <canvas ref={ref} width={d.w} height={d.h} class={cls} {...name} style={style}></canvas> : <div class={cls} {...name} style={style}></div>;
}
/** One coloured anatomy figure, `h` tall. `lines` draws contour rings inside those muscles: the one RepVyn wants you to notice (most worked, most grown). */
export function Fig({ view, kind = "body", values, theme, h, alt, part, lines, cls = "", style = "" }: { view: View; kind?: Kind; values: Partial<Record<MuscleId, number>>; theme: Theme; h: number; alt: string; part?: Part; lines?: readonly MuscleId[]; cls?: string; style?: string }) {
  useFigures();
  return <Paint d={figure(view, theme, kind, values, h, part, lines)} alt={alt} cls={cls} style={`display: block; width: 100%; height: ${h}px; object-fit: contain; ${style}`} />;
}
/** The picture for an exercise or a recovering muscle: a close-up of that muscle on the figure. */
export function Muscle({ region, theme, color, levels, size = 56, radius = 16, bg = "var(--thumb)" }: { region: Region | undefined; theme: Theme; color?: string; levels?: Partial<Record<MuscleId, number>>; size?: number; radius?: number; bg?: string }) {
  useFigures();
  return <Paint d={region ? thumb(region, theme, size, levels ?? color) : null} style={`display: block; width: ${size}px; height: ${size}px; flex-shrink: 0; border-radius: ${radius}px; background: ${bg};`} />;
}
/** Front and back side by side. */
export const Figures = ({ kind, values, theme, h, alt, gap = 8, part, enter }: { kind?: Kind; values: Partial<Record<MuscleId, number>>; theme: Theme; h: number; alt: [string, string]; gap?: number; part?: Part; enter?: (el: HTMLElement | null) => void }) => (
  <div ref={enter} style={`display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: ${gap}px;`}>
    <figure style="margin: 0;"><Fig view="front" kind={kind} values={values} theme={theme} h={h} alt={alt[0]} part={part} /></figure>
    <figure style="margin: 0;"><Fig view="back" kind={kind} values={values} theme={theme} h={h} alt={alt[1]} part={part} /></figure>
  </div>
);

/** A Profile settings row: label, current value, and its options underneath when open. */
export const Row = ({ label, value, open, toggle, last, children }: { label: string; value: ComponentChildren; open: boolean; toggle: () => void; last?: boolean; children?: ComponentChildren }) => (
  <li style={`display: flex; flex-direction: column; ${last ? "" : "border-bottom: 1px solid var(--soft);"}`}>
    <button type="button" class="press" onClick={toggle} aria-expanded={open ? "true" : "false"} style="min-height: 60px; padding: 0; border: 0; background: transparent; color: var(--ink); display: flex; align-items: center; gap: 8px; font-size: 16px; text-align: left; cursor: pointer;">
      <span style="flex-grow: 1; font-weight: 600; letter-spacing: -0.01em;">{label}</span>
      <span style="color: var(--muted);">{value}</span>
      <span style="color: var(--faint); display: flex;"><Chevron rot={open ? 90 : 0} /></span>
    </button>
    {open && <div style="padding: 0 0 16px;">{children}</div>}
  </li>
);
export const Card = ({ children, label }: { children: ComponentChildren; label?: string }) => (
  <ul aria-label={label} style="margin: 0; padding: 4px 20px; list-style: none; background: var(--surface); border-radius: 24px; display: flex; flex-direction: column;">{children}</ul>
);
export const Section = ({ title, children, gap = 12, top = 32 }: { title: ComponentChildren; children: ComponentChildren; gap?: number; top?: number }) => (
  <section style={`margin-top: ${top}px; display: flex; flex-direction: column; gap: ${gap}px;`}><H2>{title}</H2>{children}</section>
);

/** Minus, value, plus. */
export const Stepper = ({ value, dec, inc, decLabel, incLabel, size = 20 }: { value: string; dec: () => void; inc: () => void; decLabel: string; incLabel: string; size?: number }) => {
  // The new value rolls in from the side of the button that was pressed.
  const dirn = useRef<"up" | "down" | null>(null);
  const bump = dirn.current === "up" ? rollUp : dirn.current === "down" ? rollDown : undefined;
  const b = "width: 44px; height: 44px; flex-shrink: 0; padding: 0; border: 0; border-radius: 999px; background: var(--bg); color: var(--ink); font-size: 22px; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center;";
  return (
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
      <button type="button" class="press" onClick={() => { dirn.current = "down"; dec(); }} aria-label={decLabel} style={b}>−</button>
      <span style="display: block; overflow: hidden;"><span key={value} ref={bump} style={`display: block; font-family: var(--mono); font-size: ${size}px; font-weight: 600; letter-spacing: -0.02em;`}>{value}</span></span>
      <button type="button" class="press" onClick={() => { dirn.current = "up"; inc(); }} aria-label={incLabel} style={b}>+</button>
    </div>
  );
};
