// Colour tokens per theme. Light and dark are mirror images.
export type ThemeName = "light" | "dark";

const light = {
  bg: "#F2F2F7", surface: "#FFFFFF", ink: "#1C1C1E", muted: "#636366", faint: "#85858B", line: "#D1D1D6", track: "#E1E1E6",
  idle: "#AEAEB2", accent: "#D91E36", soft: "rgba(0,0,0,0.05)", hero: "#C4223A", heroInk: "#FFFFFF", onAccent: "#FFFFFF", avatar: "#E3E3E8",
  nav: "#FFFFFF", navOn: "#1C1C1E", navOnInk: "#FFFFFF", navInk: "#636366",
  glassInk: "#1C1C1E", glassInv: "#FFFFFF", glassMuted: "rgba(28,28,30,0.64)", glassBtn: "rgba(0,0,0,0.07)", glassStep: "#FFFFFF",
  frost: "rgba(255,255,255,0.86)", fill: "rgba(28,28,30,0.07)", video: "#DCDCE2", videoInk: "rgba(0,0,0,0.32)",
  vTrack: "rgba(0,0,0,0.14)", vFill: "#1C1C1E", vInk: "#1C1C1E", vMuted: "rgba(28,28,30,0.62)",
  w1: "#EE8794", w2: "#D91E36", w3: "#7A0E1E", onW1: "#5E0A17", onW2: "#FFFFFF", onW3: "#FFFFFF",
  accentText: "#D91E36", up: "#1A6B3B", upBg: "rgba(31,122,68,0.14)", down: "#B0152B", downBg: "rgba(217,30,54,0.11)",
};
const dark: typeof light = {
  bg: "#000000", surface: "#1C1C1E", ink: "#F5F5F7", muted: "#A1A1A6", faint: "#8E8E93", line: "#3A3A3C", track: "#2C2C2E",
  idle: "#48484A", accent: "#E22A40", soft: "rgba(255,255,255,0.09)", hero: "#B8233A", heroInk: "#FFFFFF", onAccent: "#FFFFFF", avatar: "#3A3A3C",
  nav: "#2C2C2E", navOn: "#F5F5F7", navOnInk: "#000000", navInk: "rgba(245,245,247,0.66)",
  glassInk: "#FFFFFF", glassInv: "#1C1C1E", glassMuted: "rgba(255,255,255,0.72)", glassBtn: "rgba(255,255,255,0.16)", glassStep: "rgba(255,255,255,0.18)",
  frost: "rgba(44,44,46,0.9)", fill: "rgba(255,255,255,0.1)", video: "#2C2C2E", videoInk: "rgba(255,255,255,0.45)",
  vTrack: "rgba(255,255,255,0.3)", vFill: "#FFFFFF", vInk: "#FFFFFF", vMuted: "rgba(255,255,255,0.72)",
  w1: "#EE8794", w2: "#E22A40", w3: "#7A0E1E", onW1: "#5E0A17", onW2: "#FFFFFF", onW3: "#FFFFFF",
  accentText: "#FF6B7B", up: "#3DD68C", upBg: "rgba(61,214,140,0.16)", down: "#FF6B7B", downBg: "rgba(255,107,123,0.16)",
};
export const THEMES = { light, dark };
export type Colors = typeof light;

/** model.ts names colours as CSS variables ("var(--w2)"); this turns one into the colour for the theme. */
export function cssVar(v: string, c: Colors): string {
  const m = v.match(/^var\(--([a-z0-9-]+)\)$/);
  if (!m) return v;
  const key = m[1]!.replace(/-([a-z0-9])/g, (_, ch: string) => ch.toUpperCase()) as keyof Colors;
  return c[key] ?? v;
}

export const FONT = {
  400: "Geist_400Regular", 500: "Geist_500Medium", 600: "Geist_600SemiBold", 700: "Geist_700Bold", 800: "Geist_800ExtraBold",
  mono: "GeistMono_600SemiBold",
} as const;
