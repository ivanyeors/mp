-- Loyalty points slice 07 (PRD-loyalty-points; ADR 0030 rules o, p): the
-- clock, expiry, and who may be due a reminder, asserted against real
-- Postgres (20261021170000_points_expiry.sql).
--
-- Run from the repository root against a database with every migration
-- applied (a throwaway local one, never production). It prints one line,
-- `points slice 07 ok`:
--
--   psql -d <db> -v ON_ERROR_STOP=1 -q -X -t -A -f supabase/tests/loyalty-points/assert-07-expiry.sql
--
-- The race is real, not simulated: two dblink sessions expire one balance at
-- once, the second blocked behind the first's uncommitted entry. Mutation
-- check: remove `for update` from expire_points and the race fails at "race:
-- the second waits on the first". psql autocommits, so the fixtures are
-- visible to those sessions; the script deletes them at the end and puts the
-- points settings back as it found them. Needs a superuser (for dblink without
-- a password) and the dblink extension.
--
-- The sweep expires every due balance in the database, so this needs one
-- whose only points are its own.

\set ON_ERROR_STOP 1
set client_min_messages = error;
create extension if not exists dblink;

-- ---------------------------------------------------------------- cleanup
delete from orders where order_number like 'PTS07-%';
delete from customers where email like '%@assertpts07.test';
delete from partner_users where email like '%@assertpts07.test';

create temp table t_settings as
  select key, value from site_settings
   where key in ('points_enabled', 'points_launch_at', 'points_expiry_months', 'points_min_redeem');

-- A Singapore wall-clock time on a Singapore date.
create function pg_temp.sgt(d date, t time default '12:00') returns timestamptz
language sql immutable as $$ select (d + t) at time zone 'Asia/Singapore' $$;

-- ---------------------------------------------------------------- structure
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.points_clock(uuid)',
    'public.points_expires_on(timestamptz, integer)',
    'public.points_balance(uuid)',
    'public.expire_points(uuid, timestamptz)',
    'public.expire_due_points(timestamptz)',
    'public.points_expiry_reminder_candidates(timestamptz, integer)'
  ] loop
    assert not has_function_privilege('anon', f, 'execute'), 'anon executes ' || f;
    assert not has_function_privilege('authenticated', f, 'execute'), 'authenticated executes ' || f;
    assert has_function_privilege('service_role', f, 'execute'), 'service_role cannot execute ' || f;
  end loop;
  assert (select bool_and(prosecdef) from pg_proc
           where pronamespace = 'public'::regnamespace
             and proname in ('points_clock', 'points_balance', 'expire_points', 'expire_due_points',
                             'points_expiry_reminder_candidates')) = true,
    'the ledger readers are security definer';
end $$;

-- ---------------------------------------------------------------- fixtures
insert into site_settings (key, value) values
  ('points_enabled', 'true'),
  ('points_launch_at', (now() - interval '900 days')::text),
  ('points_expiry_months', '24'),
  ('points_min_redeem', '500')
on conflict (key) do update set value = excluded.value;

-- Every date is relative to today in Singapore. Most clocks started 24 months
-- less 10 days ago, so those balances expire in about 10 days.
create temp table t_days as
  select (now() at time zone 'Asia/Singapore')::date as today,
         ((now() at time zone 'Asia/Singapore')::date - interval '24 months' + interval '10 days')::date as d_a,
         ((now() at time zone 'Asia/Singapore')::date - interval '24 months' + interval '20 days')::date as d_c,
         ((now() at time zone 'Asia/Singapore')::date - interval '18 months')::date as d_h;

insert into customers (id, email, first_name, marketing_email, marketing_email_source, marketing_email_updated_at) values
  ('07070707-0000-4000-8000-000000000001', 'ann@assertpts07.test', 'Ann', 'subscribed', 'account', now()),
  ('07070707-0000-4000-8000-000000000002', 'bo@assertpts07.test', 'Bo', 'subscribed', 'account', now()),
  ('07070707-0000-4000-8000-000000000003', 'cy@assertpts07.test', 'Cy', 'subscribed', 'account', now()),
  ('07070707-0000-4000-8000-000000000004', 'di@assertpts07.test', 'Di', 'subscribed', 'account', now()),
  ('07070707-0000-4000-8000-000000000005', 'ed@assertpts07.test', 'Ed', 'unsubscribed', 'account', now()),
  ('07070707-0000-4000-8000-000000000006', 'fe@assertpts07.test', 'Fe', 'subscribed', 'account', now()),
  ('07070707-0000-4000-8000-000000000007', 'gil@assertpts07.test', 'Gil', 'not_subscribed', null, null),
  ('07070707-0000-4000-8000-000000000008', 'pat@assertpts07.test', 'Pat', 'subscribed', 'account', now()),
  ('07070707-0000-4000-8000-000000000009', 'hy@assertpts07.test', 'Hy', 'subscribed', 'account', now()),
  ('07070707-0000-4000-8000-000000000010', 'ivy@assertpts07.test', 'Ivy', 'subscribed', 'account', now());
