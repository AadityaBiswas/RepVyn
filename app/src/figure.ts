// The anatomy figures, coloured per muscle at runtime from the region maps (assets/body/make_map.py, enlarged by make_map_hd.py).
// A figure is described here and painted straight into a <canvas> by the screen (kit.tsx): no image is ever encoded.
import mapBack from "../../assets/body/map-back-2x.png";
import mapFront from "../../assets/body/map-front-2x.png";
import { MUSCLES, type Muscle } from "../../src/engine";
import { red } from "./model";

export type View = "front" | "back";
export type Theme = "light" | "dark";
/** body: ready grey and a red ramp. level: how hard an exercise works each muscle, in three reds. solid: listed muscles in one red. hero: listed muscles white on the red card. */
export type Kind = "body" | "level" | "solid" | "hero";
/** Lightly, moderately and highly worked. Further from the ground is more, as on the week strip. */
const LEVEL = { light: ["#EE8794", "#D91E36", "#7A0E1E"], dark: ["#EE8794", "#E22A40", "#7A0E1E"] };
const level = (v: number, theme: Theme): string => LEVEL[theme][v >= 1 ? 2 : v >= 0.5 ? 1 : 0]!;
/** all: the whole figure. legs: torso and legs with no arms, starting at the first whole muscle, for a legs day. */
export type Part = "all" | "legs";
type Box = [x0: number, y0: number, x1: number, y1: number];
/** What to paint: one colour per region code inside `box`, taking every `step`th map pixel; `keep` hides everything it marks 0. `key` changes when the picture does. */
export interface Drawing { key: string; view: View; w: number; h: number; box: Box; step: number; lut: Uint32Array; keep?: Uint8Array; lines?: Lines }
/** Contour rings inside some muscles, like lines on a map: which region codes get them, and the ring colour as the canvas stores it. */
interface Lines { codes: Uint8Array; colour: number }

/** The maps are drawn at twice the 468 x 860 artwork. */
const S = 2;
const THEMES = { light: { ready: "#AEAEB2", base: "#E1E1E6", on: "#D91E36", soft: "#EE8794" }, dark: { ready: "#48484A", base: "#2C2C2E", on: "#E22A40", soft: "#8E2233" } };
/** On the Today card: the body one step off the card's red, so only the muscles read. */
const ON_RED = { light: { ready: "#9B1B2E", base: "#B72038", on: "#FFFFFF", soft: "#D4586A" }, dark: { ready: "#8C1A2C", base: "#AC2036", on: "#FFFFFF", soft: "#D4586A" } };
/** Thumbnail tiles are lighter than the dark theme's cards, so the resting muscles step up with them. */
const THUMB = { light: THEMES.light, dark: { ...THEMES.dark, ready: "#636366", base: "#48484A" } };
const FRONT: Muscle[] = ["chest", "front_delt", "biceps", "quads", "abs", "forearms", "obliques", "adductors", "hip_flexors"];
/** The side of the body a muscle is drawn on. */
export const viewOf = (m: Muscle): View => (FRONT.includes(m) ? "front" : "back");

/** Each map as one number per pixel: region code in the low byte, coverage in the next. */
const maps: Partial<Record<View, { width: number; height: number; px: Uint32Array }>> = {};
let loading: Promise<void> | null = null;

/** The PNG is decoded off the main thread; only the read-back happens on it. */
async function decode(src: string): Promise<{ width: number; height: number; px: Uint32Array }> {
  const bmp = await createImageBitmap(await (await fetch(src)).blob(), { colorSpaceConversion: "none" });
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0);
  bmp.close();
  return { width: c.width, height: c.height, px: new Uint32Array(g.getImageData(0, 0, c.width, c.height).data.buffer) };
}
/** Resolves once both maps are decoded. */
export function ready(): Promise<void> {
  loading ??= Promise.all([decode(mapFront), decode(mapBack)]).then(([f, b]) => {
    maps.front = f;
    maps.back = b;
  });
  return loading;
}

/** "#RRGGBB" as the canvas stores a pixel (alpha left at 0, to be filled with the coverage). */
const abgr = (h: string) => parseInt(h.slice(1, 3), 16) | (parseInt(h.slice(3, 5), 16) << 8) | (parseInt(h.slice(5, 7), 16) << 16);

/** `shown`: how tall the picture is on screen, in CSS px. The map is sampled no finer than the screen can show, so a thumbnail costs a thumbnail. */
function drawing(view: View, base: string, colour: (m: Muscle) => string, box: Box, shown: number, keep?: Uint8Array): Drawing {
  const lut = new Uint32Array(256).fill(abgr(base));
  MUSCLES.forEach((m, i) => { lut[i + 1] = abgr(colour(m)); });
  const step = Math.max(1, Math.round((box[3] - box[1]) / (shown * (globalThis.devicePixelRatio || 1))));
  const [w, h] = [Math.ceil((box[2] - box[0]) / step), Math.ceil((box[3] - box[1]) / step)];
  return { key: `${view}|${box.join(",")}|${step}|${keep ? "k" : ""}|${lut.slice(0, MUSCLES.length + 1).join(",")}`, view, w, h, box, step, lut, keep };
}

