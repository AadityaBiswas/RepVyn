// The anatomy figures on the phone: each figure is one Skia canvas drawn by one shader on the GPU,
// instead of a stack of ~11 tinted image views. The shader reads the region map (mobile/scripts/make_figures.py:
// R = muscle code, +32 where the legs-only view keeps the pixel; G = coverage; B = contour-ring strength) and colours each
// pixel from an 18-entry table built by figureCore.ts, so the rules stay the same as the web preview's.
import { memo, useEffect, useState } from "react";
import { Image as RNImage, View, type StyleProp, type ViewStyle } from "react-native";
import { Canvas, FilterMode, Fill, ImageShader, MipmapMode, Shader, Skia, type SkImage } from "@shopify/react-native-skia";
import type { Muscle } from "../../src/engine";
import { FIG, MAPS } from "./figures.gen";
import { MUSCLES, describe, figureBox, figurePaint, same, thumbBox, thumbPaint, useFittedHeight, viewOf, type Box, type FigView, type Kind, type Paint, type Part } from "./figureCore";
import type { ThemeName } from "./theme";

export { viewOf };
export type { FigView, Kind, Part };

const N = MUSCLES.length + 1; // code 0 is the body's ground, 1..17 the muscles
const effect = Skia.RuntimeEffect.Make(`
uniform shader codes;      // the map, sampled nearest: codes must never blend
uniform shader cover;      // the same map, sampled smoothly: coverage and rings
uniform float2 origin;     // top-left of the shown region, in map pixels
uniform float scale;       // map pixels per point
uniform float legs;        // 1 = the legs-only view
uniform float4 lut[${N}];  // colour per code
uniform float ring[${N}];  // 1 where that code carries contour rings
uniform float4 line;       // ring colour
half4 main(float2 p) {
  float2 q = origin + p * scale;
  float v = floor(codes.eval(q).r * 255.0 + 0.5);
  float keep = step(31.5, v);
  float code = v - 32.0 * keep;
  half4 m = cover.eval(q);
  float4 col = lut[0];
  float r = 0.0;
  for (int i = 0; i < ${N}; i++) { if (float(i) == code) { col = lut[i]; r = ring[i]; } }
  col.rgb = mix(col.rgb, line.rgb, r * m.b);
  float a = m.g * mix(1.0, keep, legs);
  return half4(col.rgb * a, a);
}`)!;

const rgba = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).concat(1);

// The two maps are decoded once for the whole app; every figure shares them.
const maps: Partial<Record<FigView, SkImage>> = {};
let loading: Promise<void> | null = null;
const load = () => (loading ??= Promise.all((["front", "back"] as const).map(async (v) => {
  const src = RNImage.resolveAssetSource(MAPS[v]);
  if (!src) return;
  const data = await Skia.Data.fromURI(src.uri);
  const img = Skia.Image.MakeImageFromEncoded(data);
  if (img) maps[v] = img;
})).then(() => {}));
function useMap(view: FigView): SkImage | null {
  const [, ready] = useState(0);
  useEffect(() => { if (!maps[view]) void load().then(() => ready((n) => n + 1)); }, [view]);
  return maps[view] ?? null;
}

/** One shader-drawn figure: `box` of the map, `w` x `h` points. */
function Draw({ view, box, w, h, paint, lines = [], legs }: { view: FigView; box: Box; w: number; h: number; paint: Paint; lines?: readonly Muscle[]; legs: boolean }) {
  const map = useMap(view);
  if (!map) return null;
  const lut = [rgba(paint.base), ...MUSCLES.map((m) => rgba(paint.colour(m)))];
  const ring = [0, ...MUSCLES.map((m) => (lines.includes(m) ? 1 : 0))];
  const rect = { x: 0, y: 0, width: FIG[view].w, height: FIG[view].h };
  return (
    <Canvas style={{ width: w, height: h }}>
      <Fill>
        <Shader source={effect} uniforms={{ origin: [box[0], box[1]], scale: (box[3] - box[1]) / h, legs: legs ? 1 : 0, lut, ring, line: rgba(paint.line) }}>
          <ImageShader image={map} tx="decal" ty="decal" fit="none" rect={rect} sampling={{ filter: FilterMode.Nearest, mipmap: MipmapMode.None }} />
          <ImageShader image={map} tx="decal" ty="decal" fit="none" rect={rect} sampling={{ filter: FilterMode.Linear, mipmap: MipmapMode.Linear }} />
        </Shader>
      </Fill>
    </Canvas>
  );
}

/** One coloured figure, `h` tall, as wide as its artwork. `values` 0..1 per muscle; absent = ready. */
export const Fig = memo(function Fig({ view, kind = "body", values, theme, h, part = "all", lines, style, label }: { view: FigView; kind?: Kind; values: Partial<Record<Muscle, number>>; theme: ThemeName; h: number; part?: Part; lines?: readonly Muscle[]; style?: StyleProp<ViewStyle>; label?: string }) {
  const a11y = label ? { accessible: true, accessibilityRole: "image" as const, accessibilityLabel: label } : { accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" as const };
  const box = figureBox(view, part);
  const w = ((box[2] - box[0]) * h) / (box[3] - box[1]);
  return (
    <View {...a11y} pointerEvents="none" style={[{ width: w, height: h }, style]}>
      <Draw view={view} box={box} w={w} h={h} paint={figurePaint(kind, theme, values)} lines={lines} legs={part === "legs"} />
    </View>
  );
}, same);

/** Front and back side by side, centred. */
export function Figures({ kind, values, theme, h: want, gap = 8, part, inset = 0, lead }: { kind?: Kind; values: Partial<Record<Muscle, number>>; theme: ThemeName; h: number; gap?: number; part?: Part; inset?: number; lead?: string }) {
  const h = useFittedHeight(want, part, inset, gap);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={describe(values, lead, part === "legs" ? "legs, front and back" : "front and back")} style={{ flexDirection: "row", justifyContent: "center", gap }}>
      <Fig view="front" kind={kind} values={values} theme={theme} h={h} part={part} />
      <Fig view="back" kind={kind} values={values} theme={theme} h={h} part={part} />
    </View>
  );
}

/** A square close-up of one muscle on the resting figure. `paint`: one colour for that muscle, or a level per muscle. */
export const Thumb = memo(function Thumb({ region, theme, size = 56, radius = 16, bg, paint }: { region: Muscle | undefined; theme: ThemeName; size?: number; radius?: number; bg: string; paint?: string | Partial<Record<Muscle, number>> }) {
  const box = thumbBox(region);
  return (
    <View pointerEvents="none" style={{ width: size, height: size, borderRadius: radius, backgroundColor: bg, overflow: "hidden" }}>
      {box && region && <Draw view={viewOf(region)} box={box} w={size} h={size} paint={thumbPaint(region, theme, paint)} legs={false} />}
    </View>
  );
}, same);
