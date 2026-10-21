-- Loyalty points slice 04 (PRD-loyalty-points; ADR 0030 (h) to (l)): the
-- reservation, its release and the daily sweep, asserted against real
-- Postgres (20261021140000_points_spending.sql).
--
-- Run from the repository root against a database with every migration
-- applied (a throwaway local one, never production). It prints one line,
-- `points slice 04 ok`:
--
--   psql -d <db> -v ON_ERROR_STOP=1 -q -X -t -A -f supabase/tests/loyalty-points/assert-04-spending.sql
--
-- The race is real, not simulated: two dblink sessions reserve from one
-- balance for two Orders at once, the second blocked behind the first's
-- uncommitted spend. psql autocommits, so the fixtures are visible to those
-- sessions; the script deletes them at the end. Needs a superuser (for dblink
-- without a password) and the dblink contrib extension.
--
-- Mutation-checked: with the `perform 1 from customers … for update` line
-- removed from reserve_points and the migration re-applied, this script fails
-- at "race: the second reservation waits on the first" — the second session
-- no longer waits — and, with that assert skipped, at "race: one reserved,
-- one insufficient", since both sessions read 1,000 points and both reserve
-- 600. Restoring the line passes again.

\set ON_ERROR_STOP 1
set client_min_messages = error;
create extension if not exists dblink;

-- ---------------------------------------------------------------- cleanup
delete from orders where order_number like 'PTS04-%';
delete from customers where email like '%@assertpts04.test';
delete from partner_users where email ilike '%@assertpts04.test';

-- The settings this script changes go back to their seeded defaults, before
-- and after, as slice 02's assert expects them.
update site_settings set value = 'false' where key = 'points_enabled';
update site_settings set value = '500' where key = 'points_min_redeem';
update site_settings set value = '0.5' where key = 'points_max_share';

-- ---------------------------------------------------------------- structure
do $$
declare
  f text;
  c text;
begin
  foreach f in array array[
    'public.reserve_points(uuid, uuid, integer)',
    'public.release_points(uuid)',
    'public.release_stale_point_reservations(timestamptz)'
  ] loop
    assert not has_function_privilege('anon', f, 'execute'), 'anon executes ' || f;
    assert not has_function_privilege('authenticated', f, 'execute'), 'authenticated executes ' || f;
    assert has_function_privilege('service_role', f, 'execute'), 'service_role cannot execute ' || f;
  end loop;
  -- The customer reads what their own Order took off in points.
  foreach c in array array['points_spent', 'points_discount'] loop
    assert has_column_privilege('authenticated', 'public.orders', c, 'select'), 'authenticated reads orders.' || c;
    assert not has_column_privilege('anon', 'public.orders', c, 'select'), 'anon reads orders.' || c;
  end loop;
  -- The two columns cannot disagree (100 points = S$1, rule a).
  begin
    insert into orders (order_number, email, subtotal, total, shipping_address, points_spent, points_discount)
    values ('PTS04-BAD', 'x@assertpts04.test', 10, 10, '{}', 500, 4);
    assert false, 'orders: points_discount is points_spent / 100';
  exception when check_violation then null;
  end;
end $$;

-- ---------------------------------------------------------------- fixtures
insert into site_settings (key, value) values ('points_enabled', 'true'), ('points_min_redeem', '500'), ('points_max_share', '0.5')
on conflict (key) do update set value = excluded.value;

insert into customers (id, email, first_name) values
  ('04040404-0000-4000-8000-000000000001', 'ann@assertpts04.test', 'Ann'),
  ('04040404-0000-4000-8000-000000000002', 'bo@assertpts04.test', 'Bo'),
  ('04040404-0000-4000-8000-000000000003', 'cy@assertpts04.test', 'Cy'),
  ('04040404-0000-4000-8000-000000000004', 'pat@assertpts04.test', 'Pat');
insert into partner_users (email, application_status) values ('pat@assertpts04.test', 'approved');

do $$
begin
  perform adjust_points('04040404-0000-4000-8000-000000000001', 1000, 'assert 04: race balance', null);
  perform adjust_points('04040404-0000-4000-8000-000000000002', 100000, 'assert 04: sweep balance', null);
  perform adjust_points('04040404-0000-4000-8000-000000000003', 1000, 'assert 04: other customer', null);
end $$;

