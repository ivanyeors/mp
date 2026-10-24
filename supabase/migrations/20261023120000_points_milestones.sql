-- Loyalty points: bonus milestones (PRD-loyalty-points slice 09; ADR 0030
-- amendment of 2026-10-23, rules s to w).
--
-- A ladder of milestones on the points a Customer has earned from orders over
-- their lifetime. Reaching one adds a one-time **Milestone bonus** to the
-- balance. It is not a tier: nothing about how the customer earns or spends
-- changes, and nothing is ever taken away (decision 1 stands).
--
-- The setting. `points_milestones` is one `site_settings` row, the ladder as
-- "points earned:bonus points" pairs, lowest first:
--   '1000:100,2500:300,5000:800,10000:2000'
-- Settings → Discounts → Points edits it (lib/points/settings.ts, which holds
-- the same parser). A missing, blank or malformed value is no milestones at
-- all, never a default ladder: a bonus is only ever granted on a ladder the
-- owner saved (or the one seeded here). Nothing is lost while it is blank,
-- because the daily sweep below catches up once a ladder is saved.
--
-- What counts (rule t). The points earned from orders: every `earn` entry,
-- less every `clawback`. Spending points, expiry, Staff adjustments, the Claim
-- bonus and milestone bonuses themselves neither move the bar nor set it back.
-- Pending points count once they are written, so a bonus never rests on an
-- order that can still be returned.
--
-- How many bonuses (rule u). A Customer holds one milestone bonus for each
-- milestone they have reached, never more: the sweep grants milestones
-- (bonuses held + 1) up to (milestones reached), numbered from 1, and
-- points_ledger_one_per_milestone turns a concurrent duplicate into a no-op.
-- So changing the ladder never pays a milestone twice: a customer holding two
-- bonuses is owed a third only once they reach the third milestone of the
-- ladder as it is then. A bonus already granted is never taken back, even if a
-- refund later takes the customer below that milestone (rule v).
--
-- When (rule w). grant_due_milestone_bonuses() runs in the daily job right
-- after release_earned_points(), so a bonus lands on the same run as the
-- points that reached it. Nothing is granted while points are off or before
-- the launch; the first run after they are live grants what is due. A new or
-- lowered milestone is granted on the next run to everyone already past it.
-- Partners hold no points (rule r) and are never granted one.
--
-- Server-only, like the ledger: nothing granted to anon or authenticated.
--
-- Idempotent.

-- ---------------------------------------------------------------------
-- The setting, seeded with a starting ladder the owner edits
-- ---------------------------------------------------------------------
insert into public.site_settings (key, value) values
  ('points_milestones', '1000:100,2500:300,5000:800,10000:2000')
on conflict (key) do nothing;

-- The ladder, lowest first, numbered from 1. No rows for a missing, blank or
-- malformed value: every pair must be digits, every number above 0, and no
-- two milestones at the same number of points.
create or replace function public.points_milestones()
returns table (milestone integer, threshold integer, bonus integer)
language sql
stable
security definer
set search_path = public
as $$
  with raw as (
    select btrim(value) as v
      from site_settings
     where key = 'points_milestones'
       and btrim(value) ~ '^[0-9]{1,7}:[0-9]{1,7}( *, *[0-9]{1,7}:[0-9]{1,7})*$'
  ),
  pairs as (
    select split_part(p, ':', 1)::integer as threshold, split_part(p, ':', 2)::integer as bonus
      from raw, regexp_split_to_table(raw.v, ' *, *') as p
  ),
  valid as (
    select *
      from pairs
     where (select bool_and(threshold > 0 and bonus > 0) from pairs)
       and (select count(distinct threshold) = count(*) from pairs)
  )
  select (row_number() over (order by threshold))::integer, threshold, bonus
    from valid
   order by threshold;
$$;

revoke execute on function public.points_milestones() from public, anon, authenticated;
grant execute on function public.points_milestones() to service_role;

-- ---------------------------------------------------------------------
-- The ledger: an eighth kind, and which milestone it answers
-- ---------------------------------------------------------------------
alter table public.points_ledger add column if not exists milestone smallint null;

alter table public.points_ledger drop constraint if exists points_ledger_kind_check;
alter table public.points_ledger
  add constraint points_ledger_kind_check check (kind in
    ('earn', 'claim_bonus', 'milestone_bonus', 'spend', 'spend_release', 'clawback', 'expire', 'adjust'));

alter table public.points_ledger drop constraint if exists points_ledger_sign;
alter table public.points_ledger
  add constraint points_ledger_sign check (
    (kind in ('earn', 'claim_bonus', 'milestone_bonus', 'spend_release') and points > 0)
    or (kind in ('spend', 'clawback', 'expire') and points < 0)
    or kind = 'adjust'
  );

-- Only a milestone bonus names a milestone, and it always does.
alter table public.points_ledger drop constraint if exists points_ledger_milestone;
alter table public.points_ledger
  add constraint points_ledger_milestone check (
    (kind = 'milestone_bonus') = (milestone is not null) and (milestone is null or milestone >= 1)
  );

create unique index if not exists points_ledger_one_per_milestone
  on public.points_ledger (customer_id, milestone) where kind = 'milestone_bonus';

