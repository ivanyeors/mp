-- Loyalty points: spending at shop checkout, reserved so a balance can never
-- be spent twice (PRD-loyalty-points slice 04; ADR 0030 (h) to (l)).
--
-- orders.points_spent / points_discount: what the Order took off in points.
-- The points discount is also inside discount_amount, with the coupon and
-- partner pricing, because that one figure is what Stripe's amount_off, tax
-- and the paid-time reconcile already agree on. These two columns say how
-- much of it was points, for the Order page, the email and the Admin page.
-- 100 points = S$1 is fixed (rule a), so the two always agree.
--
-- reserve_points: one transaction that takes the per-Customer lock (the same
-- `select … from customers … for update` adjust_points takes), re-reads the
-- balance and writes the `spend` entry, or says why not. Checkout calls it
-- after inserting the pending Order and before opening Stripe (rule j). Two
-- tabs racing for one balance queue on that lock: the second reads the first's
-- spend and gets `insufficient`.
--
-- release_points: the `spend_release` for an Order that was never paid
-- (Checkout expired, the payment failed, or Stripe refused to open it). Once
-- per Order, by points_ledger_one_per_order, and never once the Order is paid:
-- points used are not given back by any refund (rule l).
--
-- release_stale_point_reservations: the daily sweep for a release the webhook
-- missed. It leaves alone a pending Order whose payment Stripe has already
-- reported (authorised but unsettled, or charged for a different total):
-- money may be in, and Staff resolve it. Once they cancel it, the sweep
-- gives the points back.
--
-- Server-only, like the ledger: the functions are the service role's alone.
--
-- Idempotent.

-- ---------------------------------------------------------------------
-- The Order records its points
-- ---------------------------------------------------------------------
alter table public.orders
  add column if not exists points_spent integer not null default 0 check (points_spent >= 0),
  add column if not exists points_discount numeric(10,2) not null default 0 check (points_discount >= 0);

alter table public.orders drop constraint if exists orders_points_discount_matches;
alter table public.orders
  add constraint orders_points_discount_matches check (points_discount * 100 = points_spent);

-- The customer reads their own Order through column grants
-- (20261020101000_customer_notes_and_column_grants.sql); these two are theirs
-- to see.
grant select (points_spent, points_discount) on public.orders to authenticated;

-- ---------------------------------------------------------------------
-- Reserve
-- ---------------------------------------------------------------------
-- Returns 'reserved', or the refusal:
--   customer      no such Customer
--   disabled      points are switched off
--   partner       rule (r): a partner holds no points
--   step          not a positive multiple of 100 (S$1)
--   minimum       below points_min_redeem
--   order         no such Order, not this Customer's, not pending, its
--                 points_spent is not this amount, or it already holds a
--                 different reservation
--   cap           above points_max_share of the products' price after any
--                 coupon, or the whole of it (every Order takes some cash)
--   insufficient  the available balance, read under the lock, is short
-- Called again for an Order it already reserved, it answers 'reserved' and
-- writes nothing.
create or replace function public.reserve_points(p_customer_id uuid, p_order_id uuid, p_points integer)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  s           record;
  o           record;
  v_base      numeric;
  v_cap       integer;
  v_existing  integer;
  v_available integer;