-- Every Order is pending unless a case moves it on. Ann's: the race. Bo's:
-- the cap, release and sweep. discount_amount holds the points discount and
-- any coupon, as checkout writes it.
insert into orders (id, order_number, customer_id, email, status, subtotal, discount_amount, total, shipping_address, points_spent, points_discount, created_at) values
  ('04040404-1000-4000-8000-0000000000a1', 'PTS04-A1', '04040404-0000-4000-8000-000000000001', 'ann@assertpts04.test', 'pending', 200, 6, 194, '{}', 600, 6, now()),
  ('04040404-1000-4000-8000-0000000000a2', 'PTS04-A2', '04040404-0000-4000-8000-000000000001', 'ann@assertpts04.test', 'pending', 200, 6, 194, '{}', 600, 6, now()),
  ('04040404-1000-4000-8000-0000000000a3', 'PTS04-A3', '04040404-0000-4000-8000-000000000001', 'ann@assertpts04.test', 'confirmed', 200, 6, 194, '{}', 600, 6, now()),
  ('04040404-1000-4000-8000-0000000000a4', 'PTS04-A4', '04040404-0000-4000-8000-000000000001', 'ann@assertpts04.test', 'pending', 200, 7, 193, '{}', 700, 7, now()),
  ('04040404-1000-4000-8000-0000000000c1', 'PTS04-C1', '04040404-0000-4000-8000-000000000003', 'cy@assertpts04.test', 'pending', 200, 6, 194, '{}', 600, 6, now()),
  ('04040404-1000-4000-8000-0000000000d1', 'PTS04-D1', '04040404-0000-4000-8000-000000000004', 'pat@assertpts04.test', 'pending', 200, 6, 194, '{}', 600, 6, now()),
  -- S$20 of products: half is S$10, so 1,100 points is over the cap.
  ('04040404-1000-4000-8000-0000000000b1', 'PTS04-B1', '04040404-0000-4000-8000-000000000002', 'bo@assertpts04.test', 'pending', 20, 11, 9, '{}', 1100, 11, now()),
  -- S$20 less a S$2 coupon: half of S$18 is S$9, so 900 points fits.
  ('04040404-1000-4000-8000-0000000000b2', 'PTS04-B2', '04040404-0000-4000-8000-000000000002', 'bo@assertpts04.test', 'pending', 20, 11, 9, '{}', 900, 9, now()),
  -- With a 100% share, points still never pay the whole of it.
  ('04040404-1000-4000-8000-0000000000b3', 'PTS04-B3', '04040404-0000-4000-8000-000000000002', 'bo@assertpts04.test', 'pending', 20, 20, 0, '{}', 2000, 20, now()),
  -- Release: expires; paid; never reserved.
  ('04040404-1000-4000-8000-0000000000e1', 'PTS04-E1', '04040404-0000-4000-8000-000000000002', 'bo@assertpts04.test', 'pending', 100, 5, 95, '{}', 500, 5, now()),
  ('04040404-1000-4000-8000-0000000000e2', 'PTS04-E2', '04040404-0000-4000-8000-000000000002', 'bo@assertpts04.test', 'pending', 100, 5, 95, '{}', 500, 5, now()),
  ('04040404-1000-4000-8000-0000000000e3', 'PTS04-E3', '04040404-0000-4000-8000-000000000002', 'bo@assertpts04.test', 'pending', 100, 0, 100, '{}', 0, 0, now()),
  -- The sweep.
  ('04040404-1000-4000-8000-0000000000f1', 'PTS04-S1', '04040404-0000-4000-8000-000000000002', 'bo@assertpts04.test', 'pending', 100, 5, 95, '{}', 500, 5, now() - interval '49 hours'),
  ('04040404-1000-4000-8000-0000000000f2', 'PTS04-S2', '04040404-0000-4000-8000-000000000002', 'bo@assertpts04.test', 'pending', 100, 5, 95, '{}', 500, 5, now() - interval '10 hours'),
  ('04040404-1000-4000-8000-0000000000f3', 'PTS04-S3', '04040404-0000-4000-8000-000000000002', 'bo@assertpts04.test', 'pending', 100, 5, 95, '{}', 500, 5, now() - interval '1 hour'),
  ('04040404-1000-4000-8000-0000000000f4', 'PTS04-S4', '04040404-0000-4000-8000-000000000002', 'bo@assertpts04.test', 'pending', 100, 5, 95, '{}', 500, 5, now() - interval '1 hour'),
  ('04040404-1000-4000-8000-0000000000f5', 'PTS04-S5', '04040404-0000-4000-8000-000000000002', 'bo@assertpts04.test', 'pending', 100, 5, 95, '{}', 500, 5, now() - interval '49 hours'),
  ('04040404-1000-4000-8000-0000000000f6', 'PTS04-S6', '04040404-0000-4000-8000-000000000002', 'bo@assertpts04.test', 'pending', 100, 5, 95, '{}', 500, 5, now() - interval '49 hours'),
  ('04040404-1000-4000-8000-0000000000f7', 'PTS04-S7', '04040404-0000-4000-8000-000000000002', 'bo@assertpts04.test', 'pending', 100, 5, 95, '{}', 500, 5, now() - interval '49 hours');

