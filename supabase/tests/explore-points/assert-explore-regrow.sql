-- Explore's flowers grow back at random, at least a day after a pick
-- (20261117153541_explore_flower_regrow.sql; ADR 0030, decision 22), asserted
-- against real Postgres. Run by scripts/check-explore-points-sql.sh after the
-- migrations; prints one line, `explore regrow ok`. Rolled back, so it leaves
-- nothing for the other assert files.

\set ON_ERROR_STOP 1
set client_min_messages = error;

begin;

-- Today blooms five flowers, whatever day the test runs on.
create or replace function public.explore_bloom(p_day date) returns integer language sql immutable as $$ select 5 $$;

do $$
declare
  a uuid; b uuid;
  r record;
  gap interval;
begin
  insert into customers (email) values ('regrow-a@explore.test') returning id into a;
  insert into customers (email) values ('regrow-b@explore.test') returning id into b;

  select * into r from pick_explore_flower(a, 2);
  assert r.picked and r.reason = 'picked', 'a picks flower 2';

  -- It grows back 24 to 36 hours later, at a time the database drew.
  select regrows_at - created_at into gap from explore_flower_picks where customer_id = a and flower = 2;
  assert gap >= interval '24 hours' and gap <= interval '36 hours', 'grows back 24 to 36 hours on, got ' || gap;

  -- Until then it is gone for them, and only for them.
  assert (select picked from explore_flowers(a)) = '{2}', 'gone for a';
  assert (select picked from explore_flowers(b)) = '{}', 'still there for b';
  select * into r from pick_explore_flower(a, 2);
  assert not r.picked and r.reason = 'already', 'not again before it grows back';
  select * into r from pick_explore_flower(b, 2);
  assert r.picked, 'b picks their own';

  -- 23 hours on, still gone (the old rule brought it back at midnight).
  update explore_flower_picks set created_at = now() - interval '23 hours', regrows_at = now() + interval '1 hour'
   where customer_id = a and flower = 2;
  select * into r from pick_explore_flower(a, 2);
  assert not r.picked and r.reason = 'already', 'not back after 23 hours';

  -- Once its time has passed (on a later day), it is back and pays again.
  update explore_flower_picks set day = day - 2, created_at = now() - interval '30 hours', regrows_at = now() - interval '1 second'
   where customer_id = a and flower = 2;
  assert (select picked from explore_flowers(a)) = '{}', 'grown back for a';
  select * into r from pick_explore_flower(a, 2);
  assert r.picked and r.points between 1 and 3, 'picked again, for points';
  assert (select count(*) from points_ledger where customer_id = a and kind = 'explore_flower') = 2, 'two picks, two entries';
end $$;

rollback;

select 'explore regrow ok';
