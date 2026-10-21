-- Loyalty points: expiry 24 months after the last purchase, and the clock the
-- reminders are keyed on (PRD-loyalty-points slice 07; ADR 0030 rules o, p).
--
-- The clock. points_clock(): `last_purchase_at` is the latest `paid_at` of the
-- Customer's paid Orders, or the Claim bonus's `created_at` if that is later.
-- Its entity is the Order, or the `claim_bonus` ledger entry, that set it. The
-- three reminder emails are keyed on that entity in `customer_emails`
-- (`points.expiry_3m`, `_2m`, `_1m`), so each new clock gets its own three.
-- points_balance() now reads its `last_purchase_at` from here and its
-- `expires_on` from points_expires_on(), so the Profile, the expiry and the
-- reminders count from one clock.
--
-- expires_on is the clock as a Singapore date plus points_expiry_months (24).
-- It is the last day the points can be used: "They expire on 12 March 2028
-- unless you make a purchase before then." The balance expires on the first run
-- of the daily job the day after.
--
-- expire_points(): one Customer. It takes the per-Customer lock adjust_points
-- and reserve_points take, re-reads the balance and the clock under it, and
-- writes one `expire` entry for the whole available balance once the expiry
-- date has passed. A re-run finds a zero balance and writes nothing. A `spend`
-- reserved at that moment is already debited, so it is untouched; if its
-- Checkout is later given back (`spend_release`), the next run expires that too.
-- expire_due_points() is the daily sweep over every Customer whose clock ran out.
--
-- points_expiry_reminder_candidates(): every Customer holding points whose
-- expiry date falls within the next p_within_months (the earliest reminder), with
-- the clock and what the reminder needs to reach them. Which reminder is due,
-- the minimum balance and Marketing consent are decided in code
-- (lib/points/expiry.ts), with the consent rule the check-up reminder uses.
--
-- Nothing expires, and nobody is listed, while points are off: the customer
-- cannot use the balance then, so the clock is not held against them.
-- A Customer with no paid Order and no Claim bonus (a Staff adjustment only)
-- has no clock, and their balance does not expire. Partners hold no points
-- (rule r) and are never reminded.
--
-- Server-only, like the ledger: nothing granted to anon or authenticated.
--
-- Idempotent.

-- ---------------------------------------------------------------------
-- The clock
-- ---------------------------------------------------------------------
-- One row, or none when the Customer has neither a paid Order nor a Claim
-- bonus. A tie goes to the Order.
create or replace function public.points_clock(p_customer_id uuid)
returns table (last_purchase_at timestamptz, entity_id uuid, entity_kind text)
language sql
stable
security definer
set search_path = public
as $$
  select c.at, c.entity_id, c.kind
    from (
      select o.paid_at as at, o.id as entity_id, 'order'::text as kind
        from orders o
       where o.customer_id = p_customer_id
         and o.paid_at is not null
         and o.status::text not in ('pending', 'cancelled', 'payment_failed')
      union all
      select l.created_at, l.id, 'claim_bonus'::text
        from points_ledger l
       where l.customer_id = p_customer_id
         and l.kind = 'claim_bonus'
    ) c
   order by c.at desc, c.kind desc, c.entity_id
   limit 1;
$$;

revoke execute on function public.points_clock(uuid) from public, anon, authenticated;
grant execute on function public.points_clock(uuid) to service_role;

