-- Loyalty points: earning and clawback (PRD-loyalty-points slice 03; ADR 0030
-- rules c, d, e, m).
--
-- release_earned_points: the daily job's half of earning. An Order's points
-- are pending while its return window is open: they are computed from the
-- Order by points_order_candidates (slice 02) and are not in the ledger. Once
-- `release_at` has passed, this writes the one `earn` entry. Every rule about
-- WHICH Orders earn (launch date, status, partner self-purchase, partner
-- Customer through is_partner_customer, a positive base) lives in that view,
-- once; this adds only the clock and the switch. Nothing is written while
-- points are off: the Orders stay pending and are written on the first run
-- after points are turned back on. A re-run writes nothing, because the view
-- leaves out an Order that has its `earn` entry and points_ledger_one_per_order
-- turns a concurrent duplicate into a no-op.
--
-- clawback_points_for_refund: a refund that lands after the Order's points
-- were written takes back floor(rate × refund), no more than the Order still
-- holds and no more than the Customer has. What the balance cannot cover is
-- recorded on the entry, not chased (rule m). A refund before the points were
-- written needs nothing: the base already subtracts amount_refunded. Spent
-- points are never refunded (rule l), and this never gives any back.
--
-- The refund and the release can cross. The refund webhook records the
-- refund, rolls `amount_refunded` up onto the Order, then calls the clawback,
-- each its own statement; the daily job can write the Order's `earn` between
-- the rollup and the clawback. Two guards keep that from counting the refund
-- twice or not at all:
--   - the release locks the Orders it is about to write before reading them,
--     so a rollup in flight lands either wholly before the read (and is in the
--     base) or wholly after the entry (and is clawed back);
--   - the clawback takes back no more than the Order holds above what it would
--     earn on the cash it keeps now. When the `earn` already reflected the
--     refund, that is nothing. Otherwise it is at least floor(rate × refund),
--     so in the ordinary case it never binds.
-- The clawback is therefore called after the rollup (app/api/stripe/webhook).
--
-- Server-only: nothing granted to anon or authenticated.
--
-- Idempotent.

-- ---------------------------------------------------------------------
-- Release: one `earn` entry per Order whose window has closed
-- ---------------------------------------------------------------------
-- Returns how many entries it wrote. p_now is for tests; the job passes its
-- own clock.
create or replace function public.release_earned_points(p_now timestamptz default now())
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ids     uuid[];
  v_written integer;
begin
  if not coalesce((select enabled from points_settings()), false) then
    return 0;
  end if;

  -- Lock first, in a fixed order, then read in a fresh statement: a refund
  -- rollup that held one of these rows has committed by the time the insert
  -- below reads amount_refunded, and one that has not started waits for this
  -- transaction.
  with due as (
    select o.id
      from orders o
     where o.id in (select c.order_id from points_order_candidates c where c.release_at <= p_now)
     order by o.id
       for update of o
  )
  select array_agg(id) into v_ids from due;

  if v_ids is null then
    return 0;
  end if;

  insert into points_ledger (customer_id, kind, points, order_id)
  select c.customer_id, 'earn', c.points, c.order_id
    from points_order_candidates c
   where c.order_id = any (v_ids)
     and c.release_at <= p_now
  on conflict (order_id, kind)
     where order_id is not null and kind in ('earn', 'spend', 'spend_release')
  do nothing;

  get diagnostics v_written = row_count;
  return v_written;
end;
$$;

revoke execute on function public.release_earned_points(timestamptz) from public, anon, authenticated;
grant execute on function public.release_earned_points(timestamptz) to service_role;

-- ---------------------------------------------------------------------
-- Clawback (rule m): one `clawback` entry per Stripe refund
-- ---------------------------------------------------------------------
-- p_refund_amount is the refund in dollars, as Stripe paid it out. Returns the
-- points taken back: 0 when the Order has no `earn` entry, the refund was
-- already answered (a replayed webhook), or nothing is left to take. When the
-- whole amount is a shortfall (the balance is 0) there is no entry to carry
-- the note, so nothing is written.
--
-- Holds the per-Customer lock adjust_points takes, so a clawback, a Staff
-- adjustment and a spend never read the same old balance, and two replays of
-- one refund write once.
--
-- Not gated on points_enabled: the `earn` it corrects is already in the
-- ledger, as a Staff adjustment is not gated either.
create or replace function public.clawback_points_for_refund(
  p_order_id      uuid,
  p_refund_id     text,
  p_refund_amount numeric
)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_customer  uuid;
  v_rate      numeric;
  v_due       integer;
  v_net       integer;
  v_kept      integer;
  v_available integer;
  v_owed      integer;
  v_take      integer;
  v_note      text;
  v_written   integer;
begin
  if p_refund_id is null or length(btrim(p_refund_id)) = 0 then
    raise exception 'A clawback needs the refund id' using errcode = 'check_violation';
  end if;
  if p_order_id is null or p_refund_amount is null or p_refund_amount <= 0 then
    return 0;
  end if;

  -- Only an Order whose points were written has anything to take back.
  select customer_id into v_customer
    from points_ledger
   where order_id = p_order_id and kind = 'earn';
  if v_customer is null then
    return 0;
  end if;

  perform 1 from customers where id = v_customer for update;
  if not found then
    return 0;
  end if;

  -- A replayed refund writes nothing.
  if exists (select 1 from points_ledger where kind = 'clawback' and refund_id = btrim(p_refund_id)) then
    return 0;
  end if;

  select earn_per_dollar into v_rate from points_settings();
  v_due := floor(v_rate * p_refund_amount)::integer;

  -- What this Order still holds: its `earn` less earlier clawbacks.
  select coalesce(sum(points), 0)::integer into v_net
    from points_ledger
   where order_id = p_order_id and kind in ('earn', 'clawback');

  -- What it would earn on the cash it keeps now (rule c, as the view computes
  -- it). Holding more than that is what a refund after the release owes.
  select floor(v_rate * greatest(o.subtotal - o.discount_amount - coalesce(o.amount_refunded, 0), 0))::integer
    into v_kept
    from orders o
   where o.id = p_order_id;

  select greatest(coalesce(sum(points), 0), 0)::integer into v_available
    from points_ledger
   where customer_id = v_customer;

  v_owed := greatest(least(v_due, v_net, v_net - coalesce(v_kept, 0)), 0);
  v_take := least(v_owed, v_available);
  if v_take <= 0 then
    return 0;
  end if;

  if v_take < v_owed then
    v_note := format(
      'Refund of S$%s owed %s points; %s were available. %s not taken back.',
      to_char(p_refund_amount, 'FM999,999,990.00'), v_owed, v_take, v_owed - v_take
    );
  end if;

  insert into points_ledger (customer_id, kind, points, order_id, refund_id, note)
  values (v_customer, 'clawback', -v_take, p_order_id, btrim(p_refund_id), v_note)
  on conflict (refund_id) where kind = 'clawback' do nothing;

  get diagnostics v_written = row_count;
  return case when v_written = 1 then v_take else 0 end;
end;
$$;

revoke execute on function public.clawback_points_for_refund(uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.clawback_points_for_refund(uuid, text, numeric) to service_role;
