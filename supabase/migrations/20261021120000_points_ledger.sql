-- Loyalty points: the ledger, the balance, the settings and Staff
-- adjustments (PRD-loyalty-points slice 02; ADR 0030).
--
-- points_ledger: every change to a Customer's balance, append-only. The
-- balance is the sum of the entries and is never stored on `customers`, which
-- the customer can read (ADR 0029 (d)). Kinds and signs:
--   earn           +  an Order's points, written when its return window closes
--   claim_bonus    +  the one-time Claim bonus (slice 05)
--   spend          -  reserved when a shop Checkout is created (slice 04)
--   spend_release  +  a reservation given back: the Checkout expired or failed
--   clawback       -  a refund after the Order's points were written
--   expire         -  the whole balance, 24 months after the last purchase
--   adjust         ±  Staff, with a reason; never for a partner
--
-- Rule (r): "is this Customer a partner?" has one answer,
-- is_partner_customer(). The earn job, checkout, the Claim and Staff
-- adjustments all ask it. lib/points/partner.ts mirrors it for checkout, and a
-- parity test holds the two equal.
--
-- Settings are `site_settings` rows (publicly readable, which is fine: the
-- terms are advertised). Every default is seeded except points_launch_at,
-- which the owner sets, and points_enabled starts 'false'. 100 points = S$1
-- is a constant in code (lib/points/value.ts), never a setting (rule a).
--
-- Server-only: RLS on, no policy, nothing granted to anon or authenticated,
-- on the table, its views and its functions.
--
-- Idempotent.

-- ---------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------
insert into public.site_settings (key, value) values
  ('points_enabled', 'false'),
  ('points_earn_per_dollar', '3'),
  ('points_min_redeem', '500'),
  ('points_max_share', '0.5'),
  ('points_expiry_months', '24'),
  ('points_claim_bonus', '1000'),
  ('points_claim_bonus_months', '3')
on conflict (key) do nothing;

