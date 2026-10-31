-- Loyalty points slice 09 (PRD-loyalty-points; ADR 0030 rules s to w): bonus
-- milestones, asserted against real Postgres
-- (20261023120000_points_milestones.sql).
--
-- Run from the repository root against a database with every migration
-- applied (a throwaway local one, never production). It prints one line,
-- `points slice 09 ok`:
--
--   psql -d <db> -v ON_ERROR_STOP=1 -q -X -t -A -f supabase/tests/loyalty-points/assert-09-milestones.sql
--
-- The race is real: two dblink sessions grant the same Customer at once, the
-- second blocked behind the first's uncommitted work. psql autocommits, so the
-- fixtures are visible to those sessions; the script deletes them at the end
-- and puts the points settings back as it found them. Needs a superuser (for
-- dblink without a password) and the dblink extension.
--
-- The sweep grants every Customer in the database, so this needs one whose
-- only ledger entries are its own.

\set ON_ERROR_STOP 1
set client_min_messages = error;
create extension if not exists dblink;

-- ---------------------------------------------------------------- cleanup
delete from customers where email like '%@assertpts09.test';
delete from partner_users where email like '%@assertpts09.test';

create temp table t_settings as
  select key, value from site_settings
   where key in ('points_enabled', 'points_launch_at', 'points_milestones');

-- ---------------------------------------------------------------- structure
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.points_milestones()',
    'public.grant_milestone_bonuses_for(uuid)',
    'public.grant_due_milestone_bonuses(timestamptz)'
  ] loop
    assert not has_function_privilege('anon', f, 'execute'), 'anon executes ' || f;
    assert not has_function_privilege('authenticated', f, 'execute'), 'authenticated executes ' || f;
    assert has_function_privilege('service_role', f, 'execute'), 'service_role cannot execute ' || f;
  end loop;
  assert not has_table_privilege('anon', 'public.points_milestone_progress', 'select'), 'anon reads progress';
  assert not has_table_privilege('authenticated', 'public.points_milestone_progress', 'select'), 'authenticated reads progress';
  assert (select value from t_settings where key = 'points_milestones') is not null, 'the ladder is seeded';
end $$;

-- ------------------------------------------------- milestone-cases.json (parity with parseMilestones)
\set milestone_cases `cat supabase/tests/loyalty-points/milestone-cases.json`
create temp table t_milestone_cases as select (:'milestone_cases')::jsonb as doc;

do $$
declare
  c        jsonb;
  got      jsonb;
  failures text := '';
begin
  for c in select value from jsonb_array_elements((select doc from t_milestone_cases)->'cases') loop
    delete from site_settings where key = 'points_milestones';
    if c->'value' <> 'null'::jsonb then
      insert into site_settings (key, value) values ('points_milestones', c->>'value');
    end if;
    select coalesce(jsonb_agg(jsonb_build_array(threshold, bonus) order by milestone), '[]'::jsonb) into got
      from points_milestones();
    if got <> c->'expected' then
      failures := failures || E'\n  ' || (c->>'name') || ': got ' || got::text;
    end if;
    -- Numbered from 1, lowest first.
    if exists (select 1 from points_milestones() m
                where m.milestone <> (select count(*) from points_milestones() n where n.threshold <= m.threshold)) then
      failures := failures || E'\n  ' || (c->>'name') || ': not numbered lowest first';
    end if;
  end loop;
  assert failures = '', 'points_milestones disagrees with milestone-cases.json:' || failures;
end $$;

-- ---------------------------------------------------------------- fixtures
insert into site_settings (key, value) values
  ('points_enabled', 'false'),
  ('points_launch_at', (now() - interval '100 days')::text),
  ('points_milestones', '1000:100,2500:300,5000:800,10000:2000')
on conflict (key) do update set value = excluded.value;

insert into customers (id, email, first_name) values
  ('09090909-0000-4000-8000-000000000001', 'ann@assertpts09.test', 'Ann'),
  ('09090909-0000-4000-8000-000000000002', 'bo@assertpts09.test', 'Bo'),
  ('09090909-0000-4000-8000-000000000003', 'cy@assertpts09.test', 'Cy'),
  ('09090909-0000-4000-8000-000000000004', 'di@assertpts09.test', 'Di'),
  ('09090909-0000-4000-8000-000000000005', 'pat@assertpts09.test', 'Pat');
insert into partner_users (email, application_status) values ('pat@assertpts09.test', 'approved');