type Map = { width: number; height: number; px: Uint32Array };
const small: Record<string, Map> = {};
/** The map at 1/n size, each pixel the average coverage of the block it stands for, so a small figure keeps smooth edges. Made once per size. */
function shrunk(view: View, n: number): Map {
  const m = maps[view]!;
  if (n === 1) return m;
  return (small[view + n] ??= (() => {
    const [w, h] = [Math.ceil(m.width / n), Math.ceil(m.height / n)];
    const px = new Uint32Array(w * h);
    for (let j = 0; j < h; j++) {
      const yb = Math.min(m.height, (j + 1) * n);
      for (let i = 0; i < w; i++) {
        const xb = Math.min(m.width, (i + 1) * n);
        let cover = 0;
        let code = 0;
        for (let y = j * n; y < yb; y++) {
          for (let q = y * m.width + i * n, end = y * m.width + xb; q < end; q++) {
            const v = m.px[q]!;
            cover += (v >> 8) & 255;
            code ||= v & 255;
          }
        }
        px[j * w + i] = code | (Math.round(cover / (n * n)) << 8);
      }
    }
    return { width: w, height: h, px };
  })());
}

/** Contour rings, in pixels of the full map (the 2x artwork): one ring every GAP in from a muscle's edge, WIDTH thick. */
const GAP = 21;
const WIDTH = 7.5;
const dists: Partial<Record<View, Float32Array>> = {};
/** How far each pixel of the full map is inside its muscle: the distance to the nearest pixel of anything else (two chamfer passes). Made once per side. */
function distances(view: View): Float32Array {
  return (dists[view] ??= (() => {
    const { width: w, height: h, px } = maps[view]!;
    const code = (p: number) => (((px[p]! >> 8) & 255) > 140 ? px[p]! & 255 : 0);
    const d = new Float32Array(w * h);
    for (let p = 0; p < w * h; p++) d[p] = code(p) ? 1e9 : 0;
    const pass = (from: number, to: number, dir: 1 | -1, nbs: [number, number][]) => {
      for (let y = from; y !== to; y += dir) for (let x = from === 1 ? 1 : w - 2; dir === 1 ? x < w - 1 : x > 0; x += dir) {
        const p = y * w + x;
        if (!d[p]) continue;
        const k = code(p);
        for (const [o, c] of nbs) { const v = code(p + o) === k ? d[p + o]! + c : c - 0.5; if (v < d[p]!) d[p] = v; }
      }
    };
    pass(1, h - 1, 1, [[-1, 1], [-w, 1], [-w - 1, Math.SQRT2], [-w + 1, Math.SQRT2]]);
    pass(h - 2, 0, -1, [[1, 1], [w, 1], [w + 1, Math.SQRT2], [w - 1, Math.SQRT2]]);
    return d;
  })());
}
/** How much of the ring colour a pixel `dd` in from its muscle's edge takes, 0..1. The edge itself stays clean. */
const ring = (dd: number) => {
  if (dd < GAP * 0.7) return 0;
  const t = Math.abs(((dd + GAP / 2) % GAP) - GAP / 2);
  return Math.max(0, Math.min(1, WIDTH / 2 + 0.75 - t));
};
const mix = (a: number, b: number, k: number) => {
  let out = 0;
  for (let sh = 0; sh < 24; sh += 8) out |= Math.round(((a >> sh) & 255) * (1 - k) + ((b >> sh) & 255) * k) << sh;
  return out;
};

/** Paints a drawing into a canvas that already has its width and height. */
export function draw(canvas: HTMLCanvasElement, d: Drawing): void {
  const n = d.step;
  const { width: mw, height: mh, px } = shrunk(d.view, n);
  const full = maps[d.view]!.width;
  const [x0, y0] = [Math.floor(d.box[0] / n), Math.floor(d.box[1] / n)];
  const out = new ImageData(d.w, d.h);
  const dst = new Uint32Array(out.data.buffer);
  const dist = d.lines ? distances(d.view) : null;
  const [ia, ib] = [Math.max(0, -x0), Math.min(d.w, mw - x0)];
  for (let j = Math.max(0, -y0); j < Math.min(d.h, mh - y0); j++) {
    let p = (y0 + j) * mw + x0 + ia;
    let o = j * d.w + ia;
    for (let i = ia; i < ib; i++, p++, o++) {
      if (d.keep && !d.keep[(y0 + j) * n * full + (x0 + i) * n]) continue;
      const v = px[p]!;
      let c = d.lut[v & 255]!;
      if (d.lines?.codes[v & 255]) {
        const k = ring(dist![(y0 + j) * n * full + (x0 + i) * n]!);
        if (k) c = mix(c, d.lines.colour, k);
      }
      dst[o] = (c | (((v >> 8) & 255) << 24)) >>> 0;
    }
  }
  canvas.getContext("2d")!.putImageData(out, 0, 0);
}

