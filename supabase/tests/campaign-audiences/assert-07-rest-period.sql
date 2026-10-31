-- The rest period (20261031144935_campaign_rest_period.sql; PRD-campaign-audiences
-- slice 07), asserted against real Postgres. The rule's cases are in
-- supabase/tests/email-marketing/campaign-rule-cases.json, which
-- assert-01-email-campaigns.sql runs; this covers the rest: what counts, the
-- date, the claim writing nothing, the view, the grants, and two campaigns
-- claiming one person at once.
--
-- Run from the repository root against a database with every migration
-- applied (a throwaway local one, never production), as a superuser with the
-- dblink extension, and with the server able to reach itself by socket
-- (PGHOST set where it was started). It prints `slice 07 rest period ok`:
--
--   psql -d <db> -v ON_ERROR_STOP=1 -q -X -t -A -f supabase/tests/campaign-audiences/assert-07-rest-period.sql
--
-- psql autocommits, so the dblink sessions see the fixtures; the script
-- deletes them at the start and the end.

\set ON_ERROR_STOP 1
set client_min_messages = error;
create extension if not exists dblink;

-- ---------------------------------------------------------------- cleanup
delete from customer_campaign_sends where customer_id in (select id from customers where email like '%@assert07r.test');
delete from customer_campaign_sends where campaign_id in (select id from email_campaigns where name like 'assert-07r %');
delete from email_campaigns where name like 'assert-07r %';
delete from customers where email like '%@assert07r.test';

-- ---------------------------------------------------------------- fixtures
insert into customers (id, email, first_name, marketing_email, marketing_email_source, marketing_email_updated_at) values
  ('07070707-1000-4000-8000-000000000001', 'rest@assert07r.test',   'Rae', 'subscribed', 'account', now() - interval '90 days'),
  ('07070707-1000-4000-8000-000000000002', 'fresh@assert07r.test',  'Fen', 'subscribed', 'account', now() - interval '90 days'),
  ('07070707-1000-4000-8000-000000000003', 'race@assert07r.test',   'Ray', 'subscribed', 'account', now() - interval '90 days');
insert into email_campaigns (id, name, subject, body, audience) values
  ('07070707-0000-4000-8000-0000000000c1', 'assert-07r one',   'One',   'Hello', 'subscribed'),
  ('07070707-0000-4000-8000-0000000000c2', 'assert-07r two',   'Two',   'Hello', 'subscribed'),
  ('07070707-0000-4000-8000-0000000000c3', 'assert-07r three', 'Three', 'Hello', 'subscribed'),
  ('07070707-0000-4000-8000-0000000000c4', 'assert-07r four',  'Four',  'Hello', 'subscribed'),
  ('07070707-0000-4000-8000-0000000000c5', 'assert-07r five',  'Five',  'Hello', 'subscribed');

do $$
begin
  assert not has_function_privilege('authenticated', 'public.marketing_rest_until(uuid, timestamptz)', 'execute'),
    'authenticated cannot read anyone''s rest';
  assert not has_function_privilege('anon', 'public.marketing_recent(uuid, timestamptz)', 'execute'),
    'anon cannot read anyone''s marketing email';
  assert has_function_privilege('service_role', 'public.marketing_rest_until(uuid, timestamptz)', 'execute'),
    'the service role reads the rest';
end $$;

-- ---------------------------------------------------------------- what counts, and until when
do $$
declare
  rae  uuid := '07070707-1000-4000-8000-000000000001';
  fen  uuid := '07070707-1000-4000-8000-000000000002';
  t0   timestamptz := now();
  r    record;
