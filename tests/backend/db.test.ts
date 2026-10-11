// The backend schema: isolation between users, sync ordering and tombstones, entitlements, reminders.
import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { addUser, as, freshDb } from "./pg";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const ev = (id: string, ts = 1000, type = "set_logged") => ({ id, ts, seq: 0, type, payload: { sessionId: "s1" }, schemaVersion: 1 });
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Json = Record<string, any>;
const push = async (db: PGlite, who: string, events: unknown[], deleted: string[] = [], doc?: { doc: Json; at: number; remind?: string; tz?: string }) =>
  (await as<{ r: Json }>(db, who, "select public.sync_push($1::jsonb, $2::uuid[], $3::jsonb, $4::bigint, $5, $6) as r",
    [JSON.stringify(events), deleted, doc ? JSON.stringify(doc.doc) : null, doc?.at ?? null, doc?.remind ?? null, doc?.tz ?? null]))[0]!.r;
const pull = async (db: PGlite, who: string, cursor = 0, limit = 1000) =>
  (await as<{ r: Json }>(db, who, "select public.sync_pull($1, $2) as r", [cursor, limit]))[0]!.r;

describe("backend schema", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await freshDb();
    await addUser(db, A);
    await addUser(db, B);
  }, 30_000);

  it("pushes, pulls in order, and is idempotent on retry", async () => {
    await push(db, A, [ev(id(1)), ev(id(2))]);
    await push(db, A, [ev(id(2)), ev(id(3))]); // id 2 is a retry
    const r = await pull(db, A);
    expect(r.events.map((e: Json) => e.id)).toEqual([id(1), id(2), id(3)]);
    expect(r.events.map((e: Json) => e.serverSeq)).toEqual([1, 2, 3]);
    expect(r.cursor).toBe(3);
    expect((await pull(db, A, 3)).events).toEqual([]);
  });

  it("keeps users apart", async () => {
    await push(db, A, [ev(id(1))]);
    await push(db, B, [ev(id(1))]); // the same client id is fine for another user
    expect((await pull(db, B)).events).toHaveLength(1);
    expect(await as(db, B, "select * from public.events where user_id = $1", [A])).toEqual([]);
    await expect(as(db, B, "insert into public.events (user_id, id, ts, seq, type, payload, schema_version, server_seq) values ($1, $2, 1, 0, 'x', '{}', 1, 99)", [A, id(9)])).rejects.toThrow();
    await expect(as(db, B, "update public.profiles set doc = '{}'")).rejects.toThrow();
    await expect(as(db, B, "select * from public.billing_events")).rejects.toThrow();
  });

  it("refuses anonymous callers", async () => {
    await expect(as(db, "anon", "select public.sync_pull(0, 10)")).rejects.toThrow();
    await expect(as(db, "anon", "select * from public.events")).rejects.toThrow();
  });

  it("tombstones deletes with a new sequence number and reports ids deleted elsewhere", async () => {
    await push(db, A, [ev(id(1)), ev(id(2))]);
    await push(db, A, [], [id(1)]);
    const r = await pull(db, A, 2);
    expect(r.events).toEqual([expect.objectContaining({ id: id(1), deleted: true, serverSeq: 3, payload: {} })]);
    // Another device, unaware of the delete, uploads id 1 again: it stays deleted and is reported.
    const again = await push(db, A, [ev(id(1))]);
    expect(again.gone).toEqual([id(1)]);
    expect((await pull(db, A, 3)).events).toEqual([]);
  });

  it("validates input", async () => {
    await expect(push(db, A, [{ ...ev(id(1)), type: "Robert'); drop table" }])).rejects.toThrow();
    await expect(push(db, A, [{ ...ev(id(1)), payload: [1] }])).rejects.toThrow();
    await expect(push(db, A, Array.from({ length: 501 }, (_, i) => ev(id(i))))).rejects.toThrow(/batch too large/);
  });

  it("pages large pulls", async () => {
    await push(db, A, Array.from({ length: 30 }, (_, i) => ev(id(i), 1000 + i)));
    const p1 = await pull(db, A, 0, 20);
    expect(p1.events).toHaveLength(20);
    expect(p1.more).toBe(true);
    const p2 = await pull(db, A, p1.cursor, 20);
    expect(p2.events).toHaveLength(10);
    expect(p2.more).toBe(false);
  });

  it("keeps the newer settings document", async () => {
    await push(db, A, [], [], { doc: { v: "new" }, at: 200, remind: "18:30", tz: "Asia/Kolkata" });
    await push(db, A, [], [], { doc: { v: "old" }, at: 100 });
    const r = await pull(db, A);
    expect(r.doc).toEqual({ v: "new" });
    expect(r.docAt).toBe(200);
    // Bad zones and times are dropped rather than stored.
    await push(db, A, [], [], { doc: { v: "newer" }, at: 300, remind: "25:00", tz: "Mars/Olympus" });
    const [p] = await as<Json>(db, "service", "select remind_at, tz from public.profiles where user_id = $1", [A]);
    expect(p).toEqual({ remind_at: null, tz: null });
  });

  it("computes entitlements from subscriptions and grants", async () => {
    const ent = async () => (await as<{ e: Json }>(db, A, "select public.my_entitlement() as e"))[0]!.e;
    expect(await ent()).toMatchObject({ pro: false, hadSubscription: false });
    const sub = (status: string, end: string | null, sid = "sub_1") =>
      as(db, "service", "insert into public.subscriptions (user_id, provider_subscription_id, plan_key, status, current_end) values ($1, $2, 'in_yearly', $3, $4::timestamptz) on conflict (provider, provider_subscription_id) do update set status = excluded.status, current_end = excluded.current_end", [A, sid, status, end]);
    await sub("created", null);
    expect(await ent()).toMatchObject({ pro: false, hadSubscription: false }); // abandoned checkout keeps the trial
    await sub("active", "2999-01-01T00:00:00Z");
    expect(await ent()).toMatchObject({ pro: true, status: "active", plan: "in_yearly" });
    await sub("cancelled", "2000-01-01T00:00:00Z");
    expect(await ent()).toMatchObject({ pro: false });
    await as(db, "service", "insert into public.pro_grants (user_id, until, reason) values ($1, '2999-01-01', 'creator')", [A]);
    expect(await ent()).toMatchObject({ pro: true });
    // A user cannot see or call another user's entitlement.
    await expect(as(db, B, "select public.entitlement_for($1)", [A])).rejects.toThrow();
    expect((await as<{ e: Json }>(db, B, "select public.my_entitlement() as e"))[0]!.e).toMatchObject({ pro: false });
  });

  it("claims due reminders once a day and skips users who already trained", async () => {
    // Reminder one minute ago in UTC, so it is due now (not testable in the first minutes after UTC midnight).
    if (new Date().getUTCHours() === 0 && new Date().getUTCMinutes() < 2) return;
    const t = (await db.query<{ t: string }>("select to_char((now() at time zone 'UTC') - interval '1 minute', 'HH24:MI') as t")).rows[0]!.t;
    await push(db, A, [], [], { doc: {}, at: 1, remind: t, tz: "UTC" });
    await push(db, B, [ev(id(1), Date.now())], [], { doc: {}, at: 1, remind: t, tz: "UTC" });
    for (const u of [A, B]) await as(db, u, "insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a')", [u, `https://push.example/${u}`]);
    await expect(as(db, A, "select * from public.claim_due_reminders()")).rejects.toThrow();
    const first = await as<Json>(db, "service", "select * from public.claim_due_reminders()");
    expect(first.map((r) => r.user_id)).toEqual([A]);
    expect(await as(db, "service", "select * from public.claim_due_reminders()")).toEqual([]);
    // A user who trained today does not use up the batch: the one behind them is still reached.
    await as(db, "service", "update public.profiles set reminded_on = null");
    expect((await as<Json>(db, "service", "select * from public.claim_due_reminders(p_limit => 1)")).map((r) => r.user_id)).toEqual([A]);
  });

  it("cascades an account delete to every table", async () => {
    await push(db, A, [ev(id(1))], [], { doc: {}, at: 1 });
    await as(db, A, "insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://p.example/1', 'k', 'a')", [A]);
    await db.query("delete from auth.users where id = $1", [A]);
    for (const t of ["events", "profiles", "sync_state", "push_subscriptions"]) {
      expect((await db.query(`select count(*)::int as n from public.${t}`)).rows).toEqual([{ n: 0 }]);
    }
  });
});