-- Entries written straight to the ledger: what the release, the Claim and
-- Staff would have written. Ann 900 earned; Bo 5,200 in one go; Cy only a
-- Claim bonus and a Staff adjustment; Di 1,050 earned; Pat a partner with an
-- `earn` from before they were one.
insert into points_ledger (customer_id, kind, points, note) values
  ('09090909-0000-4000-8000-000000000001', 'earn', 600, null),
  ('09090909-0000-4000-8000-000000000001', 'earn', 300, null),
  ('09090909-0000-4000-8000-000000000002', 'earn', 5200, null),
  ('09090909-0000-4000-8000-000000000003', 'claim_bonus', 1000, null),
  ('09090909-0000-4000-8000-000000000003', 'adjust', 2000, 'Goodwill'),
  ('09090909-0000-4000-8000-000000000004', 'earn', 1050, null),
  ('09090909-0000-4000-8000-000000000005', 'earn', 3000, null);

create temp view t_bonus as
  select c.first_name as who, l.milestone, l.points, l.note
    from points_ledger l join customers c on c.id = l.customer_id
   where l.kind = 'milestone_bonus' and c.email like '%@assertpts09.test';

-- ---------------------------------------------------------------- constraints
do $$
begin
  begin
    insert into points_ledger (customer_id, kind, points) values ('09090909-0000-4000-8000-000000000001', 'milestone_bonus', 100);
    assert false, 'a milestone bonus with no milestone was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into points_ledger (customer_id, kind, points, milestone) values ('09090909-0000-4000-8000-000000000001', 'earn', 100, 1);
    assert false, 'an earn entry naming a milestone was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into points_ledger (customer_id, kind, points, milestone) values ('09090909-0000-4000-8000-000000000001', 'milestone_bonus', -100, 1);
    assert false, 'a negative milestone bonus was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into points_ledger (customer_id, kind, points, milestone) values ('09090909-0000-4000-8000-000000000001', 'milestone_bonus', 100, 0);
    assert false, 'milestone 0 was accepted';
  exception when check_violation then null;
  end;
end $$;

-- ---------------------------------------------------------------- the sweep
do $$
declare
  v integer;
  p record;
