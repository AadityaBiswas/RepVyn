// npm run sim -- --scenario <name> [--weeks 12] [--seed 1]
import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { runScenario } from "../sim/runner";
import { scenario, SCENARIOS } from "../sim/scenarios";
import { loadCatalogAndParams } from "./report";

try {
  const { values } = parseArgs({ options: { scenario: { type: "string" }, weeks: { type: "string", default: "12" }, seed: { type: "string", default: "1" } } });
  if (!values.scenario) throw new Error(`usage: npm run sim -- --scenario <name> [--weeks 12] [--seed 1]\nscenarios: ${SCENARIOS.map((s) => s.name).join(", ")}`);
  const weeks = Number(values.weeks);
  const seed = Number(values.seed);
  if (!Number.isInteger(weeks) || weeks < 1) throw new Error(`--weeks: expected a positive integer, got ${values.weeks}`);
  if (!Number.isInteger(seed)) throw new Error(`--seed: expected an integer, got ${values.seed}`);
  const sc = scenario(values.scenario);
  const { catalog, params } = await loadCatalogAndParams();
  const r = runScenario(sc, { weeks, seed, catalog, params });

  console.log(`scenario ${sc.name}, seed ${seed}, ${weeks} weeks — hidden truth: rho=${sc.rhoTrue} b=${sc.bTrue} d=${sc.dTrue}`);
  console.log("region order: chest front_delt side_rear_delt triceps upper_back biceps quads glutes hamstrings calves abs lower_back (R ready, r recovering, F fatigued)\n");
  console.log(`${"date".padEnd(10)}  ${"plan".padEnd(8)} ${"regions".padEnd(12)}  rho    b      d      exercises × sets done`);
  for (const d of r.days) {
    console.log(`${d.date}  ${d.plan.padEnd(8)} ${d.states.padEnd(12)}  ${d.rho.toFixed(2)}  ${d.b.toFixed(2).padStart(5)}  ${d.d.toFixed(3)}  ${d.exercises}`);
  }
  console.log(`\nweekly rep MAE: ${r.weeklyMae.map((m, i) => `w${i + 1}=${m === null ? "—" : m.toFixed(2)}`).join("  ")}`);
  console.log(`final learned: rho=${r.state.rho.value.toFixed(3)} (true ${sc.rhoTrue})  b=${r.state.b.value.toFixed(3)} (true ${sc.bTrue})  d=${r.state.d.value.toFixed(3)} (true ${sc.dTrue})`);
  console.log(`max weekly done/target: ${Math.max(...r.weeklyDoneRatio).toFixed(2)}   fatigued-region violations: ${r.violations.length}`);

  mkdirSync("out", { recursive: true });
  const base = `out/${sc.name}-seed${seed}`;
  const { events, state, ...rest } = r;
  writeFileSync(`${base}.json`, JSON.stringify({
    ...rest,
    learned: { rho: state.rho, b: state.b, d: state.d, deload: state.deload },
    capacity: Object.fromEntries(Object.entries(state.capacity).map(([id, c]) => [id, { ...c, Mtrue: r.truth.M[id] }])),
    eventCount: events.length,
  }, null, 1));
  writeFileSync(`${base}.events.json`, JSON.stringify(events, null, 1));
  console.log(`\nwrote ${base}.json and ${base}.events.json (replay it: npm run replay -- --file ${base}.events.json)`);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
