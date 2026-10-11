# ADR-0003: Sync the event log with per-user server sequence numbers and tombstones

**Status:** Proposed
**Date:** 2026-10-11
**Deciders:** Aaditya

## Context
Each device holds the full event log (`Saved.events`). Events are mostly append-only with client UUIDs, but the app also removes events: un-liking an exercise deletes its `exercise_feedback` event, and back-to-back profile edits replace the last `profile_set`. Settings, onboarding state and per-exercise feedback marks live outside the log. Users may use two devices, or start offline and sign in later. Another thread is extending the engine, so the server must not depend on the event types.

## Decision
- **Server table** `events(user_id, id, ts, seq, type, payload jsonb, schema_version, deleted, server_seq)`, primary key `(user_id, id)`. Payloads are opaque JSON; `type` is only checked to be a short snake_case word, so new engine events need no migration.
- **Writes** go through one RPC, `sync_push`, which takes a per-user row lock and stamps each insert or tombstone with the next per-user `server_seq`. Because writes for a user are serialised, `server_seq` order equals commit order and a reader can never skip a row (the classic gap problem with global sequences).
- **Reads** go through `sync_pull(cursor)`, returning rows with `server_seq > cursor` in order, including tombstones, in pages.
- **Client** keeps `known`: the ids the server has alive. Pending uploads = local ids not in `known`; pending deletes = `known` ids no longer local. A pulled alive event is added only if its id is not in `known` (otherwise the device deleted it and the delete is pending). Pulled tombstones remove the event. Pushes report ids that were already tombstoned elsewhere so the device drops them.
- **Settings document** (settings, onboarded, program start, feedback marks) syncs as one row with last-writer-wins on the client's change time.
- Inserts are idempotent (`on conflict do nothing`), so retries are safe. Merge, diff and apply are pure functions in `app/src/cloud/syncCore.ts`, unit-tested.

## Options Considered

### Option A: Cursor + tombstones via RPC (chosen)
| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium: two SQL functions, one pure merge module |
| Cost | One small request per sync |
| Scalability | Indexed by `(user_id, server_seq)` |
| Team familiarity | Plain SQL |

**Pros:** correct under retries and concurrent devices; engine-agnostic; offline-first.
**Cons:** the `known` id list grows with the log (about 40 bytes per event).

### Option B: Upload the whole log and replace
**Pros:** trivial. **Cons:** last device wins and silently drops the other device's workouts.

### Option C: CRDT library or Supabase Realtime replication
**Pros:** general. **Cons:** heavy for an append-mostly log; more moving parts.

## Trade-off Analysis
The log is append-mostly with immutable events, so union-by-id plus tombstones is a complete merge. Only the settings document needs a conflict rule, and last-writer-wins matches what a user expects from a settings screen.

## Consequences
- Easier: new engine event types sync with no server change; data export is the log itself.
- Harder: the log lives in `localStorage` (5 MB). At roughly 300 bytes per set that is years of training, but an IndexedDB store should replace it before the Expo app.
- Revisit: move to IndexedDB; consider server-side compaction of tombstones older than 90 days.

## Action Items
1. [x] `sync_push`, `sync_pull` in the init migration, tested in PGlite.
2. [x] `app/src/cloud/syncCore.ts` with unit tests.
3. [ ] Move device storage to IndexedDB before the Expo port.