-- Pat is a partner (rule r): never reminded.
insert into partner_users (email, application_status) values ('pat@assertpts07.test', 'approved');

insert into orders (id, order_number, customer_id, email, status, currency, subtotal, discount_amount, total, shipping_address, paid_at, delivered_at)
select v.id::uuid, v.n, v.c::uuid, v.e, v.s::order_status, 'SGD', 100, 0, 100, '{}', v.paid, v.paid
  from t_days d,
  lateral (values
    ('07070707-1000-4000-8000-000000000001', 'PTS07-A1', '07070707-0000-4000-8000-000000000001', 'ann@assertpts07.test', 'delivered', pg_temp.sgt(d.d_a, '15:00')),
    ('07070707-1000-4000-8000-000000000002', 'PTS07-B1', '07070707-0000-4000-8000-000000000002', 'bo@assertpts07.test', 'delivered', pg_temp.sgt(d.d_a, '15:00')),
    ('07070707-1000-4000-8000-000000000005', 'PTS07-E1', '07070707-0000-4000-8000-000000000005', 'ed@assertpts07.test', 'delivered', pg_temp.sgt(d.d_a, '10:00')),
    ('07070707-1000-4000-8000-000000000006', 'PTS07-F1', '07070707-0000-4000-8000-000000000006', 'fe@assertpts07.test', 'delivered', pg_temp.sgt(d.d_a, '15:00')),
    ('07070707-1000-4000-8000-000000000007', 'PTS07-G1', '07070707-0000-4000-8000-000000000007', 'gil@assertpts07.test', 'delivered', pg_temp.sgt(d.d_a, '15:00')),
    ('07070707-1000-4000-8000-000000000008', 'PTS07-P1', '07070707-0000-4000-8000-000000000008', 'pat@assertpts07.test', 'delivered', pg_temp.sgt(d.d_a, '15:00')),
    ('07070707-1000-4000-8000-000000000009', 'PTS07-H1', '07070707-0000-4000-8000-000000000009', 'hy@assertpts07.test', 'delivered', pg_temp.sgt(d.d_h, '15:00')),
    ('07070707-1000-4000-8000-000000000010', 'PTS07-I1', '07070707-0000-4000-8000-000000000010', 'ivy@assertpts07.test', 'delivered', pg_temp.sgt(d.d_a, '15:00')),
    -- Cancelled after payment, and later than every clock: never a purchase.
    ('07070707-1000-4000-8000-000000000011', 'PTS07-A2', '07070707-0000-4000-8000-000000000001', 'ann@assertpts07.test', 'cancelled', pg_temp.sgt(d.d_a + 5, '15:00'))
  ) as v(id, n, c, e, s, paid);
-- Fe's Checkout, still open: its points are reserved.
insert into orders (id, order_number, customer_id, email, status, currency, subtotal, discount_amount, total, shipping_address, paid_at, points_spent, points_discount)
values ('07070707-1000-4000-8000-000000000016', 'PTS07-F2', '07070707-0000-4000-8000-000000000006', 'fe@assertpts07.test',
        'pending', 'SGD', 100, 5, 95, '{}', null, 500, 5);