-- ---------------------------------------------------------------- refusals
do $$
declare
  v_before bigint := (select count(*) from points_ledger);
begin
  assert reserve_points('04040404-0000-4000-8000-0000000000ff', '04040404-1000-4000-8000-0000000000a1', 600) = 'customer',
    'refused: no such Customer';
  assert reserve_points('04040404-0000-4000-8000-000000000004', '04040404-1000-4000-8000-0000000000d1', 600) = 'partner',
    'refused: a partner (rule r)';
  assert reserve_points('04040404-0000-4000-8000-000000000001', '04040404-1000-4000-8000-0000000000a1', 550) = 'step',
    'refused: not a multiple of 100';
  assert reserve_points('04040404-0000-4000-8000-000000000001', '04040404-1000-4000-8000-0000000000a1', 0) = 'step',
    'refused: zero';
  assert reserve_points('04040404-0000-4000-8000-000000000001', '04040404-1000-4000-8000-0000000000a1', -600) = 'step',
    'refused: negative';
  assert reserve_points('04040404-0000-4000-8000-000000000001', '04040404-1000-4000-8000-0000000000a1', null) = 'step',
    'refused: null';
  assert reserve_points('04040404-0000-4000-8000-000000000001', '04040404-1000-4000-8000-0000000000a1', 400) = 'minimum',
    'refused: below points_min_redeem';
  assert reserve_points('04040404-0000-4000-8000-000000000001', '04040404-1000-4000-8000-0000000000c1', 600) = 'order',
    'refused: another Customer''s Order';
  assert reserve_points('04040404-0000-4000-8000-000000000001', '04040404-1000-4000-8000-0000000000a3', 600) = 'order',
    'refused: an Order that is not pending';
  assert reserve_points('04040404-0000-4000-8000-000000000001', '04040404-1000-4000-8000-0000000000a4', 600) = 'order',
    'refused: not the points the Order records';
  assert reserve_points('04040404-0000-4000-8000-000000000001', '04040404-1000-4000-8000-0000000000ff', 600) = 'order',
    'refused: no such Order';
  assert reserve_points('04040404-0000-4000-8000-000000000002', '04040404-1000-4000-8000-0000000000b1', 1100) = 'cap',
    'refused: over half the products after the coupon';

  update site_settings set value = '1' where key = 'points_max_share';
  assert reserve_points('04040404-0000-4000-8000-000000000002', '04040404-1000-4000-8000-0000000000b3', 2000) = 'cap',
    'refused: never the whole of the products, whatever the share';
  update site_settings set value = '0.5' where key = 'points_max_share';

  update site_settings set value = 'false' where key = 'points_enabled';
  assert reserve_points('04040404-0000-4000-8000-000000000002', '04040404-1000-4000-8000-0000000000b2', 900) = 'disabled',
    'refused: points switched off';
  update site_settings set value = 'true' where key = 'points_enabled';

  assert (select count(*) from points_ledger) = v_before, 'refusals write nothing';

  -- Within the cap, and a repeat call writes nothing more.
  assert reserve_points('04040404-0000-4000-8000-000000000002', '04040404-1000-4000-8000-0000000000b2', 900) = 'reserved',
    'reserved: half of the products after the coupon';
  assert reserve_points('04040404-0000-4000-8000-000000000002', '04040404-1000-4000-8000-0000000000b2', 900) = 'reserved',
    'reserved: a repeat call answers the same';
  assert (select count(*) from points_ledger where order_id = '04040404-1000-4000-8000-0000000000b2') = 1,
    'reserved: one spend, however often it is called';
  assert (select points from points_ledger where order_id = '04040404-1000-4000-8000-0000000000b2' and kind = 'spend') = -900,
    'reserved: the spend is negative';
