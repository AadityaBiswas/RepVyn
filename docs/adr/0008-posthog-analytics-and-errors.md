# ADR-0008: PostHog for product analytics and error reports, no personal data

**Status:** Proposed
**Date:** 2026-10-11
**Deciders:** Aaditya

## Context
The launch is judged on calibration-week completion and trial start rate (launch plan). The engine's constants are untested on people, so real errors must be visible. Health-adjacent data in India (DPDP) and US states calls for minimal collection.

## Decision
One vendor, PostHog (EU or US cloud), called through a 2 KB wrapper (`app/src/telemetry.ts`) using its HTTP capture API instead of the SDK. Events: `app_opened`, `onboarding_done`, `workout_finished`, `paywall_viewed`, `checkout_started`, `subscribed`, `signed_in`, and `$exception` for uncaught errors. The distinct id is a random install id (or the account id after sign-in); no email, body weight or workout contents are sent. Telemetry is off when no key is configured and when the browser sends Do Not Track / Global Privacy Control.

## Options Considered

### Option A: PostHog over HTTP (chosen)
| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Cost | Free tier |
| Scalability | Fine |
| Team familiarity | n/a |

**Pros:** funnels and errors in one place; tiny bundle.
**Cons:** less rich stack traces than Sentry.

### Option B: PostHog + Sentry SDKs
**Pros:** best-in-class error tooling. **Cons:** about 80 KB more JavaScript, two vendors, two privacy disclosures.

## Consequences
- Revisit: add Sentry if error volume or debugging needs grow.

## Action Items
1. [x] `app/src/telemetry.ts`.
2. [ ] Aaditya: create a PostHog project and set `REPVYN_POSTHOG_KEY`.
