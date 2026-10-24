-- Email campaigns (PRD-email-marketing; ADR 0029 i).
--
-- A Campaign is an email Staff write in the Admin Panel (Email campaigns) and
-- send, in waves they start, to one audience:
--
--   imported_not_signed_in  Migrated customers who have not Claimed
--   subscribed              every Customer who agreed to marketing email
--   segment                 the Customers a saved Segment chooses
--
-- Whatever the audience, only `subscribed` Customers receive it, nobody whose
-- campaign email bounced or drew a complaint, and nobody twice.
--
-- Its sends go in the one campaign ledger, customer_campaign_sends
-- (20261020130000), as PRD-email-marketing requires ("Ledger first ... do not
-- build a second ledger"). A Campaign's sends carry its id in `campaign_id`
-- and `template = 'campaign:<id>'`, so the ledger's unique (Customer,
-- template) key is "never the same Campaign twice", and a bounce or complaint
-- on any campaign email suppresses the Customer from every later one, the
-- migration's three templates included. The Resend webhook, the Customer
-- timeline and the Migration card read the ledger as they already do.
--
-- The rule is marketing_campaign_blocker(); claim_marketing_campaign_send()
-- runs it and writes the `pending` row in one call, so each recipient is
-- re-checked at the moment of sending, after the audience was planned.
-- finish_campaign_send() (20261020130000) closes the row. A Segment's
-- membership is decided when the wave is planned (lib/crm/segments.ts
-- `resolveSegment`); consent, suppression and "already sent" are decided here.
-- lib/email-campaigns/rules.ts is the same rule for the plan, and
-- supabase/tests/email-marketing/campaign-rule-cases.json holds the two
-- equal.
--
-- Once a Campaign's first wave is planned (`locked_at`), its content cannot
-- change: every recipient gets the same email. A trigger refuses the edit, so
-- no write path can forget.
--
-- Server-only: RLS on, no policy, nothing granted to anon or authenticated,
-- on the table, the views or the functions. The Admin Panel reads and writes
-- with the service role after checking the `campaigns` permission.
--
-- Idempotent.

create table if not exists public.email_campaigns (
  id                    uuid primary key default gen_random_uuid(),
  -- Staff's name for it; customers never see it.
  name                  text not null check (length(btrim(name)) between 1 and 80),
  subject               text not null check (length(btrim(subject)) between 1 and 150),
  -- The inbox preview line; null shows the start of the body.
  preheader             text null check (preheader is null or length(preheader) <= 200),
  -- Plain text: blank lines part paragraphs, "- " starts a bullet, "## " a
  -- heading, and https links become links (lib/email/campaigns.ts).
  body                  text not null check (length(btrim(body)) between 1 and 10000),
  -- Open with "Hi <first name>," (or "Hi,").
  greeting              boolean not null default true,
  -- One optional button: the recipient's sign-in (their own Claim link when
  -- they are a Migrated customer who has not Claimed), or an https link.
  button_label          text null check (button_label is null or length(btrim(button_label)) between 1 and 40),
  button_target         text null check (button_target is null or button_target in ('sign_in', 'url')),
  button_url            text null check (button_url is null or (button_url ~ '^https://[^\s]+$' and length(button_url) <= 500)),
  audience              text not null check (audience in ('imported_not_signed_in', 'subscribed', 'segment')),
  segment_id            uuid null references public.customer_segments(id) on delete restrict,
  created_by_profile_id uuid null references public.mp_staff(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- The first wave was planned: the content is fixed from here on.
  locked_at             timestamptz null,
  archived_at           timestamptz null,
  constraint email_campaigns_button check (
    (button_target is null and button_label is null and button_url is null)
    or (button_target = 'sign_in' and button_label is not null and button_url is null)
    or (button_target = 'url' and button_label is not null and button_url is not null)
  ),
  constraint email_campaigns_segment check ((audience = 'segment') = (segment_id is not null))
);

create index if not exists email_campaigns_created_at_idx on public.email_campaigns (created_at desc);

alter table public.email_campaigns enable row level security;
revoke all on public.email_campaigns from anon, authenticated;

-- Content is fixed once the first wave is planned; the name, archiving and
-- the lock itself stay writable. updated_at follows every change.
create or replace function public.email_campaigns_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.locked_at is not null and (
       new.subject is distinct from old.subject
    or new.preheader is distinct from old.preheader
    or new.body is distinct from old.body
    or new.greeting is distinct from old.greeting
    or new.button_label is distinct from old.button_label
    or new.button_target is distinct from old.button_target
    or new.button_url is distinct from old.button_url
    or new.audience is distinct from old.audience
    or new.segment_id is distinct from old.segment_id
    or new.locked_at is distinct from old.locked_at
  ) then
    raise exception 'This campaign has started sending, so its email and audience cannot change. Duplicate it to send a changed one.'
      using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_email_campaigns_guard on public.email_campaigns;