begin
  perform 1 from customers where id = p_customer_id for update;
  if not found then
    return 'customer';
  end if;

  select * into s from points_settings();
  if not s.enabled then
    return 'disabled';
  end if;
  if is_partner_customer(p_customer_id) then
    return 'partner';
  end if;
  if p_points is null or p_points <= 0 or p_points % 100 <> 0 then
    return 'step';
  end if;
  if p_points < s.min_redeem then
    return 'minimum';
  end if;

  select id, customer_id, status::text as status, paid_at, subtotal, discount_amount, points_spent, points_discount
    into o
    from orders where id = p_order_id for update;
  if not found
     or o.customer_id is distinct from p_customer_id
     or o.status <> 'pending'
     or o.paid_at is not null
     or o.points_spent <> p_points then
    return 'order';
  end if;

  -- Rule (i): whole dollars, at most the share of the products' price after
  -- any coupon (discount_amount without the points), and never all of it.
  v_base := o.subtotal - (o.discount_amount - o.points_discount);
  v_cap := greatest(least(floor(s.max_share * v_base), ceil(v_base) - 1), 0)::integer * 100;
  if p_points > v_cap then
    return 'cap';
  end if;

  select points into v_existing from points_ledger where order_id = p_order_id and kind = 'spend';
  if found then
    if -v_existing = p_points
       and not exists (select 1 from points_ledger where order_id = p_order_id and kind = 'spend_release') then
      return 'reserved';
    end if;
    return 'order';
  end if;

  select coalesce(sum(points), 0) into v_available from points_ledger where customer_id = p_customer_id;
  if v_available < p_points then
    return 'insufficient';
  end if;

  insert into points_ledger (customer_id, kind, points, order_id)
  values (p_customer_id, 'spend', -p_points, p_order_id);
  return 'reserved';
end;
$$;

revoke execute on function public.reserve_points(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.reserve_points(uuid, uuid, integer) to service_role;

-- ---------------------------------------------------------------------
-- Release
-- ---------------------------------------------------------------------
-- Gives an Order's reservation back, once. Writes nothing, and returns false,
-- when the Order has no `spend`, already has its release, or was paid: a paid
-- Order (paid_at set, or any status past payment) keeps its points spent.
-- Locks the Order, so a payment confirmed at the same moment is seen.
create or replace function public.release_points(p_order_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  o       record;
  v_spend record;
  v_rows  integer;
begin
  select id, status::text as status, paid_at into o from orders where id = p_order_id for update;
  if not found or o.paid_at is not null or o.status not in ('pending', 'cancelled', 'payment_failed') then
    return false;
  end if;

  select customer_id, points into v_spend from points_ledger where order_id = p_order_id and kind = 'spend';
  if not found then
    return false;
  end if;

  insert into points_ledger (customer_id, kind, points, order_id)
  values (v_spend.customer_id, 'spend_release', -v_spend.points, p_order_id)
  on conflict (order_id, kind)
    where order_id is not null and kind in ('earn', 'spend', 'spend_release')
  do nothing;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke execute on function public.release_points(uuid) from public, anon, authenticated;
grant execute on function public.release_points(uuid) to service_role;

-- ---------------------------------------------------------------------
-- The daily sweep
-- ---------------------------------------------------------------------
-- Releases every unreleased `spend` whose Order is cancelled or failed, or
-- still pending 48 hours after it was created (a Checkout Session lives 24),
-- unless Stripe has already reported a payment for it. Returns how many it
-- released. Safe to re-run: release_points writes each release once.
create or replace function public.release_stale_point_reservations(p_now timestamptz default now())
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  r      record;
  v_done integer := 0;
begin
  for r in
    select l.order_id
      from points_ledger l
      join orders o on o.id = l.order_id
     where l.kind = 'spend'
       and o.paid_at is null
       and not exists (
         select 1 from points_ledger x where x.order_id = l.order_id and x.kind = 'spend_release'
       )
       and (
         o.status::text in ('cancelled', 'payment_failed')
         or (
           o.status::text = 'pending'
           and o.created_at <= p_now - interval '48 hours'
           and not o.needs_attention
           and not exists (
             select 1 from order_timeline t
              where t.order_id = o.id and t.event_type in ('payment_pending', 'total_mismatch')
           )
         )
       )
     order by l.created_at
  loop
    if release_points(r.order_id) then
      v_done := v_done + 1;
    end if;
  end loop;
  return v_done;
end;
$$;

revoke execute on function public.release_stale_point_reservations(timestamptz) from public, anon, authenticated;
grant execute on function public.release_stale_point_reservations(timestamptz) to service_role;
