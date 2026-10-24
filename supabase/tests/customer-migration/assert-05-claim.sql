-- Slice 05 (PRD-shopify-customer-migration), as PRD-loyalty-points slice 05
-- changed it: the Claim, the Claim bonus that replaced the Welcome-back
-- voucher (ADR 0030 rules f, g), and the customer_emails ledger, asserted
-- against real Postgres (20261020112100, 20261021150000). Since slice 06
-- (20261021160000) a coupon cannot be bound to a Customer at all, and no
-- Claim writes one.
--
-- Run against a database with every migration applied (a throwaway local one,
-- never production). It prints one line, `slice 05 claim ok`:
--
--   psql -d <db> -v ON_ERROR_STOP=1 -q -X -t -A -f supabase/tests/customer-migration/assert-05-claim.sql
--
-- The race is real, not simulated: two dblink sessions call
-- claim_migrated_customer for one Customer at once, the second blocked behind
-- the first's uncommitted Claim. psql autocommits, so the fixtures are visible
-- to those sessions; the script deletes them at the end. Needs a superuser
-- (for dblink without a password) and the dblink contrib extension.
--
-- The window counts from the first campaign email sent to anyone, so this
-- needs a database whose only campaign sends are its own.

\set ON_ERROR_STOP 1
set client_min_messages = error;
create extension if not exists dblink;

-- ---------------------------------------------------------------- fixtures
delete from customers where email like '%@assert05.test';
delete from partner_users where email like '%@assert05.test';
delete from customer_import_batches where file_name = 'assert-05.csv';
delete from site_settings where key = 'points_launch_at';
update site_settings set value = 'false' where key = 'points_enabled';
update site_settings set value = '1000' where key = 'points_claim_bonus';
update site_settings set value = '3' where key = 'points_claim_bonus_months';

do $$
begin
  assert not exists (select 1 from customer_campaign_sends),
    'this assert needs a database with no campaign sends: the window counts from the first one sent';
  -- PRD-loyalty-points slice 06: coupons are bearer codes. Nothing in them
  -- names a Customer, so no Claim can issue one to somebody.
  assert not exists (select 1 from pg_constraint
                      where conrelid = 'public.coupons'::regclass and confrelid = 'public.customers'::regclass),
    'coupons still references customers';
  assert not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'coupons' and column_name ~ '^(customer_id|issued)'),
    'coupons still has a column binding it to a Customer';
end $$;

-- Every coupon there is now; the Claims below must add none.
drop table if exists pg_temp.coupons_before_claims;
create temp table coupons_before_claims as select id from coupons;

insert into customer_import_batches (id, source, file_name, file_sha256, rows_total, exported_at)
values ('05050505-0000-4000-8000-0000000000b0', 'shopify_customers_csv', 'assert-05.csv', repeat('a', 64), 9, '2026-10-20');

insert into customers (id, email, first_name) values
  ('05050505-0000-4000-8000-000000000001', 'race@assert05.test',    'Race'),
  ('05050505-0000-4000-8000-000000000002', 'plain@assert05.test',   'Plain'),
  ('05050505-0000-4000-8000-000000000003', 'early@assert05.test',   'Early'),
  ('05050505-0000-4000-8000-000000000004', 'off@assert05.test',     'Off'),
  ('05050505-0000-4000-8000-000000000005', 'partner@assert05.test', 'Pat'),
  ('05050505-0000-4000-8000-000000000006', 'inside@assert05.test',  'Ina'),
  ('05050505-0000-4000-8000-000000000007', 'outside@assert05.test', 'Otto'),
  ('05050505-0000-4000-8000-000000000008', 'never@assert05.test',   'Neve'),
  ('05050505-0000-4000-8000-000000000009', 'zero@assert05.test',    'Zed');

-- Every customer but "plain" is a Migrated customer.
insert into migrated_customers (customer_id, batch_id, created_by_import, email_marketing_at_export, exported_at)
select id, '05050505-0000-4000-8000-0000000000b0', true, 'yes', date '2026-10-15'
  from customers where email like '%@assert05.test' and email <> 'plain@assert05.test';

insert into partner_users (email, application_status) values ('partner@assert05.test', 'approved');

-- ------------------------------------- points off: the Claim, and no bonus
do $$
declare r record;
begin
  select * into r from claim_migrated_customer('05050505-0000-4000-8000-000000000004');
  assert r.claimed, 'off: the Claim still happens';
  assert not r.bonus_granted, 'off: no bonus while points are off';
  assert not r.bonus_email_due, 'off: no bonus, no email';
  assert (select claimed_at is not null from migrated_customers
           where customer_id = '05050505-0000-4000-8000-000000000004'), 'off: claimed_at stamped';
  assert not exists (select 1 from points_ledger where customer_id = '05050505-0000-4000-8000-000000000004'),
    'off: nothing in the ledger';
end $$;

-- "early" also claims while points are off.
do $$ begin perform claim_migrated_customer('05050505-0000-4000-8000-000000000003'); end $$;

