-- Campaign emails: the send ledger (PRD-shopify-customer-migration slice 08;
-- ADR 0028 i, k, l).
--
-- customer_campaign_sends: one row per (Customer, campaign template), ever.
-- The unique key is the whole of "cannot double-send": the wave sender
-- (lib/customer-migration/wave-sender.ts) claims the row BEFORE it sends, so
-- a second run, or a concurrent one, finds the row and skips that person. No
-- timing, lock or flag is involved; two concurrent claims are decided by the
-- unique index (supabase/tests/customer-migration/assert-08-campaign-sends.sql
-- runs them in two sessions at once).
--
-- Its own ledger, not customer_emails (slice 05). customer_emails is the
-- transactional ledger: it retries a failed send by itself, up to three
-- times, and knows nothing of waves, bounces or complaints. A campaign send is
-- retried only when a human asks (--retry-failed), is grouped into waves the
-- human runs, and is suppressed by its own bounces and complaints. The email
-- marketing initiative widens `template` to a campaign key rather than
-- building a second ledger (PRD-email-marketing, "Ledger first").
--
-- Statuses:
--   pending     claimed; the send is in flight. A crash leaves it pending,
--               and a pending row is never sent again: it may have gone.
--   sent        the provider accepted it; provider_message_id is its id.
--   failed      the send errored. Retried only with --retry-failed.
--   bounced     a hard bounce came back (POST /api/email/resend-webhook).
--   complained  the recipient marked it as spam; they are unsubscribed in the
--               same transaction, with source `complaint`.
-- A bounce or a complaint on any send suppresses the Customer from every
-- later wave. `sent_at` is when the row was claimed, then when the provider
-- accepted it; `bounced_at` and `complained_at` date the webhook's facts, so
-- the Customer timeline never derives a time.
--
-- The eligibility rule lives in campaign_send_blocker(), which
-- claim_campaign_send() runs in the same call as the claim, so a Customer who
-- unsubscribed, bounced or Claimed after the audience was selected is not
-- sent to. lib/customer-migration/campaign.ts is the same rule for the dry
-- run; supabase/tests/customer-migration/campaign-cases.json holds the two
-- equal.
--
-- Owner decision 3 (does the no-consent group get the service notice?) is the
-- `migration_service_notice_enabled` setting, seeded 'false': until the owner
-- chooses, the service notice is never claimed, whatever the sender is told.
--
-- Server-only: RLS on, no policy, and nothing granted to anon or
-- authenticated, on the table, its views or its functions. A Customer with a
-- send reads as referenced to the import's undo (customer_import_undo_plan
-- reads every foreign key to customers), so an undo after a wave keeps the
-- Customers it emailed, as it keeps their Claim links.
--
-- Idempotent.

create table if not exists public.customer_campaign_sends (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null references public.customers(id) on delete cascade,
  template            text not null check (template in (
                        'migration_announcement', 'migration_reminder', 'migration_service_notice')),
  -- The human's label for the run, e.g. 'pilot' or 'w1'.
  wave                text not null check (wave ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$'),
  status              text not null check (status in ('pending', 'sent', 'failed', 'bounced', 'complained')),
  provider_message_id text null,
  sent_at             timestamptz not null default now(),
  -- Claims of this row: 1, plus one per --retry-failed.
  attempts            int not null default 1 check (attempts >= 1),
  last_error          text null,
  bounced_at          timestamptz null,
  complained_at       timestamptz null,
  unique (customer_id, template),
  constraint customer_campaign_sends_bounce_dated
    check (status <> 'bounced' or bounced_at is not null),
  constraint customer_campaign_sends_complaint_dated
    check (status <> 'complained' or complained_at is not null)
);

-- The webhook finds a send by the provider's id.
create unique index if not exists customer_campaign_sends_provider_message_id_key
  on public.customer_campaign_sends (provider_message_id)
  where provider_message_id is not null;

create index if not exists customer_campaign_sends_wave_idx
  on public.customer_campaign_sends (template, wave);

alter table public.customer_campaign_sends enable row level security;
revoke all on public.customer_campaign_sends from anon, authenticated;

-- Owner decision 3, off until the owner chooses.
insert into public.site_settings (key, value)
values ('migration_service_notice_enabled', 'false')
on conflict (key) do nothing;

create or replace function public.campaign_service_notice_enabled()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    (select lower(btrim(value)) = 'true' from site_settings where key = 'migration_service_notice_enabled'),
    false
  );
