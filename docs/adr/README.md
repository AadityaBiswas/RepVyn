# Architecture decision records

Each record is one decision about how RepVyn runs in production. Status "Proposed" means Claude picked it as a default and Aaditya has not signed off yet; change the status to "Accepted" (or write a superseding record) when he does.

| # | Decision | Status |
|---|----------|--------|
| [0001](0001-local-first-engine-on-device.md) | The engine runs on the device; the server only stores events | Proposed |
| [0002](0002-supabase-backend.md) | Supabase (Postgres, Auth, Edge Functions) as the backend | Proposed |
| [0003](0003-event-log-sync.md) | Sync the event log with per-user server sequence numbers and tombstones | Proposed |
| [0004](0004-email-code-auth-optional-account.md) | Optional account, email one-time code sign-in | Proposed |
| [0005](0005-razorpay-subscriptions-and-entitlements.md) | Razorpay Subscriptions, webhook-driven entitlements, Pro gating | Proposed |
| [0006](0006-pwa-on-cloudflare-pages.md) | Installable web app (PWA) on Cloudflare Pages | Proposed |
| [0007](0007-web-push-reminders.md) | Reminders as web push sent by a scheduled Edge Function | Proposed |
| [0008](0008-posthog-analytics-and-errors.md) | PostHog for product analytics and error reports, no personal data | Proposed |

Dates are 2026-10-11 unless stated. Deciders: Aaditya (owner).
