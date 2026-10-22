-- Loyalty points slice 03 (PRD-loyalty-points; ADR 0030 rules c, d, e, m):
-- the daily release of earned points and the clawback for a refund, asserted
-- against real Postgres (20261021130000_points_earning.sql).
--
-- Run from the repository root against a database with every migration
-- applied (a throwaway local one, never production). It prints one line,
-- `points slice 03 ok`:
--
--   psql -d <db> -v ON_ERROR_STOP=1 -q -X -t -A -f supabase/tests/loyalty-points/assert-03-earning.sql
--
-- The races are real, not simulated: two dblink sessions call the same
-- function at once, the second blocked behind the first's uncommitted work.
-- psql autocommits, so the fixtures are visible to those sessions; the script
-- deletes them at the end and puts the points settings back as it found them.
-- Needs a superuser (for dblink without a password) and the dblink extension.
--
-- The release writes every due Order in the database, so this needs one whose
-- only paid Orders since the launch date below are its own.

\set ON_ERROR_STOP 1
set client_min_messages = error;
create extension if not exists dblink;

-- ---------------------------------------------------------------- cleanup
delete from orders where order_number like 'PTS03-%';
delete from customers where email like '%@assertpts03.test';
delete from partner_users where email like '%@assertpts03.test';
delete from partners where name = 'PTS03 partner';
delete from auth.users where email like '%@assertpts03.test';

create temp table t_settings as
  select key, value from site_settings
   where key in ('points_enabled', 'points_launch_at', 'points_earn_per_dollar');

-- ---------------------------------------------------------------- structure
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.release_earned_points(timestamptz)',
    'public.clawback_points_for_refund(uuid, text, numeric)'
  ] loop
    assert not has_function_privilege('anon', f, 'execute'), 'anon executes ' || f;
    assert not has_function_privilege('authenticated', f, 'execute'), 'authenticated executes ' || f;
    assert has_function_privilege('service_role', f, 'execute'), 'service_role cannot execute ' || f;
  end loop;
end $$;

-- ---------------------------------------------------------------- fixtures
-- Launched 100 days ago, so every date below is relative to now().
insert into site_settings (key, value) values
  ('points_enabled', 'false'),
  ('points_launch_at', (now() - interval '100 days')::text),
  ('points_earn_per_dollar', '3')
on conflict (key) do update set value = excluded.value;

insert into customers (id, email, first_name) values
  -- A guest: no login yet.
  ('03030303-0000-4000-8000-000000000001', 'ann@assertpts03.test', 'Ann'),
  ('03030303-0000-4000-8000-000000000002', 'pat@assertpts03.test', 'Pat'),
  ('03030303-0000-4000-8000-000000000003', 'bo@assertpts03.test', 'Bo'),
  ('03030303-0000-4000-8000-000000000004', 'cy@assertpts03.test', 'Cy');
insert into partner_users (email, application_status) values ('pat@assertpts03.test', 'approved');
insert into partners (id, name) values ('03030303-9000-4000-8000-000000000001', 'PTS03 partner');

