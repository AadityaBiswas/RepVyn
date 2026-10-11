-- RepVyn backend schema (ADR-0002, 0003, 0005, 0007).
-- Every table is private to its user through row-level security. Writes that need
-- ordering or trust go through SECURITY DEFINER functions with a fixed search_path.

-- ---------------------------------------------------------------- profiles
-- One row per user: the app's settings document (last writer wins on the client's
-- change time) and the reminder fields the scheduler queries.
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  doc jsonb not null default '{}'::jsonb check (jsonb_typeof(doc) = 'object' and pg_column_size(doc) < 65536),
  doc_at bigint not null default 0,
  remind_at time,
  tz text check (tz is null or length(tz) between 1 and 64),
  reminded_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- events
-- The engine's event log. Payloads are opaque so engine changes need no migration.
create table public.events (
  user_id uuid not null references auth.users (id) on delete cascade,
  id uuid not null,
  ts bigint not null check (ts between 0 and 32503680000000),
  seq integer not null check (seq >= 0),
  type text not null check (type ~ '^[a-z][a-z0-9_]{0,47}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) < 16384),
  schema_version smallint not null check (schema_version between 1 and 100),
  deleted boolean not null default false,
  server_seq bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create unique index events_user_server_seq on public.events (user_id, server_seq);
-- Reminder skip check: "trained today" looks up set events by time.
create index events_user_type_ts on public.events (user_id, type, ts) where not deleted;

-- Per-user write counter. Its row lock serialises a user's writes so server_seq order is commit order.
create table public.sync_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_seq bigint not null default 0
);

-- ---------------------------------------------------------------- billing
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'razorpay' check (provider in ('razorpay', 'revenuecat', 'manual')),
  provider_subscription_id text not null,
  plan_key text not null,
  status text not null,
  trial_end timestamptz,
  current_start timestamptz,
  current_end timestamptz,
  cancel_at_period_end boolean not null default false,
  provider_updated_at bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);
create index subscriptions_user on public.subscriptions (user_id);

-- Webhook de-duplication and audit. No client access.
create table public.billing_events (
  event_id text primary key,
  type text not null,
  provider_subscription_id text,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

-- Free Pro for creators, testers and support cases.
create table public.pro_grants (
  user_id uuid not null references auth.users (id) on delete cascade,
  until timestamptz not null,
  reason text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, until)
);

-- ---------------------------------------------------------------- push
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) < 1024),
  p256dh text not null check (length(p256dh) < 256),
  auth text not null check (length(auth) < 64),
  created_at timestamptz not null default now()
);
create index push_subscriptions_user on public.push_subscriptions (user_id);

-- ---------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.sync_state enable row level security;
alter table public.subscriptions enable row level security;
alter table public.billing_events enable row level security;
alter table public.pro_grants enable row level security;
alter table public.push_subscriptions enable row level security;

-- Reads of own rows only. Event and profile writes go through sync_push; billing rows are
-- written only by the service role (functions), which bypasses RLS.
create policy "own profile" on public.profiles for select to authenticated using (user_id = auth.uid());
create policy "own events" on public.events for select to authenticated using (user_id = auth.uid());
create policy "own subscriptions" on public.subscriptions for select to authenticated using (user_id = auth.uid());
create policy "own grants" on public.pro_grants for select to authenticated using (user_id = auth.uid());
create policy "own push read" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "own push insert" on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy "own push delete" on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

revoke all on public.profiles, public.events, public.sync_state, public.subscriptions, public.billing_events, public.pro_grants, public.push_subscriptions from anon, authenticated;
grant select on public.profiles, public.events, public.subscriptions, public.pro_grants to authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;

