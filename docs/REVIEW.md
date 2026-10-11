# Code review: production backend and wiring (11 Oct 2026)

Scope: everything added for accounts, sync, billing, reminders and the installable app: `supabase/`, `app/src/cloud/`, `app/src/entitlements.ts`, `app/src/config.ts`, `app/src/ui/account.tsx`, the wiring in `app/src/ui/app.tsx` and `app/src/store.ts`, `app/build.mjs`, `app/public/`, `scripts/`.
Checked by: typecheck (tsc, and `deno check` for the functions), 467 passing tests, including the migrations and RLS run in PGlite, a two-device browser run against `scripts/dev-backend.ts` (`scripts/e2e-sync.ts`), and a load of the built app in a real browser under the production Content Security Policy, with the service worker in control and offline.

A second pass on the same day went looking for bugs the first had missed. It found 16; they are listed under "Fixed in the second pass". The two worst only show on the live site, because the local server did not send the security policy that production does. It does now.

## Summary
The design is sound: data isolation is enforced in the database, payments are verified by signature and re-read from Razorpay, and sync is idempotent and order-safe. The browser run found two real sync bugs and the first review found ten more issues; the second pass found 16 more. All 28 are fixed, and covered by tests where a test can reach them. What is left is listed under "Known risks", none of which block a test-key beta.

## Fixed during review
| # | Where | Issue | Severity | Fix |
|---|-------|-------|----------|-----|
| 1 | `app/src/ui/app.tsx` commit | Sync read app state through React's lazy state update, so back-to-back changes saw a stale copy (re-uploads, and a pull loop that could refetch the same page) | 🔴 Critical | Changes go through a ref updated at once |
| 2 | `cloud/syncCore.ts` stampDoc | A settings document pulled from the server was re-dated as a local edit and pushed back, undoing the other device's newer change | 🔴 Critical | Pulled documents keep their own date; test added |
| 3 | `cloud/index.ts` signOut | Logging out offline cleared the phone before unsynced workouts were uploaded | 🔴 Critical | Refuses while anything is pending, with a plain message |
| 4 | `syncCore.ts` adopt | A second phone signing in could overwrite the account's settings with its quick setup | 🟠 High | The account's settings win at sign-in; a device's are uploaded only if the account has none; test added |
| 5 | migration `entitlement_for` | Opening checkout and closing it used up the free trial | 🟠 High | Unpaid (`created`) subscriptions no longer count |
| 6 | `functions/billing` | Every tap on Subscribe created a new Razorpay subscription | 🟡 Medium | Reuses an unpaid checkout for the same plan from the last day |
| 7 | `cloud/index.ts` checkout | If the verify call failed after a successful payment, the user saw an error | 🟡 Medium | Says payment was received; re-checks Pro twice; the webhook records it regardless |
| 8 | `cloud/index.ts` enablePush | Asked for notification permission while signed out, when nothing can be delivered | 🟡 Medium | Asks only when signed in; Account offers "Turn on reminders" |
| 9 | `syncCore.ts` applyPull | A new phone restarted the 7-day free week | 🟡 Medium | The week counts from the account's first event; test added |
| 10 | `cloud/telemetry.ts` | "signed_in" was counted on every app start | 🟢 Low | Counted once per account per device |
| 11 | `scripts/dev-backend.ts` | The no-auth dev server listened on every network interface | 🟢 Low | Loopback only |
| 12 | `ui/account.tsx` | Pro page promised history and weekly-calorie limits the app does not enforce yet | 🟢 Low | Lists only what Free leaves out (dumbbells, bench, programs) |

