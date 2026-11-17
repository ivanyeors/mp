-- The Explore page (/explore): Welcome points on a falling ladder, flower
-- points, and the consent its Claim button records (ADR 0030, amendment of
-- 2026-11-17; owner, 2026-11-16 and 2026-11-17).
--
-- /explore is the launch page: a countdown, and "Claim my points". A Migrated
-- customer who signs in there gets what they always did (the Claim bonus and
-- Past-purchase points). Everyone else gets a **Welcome bonus**, once, whose
-- size falls on published dates, from a limited number at each step.
--
-- 1. Consent source `explore_claim`: pressing Claim under the line that says
--    what the emails are. No box (owner, 2026-11-16); the press is the
--    action. It acts as the boxes do: it subscribes only someone nobody has
--    asked, and never unsubscribes anyone. set_marketing_email() is restated
--    from 20261101031444 with the source added to each list.
--
-- 2. points_ledger gains two kinds:
--      welcome_bonus   +  once per Customer, with the step it was claimed at
--      explore_flower  +  1 to 5 points for a flower picked on /explore
--
-- 3. The ladder. `points_welcome_steps` is one `site_settings` row,
--    "until|points|allocation" steps, soonest first:
--      '2026-12-01T00:00+08:00|1000|500,2026-12-15T00:00+08:00|800|500'
--    A step is open until its time (exclusive) and while fewer than its
--    allocation have been claimed at it. The open step is the first one that
--    is both; so a step that runs out hands over to the next one early, and
--    what a step did not give away lapses with it. A missing, blank or
--    malformed value is no ladder and no bonus, never a default.
--
-- 4. welcome_bonus_standing(): every step with how many were claimed at it
--    and which one is open. The page's "left" count is this, never a made-up
--    number (CCS, 18 May 2026: no false urgency).
--
-- 5. grant_welcome_bonus(customer): the one entry, when points are on, a step
--    is open, and the Customer is not a partner (rule r), not a Migrated
--    customer (theirs is the Claim bonus) and holds no Welcome bonus. An
--    advisory lock makes two claims at once count one after the other, so an
--    allocation is never exceeded.
--
-- 6. Flowers. On some Singapore days (explore_bloom(), about two in five) the
--    page's cliff grows three to five flowers. A signed-in Customer who picks
--    one gets 1 to 5 points, once per flower per day, so at most 25 points
--    (S$0.25) a day. Only while points are live; never a partner.
--    explore_flower_picks holds each pick; explore_flowers() is what the page
--    reads; pick_explore_flower() is the write.
--
-- 7. admin_points_summary appends welcome_bonuses, welcome_bonus_points and
--    flower_points; every other column is as 20261108100100 left it.
--
-- Server-only, like the ledger: nothing granted to anon or authenticated.
-- Idempotent.

-- ---------------------------------------------------------------------
-- 1. The consent source
-- ---------------------------------------------------------------------
alter table public.customers drop constraint if exists customers_marketing_email_source_check;
alter table public.customers add constraint customers_marketing_email_source_check check (
  marketing_email_source in (
    'shopify_import', 'import_default', 'shopify_unsubscribed', 'checkout',
    'customisation', 'appointment', 'sign_in', 'newsletter', 'explore_claim',
    'account', 'unsubscribe_link', 'complaint', 'support'
  )
);

alter table public.customer_consent_events drop constraint if exists customer_consent_events_source_check;
alter table public.customer_consent_events add constraint customer_consent_events_source_check check (
  source in (
    'shopify_import', 'import_default', 'shopify_unsubscribed', 'checkout',
    'customisation', 'appointment', 'sign_in', 'newsletter', 'explore_claim',
    'account', 'unsubscribe_link', 'complaint', 'support'
  )
);

