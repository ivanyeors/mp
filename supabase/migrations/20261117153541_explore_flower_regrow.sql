-- Explore's flowers grow back at random, at least a day after a pick
-- (owner, 2026-11-17; ADR 0030, decision 22, amended).
--
-- Until now a picked flower came back for that Customer at the next Singapore
-- midnight, so one picked at 23:50 was back ten minutes later. Now each pick
-- records when that flower grows back for them (`regrows_at`): a random time
-- 24 to 36 hours after the pick. Until then it is gone for them, and picking
-- it again is refused ('already'). The database draws the time; the page is
-- told only which flowers are gone, never when they return.
--
-- Unchanged: which days the cliff blooms and how many flowers (explore_bloom),
-- 1 to 3 points a pick, and at most 500 points (S$5) per Customer, ever.
-- No pick had been made when this was applied. Idempotent.

alter table public.explore_flower_picks add column if not exists regrows_at timestamptz;
update public.explore_flower_picks set regrows_at = created_at + interval '24 hours' where regrows_at is null;
alter table public.explore_flower_picks alter column regrows_at set not null;
create index if not exists explore_flower_picks_regrow_idx
  on public.explore_flower_picks (customer_id, flower, regrows_at);

-- What the page shows: today's flowers, the ones still gone for this Customer
-- (picked, and not yet grown back), and whether a pick would give points.
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
    coalesce((select array_agg(distinct p.flower::integer order by p.flower::integer)
                from explore_flower_picks p
               where p.customer_id = p_customer_id and p.regrows_at > now()), '{}'),
    s.live and p_customer_id is not null and not is_partner_customer(p_customer_id)
      and explore_flower_points(p_customer_id) < explore_flower_cap()
  from d, s;
$$;

revoke execute on function public.explore_flowers(uuid) from public, anon, authenticated;
grant execute on function public.explore_flowers(uuid) to service_role;

-- reason: 'picked', or why not: 'off' (points are not live), 'partner',
-- 'none' (no such flower today), 'spent' (this Customer's flowers have given
-- the cap), 'already' (this flower has not grown back for them yet).
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

  -- One pick at a time for this Customer, so the checks below hold for the insert.
  perform pg_advisory_xact_lock(hashtext('points:explore_flower:' || p_customer_id::text));

  v_had := explore_flower_points(p_customer_id);
  if v_had >= explore_flower_cap() then
    return query select false, 0, 'spent'::text;
    return;
  end if;
  if exists (select 1 from explore_flower_picks p
              where p.customer_id = p_customer_id and p.flower = p_flower and p.regrows_at > now()) then
    return query select false, 0, 'already'::text;
    return;
  end if;
  v_points := least(1 + floor(random() * 3)::integer, 3, explore_flower_cap() - v_had);

  insert into explore_flower_picks (customer_id, day, flower, points, regrows_at)
  values (p_customer_id, v_day, p_flower, v_points, now() + interval '24 hours' + random() * interval '12 hours')
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
