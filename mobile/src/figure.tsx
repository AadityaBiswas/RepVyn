// The anatomy figures for the web preview: one white mask per muscle (mobile/scripts/make_figures.py), tinted with Image
// tintColor. The phone draws them with one Skia shader each instead (figure.native.tsx); both follow figureCore.ts.
import { memo } from "react";
import { Image, View, type StyleProp, type ViewStyle } from "react-native";
import type { Muscle } from "../../src/engine";
import { FIG, IMG } from "./figures.gen";
import { describe, figureBox, figurePaint, same, thumbBox, thumbPaint, useFittedHeight, viewOf, type Box, type FigView, type Kind, type Paint, type Part } from "./figureCore";
import type { ThemeName } from "./theme";

export { viewOf };
export type { FigView, Kind, Part };

/** The masks of one side inside `box`, scaled by `k`, each tinted; rings over the `lines` muscles. */
function Stack({ view, set, box, k, paint, lines = [] }: { view: FigView; set: "all" | "legs"; box: Box; k: number; paint: Paint; lines?: readonly Muscle[] }) {
  const v = FIG[view];
  const masks = v[set] as Record<string, Box>;
  const rings = v.rings as Record<string, Box>;
  const place = (b: Box) => ({ position: "absolute" as const, left: (b[0] - box[0]) * k, top: (b[1] - box[1]) * k, width: (b[2] - b[0]) * k, height: (b[3] - b[1]) * k });
  return (
    <>
      {Object.entries(masks).map(([name, b]) => (
        <Image key={name} source={IMG[`${view}-${set}-${name}`]!} style={[place(b), { tintColor: name === "base" ? paint.base : paint.colour(name as Muscle) }]} resizeMode="stretch" fadeDuration={0} />
      ))}
      {lines.map((m) => rings[m] && <Image key={`r-${m}`} source={IMG[`${view}-ring-${m}`]!} style={[place(rings[m]!), { tintColor: paint.line }]} resizeMode="stretch" fadeDuration={0} />)}
    </>
  );
}

/** One coloured figure, `h` tall, as wide as its artwork. `values` 0..1 per muscle; absent = ready. */
export const Fig = memo(function Fig({ view, kind = "body", values, theme, h, part = "all", lines, style, label }: { view: FigView; kind?: Kind; values: Partial<Record<Muscle, number>>; theme: ThemeName; h: number; part?: Part; lines?: readonly Muscle[]; style?: StyleProp<ViewStyle>; label?: string }) {
  const a11y = label ? { accessible: true, accessibilityRole: "image" as const, accessibilityLabel: label } : { accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" as const };
  const box = figureBox(view, part);
  const k = h / (box[3] - box[1]);
  return (
    <View {...a11y} pointerEvents="none" style={[{ width: (box[2] - box[0]) * k, height: h, overflow: "hidden" }, style]}>
      <Stack view={view} set={part} box={box} k={k} paint={figurePaint(kind, theme, values)} lines={lines} />
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
      {box && region && <Stack view={viewOf(region)} set="all" box={box} k={size / (box[2] - box[0])} paint={thumbPaint(region, theme, paint)} />}
    </View>
  );
}, same);