begin
  assert marketing_rest_until(fen) is null and cardinality(marketing_recent(fen)) = 0, 'nobody emailed: not resting';

  -- Order email and a failed send never count.
  insert into customer_emails (customer_id, template, entity_id, status, sent_at)
  values (fen, 'order.confirmation', gen_random_uuid(), 'sent', t0 - interval '1 day'),
         (fen, 'aftercare.checkup', gen_random_uuid(), 'sent', t0 - interval '1 day');
  insert into customer_campaign_sends (customer_id, template, campaign_id, wave, status, sent_at)
  values (fen, 'campaign:07070707-0000-4000-8000-0000000000c1', '07070707-0000-4000-8000-0000000000c1', 'w1', 'failed', t0 - interval '1 day');
  assert marketing_rest_until(fen) is null, 'order, aftercare and failed email do not rest anyone';
  assert (select cardinality(marketing_recent) from marketing_campaign_candidates where customer_id = fen) = 0,
    'the view: none of them is marketing';

  -- A points-expiry reminder does, 3 days ago: resting until 4 days from now.
  insert into customer_emails (customer_id, template, entity_id, status, sent_at)
  values (rae, 'points.expiry_1m', gen_random_uuid(), 'sent', t0 - interval '3 days');
  assert marketing_rest_until(rae, t0) = t0 + interval '4 days', 'a points-expiry reminder rests them 7 days';

  -- Four in 30 days, the latest 8 days ago: rested until the 4th leaves the window.
  delete from customer_emails where customer_id = rae;
  insert into customer_campaign_sends (customer_id, template, campaign_id, wave, status, sent_at) values
    (rae, 'campaign:07070707-0000-4000-8000-0000000000c1', '07070707-0000-4000-8000-0000000000c1', 'w1', 'sent', t0 - interval '8 days'),
    (rae, 'campaign:07070707-0000-4000-8000-0000000000c2', '07070707-0000-4000-8000-0000000000c2', 'w1', 'sent', t0 - interval '12 days'),
    (rae, 'migration_announcement', null, 'w1', 'sent', t0 - interval '20 days');
  insert into customer_emails (customer_id, template, entity_id, status, sent_at)
  values (rae, 'points.expiry_3m', gen_random_uuid(), 'sent', t0 - interval '29 days');
  assert marketing_rest_until(rae, t0) = t0 + interval '1 day', 'four in 30 days: until the 4th is 30 days old';
  assert (select marketing_recent[1] = t0 - interval '8 days' and cardinality(marketing_recent) = 4
            from marketing_campaign_candidates where customer_id = rae), 'the view: newest first, all four';

  -- The claim refuses them as resting and writes nothing.
  select * into r from claim_marketing_campaign_send(rae, '07070707-0000-4000-8000-0000000000c3', 'w1');
  assert r.send_id is null and r.blocker = 'resting', 'claim: resting';
  assert not exists (select 1 from customer_campaign_sends where customer_id = rae and campaign_id = '07070707-0000-4000-8000-0000000000c3'),
    'claim: a resting Customer gets no ledger row, so a later wave reaches them';

  -- Once the oldest is past 30 days, they may get it.
  update customer_emails set sent_at = t0 - interval '31 days' where customer_id = rae;
  assert marketing_rest_until(rae, t0) is null, 'three in 30 days, the latest 8 days ago: not resting';
  select * into r from claim_marketing_campaign_send(rae, '07070707-0000-4000-8000-0000000000c3', 'w1');
  assert r.send_id is not null, 'claim: rested enough, claimed';
  -- And that send rests them again for the next campaign.
  select * into r from claim_marketing_campaign_send(rae, '07070707-0000-4000-8000-0000000000c4', 'w1');
  assert r.send_id is null and r.blocker = 'resting', 'a send in flight rests them for the next campaign';
end $$;

-- ---------------------------------------------------------------- two campaigns, one person, at once
do $$
begin
  perform dblink_connect('a', 'dbname=' || current_database() || ' user=' || current_user);
  perform dblink_connect('b', 'dbname=' || current_database() || ' user=' || current_user);
  perform dblink_exec('a', 'begin');
end $$;
create temp table race_a as
  select * from dblink('a', $q$select send_id, blocker from claim_marketing_campaign_send('07070707-1000-4000-8000-000000000003', '07070707-0000-4000-8000-0000000000c4', 'w1')$q$)
    as t(send_id uuid, blocker text);

-- b claims another campaign for the same person while a's claim is uncommitted.
do $$
begin
  perform dblink_send_query('b', $q$select send_id, blocker from claim_marketing_campaign_send('07070707-1000-4000-8000-000000000003', '07070707-0000-4000-8000-0000000000c5', 'w1')$q$);
  perform pg_sleep(0.5);
  assert dblink_is_busy('b') = 1, 'race: the second campaign waits on the first claim';
  perform dblink_exec('a', 'commit');
end $$;
create temp table race_b as
  select * from dblink_get_result('b') as t(send_id uuid, blocker text);

do $$
declare
  a record;
  b record;
begin
  select * into a from race_a;
  select * into b from race_b;
  assert a.send_id is not null, 'race: the first campaign claims';
  assert b.send_id is null and b.blocker = 'resting', 'race: the second sees the first and rests them';
  assert (select count(*) from customer_campaign_sends where customer_id = '07070707-1000-4000-8000-000000000003') = 1,
    'race: one email, not two';
  perform dblink_disconnect('a');
  perform dblink_disconnect('b');
end $$;

-- ---------------------------------------------------------------- cleanup
delete from customer_campaign_sends where customer_id in (select id from customers where email like '%@assert07r.test');
delete from customer_campaign_sends where campaign_id in (select id from email_campaigns where name like 'assert-07r %');
delete from email_campaigns where name like 'assert-07r %';
delete from customers where email like '%@assert07r.test';

select 'slice 07 rest period ok';