insert into orders (id, order_number, customer_id, email, status, currency, subtotal, discount_amount, total, shipping_address, paid_at, delivered_at, amount_refunded, self_purchase_partner_id) values
  -- Delivered 10 days ago: its window closes 20 days from now. 3 × (200 − 20) = 540.
  ('03030303-1000-4000-8000-000000000001', 'PTS03-1', '03030303-0000-4000-8000-000000000001', 'ann@assertpts03.test', 'delivered', 'SGD', 200, 20, 180, '{}', now() - interval '12 days', now() - interval '10 days', 0, null),
  -- Cancelled, though delivered long ago: never earns.
  ('03030303-1000-4000-8000-000000000002', 'PTS03-2', '03030303-0000-4000-8000-000000000003', 'bo@assertpts03.test', 'cancelled', 'SGD', 100, 0, 100, '{}', now() - interval '50 days', now() - interval '45 days', 0, null),
  -- Paid before launch: never earns.
  ('03030303-1000-4000-8000-000000000003', 'PTS03-3', '03030303-0000-4000-8000-000000000003', 'bo@assertpts03.test', 'delivered', 'SGD', 100, 0, 100, '{}', now() - interval '120 days', now() - interval '118 days', 0, null),
  -- A partner's self-purchase: never earns.
  ('03030303-1000-4000-8000-000000000004', 'PTS03-4', '03030303-0000-4000-8000-000000000003', 'bo@assertpts03.test', 'delivered', 'SGD', 100, 0, 100, '{}', now() - interval '50 days', now() - interval '45 days', 0, '03030303-9000-4000-8000-000000000001'),
  -- A partner Customer's Order: never earns.
  ('03030303-1000-4000-8000-000000000005', 'PTS03-5', '03030303-0000-4000-8000-000000000002', 'pat@assertpts03.test', 'delivered', 'SGD', 100, 0, 100, '{}', now() - interval '50 days', now() - interval '45 days', 0, null),
  -- Service lines only, paid 31 days ago, never delivered: due from its payment. 3 × 40 = 120.
  ('03030303-1000-4000-8000-000000000006', 'PTS03-6', '03030303-0000-4000-8000-000000000003', 'bo@assertpts03.test', 'confirmed', 'SGD', 40, 0, 40, '{}', now() - interval '31 days', null, 0, null),
  -- Goods, paid long ago, never delivered: pending with no date, never written.
  ('03030303-1000-4000-8000-000000000008', 'PTS03-8', '03030303-0000-4000-8000-000000000003', 'bo@assertpts03.test', 'processing', 'SGD', 100, 0, 100, '{}', now() - interval '60 days', null, 0, null),
  -- Refunded S$40 BEFORE its window closed: earns on the S$60 kept. 3 × 60 = 180.
  ('03030303-1000-4000-8000-000000000009', 'PTS03-9', '03030303-0000-4000-8000-000000000003', 'bo@assertpts03.test', 'partially_refunded', 'SGD', 100, 0, 100, '{}', now() - interval '35 days', now() - interval '31 days', 40, null),
  -- Cy's Order, for the races. 3 × 100 = 300.
  ('03030303-1000-4000-8000-000000000010', 'PTS03-10', '03030303-0000-4000-8000-000000000004', 'cy@assertpts03.test', 'delivered', 'SGD', 100, 0, 100, '{}', now() - interval '35 days', now() - interval '31 days', 0, null);
insert into order_items (order_id, sku, product_title, quantity, unit_price, total_price, kind, service_key)
select '03030303-1000-4000-8000-000000000006', 'SERVICE-X', 'Measurement service', 1, 40, 40, 'service', key
  from service_prices limit 1;
insert into order_items (order_id, sku, product_title, quantity, unit_price, total_price, kind) values
  ('03030303-1000-4000-8000-000000000001', 'SKU-1', 'Pillow', 1, 200, 200, 'goods'),
  ('03030303-1000-4000-8000-000000000008', 'SKU-8', 'Case', 1, 100, 100, 'goods'),
  ('03030303-1000-4000-8000-000000000009', 'SKU-9', 'Case', 1, 100, 100, 'goods'),
  ('03030303-1000-4000-8000-000000000010', 'SKU-10', 'Case', 1, 100, 100, 'goods');

create temp view t_earned as
  select o.order_number, l.points
    from points_ledger l join orders o on o.id = l.order_id
   where l.kind = 'earn' and o.order_number like 'PTS03-%';

-- ---------------------------------------------------------------- release
do $$
declare
  v integer;
  b record;
