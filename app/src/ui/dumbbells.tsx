// Which dumbbells the user owns: fixed pairs, or an adjustable set's range.
import { ownedWeights } from "../../../src/engine";
import { dumbbellsOf, type DumbbellChoice } from "../store";
import { Opt, Seg, Segmented } from "./kit";
import { pop } from "./motion";

/** Fixed pairs offered, kg. */
export const DB_WEIGHTS = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30];

export const ownedFromChoice = (d: DumbbellChoice): number[] => {
  const db = dumbbellsOf(d);
  return db ? ownedWeights({ dumbbells: db } as never) : [];
};

export function DumbbellPicker({ value: D, set }: { value: DumbbellChoice; set: (d: DumbbellChoice) => void }) {
  const patch = (p: Partial<DumbbellChoice>) => set({ ...D, ...p });
  const step = "width: 44px; height: 44px; flex-shrink: 0; padding: 0; border: 0; border-radius: 999px; background: var(--bg); color: var(--ink); font-size: 22px; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center;";
  const ranges = [
    { label: "Lightest", value: D.min, dec: () => patch({ min: Math.max(1, D.min - 1) }), inc: () => patch({ min: Math.min(D.max, D.min + 1) }) },
    { label: "Heaviest", value: D.max, dec: () => patch({ max: Math.max(D.min, D.max - 1) }), inc: () => patch({ max: Math.min(60, D.max + 1) }) },
    { label: "Step", value: D.step, dec: () => patch({ step: Math.max(0.5, D.step - 0.5) }), inc: () => patch({ step: Math.min(5, D.step + 0.5) }) },
  ];
  return (
    <div ref={pop} role="group" aria-label="Dumbbells" style="display: flex; flex-direction: column; gap: 12px;">
      <Segmented>
        <Seg label="Fixed pairs" on={D.type === "fixed"} pick={() => patch({ type: "fixed" })} />
        <Seg label="Adjustable" on={D.type === "adjustable"} pick={() => patch({ type: "adjustable" })} />
      </Segmented>
      {D.type === "fixed" ? (
        <div ref={pop} role="group" aria-label="Weights you own" style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px;">
          {DB_WEIGHTS.map((k) => (
            <Opt key={k} mono label={`${k} kg`} on={D.fixed.includes(k)} pick={() => patch({ fixed: D.fixed.includes(k) ? D.fixed.filter((x) => x !== k) : [...D.fixed, k] })} />
          ))}
        </div>
      ) : (
        <div ref={pop} style="display: flex; flex-direction: column; gap: 8px;">
          {ranges.map((r) => (
            <div key={r.label} role="group" aria-label={r.label} style="display: flex; align-items: center; gap: 8px;">
              <span style="flex-grow: 1; font-size: 15px; font-weight: 600; letter-spacing: -0.01em;">{r.label}</span>
              <button type="button" class="press" onClick={r.dec} aria-label="Less" style={step}>−</button>
              <span style="width: 72px; text-align: center; font-family: var(--mono); font-size: 16px; font-weight: 600;">{r.value} kg</span>
              <button type="button" class="press" onClick={r.inc} aria-label="More" style={step}>+</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
