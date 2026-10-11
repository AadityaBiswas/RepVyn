// npm run plan -- --file events.json [--now ISO] [--minutes 30]
import { parseArgs } from "node:util";
import { planSession, replay } from "../engine";
import { loadCatalogAndParams, planReport, readEventsFile, resolveNow } from "./report";

try {
  const { values } = parseArgs({ options: { file: { type: "string" }, now: { type: "string" }, minutes: { type: "string" } } });
  if (!values.file) throw new Error("usage: npm run plan -- --file events.json [--now ISO] [--minutes 30]");
  const minutes = values.minutes === undefined ? undefined : Number(values.minutes);
  if (minutes !== undefined && !(minutes > 0)) throw new Error(`--minutes: expected a positive number, got ${values.minutes}`);
  const events = readEventsFile(values.file);
  const { now, note } = resolveNow(events, values.now);
  const { catalog, params } = await loadCatalogAndParams();
  const state = replay(events, catalog, params);
  console.log(`Plan for ${new Date(now).toISOString()}${note}\n`);
  console.log(planReport(planSession(state, { now, minutes }), state));
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
