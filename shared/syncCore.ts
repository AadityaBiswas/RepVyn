// The pure half of cloud sync (ADR-0003): what to upload, and how to fold in what the server sends.
// No network or storage here, so every rule is unit-tested in tests/sync.test.ts.
import { EventSchema, type EngineEvent } from "../src/engine";
import type { Saved, SyncMeta } from "./store";

/** Event fields as the server stores them (the user comes from the session, not the event). */
export interface WireEvent { id: string; ts: number; seq: number; type: string; payload: unknown; schemaVersion: number }
export interface RemoteEvent extends WireEvent { deleted: boolean; serverSeq: number }
/** The synced settings document. */
export interface Doc { settings: Saved["settings"]; onboarded: boolean; programStart: number | null; feedback: Saved["feedback"] }
export interface PullPage { events: RemoteEvent[]; cursor: number; more: boolean; doc: Doc | null; docAt: number | null }

export const BATCH = 500;

export const docOf = (s: Saved): Doc => ({ settings: s.settings, onboarded: s.onboarded, programStart: s.programStart, feedback: s.feedback });
const sameDoc = (a: Doc, b: Doc) => JSON.stringify(a) === JSON.stringify(b);
const withSync = (s: Saved, p: Partial<SyncMeta>): Saved => ({ ...s, sync: { ...s.sync, ...p } });

/**
 * Called on every change: dates the settings document when it changed, so last-writer-wins can compare.
 * A change that already carries its own date (a document pulled from the server) is left as it is;
 * re-dating it would make this device's stale copy look newer and undo the other device's edit.
 */
export function stampDoc(prev: Saved, next: Saved, now: number): Saved {
  if (prev === next || next.sync.docAt !== prev.sync.docAt || sameDoc(docOf(prev), docOf(next))) return next;
  return withSync(next, { docAt: Math.max(now, next.sync.docAt + 1) });
}

export const toWire = (e: EngineEvent): WireEvent => ({ id: e.id, ts: e.ts, seq: e.seq, type: e.type, payload: e.payload, schemaVersion: e.schemaVersion });

export interface Outbox { events: WireEvent[]; deleted: string[]; doc: Doc | null; docAt: number }
/** What the server does not have yet: new events, deletions, and the settings document if it changed. One batch at a time. */
export function outbox(s: Saved): Outbox {
  const known = new Set(s.sync.known);
  const local = new Set(s.events.map((e) => e.id));
  return {
    events: s.events.filter((e) => !known.has(e.id)).slice(0, BATCH).map(toWire),
    deleted: s.sync.known.filter((id) => !local.has(id)).slice(0, BATCH),
    doc: s.sync.docAt > s.sync.docPushedAt ? docOf(s) : null,
    docAt: s.sync.docAt,
  };
}
export const isEmpty = (o: Outbox) => !o.events.length && !o.deleted.length && !o.doc;

/**
 * Records an accepted upload. `gone` are ids another device had already deleted: they leave this device too.
 * Applied to the latest state, so anything logged while the upload was in flight stays pending.
 */
export function afterPush(s: Saved, sent: Outbox, gone: string[]): Saved {
  const goneSet = new Set(gone);
  const removed = new Set(sent.deleted);
  const known = new Set(s.sync.known.filter((id) => !removed.has(id)));
  for (const e of sent.events) if (!goneSet.has(e.id)) known.add(e.id);
  const events = goneSet.size ? s.events.filter((e) => !goneSet.has(e.id)) : s.events;
  return {
    ...s, events, feedback: goneSet.size ? dropFeedback(s.feedback, goneSet) : s.feedback,
    sync: { ...s.sync, known: [...known], docPushedAt: sent.doc ? Math.max(s.sync.docPushedAt, sent.docAt) : s.sync.docPushedAt },
  };
}
function dropFeedback(f: Saved["feedback"], gone: Set<string>): Saved["feedback"] {
  return Object.fromEntries(Object.entries(f).filter(([, v]) => !gone.has(v.eventId)));
}

const byTsSeq = (a: EngineEvent, b: EngineEvent) => a.ts - b.ts || a.seq - b.seq;