end $$;

-- ---------------------------------------------------------------- the race (rule j)
do $$
begin
  perform dblink_connect('a', 'dbname=' || current_database() || ' user=' || current_user);
  perform dblink_connect('b', 'dbname=' || current_database() || ' user=' || current_user);
  perform dblink_exec('a', 'begin');
end $$;
create temp table race_a as
  select * from dblink('a', $q$select reserve_points('04040404-0000-4000-8000-000000000001', '04040404-1000-4000-8000-0000000000a1', 600)$q$)
    as t(outcome text);

-- b starts while a's spend is uncommitted, so it must wait on the Customer lock.
do $$
begin
  perform dblink_send_query('b', $q$select reserve_points('04040404-0000-4000-8000-000000000001', '04040404-1000-4000-8000-0000000000a2', 600)$q$);
  perform pg_sleep(0.5);
  assert dblink_is_busy('b') = 1, 'race: the second reservation waits on the first';
  perform dblink_exec('a', 'commit');
end $$;
create temp table race_b as
  select * from dblink_get_result('b') as t(outcome text);
do $$
begin
  perform dblink_disconnect('a');
  perform dblink_disconnect('b');
end $$;

do $$
declare
  a text := (select outcome from race_a);
  b text := (select outcome from race_b);
begin
  assert a = 'reserved' and b = 'insufficient', format('race: one reserved, one insufficient (a %s, b %s)', a, b);
  assert (select available from points_balance('04040404-0000-4000-8000-000000000001')) = 400,
    'race: 1,000 less one 600 spend';
  assert (select count(*) from points_ledger where customer_id = '04040404-0000-4000-8000-000000000001' and kind = 'spend') = 1,
    'race: exactly one spend';

  -- The losing tab's Order is given nothing back: it reserved nothing.
  assert not release_points('04040404-1000-4000-8000-0000000000a2'), 'race: nothing to release on the losing Order';
  -- The winner's Checkout expires: the 600 come back, once.
  update orders set status = 'cancelled', cancelled_at = now() where id = '04040404-1000-4000-8000-0000000000a1';
  assert release_points('04040404-1000-4000-8000-0000000000a1'), 'race: the expired Order releases';
  assert (select available from points_balance('04040404-0000-4000-8000-000000000001')) = 1000, 'race: the balance is whole again';
end $$;

-- ---------------------------------------------------------------- release (rule j)
do $$
begin
  -- Expired: given back once; a replayed webhook writes nothing.
  assert reserve_points('04040404-0000-4000-8000-000000000002', '04040404-1000-4000-8000-0000000000e1', 500) = 'reserved', 'E1 reserved';
  update orders set status = 'cancelled', cancelled_at = now() where id = '04040404-1000-4000-8000-0000000000e1';
  assert release_points('04040404-1000-4000-8000-0000000000e1'), 'release: an expired Checkout gives the points back';
  assert not release_points('04040404-1000-4000-8000-0000000000e1'), 'release: a replay writes nothing';
  assert (select count(*) from points_ledger where order_id = '04040404-1000-4000-8000-0000000000e1' and kind = 'spend_release') = 1,
    'release: exactly one release';
  assert (select points from points_ledger where order_id = '04040404-1000-4000-8000-0000000000e1' and kind = 'spend_release') = 500,
    'release: the release is the spend, positive';
  -- Once released, the Order cannot reserve again.
  update orders set status = 'pending', cancelled_at = null where id = '04040404-1000-4000-8000-0000000000e1';
  assert reserve_points('04040404-0000-4000-8000-000000000002', '04040404-1000-4000-8000-0000000000e1', 500) = 'order',
    'release: a released Order does not reserve twice';
  update orders set status = 'cancelled', cancelled_at = now() where id = '04040404-1000-4000-8000-0000000000e1';

  -- Paid: never given back, even once the shop cancels it (rule l; Staff adjust instead, rule n).
  assert reserve_points('04040404-0000-4000-8000-000000000002', '04040404-1000-4000-8000-0000000000e2', 500) = 'reserved', 'E2 reserved';
  update orders set status = 'confirmed', paid_at = now() where id = '04040404-1000-4000-8000-0000000000e2';
  assert not release_points('04040404-1000-4000-8000-0000000000e2'), 'release: never for a paid Order';
  update orders set status = 'cancelled', cancelled_at = now() where id = '04040404-1000-4000-8000-0000000000e2';
  assert not release_points('04040404-1000-4000-8000-0000000000e2'), 'release: never for a paid Order, cancelled later';
  update orders set status = 'refunded' where id = '04040404-1000-4000-8000-0000000000e2';
  assert not release_points('04040404-1000-4000-8000-0000000000e2'), 'release: never for a refunded Order';

  -- No reservation, no release.
  assert not release_points('04040404-1000-4000-8000-0000000000e3'), 'release: nothing reserved';
  assert not release_points('04040404-1000-4000-8000-0000000000ff'), 'release: no such Order';
  assert not exists (select 1 from points_ledger where order_id in ('04040404-1000-4000-8000-0000000000e2', '04040404-1000-4000-8000-0000000000e3')
                        and kind = 'spend_release'), 'release: nothing written for E2 or E3';
