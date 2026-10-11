// One icon family for the whole app: 24 × 24, 2 px round strokes in currentColor, like the tab bar.
// Workout length, intensity and every piece of equipment have one picture each, used wherever they appear.
import type { ComponentChildren } from "preact";
import type { Equipment } from "../../../src/engine";

export type Intensity = "easy" | "normal" | "hard";
export const EQUIP_NAMES: Record<Equipment, string> = { dumbbell: "Dumbbells", bench: "Bench", resistance_band: "Band", pullup_bar: "Pull-up bar", table: "Table", chair: "Chair" };

const Svg = ({ size = 20, children, fill }: { size?: number; children: ComponentChildren; fill?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke={fill ? "none" : "currentColor"} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink: 0; display: block;">{children}</svg>
);

export const Clock = ({ size }: { size?: number }) => <Svg size={size}><circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12l3 2"></path></Svg>;
export const ListIcon = ({ size }: { size?: number }) => <Svg size={size}><path d="M9.5 6.5H20M9.5 12H20M9.5 17.5H20"></path><circle cx="4.75" cy="6.5" r="0.6"></circle><circle cx="4.75" cy="12" r="0.6"></circle><circle cx="4.75" cy="17.5" r="0.6"></circle></Svg>;
export const Layers = ({ size }: { size?: number }) => <Svg size={size}><path d="M12 3.5l8.5 4.25L12 12 3.5 7.75z"></path><path d="M3.5 12.25 12 16.5l8.5-4.25"></path><path d="M3.5 16.25 12 20.5l8.5-4.25"></path></Svg>;
export const Plus = ({ size }: { size?: number }) => <Svg size={size}><path d="M12 5v14M5 12h14"></path></Svg>;
export const Minus = ({ size }: { size?: number }) => <Svg size={size}><path d="M5 12h14"></path></Svg>;

const LEVEL: Record<Intensity, number> = { easy: 1, normal: 2, hard: 3 };
/** Three rising bars, as many lit as the intensity. */
export const IntensityIcon = ({ level, size }: { level: Intensity; size?: number }) => {
  const n = LEVEL[level];
  return (
    <Svg size={size} fill>
      {[[3.5, 14, 6], [10, 9.5, 10.5], [16.5, 4.5, 15.5]].map(([x, y, h], i) => (
        <rect key={i} x={x} y={y} width="4" height={h} rx="1.6" style={`opacity: ${i < n ? 1 : 0.28}; transition: opacity 240ms ease;`}></rect>
      ))}
    </Svg>
  );
};

const EQUIP_PATHS: Record<Equipment | "bodyweight", ComponentChildren> = {
  // A figure flexing both arms: the body is the equipment.
  bodyweight: <><circle cx="12" cy="4.5" r="2"></circle><path d="M12 8.5v6M12 9.75 7.25 9.5 6.25 5.5M12 9.75l4.75-.25 1 -4M12 14.5l-3 6M12 14.5l3 6"></path></>,
  dumbbell: <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"></path>,
  bench: <><rect x="2.5" y="8.5" width="19" height="3.5" rx="1.75"></rect><path d="M6 12v6.5M18 12v6.5M4 18.5h4M16 18.5h4"></path></>,
  resistance_band: <><ellipse cx="12" cy="12" rx="9" ry="5.5" transform="rotate(-24 12 12)"></ellipse><ellipse cx="12" cy="12" rx="5.25" ry="2.4" transform="rotate(-24 12 12)"></ellipse></>,
  pullup_bar: <path d="M3.5 4v5M20.5 4v5M3.5 6.5h17M9 6.5v5.25M15 6.5v5.25M7.5 11.75h3M13.5 11.75h3"></path>,
  table: <><rect x="2.5" y="7" width="19" height="3" rx="1.25"></rect><path d="M5.5 10v10M18.5 10v10M5.5 14.5h13"></path></>,
  chair: <path d="M7 3.5v17M7 12.75h10.5v7.75M7 3.5h4.5M7 8h4.5"></path>,
};
export const EquipIcon = ({ item, size }: { item: Equipment | "bodyweight"; size?: number }) => <Svg size={size}>{EQUIP_PATHS[item]}</Svg>;

/**
 * Each piece of equipment as a round "profile picture" in the app's own greys: a solid ink picture on a grey disc.
 * Bodyweight is a person in motion, because the body is the equipment. The same avatar is used everywhere equipment appears.
 */
const GLYPHS: Record<Equipment | "bodyweight", ComponentChildren> = {
  // A person mid star jump: the body is the equipment. Active, so it never reads as a profile picture.
  bodyweight: <><circle cx="12" cy="4" r="2.4"></circle><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="M12 8.2v6.3M12 9.6 6.2 6M12 9.6 17.8 6M12 14.5l-4.6 6.2M12 14.5l4.6 6.2"></path></>,
  dumbbell: <><rect x="7" y="10.9" width="10" height="2.2" rx="1.1"></rect><rect x="4.4" y="6.8" width="3.4" height="10.4" rx="1.3"></rect><rect x="16.2" y="6.8" width="3.4" height="10.4" rx="1.3"></rect><rect x="2" y="9.3" width="2.8" height="5.4" rx="1.1"></rect><rect x="19.2" y="9.3" width="2.8" height="5.4" rx="1.1"></rect></>,
  bench: <><rect x="3" y="8.2" width="18" height="3.6" rx="1.8"></rect><rect x="5.6" y="11" width="2.3" height="6.8" rx="1"></rect><rect x="16.1" y="11" width="2.3" height="6.8" rx="1"></rect><rect x="4" y="16.6" width="5.5" height="2.2" rx="1.1"></rect><rect x="14.5" y="16.6" width="5.5" height="2.2" rx="1.1"></rect></>,
  resistance_band: <path fill-rule="evenodd" transform="rotate(-24 12 12)" d="M3 12a9 5.6 0 1 0 18 0a9 5.6 0 1 0-18 0zM6.9 12a5.1 2.4 0 1 0 10.2 0a5.1 2.4 0 1 0-10.2 0z"></path>,
  pullup_bar: <><rect x="3" y="5.6" width="18" height="2.4" rx="1.2"></rect><rect x="2.6" y="3.2" width="2.4" height="7.6" rx="1.2"></rect><rect x="19" y="3.2" width="2.4" height="7.6" rx="1.2"></rect><rect x="8" y="7.4" width="2.2" height="5.2" rx="1.1"></rect><rect x="13.8" y="7.4" width="2.2" height="5.2" rx="1.1"></rect></>,
  table: <><rect x="2.5" y="6.8" width="19" height="3.2" rx="1.4"></rect><rect x="4.6" y="9" width="2.4" height="11" rx="1.1"></rect><rect x="17" y="9" width="2.4" height="11" rx="1.1"></rect><rect x="5" y="13.6" width="14" height="1.8" rx="0.9"></rect></>,
  chair: <><rect x="6" y="2.8" width="2.5" height="18.4" rx="1.25"></rect><rect x="6" y="11.4" width="12" height="2.8" rx="1.3"></rect><rect x="15.5" y="12" width="2.5" height="9.2" rx="1.25"></rect><rect x="6" y="4" width="6.5" height="2.2" rx="1.1"></rect><rect x="6" y="7.6" width="6.5" height="2.2" rx="1.1"></rect></>,
};
/** One equipment avatar, `size` across. `ring` cuts it out of whatever sits behind it in a stack. */
export function EquipAvatar({ item, size = 32, ring }: { item: Equipment | "bodyweight"; size?: number; ring?: string }) {
  return (
    <span aria-hidden="true" style={`width: ${size}px; height: ${size}px; flex-shrink: 0; box-sizing: border-box; border-radius: 999px; overflow: hidden; background: var(--avatar); color: var(--ink); display: flex; align-items: center; justify-content: center; ${ring ? `box-shadow: 0 0 0 2px ${ring};` : ""}`}>
      <svg width={Math.round(size * 0.66)} height={Math.round(size * 0.66)} viewBox="0 0 24 24" fill="currentColor" style="display: block;">{GLYPHS[item]}</svg>
    </span>
  );
}

/**
 * Chosen equipment at a glance, like a row of profile pictures: overlapping avatars, `max` at most, the last one then a count ("+4").
 * The stack is only as wide as its avatars. `body` puts Bodyweight first, since bodyweight moves are always in the plan. `ring` is the colour behind it, so each avatar is cut out of the one under it.
 */
export function EquipStack({ items, ring = "var(--surface)", size = 30, max = 3, body }: { items: readonly Equipment[]; ring?: string; size?: number; max?: number; body?: boolean }) {
  const all: (Equipment | "bodyweight")[] = body || !items.length ? ["bodyweight", ...items] : [...items];
  const shown = all.length > max ? all.slice(0, max - 1) : all;
  const more = all.length - shown.length;
  const overlap = Math.round(size * 0.42);
  return (
    <span aria-hidden="true" style="display: inline-flex; align-items: center; flex-shrink: 0;">
      {shown.map((e, i) => <span key={e} style={`position: relative; z-index: ${10 - i}; margin-left: ${i ? -overlap : 0}px; display: flex; border-radius: 999px;`}><EquipAvatar item={e} size={size} ring={ring} /></span>)}
      {more > 0 && <span style={`position: relative; margin-left: -${overlap}px; width: ${size}px; height: ${size}px; box-sizing: border-box; border-radius: 999px; background: var(--track); color: var(--ink); box-shadow: 0 0 0 2px ${ring}; display: flex; align-items: center; justify-content: center; font-size: ${Math.round(size * 0.4)}px; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums;`}>+{more}</span>}
    </span>
  );
}

/** The equipment one exercise needs, as small avatars after its sets and reps. Nothing for a bodyweight exercise. */
export const EquipInline = ({ items }: { items: readonly Equipment[] }) =>
  items.length ? <span role="img" aria-label={`Needs ${items.map((e) => EQUIP_NAMES[e].toLowerCase()).join(", ")}`} style="display: inline-flex; margin-left: 8px; vertical-align: -5px;"><EquipStack items={items} size={20} ring="var(--surface)" /></span> : null;