$$;

revoke execute on function public.campaign_service_notice_enabled() from public, anon, authenticated;
grant execute on function public.campaign_service_notice_enabled() to service_role;

-- ---------------------------------------------------------------------
-- The rule: why this Customer may not get this template now, or null
-- ---------------------------------------------------------------------
-- In this order (campaignBlocker in lib/customer-migration/campaign.ts is
-- the same rule, and campaign-cases.json holds the two equal):
--   not_migrated             no migrated_customers row (or no such Customer)
--   claimed                  they have Claimed: the campaign has done its job
--   unsubscribed             never anything, for any template
--   suppressed               a send of theirs bounced or drew a complaint
--   not_subscribed           the announcement and reminder need `subscribed`
--   subscribed               the service notice is for `not_subscribed` only
--   failed                   this template failed before; --retry-failed retries
--   already_sent             this template is sent, in flight, bounced or complained
--   no_announcement          the reminder follows a sent announcement only
--   announcement_too_recent  ...sent at least 7 days ago
create or replace function public.campaign_send_blocker(
  p_customer_id  uuid,
  p_template     text,
  p_retry_failed boolean default false,
  p_now          timestamptz default now()
)
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select case
    when p_template is null
      or p_template not in ('migration_announcement', 'migration_reminder', 'migration_service_notice')
      then 'unknown_template'
    when m.customer_id is null then 'not_migrated'
    when m.claimed_at is not null then 'claimed'
    when c.marketing_email = 'unsubscribed' then 'unsubscribed'
    when exists (
      select 1 from customer_campaign_sends s
       where s.customer_id = k.id
         and (s.status in ('bounced', 'complained') or s.bounced_at is not null or s.complained_at is not null)
    ) then 'suppressed'
    when p_template in ('migration_announcement', 'migration_reminder')
     and c.marketing_email <> 'subscribed' then 'not_subscribed'
    when p_template = 'migration_service_notice'
     and c.marketing_email <> 'not_subscribed' then 'subscribed'
    when own.status = 'failed' and not coalesce(p_retry_failed, false) then 'failed'
    when own.status is not null and own.status <> 'failed' then 'already_sent'
    when p_template = 'migration_reminder' and ann.status is distinct from 'sent' then 'no_announcement'
    when p_template = 'migration_reminder' and ann.sent_at > p_now - interval '7 days'
      then 'announcement_too_recent'
    else null
  end
  from (select p_customer_id as id) k
  left join customers c on c.id = k.id
  left join migrated_customers m on m.customer_id = c.id
  left join customer_campaign_sends own on own.customer_id = k.id and own.template = p_template
  left join customer_campaign_sends ann on ann.customer_id = k.id and ann.template = 'migration_announcement';
$$;

revoke execute on function public.campaign_send_blocker(uuid, text, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.campaign_send_blocker(uuid, text, boolean, timestamptz) to service_role;

-- ---------------------------------------------------------------------
-- Claiming a send: the rule, then the row, in one call
-- ---------------------------------------------------------------------
-- Returns one row. When this call owns the send, `send_id` is set and the
-- recipient's current email, first name and locale come with it (the address
-- as it is now, not as it was at selection). Otherwise `send_id` is null and
-- `blocker` says why: a reason from campaign_send_blocker, `already_sent` when
-- a concurrent claim won, `not_failed` when a retry finds no failed send of
-- this wave to retry, or `service_notice_off` while owner decision 3 is
-- unanswered.
--
-- Two concurrent claims of one (Customer, template): both may pass the rule,
-- but the second insert waits on the first's uncommitted row in the unique
-- index, then takes ON CONFLICT DO NOTHING and returns nothing:
-- `already_sent`. A retry (--retry-failed) never inserts: it moves this
-- wave's `failed` row back to `pending`, and a second retry waits on the
-- first's row lock, then re-reads the row, which is `pending` by then, and
-- updates nothing. Either way exactly one claim wins.
create or replace function public.claim_campaign_send(
  p_customer_id  uuid,
  p_template     text,
  p_wave         text,
  p_retry_failed boolean default false
)
returns table (send_id uuid, blocker text, email text, first_name text, locale text)
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_blocker text;
  v_id      uuid;