insert into points_ledger (customer_id, kind, points, order_id, note, created_at)
select v.c::uuid, v.k, v.p, v.o::uuid, v.note, coalesce(v.at, now())
  from t_days d,
  lateral (values
    ('07070707-0000-4000-8000-000000000001', 'earn', 2130, '07070707-1000-4000-8000-000000000001', null, null::timestamptz),
    ('07070707-0000-4000-8000-000000000002', 'earn', 1000, '07070707-1000-4000-8000-000000000002', null, null),
    -- Cy holds a Claim bonus and nothing else.
    ('07070707-0000-4000-8000-000000000003', 'claim_bonus', 1000, null, 'Claim bonus', pg_temp.sgt(d.d_c, '09:00')),
    -- Di holds a Staff adjustment only: no clock.
    ('07070707-0000-4000-8000-000000000004', 'adjust', 800, null, 'Goodwill', null),
    -- Ed's Claim bonus came an hour after his Order: it is his clock.
    ('07070707-0000-4000-8000-000000000005', 'claim_bonus', 1000, null, 'Claim bonus', pg_temp.sgt(d.d_a, '11:00')),
    ('07070707-0000-4000-8000-000000000006', 'earn', 1500, '07070707-1000-4000-8000-000000000006', null, null),
    ('07070707-0000-4000-8000-000000000006', 'spend', -500, '07070707-1000-4000-8000-000000000016', null, null),
    ('07070707-0000-4000-8000-000000000007', 'earn', 700, '07070707-1000-4000-8000-000000000007', null, null),
    ('07070707-0000-4000-8000-000000000008', 'earn', 900, '07070707-1000-4000-8000-000000000008', null, null),
    ('07070707-0000-4000-8000-000000000009', 'earn', 600, '07070707-1000-4000-8000-000000000009', null, null),
    ('07070707-0000-4000-8000-000000000010', 'earn', 600, '07070707-1000-4000-8000-000000000010', null, null),
    ('07070707-0000-4000-8000-000000000010', 'adjust', -600, null, 'Used in store', null)
  ) as v(c, k, p, o, note, at);

create temp view t_expired as
  select l.customer_id, l.points, l.note, l.created_at
    from points_ledger l join customers c on c.id = l.customer_id
   where l.kind = 'expire' and c.email like '%@assertpts07.test';

-- ---------------------------------------------------------------- the clock
do $$
declare
  d    record;
  k   record;
  b   record;
  cy  uuid := '07070707-0000-4000-8000-000000000003';
  ed  uuid := '07070707-0000-4000-8000-000000000005';
  v_bonus uuid;
begin
  select * into d from t_days;
  -- An Order: the latest paid one (a cancelled one never counts).
  select * into k from points_clock('07070707-0000-4000-8000-000000000001');
  assert k.entity_id = '07070707-1000-4000-8000-000000000001' and k.entity_kind = 'order', 'clock: Ann''s Order';
  assert k.last_purchase_at = pg_temp.sgt(d.d_a, '15:00'), 'clock: its paid_at';
  select * into b from points_balance('07070707-0000-4000-8000-000000000001');
  assert b.available = 2130 and b.last_purchase_at = k.last_purchase_at, 'balance: reads the same clock';
  assert b.expires_on = (d.d_a + interval '24 months')::date, 'balance: expires 24 months on';
  assert b.expires_on = points_expires_on(k.last_purchase_at, 24), 'balance: one expiry rule';

  -- A Claim bonus alone starts a clock.
  select id into v_bonus from points_ledger where customer_id = cy and kind = 'claim_bonus';
  select * into k from points_clock(cy);
  assert k.entity_id = v_bonus and k.entity_kind = 'claim_bonus', 'clock: Cy''s Claim bonus';
  assert (select expires_on from points_balance(cy)) = (d.d_c + interval '24 months')::date, 'clock: Cy expires 24 months after the bonus';

  -- The later of the two: Ed's Claim bonus, an hour after his Order.
  select id into v_bonus from points_ledger where customer_id = ed and kind = 'claim_bonus';
  select * into k from points_clock(ed);
  assert k.entity_id = v_bonus and k.entity_kind = 'claim_bonus', 'clock: the Claim bonus when it is later';
  -- A tie goes to the Order.
  insert into orders (id, order_number, customer_id, email, status, currency, subtotal, discount_amount, total, shipping_address, paid_at)
  values ('07070707-1000-4000-8000-000000000015', 'PTS07-E2', ed, 'ed@assertpts07.test', 'confirmed', 'SGD', 20, 0, 20, '{}',
          pg_temp.sgt(d.d_a, '11:00'));
  select * into k from points_clock(ed);
  assert k.entity_id = '07070707-1000-4000-8000-000000000015' and k.entity_kind = 'order', 'clock: a tie goes to the Order';

  -- No paid Order and no Claim bonus: no clock, nothing to expire.
  assert not exists (select 1 from points_clock('07070707-0000-4000-8000-000000000004')), 'clock: none for Di';
  select * into b from points_balance('07070707-0000-4000-8000-000000000004');
  assert b.available = 800 and b.expires_on is null and b.last_purchase_at is null, 'balance: Di never expires';
