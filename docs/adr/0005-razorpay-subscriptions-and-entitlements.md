# ADR-0005: Razorpay Subscriptions, webhook-driven entitlements, Pro gating

**Status:** Proposed
**Date:** 2026-10-11
**Deciders:** Aaditya

## Context
Aaditya chose Razorpay for both India and the US (2026-10-10). The launch plan proposes Free vs Pro with Pro at $7.99/month or $49.99/year in the US and ₹249/₹1,499 in India, a 7-day trial, and these Pro-only features: dumbbells and bench, programs other than Balanced, full progress history and insights, weekly calorie totals. Prices and the split are not approved yet, so they must be configuration.

## Decision
- **Plans** are created in the Razorpay dashboard (four: IN monthly/yearly in INR, US monthly/yearly in USD). Their ids are Edge Function secrets; display prices are client config.
- **Checkout:** the signed-in app calls the `billing` function (`action: "checkout"`), which creates a Razorpay subscription for the user's chosen plan with `notes.user_id`, adding a 7-day trial (`start_at` = now + 7 days) only if the user never had a subscription. The app opens Razorpay Checkout with the subscription id. On success the app sends the signed result to `billing` (`action: "verify"`), which checks the HMAC and records the subscription, so Pro unlocks immediately.
- **Source of truth** is the `razorpay-webhook` function: it verifies `X-Razorpay-Signature` over the raw body, de-duplicates by `x-razorpay-event-id`, ignores events older than the last applied one, and updates `subscriptions`.
- **Entitlement** is computed in SQL (`my_entitlement()`): Pro while a subscription is trialing/active/pending within its paid period plus 3 days of grace, or until the period end after cancel/halt, or while a manual `pro_grants` row is valid (creators, support).
- **Gating** is a pure table in `app/src/entitlements.ts`. It is enforced only when billing is configured (`RAZORPAY_KEY_ID` set at build), so the app is fully free until payments are live. Cancel is in the app (`action: "cancel"`, at cycle end).

## Options Considered

### Option A: Razorpay Subscriptions + own entitlements (chosen)
| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium: three function actions, one webhook, one SQL function |
| Cost | About 2% India, about 3% + GST on international cards |
| Scalability | Fine |
| Team familiarity | Medium |

**Pros:** UPI Autopay and cards in India; one provider; entitlement is ours.
**Cons:** international recurring cards need Razorpay approval; we write webhook handling ourselves.

### Option B: RevenueCat Web Billing
**Pros:** one entitlement across web and stores. **Cons:** web billing runs on Stripe/Paddle, not Razorpay; Stripe is invite-only in India.

### Option C: Payment links / one-off yearly payments
**Pros:** simplest. **Cons:** no renewals; churn by default.

## Trade-off Analysis
Razorpay is decided. Keeping entitlement in our database lets RevenueCat be added later for store purchases: its webhook would write the same `subscriptions` table with `provider = 'revenuecat'`.

## Consequences
- Easier: price changes are dashboard + config; free Pro for creators via `pro_grants`.
- Harder: tax (18% GST in India) and invoices are configured in Razorpay and with a CA.
- Revisit: founding-member price; RevenueCat when the Expo apps ship.

## Action Items
1. [x] `billing`, `razorpay-webhook` functions; `subscriptions`, `billing_events`, `pro_grants` tables.
2. [x] Paywall and manage-subscription screens.
3. [ ] Aaditya: KYC, enable Subscriptions and international cards, create the four plans, add the webhook.