-- The settings as typed values. A missing or malformed one reads as its
-- default, except the launch date, which reads as null (not launched).
create or replace function public.points_settings()
returns table (
  enabled            boolean,
  launch_at          timestamptz,
  earn_per_dollar    numeric,
  min_redeem         integer,
  max_share          numeric,
  expiry_months      integer,
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
    coalesce((select case when v ~ '^\d+$' then v::integer end from s where key = 'points_expiry_months'), 24),
    coalesce((select case when v ~ '^\d+$' then v::integer end from s where key = 'points_claim_bonus'), 1000),
    coalesce((select case when v ~ '^\d+$' then v::integer end from s where key = 'points_claim_bonus_months'), 3);
$$;

revoke execute on function public.points_settings() from public, anon, authenticated;
grant execute on function public.points_settings() to service_role;

-- ---------------------------------------------------------------------
-- The ledger
-- ---------------------------------------------------------------------
create table if not exists public.points_ledger (
  id                    uuid primary key default gen_random_uuid(),
  customer_id           uuid not null references public.customers(id) on delete cascade,
  kind                  text not null check (kind in
                          ('earn', 'claim_bonus', 'spend', 'spend_release', 'clawback', 'expire', 'adjust')),
  points                integer not null check (points <> 0),
  order_id              uuid null references public.orders(id) on delete set null,
  -- The Stripe refund a clawback answers.
  refund_id             text null,
  note                  text null check (note is null or length(note) <= 300),
  created_by_profile_id uuid null references public.mp_staff(id) on delete set null,
  created_at            timestamptz not null default now(),
  constraint points_ledger_sign check (
    (kind in ('earn', 'claim_bonus', 'spend_release') and points > 0)
    or (kind in ('spend', 'clawback', 'expire') and points < 0)
    or kind = 'adjust'
  ),
  constraint points_ledger_adjust_note check (kind <> 'adjust' or length(btrim(coalesce(note, ''))) > 0)
);

create unique index if not exists points_ledger_one_per_order
  on public.points_ledger (order_id, kind)
  where order_id is not null and kind in ('earn', 'spend', 'spend_release');
create unique index if not exists points_ledger_one_claim_bonus
  on public.points_ledger (customer_id) where kind = 'claim_bonus';
create unique index if not exists points_ledger_one_per_refund
  on public.points_ledger (refund_id) where kind = 'clawback';
create index if not exists points_ledger_customer_idx
  on public.points_ledger (customer_id, created_at desc);

alter table public.points_ledger enable row level security;
revoke all on public.points_ledger from anon, authenticated;

-- Append-only, for every role. A correction is a new `adjust` entry. The only
-- changes let through are the cascades from a deleted Customer or Order, which
-- arrive from the referential trigger one level down.
create or replace function public.reject_points_ledger_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  raise exception 'points_ledger is append-only: record a new entry, not an edit'
    using errcode = 'insufficient_privilege';
end;
$$;

revoke execute on function public.reject_points_ledger_change() from public, anon, authenticated;

drop trigger if exists trg_points_ledger_append_only on public.points_ledger;
create trigger trg_points_ledger_append_only
before update or delete on public.points_ledger
for each row execute function public.reject_points_ledger_change();

-- ---------------------------------------------------------------------
-- Rule (r): is this Customer a partner?
-- ---------------------------------------------------------------------
-- An approved partner_users row holds their login, their email, or (verified)
-- their backup email: the matches loadPartnerRow makes (lib/auth/partner.ts),
-- emails compared without case. A pending or rejected application is not a
-- partner.
create or replace function public.is_partner_customer(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from customers c
      join partner_users pu on pu.application_status = 'approved'
       and (
         (c.auth_user_id is not null and pu.auth_user_id = c.auth_user_id)
         or lower(btrim(pu.email)) = lower(btrim(c.email))
         or (pu.backup_email_verified and lower(btrim(pu.backup_email)) = lower(btrim(c.email)))
       )
     where c.id = p_customer_id
  );
$$;

revoke execute on function public.is_partner_customer(uuid) from public, anon, authenticated;
grant execute on function public.is_partner_customer(uuid) to service_role;

-- ---------------------------------------------------------------------
-- What each Order earns, before and after its window closes
-- ---------------------------------------------------------------------
-- One row per Order that earns or will earn (rules c to e): paid on or after
-- the launch date, not cancelled, failed or disputed, with a Customer who is
-- not a partner, not a partner's self-purchase, a positive base, and no
-- `earn` entry yet. `release_at` is 30 days after delivery
-- (DEFAULT_RETURN_WINDOW_DAYS, lib/rma/eligibility.ts; a test holds the two
-- equal), or after payment for an Order of service lines only; null while a
-- goods Order is undelivered. These are the Customer's **Pending points**;
-- slice 03's job writes the `earn` entry once `release_at` has passed.
create or replace view public.points_order_candidates with (security_invoker = true) as
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

-- ---------------------------------------------------------------------
-- The balance
-- ---------------------------------------------------------------------
-- available         the sum of the ledger; never below zero by construction
-- pending           what paid Orders will earn once their windows close
-- last_purchase_at  the latest paid Order, or the Claim bonus if later
-- expires_on        last_purchase_at plus points_expiry_months, as a
--                   Singapore date; null while nothing is available
create or replace function public.points_balance(p_customer_id uuid)
returns table (available integer, pending integer, last_purchase_at timestamptz, expires_on date)
language sql
stable
security definer
set search_path = public
as $$
  with s as (select * from points_settings()),
  a as (select coalesce(sum(points), 0)::integer as available from points_ledger where customer_id = p_customer_id),
  p as (select coalesce(sum(points), 0)::integer as pending from points_order_candidates where customer_id = p_customer_id),
  lp as (
    select greatest(
      (select max(o.paid_at) from orders o
        where o.customer_id = p_customer_id and o.paid_at is not null
          and o.status::text not in ('pending', 'cancelled', 'payment_failed')),
      (select max(created_at) from points_ledger where customer_id = p_customer_id and kind = 'claim_bonus')
    ) as at
  )
  select a.available, p.pending, lp.at,
         case when a.available > 0 and lp.at is not null
              then ((lp.at at time zone 'Asia/Singapore') + make_interval(months => s.expiry_months))::date
         end
    from a, p, lp, s;
$$;

revoke execute on function public.points_balance(uuid) from public, anon, authenticated;
grant execute on function public.points_balance(uuid) to service_role;

-- ---------------------------------------------------------------------
-- Staff adjustments (rule n)
-- ---------------------------------------------------------------------
-- Holds a row lock on the Customer, the same lock slice 04's reservation
-- takes, so an adjustment and a spend cannot both read the old balance.
-- Refuses: no such Customer, a partner, an empty note, zero, more than a
-- million points either way, and a removal below zero. Returns the new
-- available balance.
create or replace function public.adjust_points(
  p_customer_id uuid,
  p_points      integer,
  p_note        text,
  p_profile_id  uuid default null
)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_available integer;
begin
  perform 1 from customers where id = p_customer_id for update;
  if not found then
    raise exception 'No such customer' using errcode = 'no_data_found';
  end if;
  if is_partner_customer(p_customer_id) then
    raise exception 'Partners do not hold points' using errcode = 'check_violation';
  end if;
  if p_note is null or length(btrim(p_note)) = 0 then
    raise exception 'An adjustment needs a reason' using errcode = 'check_violation';
  end if;
  if p_points is null or p_points = 0 or abs(p_points) > 1000000 then
    raise exception 'An adjustment is a whole number of points, not zero, at most 1,000,000 either way'
      using errcode = 'check_violation';
  end if;

  select coalesce(sum(points), 0) into v_available from points_ledger where customer_id = p_customer_id;
  if v_available + p_points < 0 then
    raise exception 'That would take the balance below zero: % points are available', v_available
      using errcode = 'check_violation';
  end if;

  insert into points_ledger (customer_id, kind, points, note, created_by_profile_id)
  values (p_customer_id, 'adjust', p_points, btrim(p_note), p_profile_id);
  return v_available + p_points;
end;
$$;

revoke execute on function public.adjust_points(uuid, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.adjust_points(uuid, integer, text, uuid) to service_role;

-- ---------------------------------------------------------------------
-- What points cost (the Settings → Discounts → Points card)
-- ---------------------------------------------------------------------
-- One row. "This month" is the Singapore calendar month.
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
  count(distinct customer_id)                                                              as customers_with_entries
from l;

revoke all on public.admin_points_summary from anon, authenticated;
