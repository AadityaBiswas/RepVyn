import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import rawCatalog from "../catalog/library";
import rawParams from "../params/default.params.json";
import { importEvents, replayFromDb } from "../src/cli/db";
import { replay, type EngineEvent } from "../src/engine";
import { MemoryCatalogStore, MemoryEventStore, MemoryParamsStore } from "../src/storage/memory";
import { DuplicateEventError, type EventStore } from "../src/storage/repo";
import { SqliteEventStore } from "../src/storage/sqlite";
import { catalog, ev, H, params, profile, session, T0 } from "./helpers";

const dir = mkdtempSync(join(tmpdir(), "workout-engine-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const sample = (): EngineEvent[] => [
  profile(),
  ...session(T0, "a", [["push_up_standard", 12, 2], ["plank", 45, 2]]).map((e) =>
    e.type === "set_logged" && e.payload.exerciseId === "plank" ? { ...e, payload: { ...e.payload, reps: undefined, holdSeconds: 45 } } : e,
  ),
  ev(T0 + 2 * H, { type: "checkin", payload: { feel: "beat_up", soreRegions: ["chest"] } }),
  ev(T0 + 5 * H, { type: "external_activity", payload: { presetId: "running", minutes: 30, intensity: "moderate" } }),
  ...session(T0 + 48 * H, "b", [["squat_bodyweight", 20, 2]]),
];
const strip = (e: EngineEvent) => JSON.parse(JSON.stringify(e)) as EngineEvent; // drop undefined keys

const stores: [string, () => EventStore][] = [
  ["memory", () => new MemoryEventStore()],
  ["sqlite", () => new SqliteEventStore(":memory:")],
];

describe.each(stores)("EventStore contract: %s", (_, make) => {
  it("round-trips events, ordered by (ts, seq), regardless of append order", async () => {
    const store = make();
    const events = sample().map(strip);
    for (const e of [...events].reverse()) await store.append(e);
    expect(await store.list("u1")).toEqual([...events].sort((a, b) => a.ts - b.ts || a.seq - b.seq));
  });

  it("filters by user and by inclusive from/to", async () => {
    const store = make();
    for (const e of sample()) await store.append(strip(e));
    await store.append({ ...strip(profile()), id: "99999999-0000-4000-8000-000000000001", userId: "someone_else" });
    expect(await store.list("nobody")).toEqual([]);
    expect(await store.list("someone_else")).toHaveLength(1);
    const mid = await store.list("u1", { from: T0 + 2 * H, to: T0 + 5 * H });
    expect(mid.map((e) => e.type)).toEqual(["checkin", "external_activity"]);
  });

  it("validates on append", async () => {
    const store = make();
    const bad = { ...strip(profile()), payload: { goal: "muscle" } } as unknown as EngineEvent;
    await expect(store.append(bad)).rejects.toThrow();
    await expect(store.append({ ...strip(profile()), id: "not-a-uuid" })).rejects.toThrow();
    expect(await store.list("u1")).toEqual([]);
  });

  it("rejects a duplicate id", async () => {
    const store = make();
    const e = strip(profile());
    await store.append(e);
    await expect(store.append(e)).rejects.toBeInstanceOf(DuplicateEventError);
  });

  it("replay(list) equals replay of the original events", async () => {
    const store = make();
    const events = sample().map(strip);
    for (const e of events) await store.append(e);
    expect(replay(await store.list("u1"), catalog, params())).toEqual(replay(events, catalog, params()));
  });
});

describe("SqliteEventStore", () => {
  it("persists to a file across reopen", async () => {
    const file = join(dir, "persist.sqlite");
    const a = new SqliteEventStore(file);
    for (const e of sample()) await a.append(strip(e));
    a.close();
    const b = new SqliteEventStore(file);
    expect(await b.list("u1")).toHaveLength(sample().length);
    expect(b.users()).toEqual(["u1"]);
    b.close();
  });

  it("validates on read: a corrupt row fails loudly", async () => {
    const store = new SqliteEventStore(":memory:");
    store.db
      .prepare("INSERT INTO events VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("3f1c2a7e-8b4d-4c1a-9e2f-1a2b3c4d5e6f", "u1", 0, 0, "set_logged", JSON.stringify({ sessionId: "s", exerciseId: "x", reps: 5, rir: 9, isWarmup: false, isAmrap: false }), 1);
    await expect(store.list("u1")).rejects.toThrow();
  });

  it("has the (user_id, ts, seq) index", () => {
    const store = new SqliteEventStore(":memory:");
    const idx = store.db.prepare("PRAGMA index_info('events_user_ts_seq')").all() as { name: string }[];
    expect(idx.map((c) => c.name)).toEqual(["user_id", "ts", "seq"]);
  });
});

describe("catalog and params stores", () => {
  it("load and validate", async () => {
    expect((await new MemoryCatalogStore(rawCatalog).load()).exercises.length).toBeGreaterThan(50);
    const v2 = { ...structuredClone(rawParams), version: 2 };
    const store = new MemoryParamsStore([rawParams, v2]);
    expect((await store.load()).version).toBe(2);
    expect((await store.load(1)).version).toBe(1);
    await expect(store.load(7)).rejects.toThrow(/version 7/);
    expect(() => new MemoryParamsStore([{ version: 1 }])).toThrow();
  });
});

describe("db CLI", () => {
  const fixture = join(__dirname, "../fixtures/events.sample.json");

  it("imports the sample fixture, skips duplicates on re-import, and replays", async () => {
    const db = join(dir, "cli.sqlite");
    const n = (JSON.parse(readFileSync(fixture, "utf8")) as unknown[]).length;
    expect(await importEvents(fixture, db)).toEqual({ imported: n, skipped: 0 });
    expect(await importEvents(fixture, db)).toEqual({ imported: 0, skipped: n });
    const report = await replayFromDb(db, "demo");
    expect(report).toMatch(/^user demo, \d+ events/);
    expect(report).toMatch(/readiness string: [RrF]{12}/);
    expect(report).toMatch(/diagnostics\n {2}rho=[\d.]+ \((calibrating|low|medium|high)\)/);
    expect(await replayFromDb(db, undefined, "2026-01-12T07:00:00Z")).toMatch(/State at 2026-01-12T07:00:00.000Z/);
    await expect(replayFromDb(db, "nobody")).rejects.toThrow(/no events for user nobody/);
  });

  it("rejects a file with an invalid event and writes nothing", async () => {
    const db = join(dir, "bad.sqlite");
    const file = join(dir, "bad.json");
    const good = strip(profile());
    writeFileSync(file, JSON.stringify([good, { ...good, id: "11111111-0000-4000-8000-000000000001", ts: -5 }]));
    await expect(importEvents(file, db)).rejects.toThrow(/1 invalid event\(s\), nothing imported[\s\S]*event #1/);
    const store = new SqliteEventStore(db);
    expect(await store.list("u1")).toEqual([]);
    store.close();
  });
});