-- --------------------------------------------------------------- points on
insert into site_settings (key, value) values ('points_launch_at', '2026-10-01T00:00:00+08:00')
on conflict (key) do update set value = excluded.value;
update site_settings set value = 'true' where key = 'points_enabled';

-- ------------------------------- two concurrent Claims for one Customer
do $$
begin
  perform dblink_connect('a', 'dbname=' || current_database() || ' user=' || current_user);
  perform dblink_connect('b', 'dbname=' || current_database() || ' user=' || current_user);
  perform dblink_exec('a', 'begin');
end $$;
create temp table race_a as
  select * from dblink('a', $q$select * from claim_migrated_customer('05050505-0000-4000-8000-000000000001')$q$)
    as t(claimed boolean, bonus_granted boolean, bonus_email_due boolean);

-- b starts while a's Claim and bonus are uncommitted, so it must wait.
do $$
begin
  perform dblink_send_query('b', $q$select * from claim_migrated_customer('05050505-0000-4000-8000-000000000001')$q$);
  perform pg_sleep(0.5);
  assert dblink_is_busy('b') = 1, 'race: the second Claim waits on the first';
  perform dblink_exec('a', 'commit');
end $$;
create temp table race_b as
  select * from dblink_get_result('b') as t(claimed boolean, bonus_granted boolean, bonus_email_due boolean);
do $$
begin
  perform dblink_disconnect('a');
  perform dblink_disconnect('b');
end $$;

do $$
declare
  a record;
  b record;
begin
  select * into a from race_a;
  select * into b from race_b;
  assert a.claimed and a.bonus_granted, 'race: the first call claims and grants';
  assert not b.claimed and not b.bonus_granted, 'race: the second call claims nothing and grants nothing';
  assert a.bonus_email_due and b.bonus_email_due,
    'race: both may try the email; the customer_emails claim lets one through';
  assert (select count(*) from points_ledger
           where customer_id = '05050505-0000-4000-8000-000000000001' and kind = 'claim_bonus') = 1,
    'race: exactly one Claim bonus';
  assert (select points from points_ledger
           where customer_id = '05050505-0000-4000-8000-000000000001' and kind = 'claim_bonus') = 1000,
    'race: 1,000 points';
  assert (select available from points_balance('05050505-0000-4000-8000-000000000001')) = 1000,
    'race: spendable at once';
end $$;

-- ------------------------------------------------------- earlier claimers
-- "off" and "early" claimed while points were off, before any campaign email:
-- inside the open window, so their next sign-in grants it (rule g).
do $$
declare r record;
begin
  select * into r from claim_migrated_customer('05050505-0000-4000-8000-000000000003');
  assert not r.claimed and r.bonus_granted, 'early: no new Claim, and the bonus at the next sign-in';
  select * into r from claim_migrated_customer('05050505-0000-4000-8000-000000000003');
  assert not r.bonus_granted, 'early: once';
end $$;

-- ------------------------------------------------------- partners, and plain
do $$
declare r record;
begin
  select * into r from claim_migrated_customer('05050505-0000-4000-8000-000000000005');
  assert r.claimed and not r.bonus_granted, 'partner: claimed, never a bonus';
  assert not exists (select 1 from points_ledger where customer_id = '05050505-0000-4000-8000-000000000005'),
    'partner: nothing in the ledger';
end $$;

-- A non-migrated Customer: no Claim, no bonus, and no write at all.
do $$
declare r record;
begin
  select * into r from claim_migrated_customer('05050505-0000-4000-8000-000000000002');
  assert not r.claimed and not r.bonus_granted and not r.bonus_email_due, 'plain: nothing';
  assert txid_current_if_assigned() is null, 'plain: the Claim wrote nothing';
end $$;

-- A bonus of 0 grants nothing.
do $$
declare r record;
begin
  update site_settings set value = '0' where key = 'points_claim_bonus';
  select * into r from claim_migrated_customer('05050505-0000-4000-8000-000000000009');
  assert r.claimed and not r.bonus_granted, 'zero: claimed, no bonus of 0';
  update site_settings set value = '1000' where key = 'points_claim_bonus';
end $$;