begin
  assert exists (select 1 from order_items where order_id = '03030303-1000-4000-8000-000000000006'),
    'fixture: a service line (needs a service_prices row)';

  -- Points off: nothing is written, however late it is.
  v := release_earned_points(now() + interval '400 days');
  assert v = 0, 'off: nothing written, ' || v;
  assert not exists (select 1 from t_earned), 'off: no earn entry';

  update site_settings set value = 'true' where key = 'points_enabled';

  select * into b from points_balance('03030303-0000-4000-8000-000000000001');
  assert b.available = 0 and b.pending = 540, 'Ann: 540 pending before release';

  -- Today: the three Orders whose windows have closed, and only those.
  v := release_earned_points(now());
  assert v = 3, 'today: three Orders released, ' || v;
  assert (select points from t_earned where order_number = 'PTS03-6') = 120, 'a service-only Order is due 30 days after payment';
  assert (select points from t_earned where order_number = 'PTS03-9') = 180, 'a refund before release is taken off the base';
  assert (select points from t_earned where order_number = 'PTS03-10') = 300, 'Cy earns 300';
  assert not exists (select 1 from t_earned where order_number = 'PTS03-1'), 'inside its window: nothing yet';

  -- The day before its window closes: still nothing.
  v := release_earned_points(now() + interval '19 days');
  assert v = 0 and not exists (select 1 from t_earned where order_number = 'PTS03-1'), 'the day before: nothing';

  -- The day after: once.
  v := release_earned_points(now() + interval '21 days');
  assert v = 1, 'the day after: one Order, ' || v;
  assert (select count(*) from t_earned where order_number = 'PTS03-1') = 1, 'the day after: one entry';
  assert (select points from t_earned where order_number = 'PTS03-1') = 540, 'floor(3 × (200 − 20))';

  -- A second run writes nothing.
  v := release_earned_points(now() + interval '21 days');
  assert v = 0, 'a re-run writes nothing, ' || v;
  assert (select count(*) from t_earned where order_number = 'PTS03-1') = 1, 'a re-run: still one entry';

  -- Never: cancelled, before launch, a self-purchase, a partner Customer, undelivered goods.
  v := release_earned_points(now() + interval '400 days');
  assert v = 0, 'nothing else ever earns, ' || v;
  assert not exists (select 1 from t_earned where order_number in ('PTS03-2', 'PTS03-3', 'PTS03-4', 'PTS03-5', 'PTS03-8')),
    'cancelled, pre-launch, self-purchase, partner Customer and undelivered Orders never earn';
  assert (select count(*) from t_earned) = 4, 'four earn entries in all';

  -- Pending moves to available, and a guest's points wait on their email:
  -- signing in links the login to the same Customer, and the balance is theirs.
  select * into b from points_balance('03030303-0000-4000-8000-000000000001');
  assert b.available = 540 and b.pending = 0, 'Ann: 540 available after release';
  insert into auth.users (id, email) values ('03030303-5000-4000-8000-000000000001', 'ann@assertpts03.test');
  update customers set auth_user_id = '03030303-5000-4000-8000-000000000001' where id = '03030303-0000-4000-8000-000000000001';
  assert (select available from points_balance(
            (select id from customers where auth_user_id = '03030303-5000-4000-8000-000000000001'))) = 540,
    'Ann, signed in: her guest Order''s points are hers';
end $$;

-- Two daily jobs at once write each Order once: the second waits on the
-- first's row locks, then finds the entries written.
insert into orders (id, order_number, customer_id, email, status, currency, subtotal, discount_amount, total, shipping_address, paid_at, delivered_at, amount_refunded) values
  ('03030303-1000-4000-8000-000000000011', 'PTS03-11', '03030303-0000-4000-8000-000000000003', 'bo@assertpts03.test', 'delivered', 'SGD', 10, 0, 10, '{}', now() - interval '35 days', now() - interval '31 days', 0);
insert into order_items (order_id, sku, product_title, quantity, unit_price, total_price, kind) values
  ('03030303-1000-4000-8000-000000000011', 'SKU-11', 'Case', 1, 10, 10, 'goods');

do $$
begin
  perform dblink_connect('a', 'dbname=' || current_database() || ' user=' || current_user);
  perform dblink_connect('b', 'dbname=' || current_database() || ' user=' || current_user);
  perform dblink_exec('a', 'begin');
end $$;
create temp table race_release_a as
  select * from dblink('a', $q$select release_earned_points(now())$q$) as t(written integer);
do $$
begin
  perform dblink_send_query('b', $q$select release_earned_points(now())$q$);
  perform pg_sleep(0.5);
  assert dblink_is_busy('b') = 1, 'release race: the second run waits on the first';
  perform dblink_exec('a', 'commit');
end $$;
create temp table race_release_b as
  select * from dblink_get_result('b') as t(written integer);
do $$
begin
  perform dblink_disconnect('a');
  perform dblink_disconnect('b');
  assert (select written from race_release_a) = 1, 'release race: the first run writes the Order';
  assert (select written from race_release_b) = 0, 'release race: the second writes nothing';
  assert (select count(*) from t_earned where order_number = 'PTS03-11') = 1, 'release race: one entry';
end $$;

-- ---------------------------------------------------------------- clawback (rule m)
-- Each refund is first rolled up onto the Order, as the webhook does before
-- it calls the clawback.
do $$
declare
  v integer;
  e record;
