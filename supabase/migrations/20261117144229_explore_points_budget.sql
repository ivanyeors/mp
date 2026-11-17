-- The Explore page's points on a budget (owner, 2026-11-17; ADR 0030,
-- amendment of 2026-11-17, "The budget").
--
-- 1. The Welcome bonus costs at most S$1,000, divided equally between the
--    ladder's four steps: S$250 (25,000 points) each. The dates and the points
--    stay; each step gives as many bonuses as S$250 buys at its size, rounded
--    down, so the ladder can never cost more than S$1,000:
--      1,000 points x 25 until the end of November
--        800 points x 31 until 14 December
--        600 points x 41 until the opening at 23:59 on 31 December
--        500 points x 50 through January
--    = 99,400 points (S$994) if every one is claimed. Nothing had been claimed
--    under the old allocations (500 each) when this was applied, so no step
--    starts past its new allocation. Re-running sets the same value.
--
-- 2. Flowers are an Easter egg for whoever finds them: 1 to 3 points a pick
--    (was 1 to 5), still once per flower per day, and at most 500 points (S$5)
--    per Customer, ever. The pick that reaches 500 gives what is left of it;
--    after that the Customer's flowers never give points again (reason
--    'spent'), and explore_flowers() says so (gives_points false). A lock per
--    Customer makes two picks at once count one after the other, so the cap
--    holds. No pick had been made when this was applied, so the picks table's
--    check narrows to 1 to 3 with nothing to break.
--
-- Signatures and return shapes are unchanged, so the code already deployed
-- keeps working (it reads 'spent' as "no points"). Server-only, as before.
-- Idempotent.

-- ---------------------------------------------------------------------
-- 1. The ladder
-- ---------------------------------------------------------------------
insert into public.site_settings (key, value) values
  ('points_welcome_steps',
   '2026-12-01T00:00+08:00|1000|25,2026-12-15T00:00+08:00|800|31,2026-12-31T23:59+08:00|600|41,2027-02-01T00:00+08:00|500|50')
on conflict (key) do update set value = excluded.value;

-- ---------------------------------------------------------------------
-- 2. Flowers
-- ---------------------------------------------------------------------
alter table public.explore_flower_picks drop constraint if exists explore_flower_picks_points_check;
alter table public.explore_flower_picks
  add constraint explore_flower_picks_points_check check (points between 1 and 3);

-- The most flower points one Customer can ever be given: 500 (S$5).
create or replace function public.explore_flower_cap()
returns integer
language sql
immutable
set search_path = public
as $$ select 500 $$;

revoke execute on function public.explore_flower_cap() from public, anon, authenticated;
grant execute on function public.explore_flower_cap() to service_role;

-- The flower points this Customer has been given so far.
create or replace function public.explore_flower_points(p_customer_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(l.points), 0)::integer
    from points_ledger l
   where l.customer_id = p_customer_id and l.kind = 'explore_flower';
$$;

revoke execute on function public.explore_flower_points(uuid) from public, anon, authenticated;
grant execute on function public.explore_flower_points(uuid) to service_role;

-- What the page shows: as before, and a pick gives no points once the
-- Customer's flowers have given the cap.
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
      and explore_flower_points(p_customer_id) < explore_flower_cap()
  from d, s;
$$;

revoke execute on function public.explore_flowers(uuid) from public, anon, authenticated;
grant execute on function public.explore_flowers(uuid) to service_role;

-- reason: 'picked', or why not: 'off' (points are not live), 'partner',
-- 'none' (no such flower today), 'spent' (this Customer's flowers have given
-- the cap), 'already'.
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
  v_had    integer;
  v_points integer;
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

  -- One pick at a time for this Customer, so the total below is the total this pick joins.
  perform pg_advisory_xact_lock(hashtext('points:explore_flower:' || p_customer_id::text));

  v_had := explore_flower_points(p_customer_id);
  if v_had >= explore_flower_cap() then
    return query select false, 0, 'spent'::text;
    return;
  end if;
  v_points := least(1 + floor(random() * 3)::integer, 3, explore_flower_cap() - v_had);

  insert into explore_flower_picks (customer_id, day, flower, points)
  values (p_customer_id, v_day, p_flower, v_points)
  on conflict do nothing;
  if not found then
    return query select false, 0, 'already'::text;
    return;
  end if;

  insert into points_ledger (customer_id, kind, points, note)
  values (p_customer_id, 'explore_flower', v_points, 'Picked a flower on Explore');
  return query select true, v_points, 'picked'::text;
end;
$$;

revoke execute on function public.pick_explore_flower(uuid, integer) from public, anon, authenticated;
grant execute on function public.pick_explore_flower(uuid, integer) to service_role;