-- ------------------------------------------------------------- the window
-- "inside" was first emailed 3 months less a day ago: their window closes
-- tomorrow, so a Claim now is granted. "outside" was first emailed 3 months
-- and a day ago: closed yesterday. "never" was never emailed, so the first
-- wave (outside's email) times them: closed too.
insert into customer_campaign_sends (customer_id, template, wave, status, sent_at) values
  ('05050505-0000-4000-8000-000000000006', 'migration_announcement', 'w2', 'sent', now() - interval '3 months' + interval '1 day'),
  ('05050505-0000-4000-8000-000000000007', 'migration_announcement', 'w1', 'sent', now() - interval '3 months' - interval '1 day');

do $$
declare r record;
begin
  assert claim_bonus_window_end('05050505-0000-4000-8000-000000000006') > now(), 'window: inside is still open';
  assert claim_bonus_window_end('05050505-0000-4000-8000-000000000007') < now(), 'window: outside has closed';
  assert claim_bonus_window_end('05050505-0000-4000-8000-000000000008')
       = claim_bonus_window_end('05050505-0000-4000-8000-000000000007'), 'window: the never-emailed are timed from the first wave';

  select * into r from claim_migrated_customer('05050505-0000-4000-8000-000000000006');
  assert r.claimed and r.bonus_granted, 'window: a Claim 3 months less a day after the email is granted';
  select * into r from claim_migrated_customer('05050505-0000-4000-8000-000000000007');
  assert r.claimed and not r.bonus_granted, 'window: a day after, nothing';
  select * into r from claim_migrated_customer('05050505-0000-4000-8000-000000000008');
  assert r.claimed and not r.bonus_granted, 'window: the never-emailed, after the first wave''s window, nothing';

  -- An earlier claimer whose Claim fell inside the window keeps their right
  -- after it closes. "off" claimed while points were off; date that Claim
  -- before the first wave, as it would be in life (the sends above are
  -- backdated 3 months), so it fell inside the window.
  update migrated_customers set claimed_at = now() - interval '4 months'
   where customer_id = '05050505-0000-4000-8000-000000000004';
  select * into r from claim_migrated_customer('05050505-0000-4000-8000-000000000004');
  assert r.bonus_granted, 'window: a Claim made inside the window is granted at a sign-in after it';
end $$;

-- ------------------------------------------------- the customer_emails ledger
do $$
declare
  c   constant uuid := '05050505-0000-4000-8000-000000000001';
  r   record;
  n   int;
begin
  -- First claim: attempt 1. The email is in flight, so it is no longer due.
  select * into r from claim_customer_email(c, 'account.claim_bonus', c);
  assert r.id is not null and r.attempts = 1, 'ledger: first claim is attempt 1';
  assert not (select bonus_email_due from claim_migrated_customer(c)), 'ledger: pending is not due';

  select count(*) into n from claim_customer_email(c, 'account.claim_bonus', c);
  assert n = 0, 'ledger: a pending row is not claimed twice';

  -- A failed send is retried, up to three attempts.
  update customer_emails set status = 'failed', last_error = 'smtp down' where id = r.id;
  assert (select bonus_email_due from claim_migrated_customer(c)), 'ledger: failed with attempts left is due';
  select * into r from claim_customer_email(c, 'account.claim_bonus', c);
  assert r.attempts = 2, 'ledger: the retry is attempt 2';

  update customer_emails set status = 'failed' where id = r.id;
  select * into r from claim_customer_email(c, 'account.claim_bonus', c);
  assert r.attempts = 3, 'ledger: attempt 3';

  update customer_emails set status = 'failed' where id = r.id;
  select count(*) into n from claim_customer_email(c, 'account.claim_bonus', c);
  assert n = 0, 'ledger: three attempts, then no more';
  assert not (select bonus_email_due from claim_migrated_customer(c)), 'ledger: exhausted is not due';

  -- A sent row is never claimed again.
  update customer_emails set status = 'sent', sent_at = now() where id = r.id;
  select count(*) into n from claim_customer_email(c, 'account.claim_bonus', c);
  assert n = 0, 'ledger: sent is final';
end $$;

-- ------------------------------------------- the Claim issues nothing else
do $$
begin
  assert not exists (select id from coupons except select id from coupons_before_claims),
    format('the Claims wrote %s coupon(s): only the Claim bonus is granted',
           (select count(*) from (select id from coupons except select id from coupons_before_claims) n));
end $$;

-- ------------------------------------------------------------------ grants
do $$
declare f text;
begin
  foreach f in array array[
    'public.claim_migrated_customer(uuid)',
    'public.claim_bonus_window_end(uuid)',
    'public.grant_claim_bonus(uuid)',
    'public.claim_customer_email(uuid, text, uuid)'
  ] loop
    assert not has_function_privilege('anon', f, 'execute'), 'anon executes ' || f;
    assert not has_function_privilege('authenticated', f, 'execute'), 'authenticated executes ' || f;
    assert has_function_privilege('service_role', f, 'execute'), 'service_role cannot execute ' || f;
  end loop;
  assert not has_table_privilege('anon', 'public.customer_emails', 'select'), 'anon cannot read the email ledger';
  assert not has_table_privilege('authenticated', 'public.customer_emails', 'select'), 'authenticated cannot read the email ledger';
  assert (select relrowsecurity from pg_class where oid = 'public.customer_emails'::regclass), 'email ledger has RLS on';
end $$;

-- ----------------------------------------------------------------- cleanup
delete from customer_campaign_sends where customer_id in (select id from customers where email like '%@assert05.test');
delete from customers where email like '%@assert05.test';
delete from partner_users where email like '%@assert05.test';
delete from customer_import_batches where file_name = 'assert-05.csv';
delete from site_settings where key = 'points_launch_at';
update site_settings set value = 'false' where key = 'points_enabled';
drop table if exists pg_temp.coupons_before_claims;
select 'slice 05 claim ok';