-- ---------------------------------------------------------------- sync
-- Uploads new events, tombstones deleted ones, and saves the settings document if newer.
-- Returns the ids the server already had tombstoned (deleted on another device).
create function public.sync_push(
  p_events jsonb default '[]'::jsonb,
  p_deleted uuid[] default '{}',
  p_doc jsonb default null,
  p_doc_at bigint default null,
  p_remind_at text default null,
  p_tz text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  n_events int := coalesce(jsonb_array_length(p_events), 0);
  n_deleted int := coalesce(cardinality(p_deleted), 0);
  base bigint;
  gone uuid[];
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if jsonb_typeof(p_events) <> 'array' then raise exception 'events must be an array' using errcode = '22023'; end if;
  if n_events > 500 or n_deleted > 500 then raise exception 'batch too large' using errcode = '54000'; end if;

  insert into public.sync_state (user_id) values (uid) on conflict (user_id) do nothing;
  -- Row lock: one writer per user at a time.
  select last_seq into base from public.sync_state where user_id = uid for update;

  -- Ids in this batch that another device already deleted.
  select coalesce(array_agg(e.id), '{}') into gone
  from public.events e
  where e.user_id = uid and e.deleted
    and e.id in (select (x->>'id')::uuid from jsonb_array_elements(p_events) x);

  with incoming as (
    select (x->>'id')::uuid as id, (x->>'ts')::bigint as ts, (x->>'seq')::int as seq, x->>'type' as type,
           x->'payload' as payload, (x->>'schemaVersion')::smallint as schema_version, ord
    from jsonb_array_elements(p_events) with ordinality as t(x, ord)
  ), fresh as (
    select i.* from incoming i
    where not exists (select 1 from public.events e where e.user_id = uid and e.id = i.id)
  ), ins as (
    insert into public.events (user_id, id, ts, seq, type, payload, schema_version, server_seq)
    select uid, f.id, f.ts, f.seq, f.type, f.payload, f.schema_version, base + row_number() over (order by f.ord)
    from fresh f
    on conflict (user_id, id) do nothing
    returning 1
  )
  select base + count(*) into base from ins;

  with del as (
    select d.id, row_number() over (order by d.id) as rn
    from public.events d
    where d.user_id = uid and d.id = any (p_deleted) and not d.deleted
  ), upd as (
    update public.events e
    set deleted = true, payload = '{}'::jsonb, server_seq = base + del.rn, updated_at = now()
    from del where e.user_id = uid and e.id = del.id
    returning 1
  )
  select base + count(*) into base from upd;

  update public.sync_state set last_seq = base where user_id = uid;

  -- Unknown zones would make the reminder query fail for everyone; drop them.
  if p_tz is not null and not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_tz) then
    p_tz := null;
  end if;
  if p_remind_at is not null and p_remind_at !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    p_remind_at := null;
  end if;

  if p_doc is not null and p_doc_at is not null then
    insert into public.profiles as p (user_id, doc, doc_at, remind_at, tz)
    values (uid, p_doc, p_doc_at, nullif(p_remind_at, '')::time, p_tz)
    on conflict (user_id) do update
      set doc = excluded.doc, doc_at = excluded.doc_at, remind_at = excluded.remind_at, tz = excluded.tz, updated_at = now()
      where p.doc_at < excluded.doc_at;
  end if;

  return jsonb_build_object('gone', to_jsonb(gone), 'cursor', base);
end $$;

-- Rows changed after `p_cursor`, oldest first, with the settings document.
create function public.sync_pull(p_cursor bigint default 0, p_limit int default 1000)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  lim int := least(greatest(coalesce(p_limit, 1000), 1), 1000);
  rows jsonb;
  last bigint;
  n int;
  prof record;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'ts', e.ts, 'seq', e.seq, 'type', e.type, 'payload', e.payload,
           'schemaVersion', e.schema_version, 'deleted', e.deleted, 'serverSeq', e.server_seq) order by e.server_seq), '[]'::jsonb),
         max(e.server_seq), count(*)
    into rows, last, n
  from (select * from public.events
        where user_id = uid and server_seq > coalesce(p_cursor, 0)
        order by server_seq limit lim) e;
  select doc, doc_at into prof from public.profiles where user_id = uid;
  return jsonb_build_object(
    'events', rows,
    'cursor', coalesce(last, p_cursor, 0),
    'more', n = lim,
    'doc', prof.doc,
    'docAt', prof.doc_at);
end $$;