end $$;

-- ---------------------------------------------------------------- the sweep
do $$
declare
  o  record;
  n  integer;
  released text;
begin
  -- Reserve while pending, as checkout does, then move each Order on.
  for o in select id from orders where order_number like 'PTS04-S%' loop
    assert reserve_points('04040404-0000-4000-8000-000000000002', o.id, 500) = 'reserved', 'sweep fixture reserved';
  end loop;
  update orders set status = 'cancelled', cancelled_at = now() where order_number = 'PTS04-S3';
  update orders set status = 'payment_failed' where order_number = 'PTS04-S4';
  -- Stripe said money is in flight (authorised, unsettled) or charged a different total.
  update orders set needs_attention = true where order_number = 'PTS04-S5';
  insert into order_timeline (order_id, event_type, message)
  values ('04040404-1000-4000-8000-0000000000f6', 'total_mismatch', 'assert 04');
  update orders set status = 'confirmed', paid_at = now() where order_number = 'PTS04-S7';

  n := release_stale_point_reservations();
  select string_agg(o2.order_number, ',' order by o2.order_number) into released
    from points_ledger l join orders o2 on o2.id = l.order_id
   where l.kind = 'spend_release' and o2.order_number like 'PTS04-S%';
  assert released = 'PTS04-S1,PTS04-S3,PTS04-S4',
    'sweep: stale pending, cancelled and failed are released; recent, flagged, mismatched and paid are not: ' || coalesce(released, 'none');
  assert n >= 3, 'sweep: reports what it released, ' || n;

  assert release_stale_point_reservations() = 0, 'sweep: a re-run releases nothing';

  -- The clock is a parameter: two days on, the recent one is stale too.
  perform release_stale_point_reservations(now() + interval '50 hours');
  select string_agg(o2.order_number, ',' order by o2.order_number) into released
    from points_ledger l join orders o2 on o2.id = l.order_id
   where l.kind = 'spend_release' and o2.order_number like 'PTS04-S%';
  assert released = 'PTS04-S1,PTS04-S2,PTS04-S3,PTS04-S4', 'sweep: 48 hours from creation, ' || coalesce(released, 'none');

  -- Each release is the spend, once.
  assert not exists (
    select order_id from points_ledger where order_id is not null and kind = 'spend_release' group by order_id having count(*) > 1
  ), 'sweep: never two releases for one Order';
end $$;

-- ---------------------------------------------------------------- the balance never goes below zero
do $$
begin
  assert not exists (
    select customer_id from points_ledger where customer_id::text like '04040404-%' group by customer_id having sum(points) < 0
  ), 'no balance below zero';
end $$;

-- ---------------------------------------------------------------- cleanup
delete from orders where order_number like 'PTS04-%';
delete from customers where email like '%@assertpts04.test';
delete from partner_users where email ilike '%@assertpts04.test';
update site_settings set value = 'false' where key = 'points_enabled';
update site_settings set value = '500' where key = 'points_min_redeem';
update site_settings set value = '0.5' where key = 'points_max_share';

select 'points slice 04 ok';