-- The last day the points can be used: the clock as a Singapore date plus the
-- expiry months (a month-end clock ends on the shorter month's last day).
create or replace function public.points_expires_on(p_last_purchase_at timestamptz, p_months integer)
returns date
language sql
immutable
set search_path = public
as $$
  select ((p_last_purchase_at at time zone 'Asia/Singapore') + make_interval(months => p_months))::date;
$$;

revoke execute on function public.points_expires_on(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.points_expires_on(timestamptz, integer) to service_role;

-- ---------------------------------------------------------------------
-- The balance, on the shared clock
-- ---------------------------------------------------------------------
-- As slice 02 defined it (20261021120000_points_ledger.sql), with
-- `last_purchase_at` and `expires_on` read from the clock above.
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
  lp as (select (select c.last_purchase_at from points_clock(p_customer_id) c) as at)
  select a.available, p.pending, lp.at,
         case when a.available > 0 and lp.at is not null
              then points_expires_on(lp.at, s.expiry_months)
         end
    from a, p, lp, s;
$$;

revoke execute on function public.points_balance(uuid) from public, anon, authenticated;
grant execute on function public.points_balance(uuid) to service_role;

-- ---------------------------------------------------------------------
-- Expire (rule o)
-- ---------------------------------------------------------------------
-- Returns the points expired: 0 while points are off, for no such Customer, a
-- zero balance, no clock, or a clock with time left. p_now is for tests; the job
-- passes its own clock.
create or replace function public.expire_points(p_customer_id uuid, p_now timestamptz default now())
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  s           record;
  v_clock     record;
  v_available integer;
  v_expires   date;
  v_today     date := (p_now at time zone 'Asia/Singapore')::date;
begin
  select * into s from points_settings();
  if not s.enabled then
    return 0;
  end if;

  perform 1 from customers where id = p_customer_id for update;
  if not found then
    return 0;
  end if;

  select coalesce(sum(points), 0)::integer into v_available from points_ledger where customer_id = p_customer_id;
  if v_available <= 0 then
    return 0;
  end if;

  select * into v_clock from points_clock(p_customer_id);
  if not found or v_clock.last_purchase_at is null then
    return 0;
  end if;
  v_expires := points_expires_on(v_clock.last_purchase_at, s.expiry_months);
  if v_today <= v_expires then
    return 0;
  end if;

  insert into points_ledger (customer_id, kind, points, note)
  values (
    p_customer_id,
    'expire',
    -v_available,
    format(
      'No purchase for %s months: the last was on %s.',
      s.expiry_months,
      to_char(v_clock.last_purchase_at at time zone 'Asia/Singapore', 'FMDD Mon YYYY')
    )
  );
  return v_available;
end;
$$;

revoke execute on function public.expire_points(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.expire_points(uuid, timestamptz) to service_role;

-- The daily sweep: expire_points for every Customer holding points whose clock
-- ran out before today. Returns how many balances it expired. Safe to re-run.
create or replace function public.expire_due_points(p_now timestamptz default now())
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  s       record;
  r       record;
  v_today date := (p_now at time zone 'Asia/Singapore')::date;
  v_done  integer := 0;
begin
  select * into s from points_settings();
  if not s.enabled then
    return 0;
  end if;

  for r in
    select b.customer_id
      from (
        select l.customer_id from points_ledger l group by l.customer_id having sum(l.points) > 0
      ) b
      cross join lateral points_clock(b.customer_id) c
     where v_today > points_expires_on(c.last_purchase_at, s.expiry_months)
     order by b.customer_id
  loop
    if expire_points(r.customer_id, p_now) > 0 then
      v_done := v_done + 1;
    end if;
  end loop;
  return v_done;
end;
$$;

revoke execute on function public.expire_due_points(timestamptz) from public, anon, authenticated;
grant execute on function public.expire_due_points(timestamptz) to service_role;

-- ---------------------------------------------------------------------
-- Remind (rule p): who may be due a reminder
-- ---------------------------------------------------------------------
-- Every non-partner Customer holding points whose expiry date is today or
-- within the next p_within_months (the earliest reminder's day has come),
-- soonest first, with their clock. Nothing while points are off.
create or replace function public.points_expiry_reminder_candidates(
  p_now           timestamptz default now(),
  p_within_months integer default 3
)
returns table (
  customer_id      uuid,
  email            text,
  first_name       text,
  locale           text,
  marketing_email  text,
  aftercare_email  boolean,
  available        integer,
  last_purchase_at timestamptz,
  clock_entity_id  uuid,
  clock_kind       text,
  expires_on       date
)
language sql
stable
security definer
set search_path = public
as $$
  with s as (select * from points_settings()),
  t as (select (p_now at time zone 'Asia/Singapore')::date as today),
  b as (
    select l.customer_id, sum(l.points)::integer as available
      from points_ledger l
     group by l.customer_id
    having sum(l.points) > 0
  ),
  k as (
    select b.customer_id, b.available, c.last_purchase_at, c.entity_id, c.entity_kind,
           points_expires_on(c.last_purchase_at, s.expiry_months) as expires_on
      from b
      cross join s
      cross join lateral points_clock(b.customer_id) c
     where s.enabled
  )
  select cu.id, cu.email, cu.first_name, cu.locale, cu.marketing_email, cu.aftercare_email,
         k.available, k.last_purchase_at, k.entity_id, k.entity_kind, k.expires_on
    from k
    join customers cu on cu.id = k.customer_id
    cross join t
   where k.expires_on >= t.today
     -- The earliest reminder's day has come: the same subtraction the code
     -- uses for each reminder's day (lib/points/expiry.ts, reminderDueOn), so
     -- a month-end expiry is listed on exactly the day its first one is due.
     and (k.expires_on - make_interval(months => greatest(coalesce(p_within_months, 0), 0)))::date <= t.today
     and not is_partner_customer(cu.id)
   order by k.expires_on, cu.id;
$$;

revoke execute on function public.points_expiry_reminder_candidates(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.points_expiry_reminder_candidates(timestamptz, integer) to service_role;
