# ADR-0007: Reminders as web push sent by a scheduled Edge Function

**Status:** Proposed
**Date:** 2026-10-11
**Deciders:** Aaditya

## Context
Profile has a Reminders setting (Off, 6:30 am, 12:30 pm, 6:30 pm, 9:00 pm) that is stored but never sent. Reminders drive the habit the product depends on, and the brand voice is "Steady": no nagging.

## Decision
When a signed-in user picks a reminder time, the app asks for notification permission, subscribes with the server's VAPID public key, and stores the subscription in `push_subscriptions`. The reminder time and the device's IANA time zone are saved on the user's `profiles` row with each sync. `pg_cron` calls the `send-reminders` function every 5 minutes with a shared secret. The function calls `claim_due_reminders()`, which atomically marks and returns users whose local time has passed their reminder time today within a 15-minute window, who have not trained today in their own time zone, and who were not reminded today. It sends one push per device and removes subscriptions the push service reports gone (404/410).

## Options Considered

### Option A: Web push + pg_cron (chosen)
| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Cost | Free |
| Scalability | One query per 5 minutes; batches of 500 |
| Team familiarity | SQL + one function |

**Pros:** real reminders; skips days already trained; DST-correct via IANA zones.
**Cons:** iOS needs the app installed to the home screen.

### Option B: Email reminders
**Pros:** works everywhere. **Cons:** feels like marketing; lower open rates.

### Option C: Local notifications only
**Pros:** no server. **Cons:** the web has no scheduled local notifications.

## Consequences
- Easier: a later "your legs are ready" push uses the same pipe.
- Harder: VAPID keys to manage.
- Revisit: native notifications in Expo.

## Action Items
1. [x] Table, claim function, `send-reminders` function, service worker push handler.
2. [ ] Aaditya: generate VAPID keys, set secrets, run `supabase/setup/cron.sql`.