end $$;

-- ---------------------------------------------------------------- who may be due a reminder
do $$
declare
  d    record;
  exp  date;
  ids  text[];
  r    record;
begin
  select * into d from t_days;
  exp := (d.d_a + interval '24 months')::date;
  select array_agg(c.email order by c.email) into ids
    from points_expiry_reminder_candidates(now(), 3) x join customers c on c.id = x.customer_id
   where c.email like '%@assertpts07.test';
  -- Everyone holding points with an expiry date in the next 3 months, consent
  -- or not (that is decided in code); never a partner (Pat), no clock (Di), a
  -- zero balance (Ivy), or an expiry 6 months away (Hy).
  assert ids = array['ann@assertpts07.test', 'bo@assertpts07.test', 'cy@assertpts07.test', 'ed@assertpts07.test',
                     'fe@assertpts07.test', 'gil@assertpts07.test'],
    'candidates: ' || array_to_string(ids, ', ');

  select * into r from points_expiry_reminder_candidates(now(), 3) where customer_id = '07070707-0000-4000-8000-000000000006';
  assert r.available = 1000, 'candidates: Fe''s reserved points are already out of her balance';
  assert r.expires_on = exp and r.clock_entity_id = '07070707-1000-4000-8000-000000000006' and r.clock_kind = 'order',
    'candidates: Fe''s clock';
  assert r.email = 'fe@assertpts07.test' and r.first_name = 'Fe' and r.locale = 'en-US'
     and r.marketing_email = 'subscribed' and r.aftercare_email, 'candidates: what the email needs';
  select * into r from points_expiry_reminder_candidates(now(), 3) where customer_id = '07070707-0000-4000-8000-000000000003';
  assert r.clock_kind = 'claim_bonus' and r.clock_entity_id = (select id from points_ledger where customer_id = r.customer_id and kind = 'claim_bonus'),
    'candidates: Cy''s clock is her Claim bonus';

  -- Soonest first.
  assert (select bool_and(ok) from (
            select expires_on >= lag(expires_on, 1, expires_on) over (order by n) as ok
              from (select expires_on, row_number() over () as n from points_expiry_reminder_candidates(now(), 3)) s
          ) o), 'candidates: soonest first';

  -- The expiry day itself is still listed; the day after is not.
  assert exists (select 1 from points_expiry_reminder_candidates(pg_temp.sgt(exp), 3)
                  where customer_id = '07070707-0000-4000-8000-000000000001'), 'candidates: listed on the expiry day';
  assert not exists (select 1 from points_expiry_reminder_candidates(pg_temp.sgt(exp + 1), 3)
                      where customer_id = '07070707-0000-4000-8000-000000000001'), 'candidates: not after it';
  -- More than 3 months ahead is not listed until it is within reach.
  assert not exists (select 1 from points_expiry_reminder_candidates(pg_temp.sgt((exp - interval '3 months')::date - 1), 3)
                      where customer_id = '07070707-0000-4000-8000-000000000001'), 'candidates: not 3 months and a day ahead';
  assert exists (select 1 from points_expiry_reminder_candidates(pg_temp.sgt((exp - interval '3 months')::date), 3)
                  where customer_id = '07070707-0000-4000-8000-000000000001'), 'candidates: listed 3 months ahead';
end $$;

-- ---------------------------------------------------------------- points off
do $$
declare
  far timestamptz := now() + interval '5 years';
begin
  update site_settings set value = 'false' where key = 'points_enabled';
  assert expire_due_points(far) = 0, 'off: the sweep expires nothing';
  assert expire_points('07070707-0000-4000-8000-000000000001', far) = 0, 'off: nothing expires';
  assert not exists (select 1 from points_expiry_reminder_candidates(now(), 3)), 'off: nobody is listed';
  assert not exists (select 1 from t_expired), 'off: no expire entry';
  update site_settings set value = 'true' where key = 'points_enabled';
end $$;

-- ---------------------------------------------------------------- the race
-- Gil's balance, expired by two sessions at once: one entry.
create temp table t_race as
  select pg_temp.sgt(expires_on + 1, '10:00') as at from points_balance('07070707-0000-4000-8000-000000000007');
do $$
begin
  perform dblink_connect('a', 'dbname=' || current_database() || ' user=' || current_user);
  perform dblink_connect('b', 'dbname=' || current_database() || ' user=' || current_user);
  perform dblink_exec('a', 'begin');