-- ---------------------------------------------------------------- entitlement
create function public.entitlement_for(p_user uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with subs as (
    select s.status, s.plan_key, s.cancel_at_period_end,
           coalesce(s.current_end, s.trial_end) as period_end
    from public.subscriptions s
    where s.user_id = p_user
  ), live as (
    select * from subs
    where (status in ('authenticated', 'active', 'pending') and (period_end is null or period_end + interval '3 days' > now()))
       or (status in ('halted', 'cancelled', 'completed', 'paused') and period_end > now())
  ), grant_until as (
    select max(until) as until from public.pro_grants where user_id = p_user and until > now()
  )
  select jsonb_build_object(
    'pro', exists (select 1 from live) or (select until from grant_until) is not null,
    'status', (select status from live order by period_end desc nulls first limit 1),
    'plan', (select plan_key from live order by period_end desc nulls first limit 1),
    'until', greatest((select max(period_end) from live), (select until from grant_until)),
    'cancelAtPeriodEnd', coalesce((select bool_or(cancel_at_period_end) from live), false),
    -- A checkout that was opened but never paid ('created') does not use up the trial.
    'hadSubscription', exists (select 1 from subs where status <> 'created'));
$$;
revoke all on function public.entitlement_for(uuid) from public, anon, authenticated;

create function public.my_entitlement()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.entitlement_for(auth.uid());
$$;

-- ---------------------------------------------------------------- reminders
-- Marks and returns the push subscriptions of users due a reminder now. Called by
-- the send-reminders function (service role) every few minutes.
create function public.claim_due_reminders(p_window interval default interval '15 minutes', p_limit int default 500)
returns table (user_id uuid, endpoint text, p256dh text, auth text)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with due as (
    select p.user_id, p.tz, (now() at time zone p.tz) as local_now
    from public.profiles p
    where p.remind_at is not null and p.tz is not null
      and (now() at time zone p.tz)::time >= p.remind_at
      and (now() at time zone p.tz)::time < p.remind_at + p_window
      and (p.reminded_on is null or p.reminded_on < (now() at time zone p.tz)::date)
      -- Only users with a device to notify, so every claimed user yields a row and the caller's
      -- "stop when a batch is empty" never stops early.
      and exists (select 1 from public.push_subscriptions s where s.user_id = p.user_id)
  ), untrained as (
    select d.user_id, d.local_now from due d
    where not exists (
      select 1 from public.events e
      where e.user_id = d.user_id and e.type = 'set_logged' and not e.deleted
        and e.ts >= (extract(epoch from (date_trunc('day', d.local_now) at time zone d.tz)) * 1000)::bigint)
    -- The limit comes after the "already trained" check: those users are never marked, so limiting
    -- before it would let them fill every batch and starve everyone behind them.
    limit p_limit
  ), marked as (
    update public.profiles p set reminded_on = u.local_now::date
    from untrained u where p.user_id = u.user_id
    returning p.user_id
  )
  select s.user_id, s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s join marked m on m.user_id = s.user_id;
end $$;

revoke all on function public.sync_push(jsonb, uuid[], jsonb, bigint, text, text) from public, anon;
revoke all on function public.sync_pull(bigint, int) from public, anon;
revoke all on function public.my_entitlement() from public, anon;
revoke all on function public.claim_due_reminders(interval, int) from public, anon, authenticated;
grant execute on function public.sync_push(jsonb, uuid[], jsonb, bigint, text, text) to authenticated;
grant execute on function public.sync_pull(bigint, int) to authenticated;
grant execute on function public.my_entitlement() to authenticated;
grant execute on function public.entitlement_for(uuid), public.claim_due_reminders(interval, int) to service_role;

-- ---------------------------------------------------------------- billing writes
-- Upserts a subscription from Razorpay, ignoring anything older than what is stored
-- (webhooks can arrive out of order). Service role only.
create function public.apply_subscription(p_row jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- A deleted account's last webhooks (its cancellation) still arrive. Accept and drop them: failing here
  -- would make Razorpay retry for a day and then switch the webhook off for every user.
  if not exists (select 1 from auth.users u where u.id = (p_row->>'user_id')::uuid) then return; end if;
  insert into public.subscriptions as s (user_id, provider, provider_subscription_id, plan_key, status, trial_end,
                                         current_start, current_end, cancel_at_period_end, provider_updated_at)
  values ((p_row->>'user_id')::uuid, p_row->>'provider', p_row->>'provider_subscription_id', p_row->>'plan_key',
          p_row->>'status', (p_row->>'trial_end')::timestamptz, (p_row->>'current_start')::timestamptz,
          (p_row->>'current_end')::timestamptz, coalesce((p_row->>'cancel_at_period_end')::boolean, false),
          coalesce((p_row->>'provider_updated_at')::bigint, 0))
  on conflict (provider, provider_subscription_id) do update set
    status = excluded.status,
    plan_key = excluded.plan_key,
    trial_end = coalesce(excluded.trial_end, s.trial_end),
    current_start = coalesce(excluded.current_start, s.current_start),
    current_end = coalesce(excluded.current_end, s.current_end),
    cancel_at_period_end = s.cancel_at_period_end or excluded.cancel_at_period_end,
    provider_updated_at = excluded.provider_updated_at,
    updated_at = now()
  where s.user_id = excluded.user_id and s.provider_updated_at <= excluded.provider_updated_at;
end $$;
revoke all on function public.apply_subscription(jsonb) from public, anon, authenticated;
grant execute on function public.apply_subscription(jsonb) to service_role;