const legsCache: Partial<Record<View, { keep: Uint8Array; box: Box }>> = {};
/** Torso and legs only: no arms or hands, and above the hips only whole muscles, so nothing is sliced flat. */
function legs(view: View): { keep: Uint8Array; box: Box } {
  const cached = legsCache[view];
  if (cached) return cached;
  const { width: w, height: h, px } = maps[view]!;
  const keep = new Uint8Array(w * h);
  const hip = (view === "front" ? 400 : 440) * S;
  // The lower back is left out: cut off from the back it is two stray wedges above the glutes.
  const whole = (view === "front" ? ["abs", "quads"] : ["glutes"]).map((m) => MUSCLES.indexOf(m as Muscle) + 1);
  const cover = (p: number) => (px[p]! >> 8) & 255;
  let top = h;
  for (let y = 0; y < h; y++) {
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const solid = x < w && cover(y * w + x) > 76;
      if (solid && start < 0) start = x;
      if (!solid && start >= 0) {
        // A run of body on this row: the arms and hands are the runs centred outside the middle.
        const mid = (start + x) / 2;
        if (mid > 0.3 * w && mid < 0.7 * w) keep.fill(1, y * w + Math.max(0, start - S), y * w + Math.min(w, x + S));
        start = -1;
      }
    }
    if (y >= hip) continue;
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!whole.includes(px[p]! & 255)) keep[p] = 0;
      else if (keep[p] && cover(p) > 100 && y < top) top = y;
    }
  }
  return (legsCache[view] = { keep, box: [Math.round(0.27 * w), Math.max(0, top - 2 * S), Math.round(0.73 * w), h] });
}

/** The figure to paint, or null until the maps have loaded. `values` 0..1 per region; absent = ready / untouched. */
export function figure(view: View, theme: Theme, kind: Kind, values: Partial<Record<Muscle, number>>, shown: number, part: Part = "all", lines: readonly Muscle[] = []): Drawing | null {
  const map = maps[view];
  if (!map) return null;
  const pal = kind === "hero" ? ON_RED[theme] : THEMES[theme];
  const colour = (m: Muscle): string => {
    const v = values[m];
    if (v === undefined || v <= 0) return pal.ready;
    // On the card and the workout page a muscle is a target (1) or only helps (below 1).
    return kind === "body" ? red(v, theme) : kind === "level" ? level(v, theme) : v >= 1 ? pal.on : pal.soft;
  };
  const d = part === "all" ? drawing(view, pal.base, colour, [0, 0, map.width, map.height], shown) : drawing(view, pal.base, colour, legs(view).box, shown, legs(view).keep);
  return lines.length ? withLines(d, lines, LINE[kind === "hero" ? "hero" : "plain"][theme]) : d;
}

/** The ring colour: the card's red on a hero figure (white muscles), the deepest work red elsewhere. */
const LINE = { hero: { light: "#C4223A", dark: "#B8233A" }, plain: { light: "#7A0E1E", dark: "#FFFFFF" } };
function withLines(d: Drawing, lines: readonly Muscle[], colour: string): Drawing {
  const codes = new Uint8Array(256);
  lines.forEach((m) => { codes[MUSCLES.indexOf(m) + 1] = 1; });
  return { ...d, key: `${d.key}|lines:${lines.join(",")}:${colour}`, lines: { codes, colour: abgr(colour) } };
}

const boxes: Partial<Record<Muscle, Box>> = {};
/** A square close-up of one muscle, `size` CSS px across, on the resting figure: the picture for an exercise or a recovering muscle. `paint` is one colour for that muscle, or a level per muscle so the helpers in the frame show too. */
export function thumb(region: Muscle, theme: Theme, size: number, paint?: string | Partial<Record<Muscle, number>>): Drawing | null {
  const view = viewOf(region);
  const map = maps[view];
  if (!map) return null;
  if (!boxes[region]) {
    // One pass over every other pixel finds where each muscle on this side sits.
    const at = MUSCLES.map(() => [map.width, map.height, 0, 0]);
    for (let y = 0; y < map.height; y += 2) {
      for (let x = 0; x < map.width; x += 2) {
        const v = map.px[y * map.width + x]!;
        if (!(v & 255) || ((v >> 8) & 255) < 128) continue;
        const b = at[(v & 255) - 1];
        if (!b) continue;
        if (x < b[0]!) b[0] = x;
        if (x > b[2]!) b[2] = x;
        if (y < b[1]!) b[1] = y;
        if (y > b[3]!) b[3] = y;
      }
    }
    MUSCLES.forEach((m, i) => {
      const [x0, y0, x1, y1] = at[i] as Box;
      if (viewOf(m) !== view || x1 < x0) return;
      const half = Math.round(Math.max(x1 - x0, y1 - y0) * 0.59);
      const [cx, cy] = [Math.round((x0 + x1) / 2), Math.round((y0 + y1) / 2)];
      boxes[m] = [cx - half, cy - half, cx + half, cy + half];
    });
  }
  const box = boxes[region];
  if (!box) return null;
  const pal = THUMB[theme];
  const colour = (m: Muscle): string => {
    if (typeof paint === "object") return paint[m] ? level(paint[m]!, theme) : pal.ready;
    return m === region ? paint ?? pal.on : pal.ready;
  };
  return drawing(view, pal.base, colour, box, size);
}
