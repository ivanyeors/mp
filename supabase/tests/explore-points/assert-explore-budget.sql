-- The Explore page's points on a budget (20261117144229_explore_points_budget.sql;
-- ADR 0030, amendment of 2026-11-17, "The budget"), asserted against real
-- Postgres. Run by scripts/check-explore-points-sql.sh after both migrations;
-- prints one line, `explore budget ok`. Everything here is rolled back, so it
-- leaves nothing for the other assert file, whichever runs first.

\set ON_ERROR_STOP 1
set client_min_messages = error;

begin;

-- Today blooms five flowers, whatever day the test runs on.
create or replace function public.explore_bloom(p_day date) returns integer language sql immutable as $$ select 5 $$;

do $$
declare
  a uuid; b uuid; p uuid;
  r record;
  i integer;
  total integer;
begin
  -- ------------------------------------------------------------ the ladder
  -- The seeded ladder: the same dates and points, S$250 a step, S$1,000 at most.
  update site_settings set value =
    '2026-12-01T00:00+08:00|1000|25,2026-12-15T00:00+08:00|800|31,2026-12-31T23:59+08:00|600|41,2027-02-01T00:00+08:00|500|50'
   where key = 'points_welcome_steps';
  assert (select array_agg(points order by step) from welcome_bonus_steps()) = '{1000,800,600,500}', 'the points stay';
  assert (select array_agg(allocation order by step) from welcome_bonus_steps()) = '{25,31,41,50}', 'S$250 a step at each size';
  assert (select bool_and(points * allocation <= 25000) from welcome_bonus_steps()), 'no step costs more than S$250';
  assert (select sum(points * allocation) from welcome_bonus_steps()) <= 100000, 'the ladder costs at most S$1,000';

  -- ------------------------------------------------------------ flowers
  insert into customers (email) values ('budget-a@explore.test') returning id into a;
  insert into customers (email) values ('budget-b@explore.test') returning id into b;
  insert into customers (email) values ('budget-p@explore.test') returning id into p;
  insert into partner_stand_in (customer_id) values (p);

  -- Five picks today: each 1 to 3 points, each once.
  total := 0;
  for i in 0..4 loop
    select * into r from pick_explore_flower(a, i);
    assert r.picked and r.points between 1 and 3 and r.reason = 'picked', 'a flower gives 1 to 3 points';
    total := total + r.points;
  end loop;
  assert explore_flower_points(a) = total, 'the ledger holds every pick';
  assert (select gives_points from explore_flowers(a)), 'still under the cap: flowers give points';

  -- Two points short of the cap: the next pick gives at most what is left.
  delete from explore_flower_picks where customer_id = a;
  insert into points_ledger (customer_id, kind, points, note) values (a, 'explore_flower', 498 - total, 'Earlier picks');
  assert explore_flower_points(a) = 498, 'two points from the cap';
  select * into r from pick_explore_flower(a, 0);
  assert r.picked and r.points between 1 and 2, 'the last pick gives no more than is left';
  if explore_flower_points(a) < 500 then
    select * into r from pick_explore_flower(a, 1);
    assert r.picked and r.points = 500 - 499, 'and the one after fills it exactly';
  end if;
  assert explore_flower_points(a) = 500, 'S$5 of flowers, exactly';

  -- Then never again: no points, and the page knows.
  select * into r from pick_explore_flower(a, 2);
  assert not r.picked and r.points = 0 and r.reason = 'spent', 'past the cap: nothing';
  assert not (select gives_points from explore_flowers(a)), 'and the page shows flowers without points';
  assert (select count(*) from explore_flower_picks where customer_id = a and flower = 2) = 0, 'a spent pick is not recorded';

  -- The cap is each Customer's own.
  select * into r from pick_explore_flower(b, 0);
  assert r.picked and r.points between 1 and 3, 'someone else still finds points';

  -- A partner never; signed out never.
  select * into r from pick_explore_flower(p, 0);
  assert not r.picked and r.reason = 'partner', 'a partner picks nothing';
  assert not (select gives_points from explore_flowers(null)), 'signed out: no points';

  -- The picks table holds 1 to 3 only.
  begin
    insert into explore_flower_picks (customer_id, day, flower, points, regrows_at) values (b, current_date - 1, 0, 4, now());
    assert false, 'a pick of 4 is refused';
  exception when check_violation then null;
  end;

  -- Server-only.
  assert not has_function_privilege('authenticated', 'public.explore_flower_points(uuid)', 'execute'), 'total: server-only';
  assert not has_function_privilege('anon', 'public.explore_flower_cap()', 'execute'), 'cap: server-only';
end $$;

rollback;

select 'explore budget ok';
