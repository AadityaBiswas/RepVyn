# ADR-0001: The engine runs on the device; the server only stores events

**Status:** Proposed
**Date:** 2026-10-11
**Deciders:** Aaditya

## Context
The engine (`src/engine`) is pure, deterministic TypeScript that rebuilds all state by replaying an append-only event log (SPEC §2, §6: "State is never stored"). It was written to run unchanged in a browser and in Expo. Users train at home, often with poor connectivity, and the workout screen must never wait on a network call. Launch budget is under about $50 a month.

## Decision
Keep the engine on the device. The app plans, logs and shows progress offline from its local event log. The server stores a copy of each user's event log and settings for backup and multi-device sync, and holds the things only a server can hold: subscriptions, push subscriptions and scheduled reminders. No engine code runs on the server.

## Options Considered

### Option A: Engine on device, thin server (chosen)
| Dimension | Assessment |
|-----------|------------|
| Complexity | Low: the server is tables, row-level security and four small functions |
| Cost | Near zero per user; no compute per plan |
| Scalability | Scales with storage only |
| Team familiarity | High: the engine already runs this way in `app/` |

**Pros:** works offline; instant plans; one engine for web and Expo; no server/client version skew in planning.
**Cons:** the server cannot plan for the user (no server-side emails like "your legs are ready" without replaying); engine bug fixes ship with the app.

### Option B: Engine as a server API
| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium-high: API, caching, auth on every call |
| Cost | Compute per request |
| Scalability | Needs caching of replays |
| Team familiarity | Medium |

**Pros:** one place to fix the engine; server-side insights.
**Cons:** no offline; latency mid-workout; contradicts SPEC's Expo goal.

## Trade-off Analysis
Offline workouts and cost decide it. Server-side insights, if needed later, can replay the stored log in a batch job using the same pure engine.

## Consequences
- Easier: offline, cost, the Expo port.
- Harder: server-generated content needs a replay job.
- Revisit: when an engine change must reach every user at once (force-update banner via the service worker).

## Action Items
1. [x] Keep `app/src/store.ts` as the source of truth on the device.
2. [x] Server schema stores events as opaque JSON payloads so engine changes need no migration (ADR-0003).