-- ---------------------------------------------------------------------
-- Progress: points earned from orders, and milestone bonuses held
-- ---------------------------------------------------------------------
-- One row per Customer with any entry. `earned` is every `earn` less every
-- `clawback` (rule t); a clawback never takes more than its Order earned, so
-- it is never below zero.
create or replace view public.points_milestone_progress with (security_invoker = true) as
select
  l.customer_id,
  greatest(coalesce(sum(l.points) filter (where l.kind in ('earn', 'clawback')), 0), 0)::integer as earned,
  (count(*) filter (where l.kind = 'milestone_bonus'))::integer                                   as granted
from points_ledger l
group by l.customer_id;

revoke all on public.points_milestone_progress from anon, authenticated;

-- ---------------------------------------------------------------------
-- The grant, for one Customer (rule u)
-- ---------------------------------------------------------------------
-- Holds the per-Customer lock adjust_points, reserve_points and the clawback
-- take, and reads progress under it. Writes one `milestone_bonus` entry for
-- each milestone reached beyond the bonuses already held, lowest first.
-- Returns how many it wrote: 0 for no such Customer, a partner, or nothing due.
-- Not gated on the switch itself; the sweep below is.
create or replace function public.grant_milestone_bonuses_for(p_customer_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_earned  integer;
  v_granted integer;
  v_written integer;
begin
  perform 1 from customers where id = p_customer_id for update;
  if not found or is_partner_customer(p_customer_id) then
    return 0;
  end if;

  select p.earned, p.granted into v_earned, v_granted
    from points_milestone_progress p
   where p.customer_id = p_customer_id;

  insert into points_ledger (customer_id, kind, points, milestone, note)
  select p_customer_id, 'milestone_bonus', m.bonus, m.milestone,
         format('Milestone %s: %s points earned from orders', m.milestone, to_char(m.threshold, 'FM9,999,999'))
    from points_milestones() m
   where m.threshold <= coalesce(v_earned, 0)
     and m.milestone > coalesce(v_granted, 0)
   order by m.milestone
  on conflict (customer_id, milestone) where kind = 'milestone_bonus' do nothing;

  get diagnostics v_written = row_count;
  return v_written;
end;
$$;

revoke execute on function public.grant_milestone_bonuses_for(uuid) from public, anon, authenticated;
grant execute on function public.grant_milestone_bonuses_for(uuid) to service_role;

-- ---------------------------------------------------------------------
-- The daily sweep (rule w)
-- ---------------------------------------------------------------------
-- Every Customer who has reached more milestones than they hold bonuses for.
-- Nothing while points are off or before the launch. Returns how many entries
-- it wrote. p_now is for tests; the job passes its own clock.
create or replace function public.grant_due_milestone_bonuses(p_now timestamptz default now())
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  s       record;
  v_id    uuid;
  v_total integer := 0;
begin
  select * into s from points_settings();
  if not coalesce(s.enabled, false) or s.launch_at is null or s.launch_at > p_now then
    return 0;
  end if;

  for v_id in
    select p.customer_id
      from points_milestone_progress p
     where (select count(*) from points_milestones() m where m.threshold <= p.earned) > p.granted
     order by p.customer_id
  loop
    v_total := v_total + grant_milestone_bonuses_for(v_id);
  end loop;
  return v_total;
end;
$$;

revoke execute on function public.grant_due_milestone_bonuses(timestamptz) from public, anon, authenticated;
grant execute on function public.grant_due_milestone_bonuses(timestamptz) to service_role;

-- ---------------------------------------------------------------------
-- What points cost: milestone bonuses join the summary
-- ---------------------------------------------------------------------
-- As slice 02 defined it (20261021120000_points_ledger.sql), with two columns
-- added at the end.
create or replace view public.admin_points_summary with (security_invoker = true) as
with m as (select date_trunc('month', now() at time zone 'Asia/Singapore') at time zone 'Asia/Singapore' as start),
l as (select l.*, l.created_at >= m.start as this_month from points_ledger l, m)
select
  coalesce(sum(points), 0)::bigint                                                         as outstanding_points,
  (select coalesce(sum(points), 0) from points_order_candidates)::bigint                   as pending_points,
  coalesce(-sum(points) filter (where kind in ('spend', 'spend_release')), 0)::bigint      as spent_points,
  coalesce(-sum(points) filter (where kind in ('spend', 'spend_release') and this_month), 0)::bigint as spent_points_month,
  coalesce(-sum(points) filter (where kind = 'expire'), 0)::bigint                         as expired_points,
  coalesce(-sum(points) filter (where kind = 'expire' and this_month), 0)::bigint          as expired_points_month,
  coalesce(-sum(points) filter (where kind = 'clawback'), 0)::bigint                       as clawed_back_points,
  coalesce(-sum(points) filter (where kind = 'clawback' and this_month), 0)::bigint        as clawed_back_points_month,
  coalesce(sum(points) filter (where kind = 'earn'), 0)::bigint                            as earned_points,
  count(*) filter (where kind = 'claim_bonus')                                             as claim_bonuses,
  count(distinct customer_id)                                                              as customers_with_entries,
  count(*) filter (where kind = 'milestone_bonus')                                         as milestone_bonuses,
  coalesce(sum(points) filter (where kind = 'milestone_bonus'), 0)::bigint                 as milestone_bonus_points
from l;

revoke all on public.admin_points_summary from anon, authenticated;