/**
 * Folds one pulled page into the device's state.
 * - A live event is added unless the device already knows it (if known but missing here, this device deleted it and the delete is pending).
 * - A tombstone removes the event, and the like / dislike mark that pointed at it.
 * - Events this build cannot read are left on the server untouched: not added and not marked known, so they are never deleted from here.
 * - The settings document is taken when the server's is newer.
 */
export function applyPull(s: Saved, page: PullPage, userId: string): Saved {
  const known = new Set(s.sync.known);
  const byId = new Map(s.events.map((e) => [e.id, e] as const));
  const tombstoned = new Set<string>();
  let changed = false;
  for (const r of page.events) {
    if (r.deleted) {
      known.delete(r.id);
      tombstoned.add(r.id);
      if (byId.delete(r.id)) changed = true;
      continue;
    }
    if (known.has(r.id)) continue;
    if (byId.has(r.id)) {
      known.add(r.id); // our own upload coming back
      continue;
    }
    const parsed = EventSchema.safeParse({ id: r.id, userId, ts: r.ts, seq: r.seq, type: r.type, payload: r.payload, schemaVersion: r.schemaVersion });
    if (!parsed.success) continue;
    byId.set(r.id, parsed.data);
    known.add(r.id);
    changed = true;
  }
  let next: Saved = { ...s, sync: { ...s.sync, known: [...known], cursor: Math.max(s.sync.cursor, page.cursor) } };
  if (changed) {
    const events = [...byId.values()].sort(byTsSeq);
    // The account started when its first event did (a new phone must not restart the free week).
    const createdAt = Math.min(next.createdAt, events[0]?.ts ?? next.createdAt);
    next = { ...next, events, createdAt };
  }
  // Only a tombstone takes a mark away. A mark whose event is simply not here yet (a later page of a long
  // log) must stay, or it would be lost and then uploaded as if the user had removed it.
  if (Object.values(next.feedback).some((v) => tombstoned.has(v.eventId))) next = { ...next, feedback: dropFeedback(next.feedback, tombstoned) };
  if (page.doc && page.docAt !== null && page.docAt > s.sync.docAt) {
    const d = page.doc;
    next = {
      ...next, settings: { ...next.settings, ...d.settings }, onboarded: d.onboarded || next.onboarded, programStart: d.programStart,
      feedback: d.feedback ?? next.feedback, sync: { ...next.sync, docAt: page.docAt, docPushedAt: page.docAt },
    };
  } else if (!page.doc && s.sync.seedDoc && s.onboarded) {
    // The account has no settings yet: this device's become them (dated 1, so any real edit anywhere is newer).
    next = withSync(next, { docAt: Math.max(next.sync.docAt, 1) });
  }
  if (next.sync.seedDoc) next = withSync(next, { seedDoc: false });
  return next;
}

/**
 * Ties a device's log to an account at sign-in. Events made before sign-in become the account's and will upload.
 * The account's settings win over this device's (a new phone set up in a hurry must not overwrite them);
 * this device's settings are uploaded only when the account has none.
 * Returns the same object when nothing changes: this runs every time the app comes to the front.
 */
export function adopt(s: Saved, account: { id: string; email: string | null }, appVersion: string): Saved {
  const same = s.sync.account?.id === account.id;
  const moved = s.events.every((e) => e.userId === account.id);
  if (same && moved && s.userId === account.id && s.sync.account?.email === account.email && s.sync.appVersion === appVersion) return s;
  const events = moved ? s.events : s.events.map((e) => (e.userId === account.id ? e : { ...e, userId: account.id }));
  const sync: SyncMeta = same
    ? { ...s.sync, account }
    : { ...s.sync, account, cursor: 0, known: [], docPushedAt: 0, docAt: 0, seedDoc: true };
  // A new build re-reads the whole log once, so events an older build skipped can arrive.
  if (sync.appVersion !== appVersion) {
    sync.cursor = 0;
    sync.appVersion = appVersion;
  }
  return { ...s, userId: account.id, events, sync };
}

/** "6:30 pm" -> "18:30"; "Off" or anything unreadable -> null. */
export function reminderTime(label: string): string | null {
  const m = label.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3]!.toLowerCase() === "pm") h += 12;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}