begin
  -- Points off: nothing, however much is due.
  v := grant_due_milestone_bonuses(now());
  assert v = 0 and not exists (select 1 from t_bonus), 'off: nothing granted, ' || v;

  update site_settings set value = 'true' where key = 'points_enabled';

  -- On, but before the launch: nothing.
  v := grant_due_milestone_bonuses(now() - interval '101 days');
  assert v = 0, 'before the launch: nothing, ' || v;

  -- Live. Bo crossed three milestones in one order: three bonuses, lowest
  -- first. Di is past the first. Ann (900) is short; Cy earned nothing from
  -- orders (a Claim bonus and an adjustment don't count); Pat is a partner.
  v := grant_due_milestone_bonuses(now());
  assert v = 4, 'live: Bo three, Di one, ' || v;
  assert (select array_agg(points order by milestone) from t_bonus where who = 'Bo') = array[100, 300, 800], 'Bo: milestones 1 to 3';
  assert (select note from t_bonus where who = 'Bo' and milestone = 3) = 'Milestone 3: 5,000 points earned from orders', 'the note names the milestone';
  assert (select count(*) from t_bonus where who = 'Di') = 1, 'Di: milestone 1';
  assert not exists (select 1 from t_bonus where who in ('Ann', 'Cy', 'Pat')), 'Ann short, Cy no orders, Pat a partner';

  -- The bonus is in the balance and the summary.
  assert (select available from points_balance('09090909-0000-4000-8000-000000000002')) = 5200 + 1200, 'Bo: earned plus bonuses';
  assert (select milestone_bonuses >= 4 and milestone_bonus_points >= 1300 from admin_points_summary), 'summary counts milestone bonuses';

  -- A re-run grants nothing.
  v := grant_due_milestone_bonuses(now());
  assert v = 0, 'a re-run grants nothing, ' || v;

  -- Spending and Staff removals don't set the bar back; earning moves it.
  insert into points_ledger (customer_id, kind, points, note) values
    ('09090909-0000-4000-8000-000000000001', 'spend', -500, null),
    ('09090909-0000-4000-8000-000000000001', 'adjust', -400, 'Staff removal'),
    ('09090909-0000-4000-8000-000000000001', 'earn', 200, null);
  select * into p from points_milestone_progress where customer_id = '09090909-0000-4000-8000-000000000001';
  assert p.earned = 1100 and p.granted = 0, 'Ann: 1,100 earned, spending and removals not counted';
  v := grant_due_milestone_bonuses(now());
  assert v = 1 and (select milestone from t_bonus where who = 'Ann') = 1, 'Ann: milestone 1 once she reaches it';

  -- A refund takes Di back below the milestone: the bonus stays (rule v), and
  -- earning past it again pays nothing twice.
  insert into points_ledger (customer_id, kind, points, refund_id) values
    ('09090909-0000-4000-8000-000000000004', 'clawback', -100, 're_pts09_di');
  assert (select earned from points_milestone_progress where customer_id = '09090909-0000-4000-8000-000000000004') = 950, 'a clawback comes off what was earned';
  assert (select count(*) from t_bonus where who = 'Di') = 1, 'the bonus is not taken back';
  insert into points_ledger (customer_id, kind, points) values ('09090909-0000-4000-8000-000000000004', 'earn', 100);
  v := grant_due_milestone_bonuses(now());
  assert v = 0 and (select count(*) from t_bonus where who = 'Di') = 1, 'Di: reaching milestone 1 again pays nothing';

  -- A changed ladder never pays a milestone twice: bonuses held count against
  -- milestones reached. Raised: Ann holds one and has reached none; Bo holds
  -- three and has reached two. Nothing.
  update site_settings set value = '1200:500,2500:300' where key = 'points_milestones';
  v := grant_due_milestone_bonuses(now());
  assert v = 0, 'a raised ladder grants nothing, ' || v;

  -- Lowered and longer: Bo has reached five and holds three, so milestones 4
  -- and 5, at today's bonuses. Ann has reached one and holds one.
  update site_settings set value = '1000:100,2000:200,3000:300,4000:400,5000:500' where key = 'points_milestones';
  v := grant_due_milestone_bonuses(now());
  assert v = 2, 'a longer ladder: Bo''s fourth and fifth, ' || v;
  assert (select array_agg(points order by milestone) from t_bonus where who = 'Bo') = array[100, 300, 800, 400, 500], 'Bo: 4 and 5 at the new bonuses';
  assert (select count(*) from t_bonus where who = 'Ann') = 1, 'Ann: still one';

  -- No ladder: nothing, and nothing taken.
  update site_settings set value = '' where key = 'points_milestones';
  v := grant_due_milestone_bonuses(now());
  assert v = 0 and (select count(*) from t_bonus) = 7, 'no ladder: nothing granted or taken';

  -- A partner is never granted, even called directly.
  update site_settings set value = '1000:100' where key = 'points_milestones';
  assert grant_milestone_bonuses_for('09090909-0000-4000-8000-000000000005') = 0, 'a partner is never granted';
  assert grant_milestone_bonuses_for('09090909-0000-0000-0000-000000000000') = 0, 'no such Customer: nothing';
end $$;

-- Two grants for one Customer at once write each milestone once: the second
-- waits on the first's lock on the Customer, then finds the bonus held.
insert into customers (id, email, first_name) values ('09090909-0000-4000-8000-000000000006', 'ed@assertpts09.test', 'Ed');
insert into points_ledger (customer_id, kind, points) values ('09090909-0000-4000-8000-000000000006', 'earn', 1500);

do $$
begin
  perform dblink_connect('a', 'dbname=' || current_database() || ' user=' || current_user);
  perform dblink_connect('b', 'dbname=' || current_database() || ' user=' || current_user);
  perform dblink_exec('a', 'begin');
end $$;
create temp table race_a as
  select * from dblink('a', $q$select grant_milestone_bonuses_for('09090909-0000-4000-8000-000000000006')$q$) as t(written integer);
do $$
begin
  perform dblink_send_query('b', $q$select grant_milestone_bonuses_for('09090909-0000-4000-8000-000000000006')$q$);
  perform pg_sleep(0.5);
  assert dblink_is_busy('b') = 1, 'grant race: the second waits on the first';
  perform dblink_exec('a', 'commit');
end $$;
create temp table race_b as
  select * from dblink_get_result('b') as t(written integer);
do $$
begin
  perform dblink_disconnect('a');
  perform dblink_disconnect('b');
  assert (select written from race_a) = 1, 'grant race: the first writes the bonus';
  assert (select written from race_b) = 0, 'grant race: the second writes nothing';
  assert (select count(*) from t_bonus where who = 'Ed') = 1, 'grant race: one bonus';
end $$;

-- ---------------------------------------------------------------- cleanup
delete from customers where email like '%@assertpts09.test';
delete from partner_users where email like '%@assertpts09.test';
delete from site_settings where key in ('points_enabled', 'points_launch_at', 'points_milestones');
insert into site_settings (key, value) select key, value from t_settings;

select 'points slice 09 ok';
