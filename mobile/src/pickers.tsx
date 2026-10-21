// Equipment tiles and the dumbbell picker, after app/src/ui/tabs.tsx (EquipOptions) and dumbbells.tsx.
import { View } from "react-native";
import { EQUIPMENT, type Equipment } from "../../src/engine";
import type { DumbbellChoice } from "../../app/src/store";
import { Press } from "./motion";
import { useApp } from "./app";
import { EQUIP_NAMES, EquipAvatar, Grid, Opt, Segmented, T, tick } from "./kit";

const EQUIP_ORDER: Equipment[] = ["dumbbell", "bench", "resistance_band", "pullup_bar", "table", "chair"];
export const equipLabel = (eq: Equipment[]) => (eq.length === 0 ? "Bodyweight" : eq.length === 1 ? `Bodyweight + ${EQUIP_NAMES[eq[0]!].toLowerCase()}` : `Bodyweight + ${eq.length} items`);

/** Bodyweight (always on) and every item as tiles, three to a row. A chosen tile is the dark one. */
export function EquipOptions({ value, set }: { value: Equipment[]; set: (eq: Equipment[]) => void }) {
  const { c } = useApp();
  const tile = (item: Equipment | "bodyweight", label: string, on: boolean, pick: () => void) => (
    <Press key={item} onPress={() => { tick(); pick(); }} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ minHeight: 80, gap: 8, paddingTop: 6, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.ink : c.bg }}>
      <EquipAvatar item={item} size={38} />
      <T w={600} size={14} color={on ? c.bg : c.ink}>{label}</T>
    </Press>
  );
  return (
    <Grid cols={3}>
      {[tile("bodyweight", "Bodyweight", true, () => {}),
        ...EQUIP_ORDER.filter((e) => EQUIPMENT.includes(e)).map((e) => tile(e, EQUIP_NAMES[e], value.includes(e), () => set(value.includes(e) ? value.filter((x) => x !== e) : [...value, e])))]}
    </Grid>
  );
}

/** Fixed pairs offered, kg. */
const DB_WEIGHTS = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30];

export function DumbbellPicker({ value: D, set }: { value: DumbbellChoice; set: (d: DumbbellChoice) => void }) {
  const { c } = useApp();
  const patch = (p: Partial<DumbbellChoice>) => set({ ...D, ...p });
  const ranges = [
    { label: "Lightest", value: D.min, dec: () => patch({ min: Math.max(1, D.min - 1) }), inc: () => patch({ min: Math.min(D.max, D.min + 1) }) },
    { label: "Heaviest", value: D.max, dec: () => patch({ max: Math.max(D.min, D.max - 1) }), inc: () => patch({ max: Math.min(60, D.max + 1) }) },
    { label: "Step", value: D.step, dec: () => patch({ step: Math.max(0.5, D.step - 0.5) }), inc: () => patch({ step: Math.min(5, D.step + 0.5) }) },
  ];
  const step = { width: 44, height: 44, borderRadius: 999, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" } as const;
  return (
    <View style={{ gap: 12 }}>
      <Segmented options={[
        { key: "fixed", label: "Fixed pairs", on: D.type === "fixed", pick: () => patch({ type: "fixed" }) },
        { key: "adj", label: "Adjustable", on: D.type === "adjustable", pick: () => patch({ type: "adjustable" }) },
      ]} />
      {D.type === "fixed" ? (
        <Grid cols={4}>{DB_WEIGHTS.map((k) => <Opt key={k} mono label={`${k} kg`} on={D.fixed.includes(k)} pick={() => patch({ fixed: D.fixed.includes(k) ? D.fixed.filter((x) => x !== k) : [...D.fixed, k] })} />)}</Grid>
      ) : (
        <View style={{ gap: 8 }}>
          {ranges.map((r) => (
            <View key={r.label} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <T w={600} style={{ flexGrow: 1 }}>{r.label}</T>
              <Press onPress={() => { tick(); r.dec(); }} accessibilityLabel="Less" style={step}><T size={22} w={500}>−</T></Press>
              <T mono size={16} style={{ width: 72, textAlign: "center" }}>{`${r.value} kg`}</T>
              <Press onPress={() => { tick(); r.inc(); }} accessibilityLabel="More" style={step}><T size={22} w={500}>+</T></Press>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
