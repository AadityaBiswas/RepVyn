// Cloud sync rules (app/src/cloud/syncCore.ts, ADR-0003): two devices, deletes, retries, settings conflicts.
import { describe, expect, it } from "vitest";
import { adopt, afterPush, applyPull, BATCH, docOf, outbox, reminderTime, stampDoc, type PullPage, type RemoteEvent } from "../app/src/cloud/syncCore";
import { append, fresh, setFeedback, type Saved } from "../app/src/store";

const U = "00000000-0000-4000-8000-0000000000aa";
const T0 = Date.UTC(2026, 9, 1, 8);
const checkin = (ts: number) => ({ ts, type: "checkin", payload: { feel: "normal", soreRegions: [], sorenessChecked: false } }) as never;

/** A device signed in to U with `n` check-ins logged. */
function device(n = 0, at = T0): Saved {
  let s = adopt(fresh(at, "en-IN"), { id: U, email: "a@example.com" }, "test");
  for (let i = 0; i < n; i++) s = append(s, [checkin(at + i * 1000)]);
  return s;
}
/** A fake server: the same rules as sync_push / sync_pull in the migration. */
class Server {
  rows: RemoteEvent[] = [];
  doc: PullPage["doc"] = null;
  docAt: number | null = null;
  seq = 0;
  push(s: Saved): Saved {
    const ob = outbox(s);
    const gone: string[] = [];
    for (const e of ob.events) {
      const r = this.rows.find((x) => x.id === e.id);
      if (r?.deleted) gone.push(e.id);
      else if (!r) this.rows.push({ ...e, deleted: false, serverSeq: ++this.seq });
    }
    for (const id of ob.deleted) {
      const r = this.rows.find((x) => x.id === id && !x.deleted);
      if (r) Object.assign(r, { deleted: true, payload: {}, serverSeq: ++this.seq });
    }
    if (ob.doc && (this.docAt ?? -1) < ob.docAt) [this.doc, this.docAt] = [ob.doc, ob.docAt];
    return afterPush(s, ob, gone);
  }
  pull(s: Saved): Saved {
    const events = this.rows.filter((r) => r.serverSeq > s.sync.cursor).sort((a, b) => a.serverSeq - b.serverSeq);
    return applyPull(s, { events, cursor: Math.max(s.sync.cursor, ...events.map((e) => e.serverSeq)), more: false, doc: this.doc, docAt: this.docAt }, U);
  }
  sync(s: Saved): Saved {
    return this.pull(this.push(s));
  }
}
const ids = (s: Saved) => s.events.map((e) => e.id).sort();