begin
  -- No earn entry: nothing to take back.
  v := clawback_points_for_refund('03030303-1000-4000-8000-000000000008', 're_pts03_none', 50);
  assert v = 0, 'no earn entry: 0';
  assert not exists (select 1 from points_ledger where refund_id = 're_pts03_none'), 'no earn entry: nothing written';

  -- A refund that landed before the release was already in the base: even a
  -- late call for it takes nothing.
  v := clawback_points_for_refund('03030303-1000-4000-8000-000000000009', 're_pts03_early', 40);
  assert v = 0, 'a refund before release takes nothing, ' || v;
  assert not exists (select 1 from points_ledger where refund_id = 're_pts03_early'), 'before release: nothing written';

  -- A refund after release: floor(3 × 30) = 90, once.
  update orders set amount_refunded = 30, status = 'partially_refunded' where order_number = 'PTS03-1';
  v := clawback_points_for_refund('03030303-1000-4000-8000-000000000001', 're_pts03_1', 30);
  assert v = 90, 'after release: floor(3 × 30), ' || v;
  select * into e from points_ledger where refund_id = 're_pts03_1';
  assert e.kind = 'clawback' and e.points = -90 and e.order_id = '03030303-1000-4000-8000-000000000001'
     and e.customer_id = '03030303-0000-4000-8000-000000000001' and e.note is null,
    'after release: one clawback entry, keyed on the refund, no note';

  -- A replayed webhook writes nothing.
  v := clawback_points_for_refund('03030303-1000-4000-8000-000000000001', 're_pts03_1', 30);
  assert v = 0, 'a replay takes nothing';
  assert (select count(*) from points_ledger where refund_id = 're_pts03_1') = 1, 'a replay writes nothing';

  -- Rounding down: floor(3 × 10.33) = 30.
  update orders set amount_refunded = 40.33 where order_number = 'PTS03-1';
  v := clawback_points_for_refund('03030303-1000-4000-8000-000000000001', 're_pts03_2', 10.33);
  assert v = 30, 'rounds down: floor(30.99), ' || v;

  -- Never more than the Order earned: 540 − 90 − 30 = 420 left, though the
  -- refund would call for 600. Ann has more than that from elsewhere.
  perform adjust_points('03030303-0000-4000-8000-000000000001', 1000, 'Goodwill', null);
  update orders set amount_refunded = 240.33, status = 'refunded' where order_number = 'PTS03-1';
  v := clawback_points_for_refund('03030303-1000-4000-8000-000000000001', 're_pts03_3', 200);
  assert v = 420, 'never more than the Order holds, ' || v;
  assert (select sum(points) from points_ledger where order_id = '03030303-1000-4000-8000-000000000001') = 0,
    'the Order is back to zero';
  v := clawback_points_for_refund('03030303-1000-4000-8000-000000000001', 're_pts03_4', 5);
  assert v = 0 and not exists (select 1 from points_ledger where refund_id = 're_pts03_4'), 'nothing left on the Order: nothing written';
  assert (select available from points_balance('03030303-0000-4000-8000-000000000001')) = 1000,
    'the rest of Ann''s balance is untouched';

  -- Never below zero, and the shortfall recorded. Bo holds 120 + 180 + 30
  -- (PTS03-6, PTS03-9, PTS03-11); spend all but 20 of it, then refund the
  -- whole service-only Order: 120 owed, 20 available.
  perform adjust_points('03030303-0000-4000-8000-000000000003', -310, 'Used elsewhere', null);
  update orders set amount_refunded = 40, status = 'refunded' where order_number = 'PTS03-6';
  v := clawback_points_for_refund('03030303-1000-4000-8000-000000000006', 're_pts03_6', 40);
  assert v = 20, 'takes only what is available, ' || v;
  select * into e from points_ledger where refund_id = 're_pts03_6';
  assert e.points = -20 and e.note like '%owed 120 points; 20 were available. 100 not taken back.',
    'the shortfall is recorded: ' || coalesce(e.note, 'no note');
  assert (select available from points_balance('03030303-0000-4000-8000-000000000003')) = 0, 'Bo at zero';
  -- Nothing left to take: nothing written, and the balance stays at zero.
  v := clawback_points_for_refund('03030303-1000-4000-8000-000000000006', 're_pts03_6b', 10);
  assert v = 0 and not exists (select 1 from points_ledger where refund_id = 're_pts03_6b'), 'at zero: nothing written';
  assert (select available from points_balance('03030303-0000-4000-8000-000000000003')) = 0, 'never below zero';

  -- A refund id is required; a zero refund takes nothing.
  begin
    perform clawback_points_for_refund('03030303-1000-4000-8000-000000000010', '  ', 10);
    assert false, 'a clawback needs the refund id';
  exception when check_violation then null;
  end;
  assert clawback_points_for_refund('03030303-1000-4000-8000-000000000010', 're_pts03_zero', 0) = 0, 'a zero refund takes nothing';
