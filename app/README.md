# RepVyn app (Home screen v2)

Real screens for the design in `design/` and the published Home screen v2 canvas, wired to the engine in `src/engine`.

- `npm run app` builds one self-contained file, `app/dist/index.html`. Open it in a browser.
- `npm run app -- --serve` rebuilds on save and serves it at http://localhost:5173.
- Everything is kept in the browser's localStorage (key `home-v2`) as the engine's event log; clear site data to start over.
- `app/src/model.ts` and `app/src/workout.ts` are pure and tested in `tests/app.test.ts`.
- The body figures are coloured at runtime from `assets/body/map-front.png` and `map-back.png`, made by `assets/body/make_map.py`.

Defaults picked where the design was silent: 45 s rest, the check-in card only after recent training, a "Done for today" card after a workout, reminders stored but not sent, X ends a workout and keeps the sets done, and placeholder thumbnails and video.

## Accounts, sync, Pro and reminders

The app works fully on the device. When the build has a backend configured (see `.env.example`), it also offers:
- **Sign in with an email code** (Profile → Account). The device's log moves into the account and syncs across devices (`app/src/cloud/`, ADR-0003).
- **RepVyn Pro** through Razorpay, with Free/Pro rules in `app/src/entitlements.ts`. Gating switches on only when `REPVYN_RAZORPAY_KEY_ID` is set; everything is open for the first 7 days.
- **Reminders** as web push at the time chosen in Profile, skipped on days already trained.
- **Install and offline** through `app/public/` (manifest, service worker, icons) and **legal pages** (privacy, terms, refunds; drafts to complete).

Try it locally without a cloud project:
```
npm run dev:backend                      # Supabase stand-in on http://localhost:54321, code 123456
REPVYN_SUPABASE_URL=http://localhost:54321 REPVYN_SUPABASE_ANON_KEY=dev npm run app -- --serve
```
Backend: `supabase/` (schema, functions). Decisions: `docs/adr/`. Setup steps: `docs/LAUNCH-SETUP.md`. Review: `docs/REVIEW.md`.