create or replace function public.set_marketing_email(
  p_customer_id      uuid,
  p_to               text,
  p_source           text,
  p_at               timestamptz default null,
  p_campaign_send_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current        text;
  v_current_source text;
  v_at             timestamptz := coalesce(p_at, now());
  v_send           uuid;
begin
  if p_to is null or p_to not in ('subscribed', 'unsubscribed') then
    raise exception 'A consent change subscribes or unsubscribes, not %', coalesce(p_to, 'null')
      using errcode = 'invalid_parameter_value';
  end if;
  if p_source is null or p_source not in (
    'shopify_import', 'import_default', 'shopify_unsubscribed', 'checkout',
    'customisation', 'appointment', 'sign_in', 'newsletter', 'explore_claim',
    'account', 'unsubscribe_link', 'complaint', 'support'
  ) then
    raise exception 'Unknown consent source %', coalesce(p_source, 'null')
      using errcode = 'invalid_parameter_value';
  end if;
  if p_to = 'subscribed' and p_source not in (
    'account', 'shopify_import', 'import_default', 'checkout', 'customisation', 'appointment',
    'sign_in', 'newsletter', 'explore_claim'
  ) then
    raise exception 'Only the customer, the import or a box they left ticked subscribes them (not %)', p_source
      using errcode = 'invalid_parameter_value';
  end if;
  if p_to = 'unsubscribed' and p_source in (
    'shopify_import', 'import_default', 'checkout', 'customisation', 'appointment',
    'sign_in', 'newsletter', 'explore_claim'
  ) then
    raise exception 'The source % never unsubscribes anyone', p_source
      using errcode = 'invalid_parameter_value';
  end if;

  -- Lock the row so two changes at once cannot both see the old state.
  select marketing_email, marketing_email_source
    into v_current, v_current_source
    from customers where id = p_customer_id for update;
  if not found then
    raise exception 'Customer % not found', p_customer_id using errcode = 'no_data_found';
  end if;

  if v_current = p_to then
    return false;
  end if;
  -- The import, its default, the boxes, the sign-up and the Explore claim
  -- subscribe only someone nobody has asked. The trigger would refuse an
  -- unsubscribed one; this skips it quietly, so one row does not fail an
  -- import chunk, a sale, a booking, a sign-in or a claim.
  if p_source in ('shopify_import', 'import_default', 'checkout', 'customisation', 'appointment',
                  'sign_in', 'newsletter', 'explore_claim')
     and v_current <> 'not_subscribed' then
    return false;
  end if;
  -- Shopify's list is older than a choice the customer made here.
  if p_source = 'shopify_unsubscribed' and v_current_source = 'account' then
    return false;
  end if;

  -- The campaign send behind it, only when it is this Customer's own.
  if p_campaign_send_id is not null then
    select s.id into v_send
      from customer_campaign_sends s
     where s.id = p_campaign_send_id and s.customer_id = p_customer_id;
  end if;

  update customers
     set marketing_email = p_to,
         marketing_email_source = p_source,
         marketing_email_updated_at = v_at
   where id = p_customer_id;

  insert into customer_consent_events (customer_id, channel, from_state, to_state, source, created_at, campaign_send_id)
  values (p_customer_id, 'email', v_current, p_to, p_source, v_at, v_send);

  return true;
end;
$$;

revoke execute on function public.set_marketing_email(uuid, text, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.set_marketing_email(uuid, text, text, timestamptz, uuid) to service_role;

-- ---------------------------------------------------------------------
-- 2. The ledger: `welcome_bonus` and `explore_flower`
-- ---------------------------------------------------------------------
alter table public.points_ledger add column if not exists welcome_step smallint null;

alter table public.points_ledger drop constraint if exists points_ledger_kind_check;
alter table public.points_ledger
  add constraint points_ledger_kind_check check (kind in
    ('earn', 'claim_bonus', 'milestone_bonus', 'past_purchases', 'welcome_bonus', 'explore_flower',
     'spend', 'spend_release', 'clawback', 'adjust'));

alter table public.points_ledger drop constraint if exists points_ledger_sign;
alter table public.points_ledger
  add constraint points_ledger_sign check (
    (kind in ('earn', 'claim_bonus', 'milestone_bonus', 'past_purchases', 'welcome_bonus', 'explore_flower',
              'spend_release') and points > 0)
    or (kind in ('spend', 'clawback') and points < 0)
    or kind = 'adjust'
  );

alter table public.points_ledger drop constraint if exists points_ledger_welcome_step;
alter table public.points_ledger
  add constraint points_ledger_welcome_step check ((kind = 'welcome_bonus') = (welcome_step is not null));

create unique index if not exists points_ledger_one_welcome_bonus
  on public.points_ledger (customer_id) where kind = 'welcome_bonus';
create index if not exists points_ledger_welcome_step_idx
  on public.points_ledger (welcome_step) where kind = 'welcome_bonus';

-- ---------------------------------------------------------------------
-- 3. The ladder
-- ---------------------------------------------------------------------
-- The owner's schedule (2026-11-16), each step with 500 to give: 1,000 until
-- the end of November, 800 until 14 December, 600 until the site opens at
-- 23:59 on 31 December, 500 through January. Nothing from 1 February.
insert into public.site_settings (key, value) values
  ('points_welcome_steps',
   '2026-12-01T00:00+08:00|1000|500,2026-12-15T00:00+08:00|800|500,2026-12-31T23:59+08:00|600|500,2027-02-01T00:00+08:00|500|500')
on conflict (key) do nothing;

-- The steps, soonest first, numbered from 1. No rows for a missing, blank or
-- malformed value: every step "time|points|allocation", every number above
-- 0, the times real and climbing, at most six steps.
create or replace function public.welcome_bonus_steps()
returns table (step integer, until timestamptz, points integer, allocation integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v text;
begin
  select btrim(value) into v from site_settings where key = 'points_welcome_steps';
  if v is null
     or v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}[+-][0-9]{2}:[0-9]{2}\|[0-9]{1,6}\|[0-9]{1,6}( *, *[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}[+-][0-9]{2}:[0-9]{2}\|[0-9]{1,6}\|[0-9]{1,6}){0,5}$'
  then
    return;
  end if;
  begin
    return query
    with parts as (
      select ord::integer as n,
             split_part(p, '|', 1)::timestamptz as t,
             split_part(p, '|', 2)::integer as pts,
             split_part(p, '|', 3)::integer as alloc
        from regexp_split_to_table(v, ' *, *') with ordinality as x(p, ord)
    ),
    checked as (
      select parts.*, lag(parts.t) over (order by parts.n) as prev from parts
    )
    select c.n, c.t, c.pts, c.alloc
      from checked c
     where (select bool_and(k.pts > 0 and k.alloc > 0 and (k.prev is null or k.t > k.prev)) from checked k)
     order by c.n;
  exception when others then
    -- A time that is not a real one (the 31st of a short month): no ladder.
    return;
  end;
end;
$$;

revoke execute on function public.welcome_bonus_steps() from public, anon, authenticated;
grant execute on function public.welcome_bonus_steps() to service_role;

-- ---------------------------------------------------------------------
-- 4. Where the ladder stands
-- ---------------------------------------------------------------------
-- One row per step: how many Welcome bonuses were claimed at it, and whether
-- it is the open one (the first step whose time has not come and whose
-- allocation is not used up). No step is open once the last has ended or
-- every one is used up.
create or replace function public.welcome_bonus_standing(p_now timestamptz default null)
returns table (step integer, until timestamptz, points integer, allocation integer, claimed integer, is_open boolean)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select w.step, w.until, w.points, w.allocation,
           (select count(*)::integer from points_ledger l
             where l.kind = 'welcome_bonus' and l.welcome_step = w.step) as claimed
      from welcome_bonus_steps() w
  ),
  o as (
    select min(s.step) as step from s
     where s.until > coalesce(p_now, now()) and s.claimed < s.allocation
  )
  select s.step, s.until, s.points, s.allocation, s.claimed, s.step = o.step is true
    from s, o
   order by s.step;
$$;

revoke execute on function public.welcome_bonus_standing(timestamptz) from public, anon, authenticated;
grant execute on function public.welcome_bonus_standing(timestamptz) to service_role;

-- ---------------------------------------------------------------------
-- 5. The grant
-- ---------------------------------------------------------------------
-- reason: 'granted', or why not: 'off' (points are switched off), 'partner',
-- 'migrated' (theirs is the Claim bonus), 'already', 'ended' (no step open).
create or replace function public.grant_welcome_bonus(p_customer_id uuid)
returns table (granted boolean, points integer, step integer, reason text)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  s      record;
  v_step record;
  v_id   uuid;
begin
  select * into s from points_settings();
  if not s.enabled then
    return query select false, 0, null::integer, 'off'::text;
    return;
  end if;
  if not exists (select 1 from customers c where c.id = p_customer_id) then
    raise exception 'Customer % not found', p_customer_id using errcode = 'no_data_found';
  end if;
  if exists (select 1 from points_ledger l where l.customer_id = p_customer_id and l.kind = 'welcome_bonus') then
    return query select false, 0, null::integer, 'already'::text;
    return;
  end if;
  if exists (select 1 from migrated_customers m where m.customer_id = p_customer_id) then
    return query select false, 0, null::integer, 'migrated'::text;
    return;
  end if;
  if is_partner_customer(p_customer_id) then
    return query select false, 0, null::integer, 'partner'::text;
    return;
  end if;

  -- One claim at a time, so the count below is the count this claim joins.
  perform pg_advisory_xact_lock(hashtext('points:welcome_bonus'));

  select w.step, w.points into v_step from welcome_bonus_standing() w where w.is_open;
  if not found then
    return query select false, 0, null::integer, 'ended'::text;
    return;
  end if;

  insert into points_ledger (customer_id, kind, points, welcome_step, note)
  values (p_customer_id, 'welcome_bonus', v_step.points, v_step.step, 'Welcome bonus')
  on conflict (customer_id) where kind = 'welcome_bonus' do nothing
  returning id into v_id;
  if v_id is null then
    return query select false, 0, null::integer, 'already'::text;
    return;
  end if;
  return query select true, v_step.points, v_step.step, 'granted'::text;
end;
$$;

revoke execute on function public.grant_welcome_bonus(uuid) from public, anon, authenticated;
grant execute on function public.grant_welcome_bonus(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 6. Flowers
-- ---------------------------------------------------------------------
-- How many flowers the cliff grows on a Singapore day: none on about three
-- days in five, else three to five. The same for everyone, and fixed for the
-- day, so the page before and after signing in shows the same cliff.
create or replace function public.explore_bloom(p_day date)
returns integer
language sql
immutable
set search_path = public
as $$
  with h as (select ('x' || substr(md5('explore-bloom:' || p_day::text), 1, 8))::bit(32)::bigint as n)
  select case when h.n % 100 < 40 then 3 + ((h.n / 100) % 3)::integer else 0 end from h;
$$;

revoke execute on function public.explore_bloom(date) from public, anon, authenticated;
grant execute on function public.explore_bloom(date) to service_role;

create table if not exists public.explore_flower_picks (
  customer_id uuid not null references public.customers(id) on delete cascade,
  day         date not null,
  flower      smallint not null check (flower between 0 and 4),
  points      smallint not null check (points between 1 and 5),
  created_at  timestamptz not null default now(),
  primary key (customer_id, day, flower)
);

alter table public.explore_flower_picks enable row level security;
revoke all on public.explore_flower_picks from anon, authenticated;

-- What the page shows: today's flowers, the ones this Customer has picked,
-- and whether a pick would give points (points live, and not a partner).
-- Without a Customer: the flowers, nothing picked, no points.
create or replace function public.explore_flowers(p_customer_id uuid default null)
returns table (flowers integer, picked integer[], gives_points boolean)
language sql
stable
security definer
set search_path = public
as $$
  with d as (select (now() at time zone 'Asia/Singapore')::date as day),
  s as (select enabled and launch_at is not null and launch_at <= now() as live from points_settings())
  select
    explore_bloom(d.day),
    coalesce((select array_agg(p.flower::integer order by p.flower)
                from explore_flower_picks p
               where p.customer_id = p_customer_id and p.day = d.day), '{}'),
    s.live and p_customer_id is not null and not is_partner_customer(p_customer_id)
  from d, s;
$$;

revoke execute on function public.explore_flowers(uuid) from public, anon, authenticated;
grant execute on function public.explore_flowers(uuid) to service_role;

-- reason: 'picked', or why not: 'off' (points are not live), 'partner',
-- 'none' (no such flower today), 'already'.
create or replace function public.pick_explore_flower(p_customer_id uuid, p_flower integer)
returns table (picked boolean, points integer, reason text)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  s        record;
  v_day    date := (now() at time zone 'Asia/Singapore')::date;
  v_points integer := 1 + floor(random() * 5)::integer;
begin
  select * into s from points_settings();
  if not (s.enabled and s.launch_at is not null and s.launch_at <= now()) then
    return query select false, 0, 'off'::text;
    return;
  end if;
  if is_partner_customer(p_customer_id) then
    return query select false, 0, 'partner'::text;
    return;
  end if;
  if p_flower is null or p_flower < 0 or p_flower >= explore_bloom(v_day) then
    return query select false, 0, 'none'::text;
    return;
  end if;

  insert into explore_flower_picks (customer_id, day, flower, points)
  values (p_customer_id, v_day, p_flower, least(v_points, 5))
  on conflict do nothing;
  if not found then
    return query select false, 0, 'already'::text;
    return;
  end if;

  insert into points_ledger (customer_id, kind, points, note)
  values (p_customer_id, 'explore_flower', least(v_points, 5), 'Picked a flower on Explore');
  return query select true, least(v_points, 5), 'picked'::text;
end;
$$;

revoke execute on function public.pick_explore_flower(uuid, integer) from public, anon, authenticated;
grant execute on function public.pick_explore_flower(uuid, integer) to service_role;

-- ---------------------------------------------------------------------
-- 7. What points cost, with the Welcome bonuses and the flowers
-- ---------------------------------------------------------------------
-- As 20261108100100_past_purchase_points.sql, with three columns appended.
create or replace view public.admin_points_summary with (security_invoker = true) as
with m as (select date_trunc('month', now() at time zone 'Asia/Singapore') at time zone 'Asia/Singapore' as start),
l as (select l.*, l.created_at >= m.start as this_month from points_ledger l, m)
select
  coalesce(sum(points), 0)::bigint                                                         as outstanding_points,
  (select coalesce(sum(points), 0) from points_order_candidates)::bigint                   as pending_points,
  coalesce(-sum(points) filter (where kind in ('spend', 'spend_release')), 0)::bigint      as spent_points,
  coalesce(-sum(points) filter (where kind in ('spend', 'spend_release') and this_month), 0)::bigint as spent_points_month,
  coalesce(-sum(points) filter (where kind = 'clawback'), 0)::bigint                       as clawed_back_points,
  coalesce(-sum(points) filter (where kind = 'clawback' and this_month), 0)::bigint        as clawed_back_points_month,
  coalesce(sum(points) filter (where kind = 'earn'), 0)::bigint                            as earned_points,
  count(*) filter (where kind = 'claim_bonus')                                             as claim_bonuses,
  count(distinct customer_id)                                                              as customers_with_entries,
  count(*) filter (where kind = 'milestone_bonus')                                         as milestone_bonuses,
  coalesce(sum(points) filter (where kind = 'milestone_bonus'), 0)::bigint                 as milestone_bonus_points,
  count(*) filter (where kind = 'past_purchases')                                          as past_purchase_grants,
  coalesce(sum(points) filter (where kind = 'past_purchases'), 0)::bigint                  as past_purchase_points,
  count(*) filter (where kind = 'welcome_bonus')                                           as welcome_bonuses,
  coalesce(sum(points) filter (where kind = 'welcome_bonus'), 0)::bigint                   as welcome_bonus_points,
  coalesce(sum(points) filter (where kind = 'explore_flower'), 0)::bigint                  as flower_points
from l;

revoke all on public.admin_points_summary from anon, authenticated;
grant select on public.admin_points_summary to service_role;