describe("sync", () => {
  it("uploads a device's log once and settles", () => {
    const srv = new Server();
    let a = srv.sync(device(3));
    expect(srv.rows).toHaveLength(3);
    expect(outbox(a).events).toEqual([]);
    a = srv.sync(a);
    expect(srv.rows).toHaveLength(3);
    expect(a.sync.cursor).toBe(3);
  });

  it("merges two devices into the same log", () => {
    const srv = new Server();
    let a = srv.sync(device(2));
    let b = srv.sync(device(1, T0 + 10_000));
    a = srv.sync(a);
    b = srv.sync(b);
    expect(ids(a)).toHaveLength(3);
    expect(ids(a)).toEqual(ids(b));
    expect(a.events.map((e) => e.ts)).toEqual([...a.events.map((e) => e.ts)].sort((x, y) => x - y));
  });

  it("carries a delete to the other device, and never resurrects it", () => {
    const srv = new Server();
    let a = device(0);
    a = setFeedback(a, "push_up", true, T0);
    a = srv.sync(a);
    let b = srv.sync(device(0));
    expect(b.events).toHaveLength(1);
    a = setFeedback(a, "push_up", null, T0 + 1); // removes the feedback event
    a = srv.sync(a);
    b = srv.sync(b);
    expect(b.events).toEqual([]);
    expect(srv.rows[0]!.deleted).toBe(true);
    expect(srv.sync(a).events).toEqual([]);
  });

  it("keeps a pending local delete when the server still has the event", () => {
    const srv = new Server();
    let a = srv.sync(device(1));
    const id = a.events[0]!.id;
    a = { ...a, events: [] }; // deleted locally, not pushed yet
    a = srv.pull({ ...a, sync: { ...a.sync, cursor: 0 } }); // a full re-pull sees it alive
    expect(a.events).toEqual([]);
    expect(outbox(a).deleted).toEqual([id]);
  });

  it("drops events another device already deleted when they are uploaded again", () => {
    const srv = new Server();
    const a0 = srv.sync(device(1));
    srv.push({ ...a0, events: [] }); // device A deletes it
    // Device C has the same event (e.g. restored from an export) but never synced.
    const c = { ...device(0), events: a0.events };
    const after = srv.push(c);
    expect(after.events).toEqual([]);
  });

  it("is safe to retry a push that the server already applied", () => {
    const srv = new Server();
    const a = device(2);
    srv.push(a); // the response was lost
    const again = srv.sync(a);
    expect(srv.rows).toHaveLength(2);
    expect(again.events).toHaveLength(2);
  });

  it("uploads in batches", () => {
    const srv = new Server();
    let a = device(BATCH + 5);
    a = srv.push(a);
    expect(srv.rows).toHaveLength(BATCH);
    a = srv.push(a);
    expect(srv.rows).toHaveLength(BATCH + 5);
    expect(outbox(a).events).toEqual([]);
  });

  it("skips events this build cannot read, without deleting them", () => {
    const s = device(0);
    const odd: RemoteEvent = { id: "20000000-0000-4000-8000-000000000001", ts: T0, seq: 0, type: "future_thing", payload: { x: 1 }, schemaVersion: 1, deleted: false, serverSeq: 1 };
    const after = applyPull(s, { events: [odd], cursor: 1, more: false, doc: null, docAt: null }, U);
    expect(after.events).toEqual([]);
    expect(outbox(after).deleted).toEqual([]);
    expect(after.sync.cursor).toBe(1);
  });

  it("takes the newer settings document on either side", () => {
    const srv = new Server();
    let a = srv.sync(device());
    let b = srv.sync(device());
    a = stampDoc(a, { ...a, settings: { ...a.settings, days: 5 } }, T0 + 1000);
    a = srv.sync(a);
    b = srv.sync(b);
    expect(b.settings.days).toBe(5);
    b = stampDoc(b, { ...b, settings: { ...b.settings, days: 3 } }, T0 + 2000);
    a = stampDoc(a, { ...a, settings: { ...a.settings, minutes: 20 } }, T0 + 1500); // older edit, pushed later
    b = srv.sync(b);
    a = srv.sync(a);
    expect(a.settings.days).toBe(3);
    expect(srv.doc?.settings.days).toBe(3);
  });

  it("keeps the account's settings when another device signs in", () => {
    const srv = new Server();
    let a = adopt({ ...fresh(T0, "en-IN"), onboarded: true }, { id: U, email: null }, "t");
    a = srv.sync(a);
    a = srv.sync(a); // the seeded document goes up
    expect(srv.doc?.settings.units).toBe("metric");
    let b = adopt({ ...fresh(T0 + 5000, "en-US"), onboarded: true }, { id: U, email: null }, "t");
    b = srv.sync(b);
    expect(b.settings.units).toBe("metric");
    b = srv.sync(b);
    expect(srv.doc?.settings.units).toBe("metric");
  });

  it("does not re-date a document pulled from the server, so it never bounces back over a newer edit", () => {
    const srv = new Server();
    let a = srv.sync(device());
    a = srv.sync(a);
    let b = srv.sync(device());
    // B edits; A pulls it through the app's commit path (which stamps local edits).
    b = srv.sync(stampDoc(b, { ...b, settings: { ...b.settings, days: 6 } }, T0 + 10_000));
    a = stampDoc(a, srv.pull(a), T0 + 20_000);
    expect(a.settings.days).toBe(6);
    expect(outbox(a).doc).toBeNull();
  });

  it("does not date the document when nothing in it changed", () => {
    const a = device();
    expect(stampDoc(a, append(a, [checkin(T0)]), T0 + 5).sync.docAt).toBe(a.sync.docAt);
    expect(docOf(a).settings).toBe(a.settings);
  });

  it("moves a signed-out device's training into the account at sign-in", () => {
    let s = fresh(T0, "en-US");
    s = append(s, [checkin(T0)]);
    const local = s.userId;
    s = adopt(s, { id: U, email: null }, "v1");
    expect(local).not.toBe(U);
    expect(s.userId).toBe(U);
    expect(s.events.every((e) => e.userId === U)).toBe(true);
    expect(outbox(s).events).toHaveLength(1);
    // A new build re-reads the log from the start.
    expect(adopt({ ...s, sync: { ...s.sync, cursor: 9 } }, { id: U, email: null }, "v2").sync.cursor).toBe(0);
    expect(adopt({ ...s, sync: { ...s.sync, cursor: 9 } }, { id: U, email: null }, "v1").sync.cursor).toBe(9);
  });

  it("keeps a like whose event arrives on a later page, and drops it only on a delete", () => {
    const srv = new Server();
    let a = setFeedback(device(2), "push_up", true, T0 + 5000);
    a = stampDoc(device(2), a, T0 + 5000);
    a = srv.sync(a);
    const mark = a.feedback.push_up!.eventId;
    const rows = [...srv.rows].sort((x, y) => x.serverSeq - y.serverSeq);
    const page = (from: number, to: number): PullPage => ({ events: rows.slice(from, to), cursor: rows[to - 1]!.serverSeq, more: to < rows.length, doc: srv.doc, docAt: srv.docAt });
    // A new phone reads the log one event at a time: the settings (with the like) come with the first page, the like's event with the last.
    let b = device(0);
    for (let i = 0; i < rows.length; i++) b = stampDoc(b, applyPull(b, page(i, i + 1), U), T0 + 60_000);
    expect(b.feedback.push_up?.eventId).toBe(mark);
    expect(outbox(b).doc).toBeNull();
    // Taking the like back on A removes it on B.
    a = srv.sync(stampDoc(a, setFeedback(a, "push_up", null, T0 + 70_000), T0 + 70_000));
    b = srv.sync(b);
    expect(b.feedback.push_up).toBeUndefined();
    expect(b.events.some((e) => e.id === mark)).toBe(false);
  });

  it("changes nothing when the same account signs in again", () => {
    const a = device(2);
    expect(adopt(a, { id: U, email: "a@example.com" }, "test")).toBe(a);
    expect(adopt(a, { id: U, email: "new@example.com" }, "test").sync.account?.email).toBe("new@example.com");
  });

  it("dates a new phone's free week from the account's first training", () => {
    const srv = new Server();
    srv.sync(device(2, T0));
    const b = srv.sync(device(0, T0 + 30 * 86_400_000));
    expect(b.createdAt).toBe(T0);
  });

  it("reads reminder labels as 24-hour times", () => {
    expect(reminderTime("6:30 am")).toBe("06:30");
    expect(reminderTime("12:30 pm")).toBe("12:30");
    expect(reminderTime("12:05 am")).toBe("00:05");
    expect(reminderTime("9:00 pm")).toBe("21:00");
    expect(reminderTime("Off")).toBeNull();
  });
});
