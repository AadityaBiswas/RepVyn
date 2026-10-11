import { describe, expect, it } from "vitest";
import { level } from "../src/engine";
import { runScenario } from "../src/sim/runner";
import { scenario } from "../src/sim/scenarios";
import { catalog, params } from "./helpers";

/** Mean capacity error (engine M vs the hidden truth) over the sessions of weeks 9–12, averaged over seeds. */
function run(name: string, lastSetRirOnly: boolean) {
  const seeds = [1, 2, 3];
  const rs = seeds.map((seed) => runScenario({ ...scenario(name), lastSetRirOnly }, { weeks: 12, seed, catalog, params: params() }));
  const late = rs.flatMap((r) => r.sessions.filter((x) => x.week >= 9).map((x) => x.capRelErr));
  return { capErr: late.reduce((a, b) => a + b, 0) / late.length, level: rs.map((r) => level(r.state).score), calibrated: rs.every((r) => r.state.calibratedAt !== null) };
}

describe("simulated users who rate only the last set of each exercise", () => {
  for (const [name, trueLevel] of [["beginner_3x_no_equipment", 0], ["intermediate_5x_bar_bands", 1]] as const) {
    it(`${name}: the engine still learns capacity and level`, () => {
      const last = run(name, true);
      expect(last.calibrated).toBe(true);
      expect(last.capErr).toBeLessThan(0.12);
      for (const l of last.level) expect(Math.abs(l - trueLevel)).toBeLessThan(0.5);
    });
  }
});
