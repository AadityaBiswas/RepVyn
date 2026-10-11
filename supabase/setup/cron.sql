-- Run once in the Supabase SQL editor after deploying the functions (docs/LAUNCH-SETUP.md).
-- Replace <PROJECT_REF> and <CRON_SECRET> (the same value as the function secret CRON_SECRET).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('<CRON_SECRET>', 'repvyn_cron_secret');

select cron.schedule('repvyn-send-reminders', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'repvyn_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000);
$$);

-- Weekly clean-up: webhook audit rows older than a year.
select cron.schedule('repvyn-prune-billing-events', '17 3 * * 0', $$
  delete from public.billing_events where received_at < now() - interval '1 year';
$$);