end $$;
create temp table race_a as
  select * from dblink('a', format('select expire_points(%L, %L)', '07070707-0000-4000-8000-000000000007', (select at from t_race)))
    as t(expired integer);
do $$
begin
  perform dblink_send_query('b', format('select expire_points(%L, %L)', '07070707-0000-4000-8000-000000000007', (select at from t_race)));
  perform pg_sleep(0.5);
  assert dblink_is_busy('b') = 1, 'race: the second waits on the first';
  perform dblink_exec('a', 'commit');
end $$;
create temp table race_b as
  select * from dblink_get_result('b') as t(expired integer);
do $$
begin
  perform dblink_disconnect('a');
  perform dblink_disconnect('b');
  assert (select expired from race_a) = 700, 'race: the first expires the 700';
  assert (select expired from race_b) = 0, 'race: the second finds nothing left';
  assert (select count(*) from t_expired where customer_id = '07070707-0000-4000-8000-000000000007') = 1, 'race: one entry';
  assert (select available from points_balance('07070707-0000-4000-8000-000000000007')) = 0, 'race: Gil at zero';
end $$;

-- ---------------------------------------------------------------- expiry (rule o)
do $$
declare
  d    record;
  exp  date;
  ann  uuid := '07070707-0000-4000-8000-000000000001';
  bo   uuid := '07070707-0000-4000-8000-000000000002';
  fe   uuid := '07070707-0000-4000-8000-000000000006';
  v    integer;
  k    record;
begin
  select * into d from t_days;
  exp := (d.d_a + interval '24 months')::date;
  -- Bo buys the day before his points expire.
  insert into orders (id, order_number, customer_id, email, status, currency, subtotal, discount_amount, total, shipping_address, paid_at)
  values ('07070707-1000-4000-8000-000000000012', 'PTS07-B2', bo, 'bo@assertpts07.test', 'confirmed', 'SGD', 20, 0, 20, '{}',
          pg_temp.sgt(exp - 1, '18:00'));
  select * into k from points_clock(bo);
  assert k.entity_id = '07070707-1000-4000-8000-000000000012', 'purchase: the new Order is Bo''s clock';
  assert (select expires_on from points_balance(bo)) = ((exp - 1) + interval '24 months')::date,
    'purchase: the day before moves expires_on 24 months on';

  -- The expiry day itself, to its last minute: nothing expires.
  v := expire_due_points(pg_temp.sgt(exp, '23:59'));
  assert v = 0, 'the expiry day: nothing, ' || v;
  assert not exists (select 1 from t_expired where customer_id <> '07070707-0000-4000-8000-000000000007'), 'the expiry day: no entry';
  assert (select available from points_balance(ann)) = 2130, 'the expiry day: Ann can still use hers';

  -- The day after, just past midnight: Ann, Ed, Fe and Pat, once each. Not Bo.
  v := expire_due_points(pg_temp.sgt(exp + 1, '00:01'));
  assert v = 4, 'the day after: four balances expire, ' || v;
  assert (select count(*) from t_expired where customer_id = ann) = 1, 'the day after: one entry for Ann';
  assert (select points from t_expired where customer_id = ann) = -2130, 'the day after: the whole balance';
  assert (select note from t_expired where customer_id = ann)
         = format('No purchase for 24 months: the last was on %s.', to_char(d.d_a, 'FMDD Mon YYYY')),
    'the day after: the note says why';
  assert (select available from points_balance(ann)) = 0, 'the day after: Ann at zero';
  assert (select expires_on from points_balance(ann)) is null, 'the day after: nothing left to expire';
  assert not exists (select 1 from t_expired where customer_id = bo), 'the day after: Bo bought in time';
  assert (select available from points_balance(bo)) = 1000, 'the day after: Bo keeps his 1,000';
  assert (select points from t_expired where customer_id = '07070707-0000-4000-8000-000000000008') = -900,
    'the day after: a partner''s old balance expires too';

  -- A reservation at that moment is already debited: Fe's 1,000 expire, her
  -- 500 stay spent on the open Checkout.
  assert (select points from t_expired where customer_id = fe) = -1000, 'reserved: only what was available';
  assert (select points from points_ledger where customer_id = fe and kind = 'spend') = -500, 'reserved: the spend is untouched';

  -- A re-run writes nothing, that day or later.
  assert expire_due_points(pg_temp.sgt(exp + 1, '10:00')) = 0, 'a re-run writes nothing';
  assert expire_points(ann, pg_temp.sgt(exp + 1, '10:00')) = 0, 'a re-run for Ann writes nothing';
  assert (select count(*) from t_expired where customer_id = ann) = 1, 'a re-run: still one entry';

  -- Fe's Checkout expires: her 500 come back, and the next run expires them.
  update orders set status = 'cancelled', cancelled_at = now() where id = '07070707-1000-4000-8000-000000000016';
  assert release_points('07070707-1000-4000-8000-000000000016'), 'reserved: the Checkout gives its points back';
  assert (select available from points_balance(fe)) = 500, 'reserved: 500 back';
  assert expire_due_points(pg_temp.sgt(exp + 2, '10:00')) = 1, 'reserved: the next run expires them';
  assert (select array_agg(points order by points) from t_expired where customer_id = fe) = array[-1000, -500],
    'reserved: two entries, the second for the 500';
  assert (select available from points_balance(fe)) = 0, 'reserved: Fe at zero';
