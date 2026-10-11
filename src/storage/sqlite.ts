import Database from "better-sqlite3";
import { EventSchema, type EngineEvent } from "../engine/types";
import { DuplicateEventError, type EventStore } from "./repo";

interface Row {
  id: string;
  user_id: string;
  ts: number;
  seq: number;
  type: string;
  payload: string;
  schema_version: number;
}

/** better-sqlite3 event store. Pass a file path, ":memory:", or an open Database. */
export class SqliteEventStore implements EventStore {
  readonly db: Database.Database;

  constructor(target: string | Database.Database) {
    this.db = typeof target === "string" ? new Database(target) : target;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        ts INTEGER NOT NULL,
        seq INTEGER NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        schema_version INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS events_user_ts_seq ON events (user_id, ts, seq);
    `);
  }

  async append(event: EngineEvent): Promise<void> {
    const e = EventSchema.parse(event);
    try {
      this.db
        .prepare("INSERT INTO events (id, user_id, ts, seq, type, payload, schema_version) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(e.id, e.userId, e.ts, e.seq, e.type, JSON.stringify(e.payload), e.schemaVersion);
    } catch (err) {
      if ((err as { code?: string }).code === "SQLITE_CONSTRAINT_PRIMARYKEY") throw new DuplicateEventError(e.id);
      throw err;
    }
  }

  async list(userId: string, { from = Number.MIN_SAFE_INTEGER, to = Number.MAX_SAFE_INTEGER } = {}): Promise<EngineEvent[]> {
    const rows = this.db
      .prepare("SELECT * FROM events WHERE user_id = ? AND ts >= ? AND ts <= ? ORDER BY ts, seq")
      .all(userId, from, to) as Row[];
    return rows.map((r) =>
      EventSchema.parse({ id: r.id, userId: r.user_id, ts: r.ts, seq: r.seq, type: r.type, payload: JSON.parse(r.payload), schemaVersion: r.schema_version }),
    );
  }

  /** Distinct user ids, for CLI convenience. */
  users(): string[] {
    return (this.db.prepare("SELECT DISTINCT user_id FROM events ORDER BY user_id").all() as { user_id: string }[]).map((r) => r.user_id);
  }

  close(): void {
    this.db.close();
  }
}
