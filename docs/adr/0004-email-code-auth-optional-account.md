# ADR-0004: Optional account, email one-time code sign-in

**Status:** Proposed
**Date:** 2026-10-11
**Deciders:** Aaditya

## Context
The app today needs no account. Product principle 1 is "the app decides; the user trains", and a sign-up wall before the first workout costs activation. An account is needed to sync across devices, keep data when the phone is lost, and own a subscription. The app runs as an installed PWA, where magic links open in the browser rather than the installed app (iOS especially).

## Decision
Accounts are optional. The app works fully signed out. Signing in (Profile → Account) is required only to buy Pro and to sync. Sign-in uses Supabase Auth email one-time codes (6 digits typed into the app). On first sign-in, the device's existing log is merged into the account (ADR-0003). Google and Apple sign-in can be added later in the same screen without changing the data model.

## Options Considered

### Option A: Optional account, email code (chosen)
| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Cost | Supabase sends a few emails free; custom SMTP (Resend) for production volume |
| Scalability | Fine |
| Team familiarity | High |

**Pros:** no friction before the first workout; codes work inside an installed PWA; no passwords to leak.
**Cons:** email deliverability matters; needs a custom SMTP sender before launch.

### Option B: Required account up front
**Pros:** every user is reachable and synced. **Cons:** activation loss before the product proves itself.

### Option C: Google sign-in only
**Pros:** one tap. **Cons:** popup and redirect quirks inside installed PWAs; excludes users without Google accounts.

## Consequences
- Easier: activation; data ownership is clear.
- Harder: a signed-out user who clears site data loses their log (the app offers export and nudges sign-in).
- Revisit: add Google / Apple sign-in when moving to Expo (Apple requires Sign in with Apple if any third-party sign-in is offered).

## Action Items
1. [x] Account screen with email code flow (`app/src/ui/account.tsx`).
2. [ ] Aaditya: set custom SMTP (Resend) and the email template showing `{{ .Token }}`.
