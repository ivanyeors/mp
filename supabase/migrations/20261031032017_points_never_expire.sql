-- Loyalty points: points never expire (owner, 2026-10-31; ADR 0030
-- amendment of 2026-10-31, which retires decision 8 and rules o and p).
--
-- A balance is kept for as long as the customer has an account. Nothing
-- expires it, nobody is reminded about it, and no date is shown beside it.
-- This undoes 20261021170000_points_expiry.sql and the expiry parts of
-- 20261021120000_points_ledger.sql:
--
--   - expire_points(), expire_due_points() and
--     points_expiry_reminder_candidates() go, with points_clock() and
--     points_expires_on(), which only they and the balance read.
--   - points_balance() returns `available` and `pending` only: no
--     `last_purchase_at`, no `expires_on`.
--   - points_settings() loses `expiry_months`, and the `points_expiry_months`
--     setting row goes. Its return type changes, so it is dropped and
--     recreated with the two views that depend on it: points_order_candidates
--     reads it, and admin_points_summary reads that view. Both come back as
--     they were, less the summary's two `expired` columns.
--   - The ledger loses its `expire` kind.
--
-- When this was written, production had points off, an empty ledger, no
-- `points.expiry_*` email in customer_emails and no saved copy for it, so
-- nothing is reinstated. A database holding an `expire` entry stops here:
-- the ledger is append-only, so give those points back with `adjust` entries
-- (adjust_points) before applying it.
--
-- Server-only, like the ledger: nothing granted to anon or authenticated.
--
-- Idempotent.

do $$
begin
  if exists (select 1 from public.points_ledger where kind = 'expire') then
    raise exception 'points_ledger holds expire entries: give those points back with adjust_points first'
      using errcode = 'check_violation';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- The expiry, its reminders and its clock
-- ---------------------------------------------------------------------
drop function if exists public.points_expiry_reminder_candidates(timestamptz, integer);
drop function if exists public.expire_due_points(timestamptz);
drop function if exists public.expire_points(uuid, timestamptz);

-- ---------------------------------------------------------------------
-- The setting, and the two views that read it
-- ---------------------------------------------------------------------
drop view if exists public.admin_points_summary;
drop view if exists public.points_order_candidates;
drop function if exists public.points_settings();

delete from public.site_settings where key = 'points_expiry_months';

-- The settings as typed values. A missing or malformed one reads as its
-- default, except the launch date, which reads as null (not launched).
create function public.points_settings()
returns table (
  enabled            boolean,
  launch_at          timestamptz,
  earn_per_dollar    numeric,
  min_redeem         integer,
  max_share          numeric,
  claim_bonus        integer,
  claim_bonus_months integer
)
language sql
stable
security definer
set search_path = public
as $$
  with s as (select key, btrim(value) as v from site_settings where key like 'points\_%')
  select
    coalesce((select lower(v) = 'true' from s where key = 'points_enabled'), false),
    (select case when v ~ '^\d{4}-\d{2}-\d{2}' then v::timestamptz end from s where key = 'points_launch_at'),
    coalesce((select case when v ~ '^\d+(\.\d+)?$' then v::numeric end from s where key = 'points_earn_per_dollar'), 3),
    coalesce((select case when v ~ '^\d+$' then v::integer end from s where key = 'points_min_redeem'), 500),
    coalesce((select case when v ~ '^(0(\.\d+)?|1(\.0+)?)$' then v::numeric end from s where key = 'points_max_share'), 0.5),
    coalesce((select case when v ~ '^\d+$' then v::integer end from s where key = 'points_claim_bonus'), 1000),
    coalesce((select case when v ~ '^\d+$' then v::integer end from s where key = 'points_claim_bonus_months'), 3);
$$;

revoke execute on function public.points_settings() from public, anon, authenticated;
grant execute on function public.points_settings() to service_role;

-- What each Order earns, before and after its window closes. Unchanged from
-- 20261021120000_points_ledger.sql.
create view public.points_order_candidates with (security_invoker = true) as
with s as (select * from points_settings()),
o as (
  select
    o.id as order_id,
    o.customer_id,
    o.order_number,
    o.paid_at,
    o.delivered_at,
    greatest(o.subtotal - o.discount_amount - coalesce(o.amount_refunded, 0), 0) as base,
    not exists (
      select 1 from order_items i where i.order_id = o.id and coalesce(i.kind, 'goods') <> 'service'
    ) and exists (select 1 from order_items i where i.order_id = o.id) as service_only
  from orders o, s
  where s.launch_at is not null
    and o.paid_at is not null
    and o.paid_at >= s.launch_at
    and o.customer_id is not null
    and o.self_purchase_partner_id is null
    and o.status::text not in ('pending', 'cancelled', 'payment_failed', 'disputed')
    and not exists (select 1 from points_ledger l where l.order_id = o.id and l.kind = 'earn')
)
select
  o.order_id,
  o.customer_id,
  o.order_number,
  o.paid_at,
  o.delivered_at,
  o.base,
  floor(s.earn_per_dollar * o.base)::integer as points,
  case
    when o.service_only then o.paid_at + interval '30 days'
    when o.delivered_at is not null then o.delivered_at + interval '30 days'
  end as release_at
from o, s
where floor(s.earn_per_dollar * o.base) > 0
  and not is_partner_customer(o.customer_id);

revoke all on public.points_order_candidates from anon, authenticated;

-- What points cost (the Settings → Discounts → Points card). As
-- 20261023120000_points_milestones.sql defined it, less the two `expired`
-- columns.
create view public.admin_points_summary with (security_invoker = true) as
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
  coalesce(sum(points) filter (where kind = 'milestone_bonus'), 0)::bigint                 as milestone_bonus_points
from l;

revoke all on public.admin_points_summary from anon, authenticated;

-- ---------------------------------------------------------------------
-- The balance: what is available and what is pending, and no date
-- ---------------------------------------------------------------------
-- available  the sum of the ledger; never below zero by construction
-- pending    what paid Orders will earn once their windows close
drop function if exists public.points_balance(uuid);
create function public.points_balance(p_customer_id uuid)
returns table (available integer, pending integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select coalesce(sum(points), 0)::integer from points_ledger where customer_id = p_customer_id),
    (select coalesce(sum(points), 0)::integer from points_order_candidates where customer_id = p_customer_id);
$$;

revoke execute on function public.points_balance(uuid) from public, anon, authenticated;
grant execute on function public.points_balance(uuid) to service_role;

drop function if exists public.points_clock(uuid);
drop function if exists public.points_expires_on(timestamptz, integer);

-- ---------------------------------------------------------------------
-- The ledger: no `expire` kind
-- ---------------------------------------------------------------------
alter table public.points_ledger drop constraint if exists points_ledger_kind_check;
alter table public.points_ledger
  add constraint points_ledger_kind_check check (kind in
    ('earn', 'claim_bonus', 'milestone_bonus', 'spend', 'spend_release', 'clawback', 'adjust'));

alter table public.points_ledger drop constraint if exists points_ledger_sign;
alter table public.points_ledger
  add constraint points_ledger_sign check (
    (kind in ('earn', 'claim_bonus', 'milestone_bonus', 'spend_release') and points > 0)
    or (kind in ('spend', 'clawback') and points < 0)
    or kind = 'adjust'
  );

-- ---------------------------------------------------------------------
-- The reminder email's saved words, wherever any were saved
-- ---------------------------------------------------------------------
delete from public.email_template_copy where template_id = 'points.expiry';
