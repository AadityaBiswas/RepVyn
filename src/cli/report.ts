import { readFileSync } from "node:fs";
import rawCatalog from "../../catalog/library";
import rawParams from "../../params/default.params.json";
import {
  diagnostics, EventSchema, readiness, REGIONS, systemic, weeklyNeed,
  type EngineEvent, type EngineState, type Plan,
} from "../engine";
import { MemoryCatalogStore, MemoryParamsStore } from "../storage/memory";

const STATE_CHAR = { ready: "R", recovering: "r", fatigued: "F" } as const;

export const loadCatalogAndParams = async () => ({
  catalog: await new MemoryCatalogStore(rawCatalog).load(),
  params: await new MemoryParamsStore([rawParams]).load(),
});

/** Read and validate a JSON array of events. */
export function readEventsFile(file: string): EngineEvent[] {
  const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(raw)) throw new Error(`${file}: expected a JSON array of events`);
  return raw.map((e, i) => {
    const r = EventSchema.safeParse(e);
    if (!r.success) throw new Error(`${file}: event #${i}: ${r.error.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`);
    return r.data;
  });
}

/** --now ISO, or the time of the last event. */
export function resolveNow(events: EngineEvent[], nowIso?: string): { now: number; note: string } {
  if (nowIso) {
    const now = Date.parse(nowIso);
    if (Number.isNaN(now)) throw new Error(`--now: not a valid ISO date: ${nowIso}`);
    return { now, note: "" };
  }
  const last = Math.max(...events.map((e) => e.ts));
  if (!Number.isFinite(last)) throw new Error("no events");
  return { now: last, note: " (now = last event; pass --now ISO to change)" };
}

export const regionStateString = (s: EngineState, now: number) => {
  const r = readiness(s, now);
  return REGIONS.map((m) => STATE_CHAR[r[m].state]).join("");
};

/** Readiness, weekly need, systemic and diagnostics. */
export function stateReport(s: EngineState, now: number): string {
  const r = readiness(s, now);
  const w = weeklyNeed(s, now);
  const sys = systemic(s, now);
  const dg = diagnostics(s, now);
  const out: string[] = [];
  out.push(`State at ${new Date(now).toISOString()}  (${s.sessions.length} sessions, ${s.predictionLog.length} logged sets)`);
  out.push("");
  out.push("region          state        fatigue  ready in   target   done    need");
  for (const m of REGIONS) {
    out.push(
      `${m.padEnd(15)} ${r[m].state.padEnd(11)} ${r[m].fatigue.toFixed(2).padStart(8)} ${(r[m].hoursToReady.toFixed(1) + "h").padStart(9)} ` +
        `${w[m].target.toFixed(1).padStart(8)} ${w[m].done.toFixed(2).padStart(6)} ${w[m].need.toFixed(2).padStart(7)}`,
    );
  }
  out.push(`readiness string: ${regionStateString(s, now)}  (R ready, r recovering, F fatigued; order: ${REGIONS.join(" ")})`);
  out.push("");
  out.push(`systemic G=${sys.G.toFixed(2)}  typical=${sys.typical.toFixed(2)}  rest recommended: ${sys.restRecommended ? "YES — " + sys.reasons.join("; ") : "no"}`);
  out.push("");
  out.push("diagnostics");
  out.push(`  rho=${dg.rho.toFixed(3)} (${dg.confidences.rho})  b=${dg.b.toFixed(3)} (${dg.confidences.b})  d=${dg.d.toFixed(3)} (${dg.confidences.d})`);
  out.push(`  deload: ${dg.deloadActive ? "active" : "no"}   calibrating: ${dg.calibrating ? "yes" : "no"}`);
  out.push(`  rep MAE last 20 sets: ${dg.maeLast20 === null ? "n/a" : dg.maeLast20.toFixed(2)}`);
  out.push(`  rep MAE by week: ${dg.maeByWeek.map((x) => `w${x.week}=${x.mae.toFixed(2)} (${x.n})`).join("  ") || "n/a"}`);
  out.push(`  equipment gaps: ${dg.equipmentGaps.map((g) => `${g.region} (best ${g.best})`).join(", ") || "none"}`);
  out.push("  last predictions:");
  for (const x of dg.predictionLogTail) {
    out.push(`    ${new Date(x.ts).toISOString().slice(0, 16)} ${x.exerciseId.padEnd(28)} ${x.type.padEnd(9)} pred ${x.M_pred.toFixed(1).padStart(5)}  obs ${x.M_obs.toFixed(1).padStart(5)}  err ${(x.err * 100).toFixed(0).padStart(4)}%`);
  }
  return out.join("\n");
}

export function planReport(plan: Plan, s: EngineState): string {
  const out: string[] = [];
  out.push(`${plan.kind.toUpperCase()}${plan.template ? ` — ${plan.template} template` : ""}${plan.kind === "workout" ? `, ~${Math.round(plan.estMinutes)} min` : ""}` +
    `${plan.deloadActive ? "  [deload]" : ""}${plan.calibrating ? "  [calibrating]" : ""}`);
  for (const r of plan.reasons) out.push(`  * ${r}`);
  plan.exercises.forEach((e, i) => {
    const ex = s.catalog.byId[e.exerciseId]!;
    const sets = e.sets.map((x) => (x.weightKg !== undefined ? `${x.weightKg} kg × ` : "") + (x.seconds !== undefined ? `${x.seconds}s` : `${x.reps}`) + ` @RIR${x.targetRir}` + (x.isAmrap ? " AMRAP" : "")).join(", ");
    out.push("");
    out.push(`${i + 1}. ${ex.name} (${e.exerciseId})${ex.unilateral ? " — per side" : ""}`);
    out.push(`   ${e.sets.length} sets: ${sets}`);
    out.push(`   difficulty for you: ${e.difficulty.score} (${e.difficulty.label.replace("_", " ")}, ${e.difficulty.source})`);
    if (e.firstSetMode) out.push("   first set: go to technical failure (new or stale capacity)");
    for (const r of e.reasons) out.push(`   - ${r}`);
  });
  return out.join("\n");
}