begin
  if p_wave is null or p_wave !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$' then
    raise exception 'A wave is 1 to 32 letters, digits, - or _, starting with a letter or digit (not %)',
      coalesce(p_wave, 'null') using errcode = 'invalid_parameter_value';
  end if;

  if p_template = 'migration_service_notice' and not campaign_service_notice_enabled() then
    return query select null::uuid, 'service_notice_off'::text, null::text, null::text, null::text;
    return;
  end if;

  v_blocker := campaign_send_blocker(p_customer_id, p_template, p_retry_failed);
  if v_blocker is not null then
    return query select null::uuid, v_blocker, null::text, null::text, null::text;
    return;
  end if;

  if coalesce(p_retry_failed, false) then
    update customer_campaign_sends s
       set status = 'pending',
           sent_at = now(),
           attempts = s.attempts + 1,
           last_error = null,
           provider_message_id = null
     where s.customer_id = p_customer_id
       and s.template = p_template
       and s.wave = p_wave
       and s.status = 'failed'
    returning s.id into v_id;

    if v_id is null then
      return query
        select null::uuid,
               case when exists (
                      select 1 from customer_campaign_sends s
                       where s.customer_id = p_customer_id and s.template = p_template and s.status <> 'failed'
                    ) then 'already_sent' else 'not_failed' end,
               null::text, null::text, null::text;
      return;
    end if;
  else
    insert into customer_campaign_sends (customer_id, template, wave, status)
    values (p_customer_id, p_template, p_wave, 'pending')
    on conflict (customer_id, template) do nothing
    returning id into v_id;

    if v_id is null then
      return query select null::uuid, 'already_sent'::text, null::text, null::text, null::text;
      return;
    end if;
  end if;

  return query
    select v_id, null::text, c.email, c.first_name, c.locale
      from customers c
     where c.id = p_customer_id;
end;
$$;