create trigger trg_email_campaigns_guard
before update on public.email_campaigns
for each row execute function public.email_campaigns_guard();

-- ---------------------------------------------------------------------
-- The ledger: a Campaign's sends are `campaign:<id>`
-- ---------------------------------------------------------------------
alter table public.customer_campaign_sends
  add column if not exists campaign_id uuid null references public.email_campaigns(id) on delete restrict;

alter table public.customer_campaign_sends drop constraint if exists customer_campaign_sends_template_check;
alter table public.customer_campaign_sends add constraint customer_campaign_sends_template_check check (
  (campaign_id is null and template in ('migration_announcement', 'migration_reminder', 'migration_service_notice'))
  or (campaign_id is not null and template = 'campaign:' || campaign_id::text)
);

create index if not exists customer_campaign_sends_campaign_idx
  on public.customer_campaign_sends (campaign_id, wave)
  where campaign_id is not null;

-- ---------------------------------------------------------------------
-- The rule: why this Customer may not get this Campaign now, or null
-- ---------------------------------------------------------------------
-- In this order (composedCampaignBlocker in lib/email-campaigns/rules.ts is
-- the same rule, and campaign-rule-cases.json holds the two equal):
--   unknown_campaign   no such Campaign
--   campaign_archived  it was archived
--   not_found          no such Customer
--   not_migrated       the imported audience: not a Migrated customer
--   claimed            the imported audience: they have Claimed
--   unsubscribed       never anything
--   suppressed         a campaign email of theirs bounced or drew a complaint
--   not_subscribed     marketing needs `subscribed`
--   failed             this Campaign failed for them before; a retry retries it
--   already_sent       this Campaign is sent, in flight, bounced or complained
create or replace function public.marketing_campaign_blocker(
  p_customer_id  uuid,
  p_campaign_id  uuid,
  p_retry_failed boolean default false
)
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select case
    when e.id is null then 'unknown_campaign'
    when e.archived_at is not null then 'campaign_archived'
    when c.id is null then 'not_found'
    when e.audience = 'imported_not_signed_in' and m.customer_id is null then 'not_migrated'
    when e.audience = 'imported_not_signed_in' and m.claimed_at is not null then 'claimed'
    when c.marketing_email = 'unsubscribed' then 'unsubscribed'
    when exists (
      select 1 from customer_campaign_sends s
       where s.customer_id = k.id
         and (s.status in ('bounced', 'complained') or s.bounced_at is not null or s.complained_at is not null)
    ) then 'suppressed'
    when c.marketing_email <> 'subscribed' then 'not_subscribed'
    when own.status = 'failed' and not coalesce(p_retry_failed, false) then 'failed'
    when own.status is not null and own.status <> 'failed' then 'already_sent'
    else null
  end
  from (select p_customer_id as id) k
  left join email_campaigns e on e.id = p_campaign_id
  left join customers c on c.id = k.id
  left join migrated_customers m on m.customer_id = c.id
  left join customer_campaign_sends own
    on own.customer_id = k.id and own.template = 'campaign:' || p_campaign_id::text;
$$;

