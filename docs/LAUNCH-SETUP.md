# RepVyn launch setup

Everything in code is built and tested. These steps need your own accounts, keys and money, so they are yours. Do them in order; each says how to check it worked. Start with test keys everywhere and switch to live keys only at launch.

Until a step is done the app keeps working: with no backend configured it runs fully on the phone, and Pro checks stay off until a Razorpay key is set.

## 1. Code hosting (15 min)
1. Create a private GitHub repository and push this folder (`.gitignore` already keeps `node_modules`, builds and `.env` files out).
2. CI (`.github/workflows/ci.yml`) runs typecheck, tests, the app build and a Deno check of the functions on every push.

## 2. Supabase (30 min)
1. Create a project at supabase.com, region **Mumbai (ap-south-1)**, a strong database password.
2. Install the CLI: `npx supabase login`, then `npx supabase link --project-ref <ref>`.
3. Apply the schema: `npx supabase db push` (runs `supabase/migrations`).
4. Auth → Providers → Email: on; "Confirm email" off (the 6-digit code confirms it). Auth → Email templates → Magic Link: make the body show the code, for example `Your RepVyn code is {{ .Token }}`. Do the same for "Confirm signup".
5. Auth → SMTP: add a sender (Resend or Postmark, from an address on your domain). Supabase's built-in sender is limited to a few emails an hour, and on the free plan the email templates cannot be changed until a custom sender is set. Once it is, `npx supabase config push` applies the code email from `supabase/config.toml` (`supabase/templates/code.html`), which replaces the manual template edit in step 4.
6. Auth → URL configuration: Site URL `https://<your domain>`.
7. Copy Project URL and the **anon** key (Settings → API) for step 5.

Check: `npm run dev:backend` is the offline stand-in; for the real project, signing in from the built app (step 5) should email a code.

## 3. Razorpay (KYC takes days, start early)
1. Complete KYC for your business. Razorpay will review your website: it must show the privacy, terms and refund pages (in `app/public`, fill in every `[BRACKETED]` item and have them checked by a lawyer or CA first).
2. Ask Razorpay support to enable **Subscriptions** and **international card payments** (for US users, recurring USD).
3. Create four plans (Subscriptions → Plans), and note each plan id:
   - `in_monthly` ₹249 / month, `in_yearly` ₹1,499 / year (INR)
   - `us_monthly` $7.99 / month, `us_yearly` $49.99 / year (USD)
   Prices are the launch plan's proposal; change them here and in `app/src/config.ts` (`DEFAULT_PRICES`) together.
4. Webhooks → add `https://<ref>.supabase.co/functions/v1/razorpay-webhook`, a long random secret, and these events: all `subscription.*`.
5. Settings → API keys: generate test keys (`rzp_test_...`).
6. Get a CA's advice on GST (18% on Indian sales) and on US sales before going live.

## 4. Push reminders (10 min)
1. `npx web-push generate-vapid-keys` and keep both keys.
2. Pick a cron secret: any long random string.

## 5. Function secrets and deploy (10 min)
1. Copy `supabase/.env.example` to `supabase/.env` and fill it in (Razorpay keys and plan ids, webhook secret, VAPID keys, cron secret, `APP_ORIGINS` = your site's origin).
2. `npx supabase secrets set --env-file supabase/.env`
3. `npx supabase functions deploy billing razorpay-webhook account-delete send-reminders`
4. In the SQL editor, run `supabase/setup/cron.sql` after replacing `<PROJECT_REF>` and `<CRON_SECRET>`.

Check: Edge Functions → send-reminders → Logs shows a run every 5 minutes.

## 6. PostHog (5 min, optional)
Create a project (US or EU cloud) and copy the project API key.

## 7. Web hosting on Cloudflare Pages (15 min)
1. Pages → Create → connect the GitHub repository.
2. Build command `npm run app`, output directory `app/dist`, Node 22.
3. Environment variables (all public by design), from `.env.example`: `REPVYN_SUPABASE_URL`, `REPVYN_SUPABASE_ANON_KEY`, `REPVYN_RAZORPAY_KEY_ID`, `REPVYN_VAPID_PUBLIC_KEY`, `REPVYN_POSTHOG_KEY`, `REPVYN_POSTHOG_HOST`, `REPVYN_SUPPORT_EMAIL`.
4. Add your domain (for example `app.repvyn.com`) and make sure it matches `APP_ORIGINS` and the Supabase Site URL.

Check: open the site on a phone, add it to the home screen, turn on airplane mode, and reopen it: it should still open. The build log line shows which features are live, for example `accounts, billing, push, analytics`.

## 8. Test the money path with test keys
1. Sign in, open Profile → RepVyn Pro, and subscribe with a Razorpay test card or test UPI id.
2. Check Supabase → Table editor → `subscriptions` has a row with status `authenticated` (trial) or `active`, and Profile shows Pro.
3. Cancel from Profile and check the row shows `cancel_at_period_end` or `cancelled`.
4. Razorpay → Webhooks shows deliveries as 200.

## 9. Go live
Swap to `rzp_live_...` keys and live plan ids in both places (function secrets and `REPVYN_RAZORPAY_KEY_ID`), redeploy, and buy one subscription yourself with a real card. Give free Pro to testers and creators with one SQL line:
`insert into pro_grants (user_id, until, reason) values ('<user id>', '2027-12-31', 'creator');`