end $$;

-- ---------------------------------------------------------------- a Claim bonus alone
do $$
declare
  d    record;
  exp  date;
  cy  uuid := '07070707-0000-4000-8000-000000000003';
begin
  select * into d from t_days;
  exp := (d.d_c + interval '24 months')::date;
  assert expire_due_points(pg_temp.sgt(exp, '12:00')) = 0, 'claim bonus: not on its expiry day';
  assert (select available from points_balance(cy)) = 1000, 'claim bonus: still 1,000';
  assert expire_due_points(pg_temp.sgt(exp + 1, '10:00')) = 1, 'claim bonus: the day after';
  assert (select points from t_expired where customer_id = cy) = -1000, 'claim bonus: its 1,000 expire';
  assert expire_due_points(pg_temp.sgt(exp + 1, '10:00')) = 0, 'claim bonus: once';

  -- Nobody else: Di has no clock, Bo bought, Hy has months left.
  assert not exists (select 1 from t_expired where customer_id in (
    '07070707-0000-4000-8000-000000000002', '07070707-0000-4000-8000-000000000004', '07070707-0000-4000-8000-000000000009')),
    'only the due balances expire';
  assert (select available from points_balance('07070707-0000-4000-8000-000000000004')) = 800, 'Di keeps hers';
end $$;

-- ---------------------------------------------------------------- a month-end window
-- Bought on 31 May 2024, so the points expire on 31 May 2026; the 3-month
-- reminder's day is 28 February 2026 (lib/points/expiry.ts, reminderDueOn),
-- and that is the first day the window lists them.
do $$
declare
  mo uuid := '07070707-0000-4000-8000-000000000011';
begin
  insert into customers (id, email, first_name) values (mo, 'mo@assertpts07.test', 'Mo');
  insert into orders (id, order_number, customer_id, email, status, currency, subtotal, discount_amount, total, shipping_address, paid_at, delivered_at)
  values ('07070707-1000-4000-8000-000000000019', 'PTS07-M1', mo, 'mo@assertpts07.test', 'delivered', 'SGD', 100, 0, 100, '{}',
          pg_temp.sgt('2024-05-31', '15:00'), pg_temp.sgt('2024-05-31', '15:00'));
  insert into points_ledger (customer_id, kind, points, order_id) values (mo, 'earn', 600, '07070707-1000-4000-8000-000000000019');
  assert (select expires_on from points_balance(mo)) = '2026-05-31', 'month end: expires on 31 May 2026';
  assert not exists (select 1 from points_expiry_reminder_candidates(pg_temp.sgt('2026-02-27'), 3) where customer_id = mo),
    'month end: not on 27 February';
  assert exists (select 1 from points_expiry_reminder_candidates(pg_temp.sgt('2026-02-28'), 3) where customer_id = mo),
    'month end: listed from 28 February';
  assert exists (select 1 from points_expiry_reminder_candidates(pg_temp.sgt('2026-05-31', '23:59'), 3) where customer_id = mo),
    'month end: listed on its last day';
end $$;

-- ---------------------------------------------------------------- cleanup
delete from orders where order_number like 'PTS07-%';
delete from customers where email like '%@assertpts07.test';
delete from partner_users where email like '%@assertpts07.test';
delete from site_settings where key in ('points_enabled', 'points_launch_at', 'points_expiry_months', 'points_min_redeem');
insert into site_settings (key, value) select key, value from t_settings;

select 'points slice 07 ok';