revoke execute on function public.marketing_campaign_blocker(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.marketing_campaign_blocker(uuid, uuid, boolean) to service_role;

-- ---------------------------------------------------------------------
-- Claiming a send: the rule, then the row, in one call
-- ---------------------------------------------------------------------
-- As claim_campaign_send (20261020130000): when this call owns the send,
-- `send_id` is set and the recipient's email, first name and locale come with
-- it as they are now, plus `unclaimed_migrated` (their sign-in button is their
-- own Claim link). Otherwise `send_id` is null and `blocker` says why.
-- Two concurrent claims of one (Customer, Campaign) are decided by the unique
-- key: the second waits on the first's uncommitted row, then inserts nothing.
-- A retry moves this Campaign's `failed` row back to `pending` in the new
-- wave; a concurrent second retry finds it `pending` and updates nothing.
create or replace function public.claim_marketing_campaign_send(
  p_customer_id  uuid,
  p_campaign_id  uuid,
  p_wave         text,
  p_retry_failed boolean default false
)
returns table (send_id uuid, blocker text, email text, first_name text, locale text, unclaimed_migrated boolean)
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_blocker  text;
  v_id       uuid;
  v_template text := 'campaign:' || p_campaign_id::text;
begin
  if p_wave is null or p_wave !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$' then
    raise exception 'A wave is 1 to 32 letters, digits, - or _, starting with a letter or digit (not %)',
      coalesce(p_wave, 'null') using errcode = 'invalid_parameter_value';
  end if;

  v_blocker := marketing_campaign_blocker(p_customer_id, p_campaign_id, p_retry_failed);
  if v_blocker is not null then
    return query select null::uuid, v_blocker, null::text, null::text, null::text, null::boolean;
    return;
  end if;

  if coalesce(p_retry_failed, false) then
    update customer_campaign_sends s
       set status = 'pending',
           wave = p_wave,
           sent_at = now(),
           attempts = s.attempts + 1,
           last_error = null,
           provider_message_id = null
     where s.customer_id = p_customer_id
       and s.template = v_template
       and s.status = 'failed'
    returning s.id into v_id;
  else
    insert into customer_campaign_sends (customer_id, template, campaign_id, wave, status)
    values (p_customer_id, v_template, p_campaign_id, p_wave, 'pending')
    on conflict (customer_id, template) do nothing
    returning id into v_id;
  end if;

  if v_id is null then
    return query select null::uuid, 'already_sent'::text, null::text, null::text, null::text, null::boolean;
    return;
  end if;

  return query
    select v_id, null::text, c.email, c.first_name, c.locale,
           (m.customer_id is not null and m.claimed_at is null)
      from customers c
      left join migrated_customers m on m.customer_id = c.id
     where c.id = p_customer_id;
end;
$$;

revoke execute on function public.claim_marketing_campaign_send(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_marketing_campaign_send(uuid, uuid, text, boolean) to service_role;

-- ---------------------------------------------------------------------
-- What the planner reads
-- ---------------------------------------------------------------------
-- One row per Customer, with the facts the rule needs and their sends of
-- every Campaign as {campaign_id: {status, wave, sent_at}}. A buyer has an
-- order here or on Shopify; `since` (the import, else the account) orders the
-- rest, newest first, as the migration's sender does.
create or replace view public.marketing_campaign_candidates with (security_invoker = true) as
select
  c.id as customer_id,
  c.email,
  c.first_name,
  c.locale,
  c.marketing_email,
  (m.customer_id is not null) as migrated,
  m.claimed_at,
  coalesce(m.shopify_orders_count, 0) + coalesce(c.total_orders, 0) as orders_count,
  coalesce(m.imported_at, c.created_at) as since,
  exists (
    select 1 from public.customer_campaign_sends s
     where s.customer_id = c.id
       and (s.status in ('bounced', 'complained') or s.bounced_at is not null or s.complained_at is not null)
  ) as suppressed,
  coalesce(
    (select jsonb_object_agg(s.campaign_id::text, jsonb_build_object(
              'status', s.status,
              'wave', s.wave,
              'sent_at', s.sent_at))
       from public.customer_campaign_sends s
      where s.customer_id = c.id and s.campaign_id is not null),
    '{}'::jsonb
  ) as campaign_sends
from public.customers c
left join public.migrated_customers m on m.customer_id = c.id;

revoke all on public.marketing_campaign_candidates from anon, authenticated;

-- Each Campaign's numbers, for the list and its page. `link_clicks` counts the
-- Claim links its emails carried that were opened at least once.
create or replace view public.email_campaign_stats with (security_invoker = true) as
select
  e.id as campaign_id,
  count(s.id) filter (where s.status in ('sent', 'bounced', 'complained'))       as handed,
  count(s.id) filter (where s.bounced_at is not null)                            as bounced,
  count(s.id) filter (where s.complained_at is not null)                         as complained,
  count(s.id) filter (where s.status = 'failed')                                 as failed,
  count(s.id) filter (where s.status = 'pending')                                as pending,
  count(distinct s.wave)                                                         as waves,
  min(s.sent_at) filter (where s.status in ('sent', 'bounced', 'complained'))    as first_sent_at,
  max(s.sent_at) filter (where s.status in ('sent', 'bounced', 'complained'))    as last_sent_at,
  (select count(*) from public.customer_claim_links l
    where l.template = 'campaign:' || e.id::text and l.first_clicked_at is not null) as link_clicks
from public.email_campaigns e
left join public.customer_campaign_sends s on s.campaign_id = e.id
group by e.id;

revoke all on public.email_campaign_stats from anon, authenticated;