revoke execute on function public.claim_campaign_send(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_campaign_send(uuid, text, text, boolean) to service_role;

-- ---------------------------------------------------------------------
-- Finishing a send: sent with the provider's id, or failed with the error
-- ---------------------------------------------------------------------
-- Only a `pending` row moves, so a late or repeated call changes nothing.
create or replace function public.finish_campaign_send(
  p_send_id             uuid,
  p_sent                boolean,
  p_provider_message_id text default null,
  p_error               text default null
)
returns boolean
language sql
volatile
security invoker
set search_path = public
as $$
  with finished as (
    update customer_campaign_sends
       set status = case when p_sent then 'sent' else 'failed' end,
           provider_message_id = case when p_sent then nullif(btrim(p_provider_message_id), '') end,
           sent_at = case when p_sent then now() else sent_at end,
           last_error = case when p_sent then null else left(coalesce(nullif(p_error, ''), 'unknown error'), 1000) end
     where id = p_send_id
       and status = 'pending'
    returning 1
  )
  select exists (select 1 from finished);
$$;

revoke execute on function public.finish_campaign_send(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.finish_campaign_send(uuid, boolean, text, text) to service_role;

-- ---------------------------------------------------------------------
-- A bounce or a complaint from the provider's webhook
-- ---------------------------------------------------------------------
-- Finds the send by the provider's message id (no row: not a campaign send,
-- which the webhook answers 200 and ignores). A bounce marks a `sent` row
-- `bounced`. A complaint marks a `sent` or `bounced` row `complained`, and
-- unsubscribes the Customer with source `complaint` through
-- set_marketing_email, which writes the consent event, in the same
-- transaction. Repeats (the provider delivers at least once) change nothing.
create or replace function public.record_campaign_send_event(
  p_provider_message_id text,
  p_event               text,
  p_at                  timestamptz default null
)
returns table (send_id uuid, customer_id uuid, changed boolean, unsubscribed boolean)
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_row     customer_campaign_sends%rowtype;
  v_at      timestamptz := coalesce(p_at, now());
  v_changed boolean := false;
  v_unsub   boolean := false;
begin
  if p_event is null or p_event not in ('bounced', 'complained') then
    raise exception 'A send event is bounced or complained, not %', coalesce(p_event, 'null')
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_row
    from customer_campaign_sends s
   where s.provider_message_id = nullif(btrim(p_provider_message_id), '')
   for update;
  if not found then
    return;
  end if;

  if p_event = 'bounced' then
    if v_row.status = 'sent' then
      update customer_campaign_sends
         set status = 'bounced', bounced_at = coalesce(bounced_at, v_at)
       where id = v_row.id;
      v_changed := true;
    end if;
  else
    if v_row.status in ('sent', 'bounced') then
      update customer_campaign_sends
         set status = 'complained', complained_at = coalesce(complained_at, v_at)
       where id = v_row.id;
      v_changed := true;
    end if;
    v_unsub := set_marketing_email(v_row.customer_id, 'unsubscribed', 'complaint', v_at);
  end if;

  return query select v_row.id, v_row.customer_id, v_changed, v_unsub;
end;
$$;

revoke execute on function public.record_campaign_send_event(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_campaign_send_event(text, text, timestamptz) to service_role;

-- ---------------------------------------------------------------------
-- What the sender reads
-- ---------------------------------------------------------------------
-- One row per Migrated customer, with every campaign send of theirs as
-- {template: {status, wave, sent_at, bounced, complained}}: the one query
-- selectCampaignAudience (lib/customer-migration/audience.ts) makes, before
-- its pure rule decides. The wave is there so a wave's size is counted from
-- the same read as its candidates.
create or replace view public.customer_campaign_candidates with (security_invoker = true) as
select
  m.customer_id,
  c.email,
  c.first_name,
  c.locale,
  c.marketing_email,
  m.claimed_at,
  m.shopify_orders_count,
  m.imported_at,
  coalesce(
    (select jsonb_object_agg(s.template, jsonb_build_object(
              'status', s.status,
              'wave', s.wave,
              'sent_at', s.sent_at,
              'bounced', s.bounced_at is not null,
              'complained', s.complained_at is not null))
       from public.customer_campaign_sends s
      where s.customer_id = m.customer_id),
    '{}'::jsonb
  ) as sends
from public.migrated_customers m
join public.customers c on c.id = m.customer_id;

revoke all on public.customer_campaign_candidates from anon, authenticated;

-- Each wave's numbers, for the dry run's report and the pause rule (PRD:
-- pause when bounces pass 2% or complaints 0.1% of what was handed over).
create or replace view public.customer_campaign_wave_stats with (security_invoker = true) as
select
  s.template,
  s.wave,
  count(*) filter (where s.status in ('sent', 'bounced', 'complained'))       as handed,
  count(*) filter (where s.bounced_at is not null)                            as bounced,
  count(*) filter (where s.complained_at is not null)                         as complained,
  count(*) filter (where s.status = 'failed')                                 as failed,
  count(*) filter (where s.status = 'pending')                                as pending,
  min(s.sent_at) filter (where s.status in ('sent', 'bounced', 'complained')) as first_sent_at,
  max(s.sent_at) filter (where s.status in ('sent', 'bounced', 'complained')) as last_sent_at
from public.customer_campaign_sends s
group by s.template, s.wave;

revoke all on public.customer_campaign_wave_stats from anon, authenticated;
