// npm run replay -- --file events.json [--now ISO]
import { parseArgs } from "node:util";
import { replay } from "../engine";
import { loadCatalogAndParams, readEventsFile, resolveNow, stateReport } from "./report";

try {
  const { values } = parseArgs({ options: { file: { type: "string" }, now: { type: "string" } } });
  if (!values.file) throw new Error("usage: npm run replay -- --file events.json [--now ISO]");
  const events = readEventsFile(values.file);
  const { now, note } = resolveNow(events, values.now);
  const { catalog, params } = await loadCatalogAndParams();
  console.log(`${events.length} events from ${values.file}${note}`);
  console.log(stateReport(replay(events, catalog, params), now));
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
