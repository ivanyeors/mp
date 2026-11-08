-- Loyalty points: Past-purchase points (ADR 0030, amendment of 2026-11-08;
-- owner, 2026-11-08: "backfill points based on the amount of the orders").
--
-- A Migrated customer receives points once for what they spent on the old
-- shop, at the earn rate: floor(points_earn_per_dollar ×
-- migrated_customers.shopify_amount_spent). This retires decision 6 ("only
-- Orders paid from launch earn") for the Shopify era only, settled once from
-- what the platform already holds; nothing reads Shopify.
--
-- The owner's choices, 2026-11-08:
--   - Staff run it, once, from Settings → Discounts → Points: a preview first
--     (how many customers, how many points, what they are worth), then Apply.
--     Running it again later grants only those not yet granted (a later
--     customer import), never anyone twice.
--   - They never count towards a Milestone bonus. Milestones count `earn`
--     less `clawback` (points_milestone_progress), and this is a kind of its
--     own, so nothing there changes.
--   - Partners get none (rule r), as they earn none.
--
-- 1. points_ledger gains its ninth kind, `past_purchases`: positive, at most
--    one per Customer (points_ledger_one_past_purchases), so a run twice, or
--    two runs at once, grant nobody twice.
-- 2. points_past_purchase_candidates: who a run would grant now, and what.
--    A Migrated customer whose spend earns at least one point, with no
--    `past_purchases` entry, who is not a partner.
-- 3. past_purchase_points_preview(): the numbers the panel shows before
--    Apply, and what earlier runs granted.
-- 4. grant_past_purchase_points(profile, customers, points): grants every
--    candidate in one statement, under an advisory lock so two runs never
--    overlap. Refused when the candidates are no longer the customers and
--    points the preview showed (a customer import or a rate change in
--    between), so what Staff confirm is what is granted. Each entry's note
--    says what they spent, as the Staff card shows it.
-- 5. admin_points_summary appends `past_purchase_grants` and
--    `past_purchase_points`; every other column is as 20261031032017 left it.
--
-- Not gated on points being on: with points off customers see nothing, and
-- the balance waits for launch. Not reversible: the ledger is append-only, so
-- a correction is an `adjust` entry (adjust_points), as for any other.
--
-- Server-only, like the ledger: nothing granted to anon or authenticated.
-- Idempotent.

-- ---------------------------------------------------------------------
-- 1. The ledger: `past_purchases`
-- ---------------------------------------------------------------------
alter table public.points_ledger drop constraint if exists points_ledger_kind_check;
alter table public.points_ledger
  add constraint points_ledger_kind_check check (kind in
    ('earn', 'claim_bonus', 'milestone_bonus', 'past_purchases', 'spend', 'spend_release', 'clawback', 'adjust'));

alter table public.points_ledger drop constraint if exists points_ledger_sign;
alter table public.points_ledger
  add constraint points_ledger_sign check (
    (kind in ('earn', 'claim_bonus', 'milestone_bonus', 'past_purchases', 'spend_release') and points > 0)
    or (kind in ('spend', 'clawback') and points < 0)
    or kind = 'adjust'
  );

create unique index if not exists points_ledger_one_past_purchases
  on public.points_ledger (customer_id) where kind = 'past_purchases';

-- ---------------------------------------------------------------------
-- 2. Who a run would grant, and what
-- ---------------------------------------------------------------------
create or replace view public.points_past_purchase_candidates with (security_invoker = true) as
with s as (select earn_per_dollar from points_settings())
select
  m.customer_id,
  m.shopify_orders_count,
  m.shopify_amount_spent,
  floor(s.earn_per_dollar * m.shopify_amount_spent)::integer as points
from migrated_customers m, s
where floor(s.earn_per_dollar * m.shopify_amount_spent) > 0
  and not exists (
    select 1 from points_ledger l where l.customer_id = m.customer_id and l.kind = 'past_purchases'
  )
  and not is_partner_customer(m.customer_id);

revoke all on public.points_past_purchase_candidates from anon, authenticated;
grant select on public.points_past_purchase_candidates to service_role;

-- ---------------------------------------------------------------------
-- 3. The preview
-- ---------------------------------------------------------------------
-- customers, points   what Apply would grant now
-- spend               what those customers spent on the old shop, S$
-- median, largest     the middle and the largest grant, in points
-- granted_*           what earlier runs granted
-- partners_left_out   Migrated customers with spend who are partners
-- earn_per_dollar     the rate the points were worked out at
create or replace function public.past_purchase_points_preview()
returns table (
  customers         integer,
  points            bigint,
  spend             numeric,
  median            integer,
  largest           integer,
  granted_customers integer,
  granted_points    bigint,
  partners_left_out integer,
  earn_per_dollar   numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with c as materialized (select * from points_past_purchase_candidates),
  g as (select count(*)::integer as n, coalesce(sum(points), 0)::bigint as p from points_ledger where kind = 'past_purchases')
  select
    (select count(*)::integer from c),
    (select coalesce(sum(c.points), 0)::bigint from c),
    (select coalesce(sum(c.shopify_amount_spent), 0) from c),
    (select coalesce(percentile_disc(0.5) within group (order by c.points), 0)::integer from c),
    (select coalesce(max(c.points), 0)::integer from c),
    g.n,
    g.p,
    (select count(*)::integer
       from migrated_customers m
      where m.shopify_amount_spent > 0
        and not exists (select 1 from points_ledger l where l.customer_id = m.customer_id and l.kind = 'past_purchases')
        and is_partner_customer(m.customer_id)),
    (select s.earn_per_dollar from points_settings() s)
  from g;
$$;

revoke execute on function public.past_purchase_points_preview() from public, anon, authenticated;
grant execute on function public.past_purchase_points_preview() to service_role;

-- ---------------------------------------------------------------------
-- 4. The grant
-- ---------------------------------------------------------------------
create or replace function public.grant_past_purchase_points(
  p_profile_id       uuid,
  p_expect_customers integer,
  p_expect_points    bigint
)
returns table (customers integer, points bigint)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_customers integer;
  v_points    bigint;
begin
  -- One run at a time; a second waits, then finds nothing left to grant.
  perform pg_advisory_xact_lock(hashtext('public.grant_past_purchase_points'));

  select count(*)::integer, coalesce(sum(c.points), 0)::bigint
    into v_customers, v_points
    from points_past_purchase_candidates c;
  if v_customers is distinct from p_expect_customers or v_points is distinct from p_expect_points then
    raise exception 'The numbers changed since the preview: % customers and % points now. Check them again before applying.',
      v_customers, v_points
      using errcode = 'check_violation';
  end if;

  with ins as (
    insert into points_ledger (customer_id, kind, points, note, created_by_profile_id)
    select c.customer_id,
           'past_purchases',
           c.points,
           'S$' || to_char(c.shopify_amount_spent, 'FM999,999,990.00') || ' spent on the old shop',
           p_profile_id
      from points_past_purchase_candidates c
    on conflict (customer_id) where kind = 'past_purchases' do nothing
    returning points_ledger.points
  )
  select count(*)::integer, coalesce(sum(ins.points), 0)::bigint
    into v_customers, v_points
    from ins;

  return query select v_customers, v_points;
end;
$$;

revoke execute on function public.grant_past_purchase_points(uuid, integer, bigint) from public, anon, authenticated;
grant execute on function public.grant_past_purchase_points(uuid, integer, bigint) to service_role;

-- ---------------------------------------------------------------------
-- 5. What points cost: the Past-purchase points too
-- ---------------------------------------------------------------------
-- As 20261031032017_points_never_expire.sql, with the two columns appended.
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
  coalesce(sum(points) filter (where kind = 'past_purchases'), 0)::bigint                  as past_purchase_points
from l;

revoke all on public.admin_points_summary from anon, authenticated;
