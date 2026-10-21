// What a figure shows, shared by both ways of drawing it: tinted masks (figure.tsx, the web preview) and one Skia shader
// per figure (figure.native.tsx, the phone).
import { useWindowDimensions } from "react-native";
import { MUSCLES, REGION_NAMES, type Muscle, type Region } from "../../src/engine";
import { red } from "../../shared/model";
import { FIG } from "./figures.gen";
import type { ThemeName } from "./theme";

export type FigView = "front" | "back";
export type Kind = "body" | "level" | "solid" | "hero";
export type Part = "all" | "legs";
export type Box = readonly [number, number, number, number];
export { MUSCLES };

const LEVEL = { light: ["#EE8794", "#D91E36", "#7A0E1E"], dark: ["#EE8794", "#E22A40", "#7A0E1E"] } as const;
export const level = (v: number, t: ThemeName) => LEVEL[t][v >= 1 ? 2 : v >= 0.5 ? 1 : 0];
const PAL = { light: { ready: "#AEAEB2", base: "#E1E1E6", on: "#D91E36", soft: "#EE8794" }, dark: { ready: "#48484A", base: "#2C2C2E", on: "#E22A40", soft: "#8E2233" } };
const ON_RED = { light: { ready: "#9B1B2E", base: "#B72038", on: "#FFFFFF", soft: "#D4586A" }, dark: { ready: "#8C1A2C", base: "#AC2036", on: "#FFFFFF", soft: "#D4586A" } };
const THUMB = { light: PAL.light, dark: { ...PAL.dark, ready: "#636366", base: "#48484A" } };
const LINE = { hero: { light: "#C4223A", dark: "#B8233A" }, plain: { light: "#7A0E1E", dark: "#FFFFFF" } };
const FRONT: Muscle[] = ["chest", "front_delt", "biceps", "quads", "abs", "forearms", "obliques", "adductors", "hip_flexors"];
export const viewOf = (m: Muscle): FigView => (FRONT.includes(m) ? "front" : "back");

/** How one figure is coloured: the body's ground, each muscle, and the contour-ring colour. */
export interface Paint { base: string; colour: (m: Muscle) => string; line: string }

export function figurePaint(kind: Kind, theme: ThemeName, values: Partial<Record<Muscle, number>>): Paint {
  const pal = kind === "hero" ? ON_RED[theme] : PAL[theme];
  const colour = (m: Muscle): string => {
    const v = values[m];
    if (v === undefined || v <= 0) return pal.ready;
    return kind === "body" ? red(v, theme) : kind === "level" ? level(v, theme) : v >= 1 ? pal.on : pal.soft;
  };
  return { base: pal.base, colour, line: LINE[kind === "hero" ? "hero" : "plain"][theme] };
}

/** The close-up's colouring: one colour for that muscle, or a level per muscle so the helpers in the frame show too. */
export function thumbPaint(region: Muscle | undefined, theme: ThemeName, paint?: string | Partial<Record<Muscle, number>>): Paint {
  const pal = THUMB[theme];
  const colour = (m: Muscle): string => {
    if (typeof paint === "object") return paint[m] ? level(paint[m]!, theme) : pal.ready;
    return m === region ? paint ?? pal.on : pal.ready;
  };
  return { base: pal.base, colour, line: LINE.plain[theme] };
}

/** The region of the map a figure shows. */
export const figureBox = (view: FigView, part: Part): Box => (part === "legs" ? FIG[view].legsBox : [0, 0, FIG[view].w, FIG[view].h]);
export const thumbBox = (region: Muscle | undefined): Box | undefined => (region ? (FIG[viewOf(region)].thumbs as Record<string, Box>)[region] : undefined);

/** Two figures side by side fit the page's width (gutters and any card padding, `inset`), even on a narrow phone. */
export function useFittedHeight(want: number, part: Part | undefined, inset: number, gap: number): number {
  const width = Math.min(useWindowDimensions().width, 600);
  const box = figureBox("front", part ?? "all");
  const aspect = (box[2] - box[0]) / (box[3] - box[1]);
  return Math.min(want, Math.floor((width - 40 - 2 * inset - gap) / 2 / aspect));
}

const nameOf = (m: Muscle) => (REGION_NAMES[m as Region] ?? m.replace(/_/g, " ")).toLowerCase();
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
/**
 * A figure for a screen reader: what it shows and which muscles are lit, most first. `lead` names what the colour means on
 * that screen ("Worked today", "Still recovering").
 */
export function describe(values: Partial<Record<Muscle, number>>, lead = "Highlighted", sides = "front and back"): string {
  const lit = (Object.entries(values) as [Muscle, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([m]) => nameOf(m));
  return `Body, ${sides}. ${lit.length ? `${lead}: ${list(lit)}.` : "Nothing highlighted."}`;
}

/** Props are equal when they draw the same picture: colour records are compared by content, since callers rebuild them each render. */
export const same = (a: Record<string, unknown>, b: Record<string, unknown>) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const x = a[k], y = b[k];
    if (x === y) continue;
    if (typeof x !== "object" || typeof y !== "object" || !x || !y || JSON.stringify(x) !== JSON.stringify(y)) return false;
  }
  return true;
};