## Fixed in the second pass
| # | Where | Issue | Severity | Fix |
|---|-------|-------|----------|-----|
| 13 | `app/build.mjs` policy | On the live site the body maps could not load: they are read with `fetch` from bundled data, which the policy blocked | 🔴 Critical | `data:` allowed for fetches; checked in a real browser |
| 14 | `app/build.mjs` policy | On the live site the Geist fonts failed on every visit after the first: the service worker fetches them, and a worker's fetches were not allowed to reach Google Fonts | 🟠 High | Font hosts allowed for the worker; checked in a real browser, online and offline |
| 15 | `cloud/index.ts` signOut | Logging out on one phone signed out every phone on the account, and those phones had no way to sign back in | 🟠 High | Log out ends this device's session only; a phone whose session ended shows "Sign in again" |
| 16 | `ui/app.tsx` | Fix 4 was half done: a second phone took the account's settings, but the engine kept planning from that phone's quick setup, and passed it to the other phones | 🟠 High | The engine's profile is recorded again when settings arrive from the account; checked in the two-device run |
| 17 | `ui/account.tsx` Pro page | "7 days free" was promised to accounts that had already used the trial; they would have been charged at once | 🟠 High | The offer follows the server's record of a past subscription |
| 18 | migration `apply_subscription` | A webhook for a deleted account (its own cancellation) failed every time. Razorpay retries for a day and then turns the webhook off for everyone | 🟠 High | Accepted and dropped; test added |
| 19 | `syncCore.ts` applyPull | A new phone reading a long log (over 1,000 events) lost like and dislike marks whose events were on a later page, then uploaded that loss to the account | 🟠 High | Only a delete removes a mark; test added |
| 20 | `entitlements.ts` access | Pro switched off at the renewal date until the charge was confirmed, although the server allows 3 days | 🟡 Medium | The app allows the same 3 days; test added |
| 21 | `account-delete` | "Already cancelled" was recognised by finding 400 or 404 anywhere in the error text, so a subscription id containing those digits could let a delete go ahead without cancelling billing | 🟡 Medium | Checks Razorpay's status code |
| 22 | `cloud/index.ts` attach | Opening the app offline after an hour said "Your session ended" | 🟡 Medium | A refresh that could not reach the server is not an ended session |
| 23 | `cloud/index.ts` signedIn | Each time the app came to the front, the whole log was rewritten to storage and replayed, and the reminder subscription was sent again | 🟡 Medium | Nothing is written when nothing changed; test added |
| 24 | `cloud/index.ts` signedIn | Signing in with a different email on a phone that still held another account's training merged the two logs | 🟡 Medium | Refused with a plain message |
| 25 | `cloud/index.ts` syncOnce | A sync sent without a session was reported as "Sync paused. It will retry", and retried for ever | 🟡 Medium | Recognised as an ended session |
| 26 | migration `claim_due_reminders` | Users who had already trained, or had no device to notify, could fill every batch and starve the users behind them | 🟢 Low | Batch limit applied after those checks; test added |
| 27 | `cloud/index.ts` leave | A sync still running at log-out could write the old state back to the cleared phone | 🟢 Low | The app is detached before the phone is cleared |
| 28 | `cloud/index.ts` signOut | The reminder subscription was removed after the session had ended, so the server kept it | 🟢 Low | Removed first |

The local server (`npm run app -- --serve`) now sends the production policy, so anything it would block shows up before a deploy.

## Security checks that passed
- Every table has RLS; users can only read their own rows, and the tests prove another user's rows, billing tables and the reminder function are unreachable (`tests/backend/db.test.ts`).
- All writes that need trust are `SECURITY DEFINER` functions with `search_path = ''`, called with `auth.uid()`; the service-role-only ones are revoked from `anon` and `authenticated`.
- Event types are checked by pattern, payloads by type and size, batches by count; bad time zones and reminder times are dropped before they reach the scheduler.
- Webhook: HMAC over the raw body, constant-time compare, refuses everything when no secret is set, de-duplicated by event id, stale events ignored, user id taken from the subscription's notes and never allowed to move a subscription between users.
- Checkout: signature verified with the key secret, then the subscription is re-fetched from Razorpay and its user checked against the caller.
- Account deletion cancels billing first and stops if it cannot, so nobody is charged after deleting.
- Only public values reach the browser. The CSP allows only this build's inline script (by hash), Razorpay, Supabase, PostHog and Google Fonts; framing is denied.

## Known risks (not fixed)
- **Plan choice is trusted.** The app picks INR or USD from the time zone; the server accepts either. A US user could buy the cheaper INR plan with an international card. Fix when it matters: check the card country in the webhook (`payment.entity.international`) or price by billing address.
- **Trial reuse.** Deleting the account and signing up again with the same email gives a second trial. Fix if abused: keep a hash of emails that have had a trial.
- **Device storage.** The log is in `localStorage` (about 5 MB, years of training). Move to IndexedDB before the Expo app (ADR-0003).
- **Razorpay specifics to confirm in test mode:** trials via `start_at` with UPI Autopay, the exact webhook sequence, and whether checkout needs any CSP host beyond those listed.
- **Free tier history limit** (28 days) is defined (`FREE_HISTORY_DAYS`) but the Progress tab does not apply it yet; that belongs to the UX pass.
- **Edge Functions are not run in CI**, only type-checked; the pure parts they use are unit-tested. The one-line change to `account-delete` in the second pass was made on a PC without Deno, so CI's `deno check` is its first type check.
- **Settings conflicts trust each phone's clock.** The newer edit wins by the device's own time; a phone with a wrong clock can win or lose unfairly. Training events are not affected.
- **Free and Pro are decided on the device** from a cached answer, so someone who edits the app's storage can unlock Pro features on their own phone. Nothing on the server trusts that cache.
- **Legal pages are not finished.** `app/public/privacy.html`, `terms.html` and `refunds.html` still have `[BRACKETED]` items to fill in and have checked (`docs/LAUNCH-SETUP.md` step 3).

## Verdict
Approve for a test-key beta. Go live after the Razorpay test-mode checks in `docs/LAUNCH-SETUP.md` step 8.
