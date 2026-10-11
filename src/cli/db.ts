// npm run db:import -- --file events.json --db data.sqlite
// npm run db:replay -- --db data.sqlite --user <id> [--now ISO]
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { EventSchema, replay, type EngineEvent } from "../engine";
import { DuplicateEventError } from "../storage/repo";
import { SqliteEventStore } from "../storage/sqlite";
import { loadCatalogAndParams, stateReport } from "./report";

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

/** Validate every event first (nothing is written if any is invalid), then append; duplicate ids are skipped. */
export async function importEvents(file: string, dbPath: string): Promise<{ imported: number; skipped: number }> {
  const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(raw)) throw new Error(`${file}: expected a JSON array of events`);
  const errors: string[] = [];
  const events: EngineEvent[] = [];
  raw.forEach((e, i) => {
    const r = EventSchema.safeParse(e);
    if (r.success) events.push(r.data);
    else errors.push(`event #${i}${(e as { id?: string })?.id ? ` (${(e as { id: string }).id})` : ""}: ${r.error.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`);
  });
  if (errors.length) throw new Error(`${errors.length} invalid event(s), nothing imported:\n${errors.join("\n")}`);

  const store = new SqliteEventStore(dbPath);
  let imported = 0;
  let skipped = 0;
  store.db.exec("BEGIN");
  try {
    for (const e of events) {
      try {
        await store.append(e);
        imported++;
      } catch (err) {
        if (!(err instanceof DuplicateEventError)) throw err;
        skipped++;
      }
    }
    store.db.exec("COMMIT");
  } catch (err) {
    store.db.exec("ROLLBACK");
    throw err;
  } finally {
    store.close();
  }
  return { imported, skipped };
}

/** Replay a user's events from the database. `now` defaults to the time of their last event. */
export async function replayFromDb(dbPath: string, userId: string | undefined, nowIso?: string): Promise<string> {
  const store = new SqliteEventStore(dbPath);
  try {
    const users = store.users();
    const user = userId ?? (users.length === 1 ? users[0] : undefined);
    if (!user) throw new Error(users.length ? `several users in ${dbPath}, pass --user (one of: ${users.join(", ")})` : `no events in ${dbPath}`);
    const events = await store.list(user);
    if (!events.length) throw new Error(`no events for user ${user} (users: ${users.join(", ") || "none"})`);
    const now = nowIso ? Date.parse(nowIso) : events.at(-1)!.ts;
    if (Number.isNaN(now)) throw new Error(`--now: not a valid ISO date: ${nowIso}`);
    const { catalog, params } = await loadCatalogAndParams();
    const state = replay(events, catalog, params);
    return `user ${user}, ${events.length} events${nowIso ? "" : " (now = last event; pass --now ISO to change)"}\n${stateReport(state, now)}`;
  } finally {
    store.close();
  }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { values } = parseArgs({ args: rest, options: { file: { type: "string" }, db: { type: "string" }, user: { type: "string" }, now: { type: "string" } } });
  if (!values.db) fail("--db <path> is required");
  if (cmd === "import") {
    if (!values.file) fail("--file <events.json> is required");
    const r = await importEvents(values.file, values.db);
    console.log(`imported ${r.imported} event(s) into ${values.db}${r.skipped ? `, skipped ${r.skipped} already present` : ""}`);
  } else if (cmd === "replay") {
    console.log(await replayFromDb(values.db, values.user, values.now));
  } else {
    fail("usage: db.ts import --file <events.json> --db <path> | replay --db <path> [--user <id>] [--now ISO]");
  }
}

// Run only as a script, not when imported by tests.
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  main().catch((e: Error) => fail(e.message));
}
