# RepVyn phone app: what's left to build

Details and reasons are in `docs/MOBILE-LAUNCH-PLAN.md`. Recap screens have their own list in `docs/RECAP-CHECKLIST.md`.

## Before anyone outside can use it (P0)
- [ ] Email sender for sign-in codes (SMTP: Resend or Postmark in Supabase) — *yours: account + domain*
- [ ] Decide how Pro is sold: launch free (recommended) or Google Play Billing — *your call*
- [ ] Fill the `[BRACKETED]` gaps in `legal/privacy.html` and `legal/terms.html` — *yours, ideally checked by a lawyer or CA*
- [ ] Host the privacy policy and terms at a public link
- [ ] Privacy and Terms rows in Profile that open those links
- [ ] Version code in `mobile/app.json`, upload signing key, signed release build (AAB)
- [ ] Google Play Console: app listing, screenshots, data-safety form, content rating — *yours*
- [ ] Full test pass on a real phone (checklist in the launch plan, section 5)

## Makes it feel finished (P1)
- [x] Recap screens after a workout: learned, growth, week on plan, share card (phone check of Share still to do)
- [ ] Crash reports (Sentry)
- [ ] Pro, once decided: Pro page, subscribe, restore, manage, cancel
- [ ] Free-tier limits: no dumbbells or bench, 28 days of history after the free week
- [ ] Pro offer once after the first workout past the free week

## After launch (P2)
- [ ] Exercise videos or animated demos (replace the placeholder)
- [ ] Usage numbers (PostHog: opened, set-up done, workout finished, paywall viewed)
- [ ] iPhone build (Apple developer account; Mac or EAS Build)
- [ ] Backend clean-up: turn off the web-push reminder job and remove `send-reminders` and the push tables
- [ ] Fix the 2 outdated tests (red scale direction; an hour-off time label)

## Done
- [x] First-run set-up and program
- [x] Today, soreness check-in, plan card, done-for-today
- [x] Workout set-up (length, intensity, equipment, swap, like/dislike)
- [x] Workout run that survives lock and app close
- [x] "Workout done" screen
- [x] Body, Progress and Profile tabs, all settings
- [x] Email sign-in, sync, log out, delete account
- [x] Daily reminders
- [x] Android Back and predictive back, haptics, dark mode, tablets
- [x] Web app removed; phone app is the only app