end $$;

-- Two refunds at once on one Customer: the second waits on the first's lock
-- and reads the balance it left. Cy holds 300 from PTS03-10; spend down to
-- 100, then two S$30 refunds each owe 90.
do $$ begin perform adjust_points('03030303-0000-4000-8000-000000000004', -200, 'Used elsewhere', null); end $$;
update orders set amount_refunded = 60, status = 'partially_refunded' where order_number = 'PTS03-10';

do $$
begin
  perform dblink_connect('a', 'dbname=' || current_database() || ' user=' || current_user);
  perform dblink_connect('b', 'dbname=' || current_database() || ' user=' || current_user);
  perform dblink_exec('a', 'begin');
end $$;
create temp table race_claw_a as
  select * from dblink('a', $q$select clawback_points_for_refund('03030303-1000-4000-8000-000000000010', 're_pts03_ra', 30)$q$)
    as t(taken integer);
do $$
begin
  perform dblink_send_query('b', $q$select clawback_points_for_refund('03030303-1000-4000-8000-000000000010', 're_pts03_rb', 30)$q$);
  perform pg_sleep(0.5);
  assert dblink_is_busy('b') = 1, 'clawback race: the second refund waits on the first';
  perform dblink_exec('a', 'commit');
end $$;
create temp table race_claw_b as
  select * from dblink_get_result('b') as t(taken integer);

do $$
begin
  perform dblink_disconnect('a');
  perform dblink_disconnect('b');
end $$;

do $$
begin
  assert (select taken from race_claw_a) = 90, 'clawback race: the first takes 90';
  assert (select taken from race_claw_b) = 10, 'clawback race: the second takes the 10 left, ' || (select taken from race_claw_b);
  assert (select note from points_ledger where refund_id = 're_pts03_rb') like '%owed 90 points; 10 were available.%',
    'clawback race: the second records its shortfall';
  assert (select available from points_balance('03030303-0000-4000-8000-000000000004')) = 0,
    'clawback race: never below zero';
end $$;

-- The same refund delivered twice at once: one entry.
do $$ begin perform adjust_points('03030303-0000-4000-8000-000000000004', 50, 'Goodwill', null); end $$;
update orders set amount_refunded = 65 where order_number = 'PTS03-10';
do $$
begin
  perform dblink_connect('a', 'dbname=' || current_database() || ' user=' || current_user);
  perform dblink_connect('b', 'dbname=' || current_database() || ' user=' || current_user);
  perform dblink_exec('a', 'begin');
end $$;
create temp table race_dup_a as
  select * from dblink('a', $q$select clawback_points_for_refund('03030303-1000-4000-8000-000000000010', 're_pts03_rd', 5)$q$)
    as t(taken integer);
do $$
begin
  perform dblink_send_query('b', $q$select clawback_points_for_refund('03030303-1000-4000-8000-000000000010', 're_pts03_rd', 5)$q$);
  perform pg_sleep(0.5);
  assert dblink_is_busy('b') = 1, 'duplicate race: the second delivery waits on the first';
  perform dblink_exec('a', 'commit');
end $$;
create temp table race_dup_b as
  select * from dblink_get_result('b') as t(taken integer);
do $$
begin
  perform dblink_disconnect('a');
  perform dblink_disconnect('b');
  assert (select taken from race_dup_a) = 15, 'duplicate race: the first takes floor(3 × 5), ' || (select taken from race_dup_a);
  assert (select taken from race_dup_b) = 0, 'duplicate race: the second takes nothing';
  assert (select count(*) from points_ledger where refund_id = 're_pts03_rd') = 1, 'duplicate race: one entry';
end $$;

-- ---------------------------------------------------------------- cleanup
delete from orders where order_number like 'PTS03-%';
delete from customers where email like '%@assertpts03.test';
delete from partner_users where email like '%@assertpts03.test';
delete from partners where name = 'PTS03 partner';
delete from auth.users where email like '%@assertpts03.test';
delete from site_settings where key in ('points_enabled', 'points_launch_at', 'points_earn_per_dollar');
insert into site_settings (key, value) select key, value from t_settings;

select 'points slice 03 ok';
