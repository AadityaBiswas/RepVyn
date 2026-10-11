# ADR-0002: Supabase as the backend

**Status:** Proposed
**Date:** 2026-10-11
**Deciders:** Aaditya

## Context
The backend needs: user accounts, a per-user event store with strict isolation, a few trusted server functions (create a Razorpay subscription, receive Razorpay webhooks, delete an account, send reminders), and a scheduler. One developer maintains it. Users are in India and the US.

## Decision
Use Supabase: Postgres with row-level security (RLS) for data, Supabase Auth for accounts, Edge Functions (Deno) for the trusted functions, and `pg_cron` + `pg_net` for scheduling. Schema lives in `supabase/migrations`, functions in `supabase/functions`, both deployed with the Supabase CLI. Region: Mumbai (`ap-south-1`) since most expected users are in India and DPDP favours local storage; US latency is acceptable because sync is background work.

## Options Considered

### Option A: Supabase (chosen)
| Dimension | Assessment |
|-----------|------------|
| Complexity | Low: managed auth, Postgres, functions, cron in one place |
| Cost | Free tier, then about $25/month |
| Scalability | Comfortable to hundreds of thousands of users for this write pattern |
| Team familiarity | Plain SQL and TypeScript |

**Pros:** auth handled by a vendor (fewer security mistakes); RLS keeps isolation in the database; standard Postgres so we can leave.
**Cons:** Edge Functions run Deno, not Node; vendor dashboard steps for setup.

### Option B: Own Node API (Hono/Fastify) + managed Postgres (Neon) + auth library
| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium-high: we own auth, sessions, email delivery, rate limits |
| Cost | Similar |
| Scalability | Good |
| Team familiarity | High |

**Pros:** full control, Node everywhere.
**Cons:** more code to secure; more services to run.

### Option C: Firebase
**Pros:** mature offline SDK, auth.
**Cons:** NoSQL rules are harder to test; lock-in; Postgres analytics on the event log lost.

## Trade-off Analysis
For a solo builder the biggest risk is a homemade auth or isolation bug. Supabase removes auth from our code and enforces isolation with RLS that we test (`tests/backend.db.test.ts` runs the migrations and RLS policies in PGlite).

## Consequences
- Easier: accounts, isolation, scheduling.
- Harder: Deno functions keep pure logic in `supabase/functions/_shared` so Node tests can import it.
- Revisit: if Edge Function cold starts hurt checkout, move billing to a small Node service.

## Action Items
1. [x] Migration `supabase/migrations/20261011000000_init.sql`.
2. [x] Functions: `billing`, `razorpay-webhook`, `account-delete`, `send-reminders`.
3. [ ] Aaditya: create the project in Mumbai and run the setup list in `docs/LAUNCH-SETUP.md`.
