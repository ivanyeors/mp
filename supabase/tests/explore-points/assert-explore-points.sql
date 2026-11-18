-- The Explore page's points (20261117100000_explore_welcome_points.sql; ADR
-- 0030, amendment of 2026-11-17), asserted against real Postgres. Run by
-- scripts/check-explore-points-sql.sh on a throwaway database; prints one
-- line, `explore points ok`.

\set ON_ERROR_STOP 1
set client_min_messages = error;

do $$
declare
  f text;
  a uuid; b uuid; c uuid; m uuid; p uuid;
  r record;
  n integer;
  d date;
  bloom_day date;
  quiet_day date;
begin
  -- ------------------------------------------------------------ server-only
  foreach f in array array[
    'public.welcome_bonus_steps()', 'public.welcome_bonus_standing(timestamptz)',
    'public.grant_welcome_bonus(uuid)', 'public.explore_bloom(date)', 'public.explore_flowers(uuid)',
    'public.pick_explore_flower(uuid, integer)', 'public.explore_flower_cap()', 'public.explore_flower_points(uuid)'
  ] loop
    assert not has_function_privilege('anon', f, 'execute'), f || ': no anon';
    assert not has_function_privilege('authenticated', f, 'execute'), f || ': no authenticated';
    assert has_function_privilege('service_role', f, 'execute'), f || ': service role';
  end loop;
  assert (select relrowsecurity from pg_class where oid = 'public.explore_flower_picks'::regclass), 'picks: RLS on';
  assert not has_table_privilege('authenticated', 'public.explore_flower_picks', 'select'), 'picks: server-only';
  assert not has_table_privilege('authenticated', 'public.admin_points_summary', 'select'), 'summary: server-only';

  -- ------------------------------------------------------------ the ladder
  assert (select count(*) from welcome_bonus_steps()) = 4, 'the seeded ladder has four steps';
  assert (select points from welcome_bonus_steps() where step = 1) = 1000, 'step 1 is 1,000';
  assert (select until from welcome_bonus_steps() where step = 3) = timestamptz '2026-12-31T23:59+08:00', 'step 3 ends at the opening';

  -- Malformed, out of order, zero, or not a real date: no ladder at all.
  update site_settings set value = 'soon|1000|500' where key = 'points_welcome_steps';
  assert (select count(*) from welcome_bonus_steps()) = 0, 'malformed: none';
  update site_settings set value = '2026-12-15T00:00+08:00|800|500,2026-12-01T00:00+08:00|1000|500' where key = 'points_welcome_steps';
  assert (select count(*) from welcome_bonus_steps()) = 0, 'not climbing: none';
  update site_settings set value = '2026-12-01T00:00+08:00|0|500' where key = 'points_welcome_steps';
  assert (select count(*) from welcome_bonus_steps()) = 0, 'zero points: none';
  update site_settings set value = '2026-02-31T00:00+08:00|1000|500' where key = 'points_welcome_steps';
  assert (select count(*) from welcome_bonus_steps()) = 0, 'not a real date: none';
  delete from site_settings where key = 'points_welcome_steps';
  assert (select count(*) from welcome_bonus_steps()) = 0, 'missing: none';

  -- A small ladder to walk: two bonuses at 1,000 (open for a year), then one at 800.
  insert into site_settings (key, value) values ('points_welcome_steps',
    to_char(now() + interval '300 days', 'YYYY-MM-DD"T"HH24:MI') || '+00:00|1000|2,' ||
    to_char(now() + interval '400 days', 'YYYY-MM-DD"T"HH24:MI') || '+00:00|800|1');
  assert (select count(*) from welcome_bonus_steps()) = 2, 'the test ladder';
  assert (select step from welcome_bonus_standing() where is_open) = 1, 'step 1 is open';

  insert into customers (email) values ('a@explore.test') returning id into a;
  insert into customers (email) values ('b@explore.test') returning id into b;
  insert into customers (email) values ('c@explore.test') returning id into c;
  insert into customers (email) values ('m@explore.test') returning id into m;
  insert into customers (email) values ('p@explore.test') returning id into p;
  insert into migrated_customers (customer_id) values (m);
  insert into partner_stand_in values (p);

  -- ------------------------------------------------------------ the grant
  select * into r from grant_welcome_bonus(a);
  assert r.granted and r.points = 1000 and r.step = 1 and r.reason = 'granted', 'a: 1,000 at step 1';
  select * into r from grant_welcome_bonus(a);
  assert not r.granted and r.reason = 'already', 'a: once only';
  select * into r from grant_welcome_bonus(m);
  assert not r.granted and r.reason = 'migrated', 'a Migrated customer gets the Claim bonus, not this';
  select * into r from grant_welcome_bonus(p);
  assert not r.granted and r.reason = 'partner', 'a partner gets none';
  select * into r from grant_welcome_bonus(b);
  assert r.granted and r.points = 1000 and r.step = 1, 'b: the last at step 1';

  -- Step 1 is used up, so step 2 opens early.
  select * into r from welcome_bonus_standing() where step = 1;
  assert r.claimed = 2 and not r.is_open, 'step 1: both claimed, closed';
  assert (select step from welcome_bonus_standing() where is_open) = 2, 'step 2 opened early';
  select * into r from grant_welcome_bonus(c);
  assert r.granted and r.points = 800 and r.step = 2, 'c: 800 at step 2';
  assert not exists (select 1 from welcome_bonus_standing() where is_open), 'everything claimed: nothing open';

  insert into customers (email) values ('d@explore.test') returning id into c;
  select * into r from grant_welcome_bonus(c);
  assert not r.granted and r.reason = 'ended', 'd: nothing left';

  -- A step whose time has come is closed, whatever is left in it.
  assert not exists (select 1 from welcome_bonus_standing(now() + interval '500 days') where is_open), 'after the last step: closed';
  delete from site_settings where key = 'points_welcome_steps';
  insert into site_settings (key, value) values ('points_welcome_steps',
    to_char(now() - interval '2 days', 'YYYY-MM-DD"T"HH24:MI') || '+00:00|1000|9,' ||
    to_char(now() + interval '400 days', 'YYYY-MM-DD"T"HH24:MI') || '+00:00|800|9');
  assert (select step from welcome_bonus_standing() where is_open) = 2, 'step 1 ended by date with some left: step 2 is open';

  -- Points switched off: no bonus.
  update site_settings set value = 'false' where key = 'points_enabled';
  select * into r from grant_welcome_bonus(c);
  assert not r.granted and r.reason = 'off', 'points off: none';
  update site_settings set value = 'true' where key = 'points_enabled';

  -- The ledger refuses a Welcome bonus with no step, and a step on anything else.
  begin
    insert into points_ledger (customer_id, kind, points) values (c, 'welcome_bonus', 500);
    assert false, 'a Welcome bonus needs its step';
  exception when check_violation then null;
  end;
  begin
    insert into points_ledger (customer_id, kind, points, welcome_step) values (c, 'earn', 5, 1);
    assert false, 'only a Welcome bonus has a step';
  exception when check_violation then null;
  end;

  -- ------------------------------------------------------------ flowers
  -- explore_bloom: 0 or 3..5, and both kinds of day happen.
  for i in 0..199 loop
    d := date '2026-11-01' + i;
    n := explore_bloom(d);
    assert n = 0 or n between 3 and 5, 'bloom is none, or three to five';
    if n > 0 and bloom_day is null then bloom_day := d; end if;
    if n = 0 and quiet_day is null then quiet_day := d; end if;
  end loop;
  assert bloom_day is not null and quiet_day is not null, 'some days bloom, some do not';
  select count(*) into n from generate_series(0, 999) g where explore_bloom(date '2026-11-01' + g) > 0;
  assert n between 300 and 500, 'about two days in five bloom, got ' || n;

  -- Today, whichever kind of day it is.
  d := (now() at time zone 'Asia/Singapore')::date;
  n := explore_bloom(d);
  select * into r from explore_flowers(a);
  assert r.flowers = n and r.picked = '{}' and r.gives_points, 'a: today''s flowers, none picked';
  select * into r from explore_flowers(null);
  assert r.flowers = n and not r.gives_points, 'signed out: the flowers, no points';
  select * into r from explore_flowers(p);
  assert not r.gives_points, 'a partner: no points';

  select * into r from pick_explore_flower(a, n);
  assert not r.picked and r.reason = 'none', 'no such flower';
  select * into r from pick_explore_flower(a, -1);
  assert not r.picked and r.reason = 'none', 'no flower below 0';
  select * into r from pick_explore_flower(p, 0);
  assert not r.picked and r.reason = 'partner', 'a partner picks nothing';
  if n > 0 then
    select * into r from pick_explore_flower(a, 0);
    assert r.picked and r.points between 1 and 3 and r.reason = 'picked', 'a flower gives 1 to 3 points';
    assert (select points from points_ledger where customer_id = a and kind = 'explore_flower') = r.points, 'and the ledger holds them';
    select * into r from pick_explore_flower(a, 0);
    assert not r.picked and r.reason = 'already', 'a flower is picked once a day';
    assert (select count(*) from points_ledger where customer_id = a and kind = 'explore_flower') = 1, 'and never paid twice';
    assert (select picked from explore_flowers(a)) = '{0}', 'the page hears which one';
  end if;

  -- Not live (switched on, launch still to come): flowers give nothing.
  update site_settings set value = (now() + interval '1 day')::text where key = 'points_launch_at';
  select * into r from pick_explore_flower(b, 0);
  assert not r.picked and r.reason = 'off', 'before the points launch: no points';
  assert not (select gives_points from explore_flowers(b)), 'and the page knows';
  update site_settings set value = '2026-01-01T00:00:00Z' where key = 'points_launch_at';

  -- ------------------------------------------------------------ consent
  assert set_marketing_email(a, 'subscribed', 'explore_claim'), 'the claim subscribes someone nobody has asked';
  assert (select marketing_email_source from customers where id = a) = 'explore_claim', 'under its own source';
  assert not set_marketing_email(a, 'subscribed', 'explore_claim'), 'and changes nothing the second time';
  assert set_marketing_email(a, 'unsubscribed', 'account'), 'they unsubscribe';
  assert not set_marketing_email(a, 'subscribed', 'explore_claim'), 'a claim never brings back someone who left';
  begin
    perform set_marketing_email(b, 'unsubscribed', 'explore_claim');
    assert false, 'the claim never unsubscribes';
  exception when invalid_parameter_value then null;
  end;

  -- ------------------------------------------------------------ the cost
  select * into r from admin_points_summary;
  assert r.welcome_bonuses = 3 and r.welcome_bonus_points = 2800, 'summary: three Welcome bonuses, 2,800 points';
  assert r.flower_points = coalesce((select sum(points) from points_ledger where kind = 'explore_flower'), 0), 'summary: the flower points';
end $$;

select 'explore points ok';
