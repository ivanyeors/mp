-- Loyalty points: 10 points = S$1, earned at 1 point per S$1 (owner,
-- 2026-11-08: "points earned $1 spent = 1 point", and "for spending, it
-- would be 10 points per $1 for customer to offset"). ADR 0030, amendment of
-- 2026-11-08: a point is worth S$0.10, not S$0.01, and customers get 10% back.
--
-- Rule (a) stands: the value is fixed in code (POINTS_PER_DOLLAR in
-- lib/points/value.ts) and here, never a setting. What changes:
--
-- 1. orders_points_discount_matches: points_discount × 10 = points_spent.
--    It is also the marker that this ran: the one-time conversion in 2 runs
--    only while the constraint still says 100, so applying this twice
--    converts nothing twice.
-- 2. The saved settings, once, so every amount in points keeps its dollar
--    value: the fewest used at once (500 → 50 points, S$5), the Claim bonus
--    (1,000 → 100, S$10), and the milestone ladder, each threshold and bonus
--    divided by 10. The earn rate becomes 1 point per S$1. An amount that
--    does not divide by 10, or a ladder that does not parse, is left as it
--    was for Staff to set on Settings → Discounts → Points.
-- 3. reserve_points: points are used in steps of 10 (S$1), and the cap is
--    whole dollars × 10. Otherwise as 20261021140000_points_spending.sql.
-- 4. points_settings(): a missing or malformed rate reads as 1, the fewest
--    used at once as 50, and the Claim bonus as 100, as POINTS_DEFAULTS does.
--
-- Refused while any Order has used points: those were taken at 100 = S$1,
-- and would need settling first. In production on 2026-11-08 none had, and
-- points were off with no launch date. The ledger is not converted (it is
-- append-only): it held one Staff adjustment, which Staff settle by hand.
--
-- Server-only, as before. Idempotent.

do $$
declare
  v_old boolean;
begin
  -- Postgres prints it as `(points_discount * (100)::numeric) = …`.
  select pg_get_constraintdef(c.oid) ~ '[*][[:space:]]*[(]?100[)]?'
    into v_old
    from pg_constraint c
   where c.conname = 'orders_points_discount_matches'
     and c.conrelid = 'public.orders'::regclass;

  if coalesce(v_old, true) then
    if exists (select 1 from public.orders where points_spent <> 0 or points_discount <> 0) then
      raise exception 'Orders have used points at 100 points = S$1: settle them before changing what a point is worth'
        using errcode = 'check_violation';
    end if;

    -- 2. The saved settings, once.
    update public.site_settings
       set value = (btrim(value)::bigint / 10)::text, updated_at = now()
     where key in ('points_min_redeem', 'points_claim_bonus')
       and btrim(value) ~ '^\d{1,9}$'
       and btrim(value)::bigint % 10 = 0;

    update public.site_settings s
       set value = l.ladder, updated_at = now()
      from (
        select string_agg((split_part(p, ':', 1)::bigint / 10)::text || ':' || (split_part(p, ':', 2)::bigint / 10)::text, ',') as ladder,
               bool_and(split_part(p, ':', 1)::bigint % 10 = 0 and split_part(p, ':', 2)::bigint % 10 = 0) as whole
          from public.site_settings x,
               regexp_split_to_table(btrim(x.value), ' *, *') as p
         where x.key = 'points_milestones'
           and btrim(x.value) ~ '^[0-9]{1,7}:[0-9]{1,7}( *, *[0-9]{1,7}:[0-9]{1,7})*$'
      ) l
     where s.key = 'points_milestones'
       and l.ladder is not null
       and l.whole;

    insert into public.site_settings (key, value) values ('points_earn_per_dollar', '1')
    on conflict (key) do update set value = '1', updated_at = now();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. The Order records its points: 10 points = S$1
-- ---------------------------------------------------------------------
alter table public.orders drop constraint if exists orders_points_discount_matches;
alter table public.orders
  add constraint orders_points_discount_matches check (points_discount * 10 = points_spent);

-- ---------------------------------------------------------------------
-- 3. Reserve, in 10-point (S$1) steps
-- ---------------------------------------------------------------------
-- As 20261021140000_points_spending.sql, with 10 points to the dollar:
--   step   not a positive multiple of 10 (S$1)
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
  if p_points is null or p_points <= 0 or p_points % 10 <> 0 then
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
  v_cap := greatest(least(floor(s.max_share * v_base), ceil(v_base) - 1), 0)::integer * 10;
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
-- 4. The defaults
-- ---------------------------------------------------------------------
-- As 20261031032017_points_never_expire.sql, with the defaults in the new
-- points: earn 1, fewest used 50, Claim bonus 100.
create or replace function public.points_settings()
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
    coalesce((select case when v ~ '^\d+(\.\d+)?$' then v::numeric end from s where key = 'points_earn_per_dollar'), 1),
    coalesce((select case when v ~ '^\d+$' then v::integer end from s where key = 'points_min_redeem'), 50),
    coalesce((select case when v ~ '^(0(\.\d+)?|1(\.0+)?)$' then v::numeric end from s where key = 'points_max_share'), 0.5),
    coalesce((select case when v ~ '^\d+$' then v::integer end from s where key = 'points_claim_bonus'), 100),
    coalesce((select case when v ~ '^\d+$' then v::integer end from s where key = 'points_claim_bonus_months'), 3);
$$;

revoke execute on function public.points_settings() from public, anon, authenticated;
grant execute on function public.points_settings() to service_role;
