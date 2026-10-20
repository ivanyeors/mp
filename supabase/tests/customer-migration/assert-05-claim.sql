-- Slice 05 (PRD-shopify-customer-migration): the Claim, the Welcome-back
-- voucher and the customer_emails ledger, asserted against real Postgres.
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

\set ON_ERROR_STOP 1
set client_min_messages = error;
create extension if not exists dblink;

-- ---------------------------------------------------------------- fixtures
-- Fixed ids, so a failed earlier run is cleaned up here first.
delete from coupons where customer_id in (select id from customers where email like '%@assert05.test');
delete from customers where email like '%@assert05.test';
delete from customer_import_batches where file_name = 'assert-05.csv';
delete from site_settings where key like 'welcome\_voucher\_%';

-- exported_at is NOT NULL since slice 03 (20261020110000_customer_import_apply.sql).
insert into customer_import_batches (id, source, file_name, file_sha256, rows_total, exported_at)
values ('05050505-0000-4000-8000-0000000000b0', 'shopify_customers_csv', 'assert-05.csv', repeat('a', 64), 5, '2026-10-20');

insert into customers (id, email, first_name) values
  ('05050505-0000-4000-8000-000000000001', 'race@assert05.test',  'Race'),
  ('05050505-0000-4000-8000-000000000002', 'plain@assert05.test', 'Plain'),
  ('05050505-0000-4000-8000-000000000003', 'late@assert05.test',  'Late'),
  ('05050505-0000-4000-8000-000000000004', 'off@assert05.test',   'Off'),
  ('05050505-0000-4000-8000-000000000005', 'ship@assert05.test',  'Ship'),
  ('05050505-0000-4000-8000-000000000006', 'bad@assert05.test',   'Bad');

-- Every customer but "plain" is a Migrated customer.
insert into migrated_customers (customer_id, batch_id, created_by_import, email_marketing_at_export, exported_at)
select id, '05050505-0000-4000-8000-0000000000b0', true, 'yes', date '2026-10-15'
  from customers where email like '%@assert05.test' and email <> 'plain@assert05.test';

-- The seed: issuance off, 60 days. Re-seeded here because the cleanup above
-- removed it.
insert into site_settings (key, value) values
  ('welcome_voucher_enabled', 'false'),
  ('welcome_voucher_valid_days', '60');

-- ----------------------------------------- the safe default issues nothing
do $$
declare r record;
begin
  select * into r from claim_migrated_customer('05050505-0000-4000-8000-000000000004');
  assert r.claimed, 'off: the Claim still happens';
  assert not r.voucher_issued, 'off: issuance is off by default';
  assert not r.welcome_email_due, 'off: no voucher, no email';
  assert (select claimed_at is not null from migrated_customers
           where customer_id = '05050505-0000-4000-8000-000000000004'), 'off: claimed_at stamped';
  assert not exists (select 1 from coupons where customer_id = '05050505-0000-4000-8000-000000000004'),
    'off: no voucher row';
end $$;

-- Enabled, but the owner has not set the terms: still nothing.
update site_settings set value = 'true' where key = 'welcome_voucher_enabled';
do $$
declare r record;
begin
  update migrated_customers set claimed_at = null where customer_id = '05050505-0000-4000-8000-000000000004';
  select * into r from claim_migrated_customer('05050505-0000-4000-8000-000000000004');
  assert r.claimed and not r.voucher_issued, 'enabled with no terms: claimed, no voucher';
end $$;

-- The terms for the rest of the script: SGD 20 off over SGD 50, 60 days,
-- issued until 30 days from today in Singapore.
insert into site_settings (key, value) values
  ('welcome_voucher_type', 'fixed_amount'),
  ('welcome_voucher_value', '20'),
  ('welcome_voucher_min_order', '50'),
  ('welcome_voucher_issue_until', to_char((now() at time zone 'Asia/Singapore')::date + 30, 'YYYY-MM-DD'));

-- ------------------------------- two concurrent Claims for one Customer
do $$
begin
  perform dblink_connect('a', 'dbname=' || current_database() || ' user=' || current_user);
  perform dblink_connect('b', 'dbname=' || current_database() || ' user=' || current_user);
  perform dblink_exec('a', 'begin');
end $$;
create temp table race_a as
  select * from dblink('a', $q$select * from claim_migrated_customer('05050505-0000-4000-8000-000000000001')$q$)
    as t(claimed boolean, voucher_issued boolean, welcome_email_due boolean);

-- b starts while a's Claim and voucher are uncommitted, so it must wait.
do $$
begin
  perform dblink_send_query('b', $q$select * from claim_migrated_customer('05050505-0000-4000-8000-000000000001')$q$);
  perform pg_sleep(0.5);
  assert dblink_is_busy('b') = 1, 'race: the second Claim waits on the first';
  perform dblink_exec('a', 'commit');
end $$;
create temp table race_b as
  select * from dblink_get_result('b') as t(claimed boolean, voucher_issued boolean, welcome_email_due boolean);
do $$
begin
  perform dblink_disconnect('a');
  perform dblink_disconnect('b');
end $$;

do $$
declare
  a record;
  b record;
  v record;
  m record;
begin
  select * into a from race_a;
  select * into b from race_b;
  assert a.claimed and a.voucher_issued, 'race: the first call claims and issues';
  assert not b.claimed and not b.voucher_issued, 'race: the second call claims nothing and issues nothing';
  assert a.welcome_email_due and b.welcome_email_due,
    'race: both may try the email; the customer_emails claim lets one through';

  assert (select count(*) from coupons where customer_id = '05050505-0000-4000-8000-000000000001') = 1,
    'race: exactly one voucher';
  select * into m from migrated_customers where customer_id = '05050505-0000-4000-8000-000000000001';
  assert m.claimed_at is not null, 'race: one claimed_at';

  select * into v from coupons where customer_id = '05050505-0000-4000-8000-000000000001';
  assert v.code ~ '^WB-[2-9A-HJ-NP-Z]{10}$', 'voucher: WB- plus 10 base32 characters, no look-alikes: ' || v.code;
  assert v.issued_for = 'welcome_back', 'voucher: issued_for';
  assert v.discount_type = 'fixed_amount' and v.discount_value = 20, 'voucher: SGD 20 off';
  assert v.min_order_amount = 50, 'voucher: minimum spend';
  assert v.currency = 'SGD', 'voucher: SGD';
  assert v.usage_limit = 1 and v.per_customer_limit = 1, 'voucher: one use';
  assert v.is_active, 'voucher: active';
  assert v.expires_at between m.claimed_at + interval '60 days' - interval '1 minute'
                          and m.claimed_at + interval '60 days' + interval '1 minute',
    'voucher: expires 60 days after the Claim';
end $$;

-- The unique index is a guard of its own: even with claimed_at cleared, a
-- second voucher is never inserted.
do $$
declare r record;
begin
  update migrated_customers set claimed_at = null where customer_id = '05050505-0000-4000-8000-000000000001';
  select * into r from claim_migrated_customer('05050505-0000-4000-8000-000000000001');
  assert r.claimed and not r.voucher_issued, 'index: a second voucher is refused';
  assert (select count(*) from coupons where customer_id = '05050505-0000-4000-8000-000000000001') = 1,
    'index: still one voucher';
  -- And a later call is the one indexed no-op.
  select * into r from claim_migrated_customer('05050505-0000-4000-8000-000000000001');
  assert not r.claimed and not r.voucher_issued, 'later call: nothing';
end $$;

-- A purpose-issued coupon is always bound.
do $$
begin
  begin
    insert into coupons (code, discount_type, discount_value, issued_for)
    values ('WB-UNBOUND', 'fixed_amount', 5, 'welcome_back');
    assert false, 'a welcome_back coupon without a Customer must be refused';
  exception when check_violation then null;
  end;
end $$;

-- ------------------- a non-migrated Customer: no voucher, and no write at all
begin;
do $$
declare r record;
begin
  select * into r from claim_migrated_customer('05050505-0000-4000-8000-000000000002');
  assert not r.claimed and not r.voucher_issued and not r.welcome_email_due, 'plain: nothing';
  -- No transaction id was assigned, so nothing was written (not even a no-op
  -- row version).
  assert txid_current_if_assigned() is null, 'plain: the Claim wrote nothing';
end $$;
commit;

-- ------------------------------ after issue_until: claimed, nothing issued
update site_settings
   set value = to_char((now() at time zone 'Asia/Singapore')::date - 1, 'YYYY-MM-DD')
 where key = 'welcome_voucher_issue_until';
do $$
declare r record;
begin
  select * into r from claim_migrated_customer('05050505-0000-4000-8000-000000000003');
  assert r.claimed, 'late: claimed';
  assert not r.voucher_issued and not r.welcome_email_due, 'late: no voucher';
  assert (select claimed_at is not null from migrated_customers
           where customer_id = '05050505-0000-4000-8000-000000000003'), 'late: claimed_at stamped';
  assert not exists (select 1 from coupons where customer_id = '05050505-0000-4000-8000-000000000003'),
    'late: no voucher row';
end $$;

-- Today is still inside the window.
update site_settings
   set value = to_char((now() at time zone 'Asia/Singapore')::date, 'YYYY-MM-DD')
 where key = 'welcome_voucher_issue_until';

-- ----------------------------------- free shipping, and malformed terms
update site_settings set value = 'free_shipping' where key = 'welcome_voucher_type';
delete from site_settings where key in ('welcome_voucher_value', 'welcome_voucher_min_order');
do $$
declare r record;
begin
  select * into r from claim_migrated_customer('05050505-0000-4000-8000-000000000005');
  assert r.claimed and r.voucher_issued, 'ship: issued on the last day';
  assert (select discount_type = 'free_shipping' and min_order_amount is null
            from coupons where customer_id = '05050505-0000-4000-8000-000000000005'),
    'ship: a free-shipping voucher with no minimum';
end $$;

update site_settings set value = 'fixed_amount' where key = 'welcome_voucher_type';
insert into site_settings (key, value) values ('welcome_voucher_value', 'twenty');
do $$
declare r record;
begin
  select * into r from claim_migrated_customer('05050505-0000-4000-8000-000000000006');
  assert r.claimed and not r.voucher_issued, 'bad: a malformed value issues nothing, and raises nothing';
end $$;

-- ------------------------------------------------- the customer_emails ledger
do $$
declare
  c   constant uuid := '05050505-0000-4000-8000-000000000001';
  r   record;
  n   int;
begin
  -- First claim: attempt 1. The email is in flight, so it is no longer due.
  select * into r from claim_customer_email(c, 'account.welcome_voucher', c);
  assert r.id is not null and r.attempts = 1, 'ledger: first claim is attempt 1';
  assert not (select welcome_email_due from claim_migrated_customer(c)), 'ledger: pending is not due';

  select count(*) into n from claim_customer_email(c, 'account.welcome_voucher', c);
  assert n = 0, 'ledger: a pending row is not claimed twice';

  -- A failed send is retried, up to three attempts.
  update customer_emails set status = 'failed', last_error = 'smtp down' where id = r.id;
  assert (select welcome_email_due from claim_migrated_customer(c)), 'ledger: failed with attempts left is due';
  select * into r from claim_customer_email(c, 'account.welcome_voucher', c);
  assert r.attempts = 2, 'ledger: the retry is attempt 2';
  assert (select last_error is null and status = 'pending' from customer_emails where id = r.id),
    'ledger: a re-claim clears the error';

  update customer_emails set status = 'failed' where id = r.id;
  select * into r from claim_customer_email(c, 'account.welcome_voucher', c);
  assert r.attempts = 3, 'ledger: attempt 3';

  update customer_emails set status = 'failed' where id = r.id;
  select count(*) into n from claim_customer_email(c, 'account.welcome_voucher', c);
  assert n = 0, 'ledger: three attempts, then no more';
  assert not (select welcome_email_due from claim_migrated_customer(c)), 'ledger: exhausted is not due';

  -- A sent row is never claimed again.
  update customer_emails set status = 'sent', sent_at = now() where id = r.id;
  select count(*) into n from claim_customer_email(c, 'account.welcome_voucher', c);
  assert n = 0, 'ledger: sent is final';

  -- The same template about another entity is its own send.
  select * into r from claim_customer_email(c, 'account.welcome_voucher', '05050505-0000-4000-8000-0000000000ff');
  assert r.attempts = 1, 'ledger: keyed by entity';
end $$;

-- A used or expired voucher is not emailed.
do $$
declare c constant uuid := '05050505-0000-4000-8000-000000000005';
begin
  assert (select welcome_email_due from claim_migrated_customer(c)), 'ship: due before it is used';
  update coupons set usage_count = 1 where customer_id = c;
  assert not (select welcome_email_due from claim_migrated_customer(c)), 'ship: a used voucher is not emailed';
  update coupons set usage_count = 0, expires_at = now() - interval '1 second' where customer_id = c;
  assert not (select welcome_email_due from claim_migrated_customer(c)), 'ship: an expired voucher is not emailed';
end $$;

-- ------------------------------------------------------------------ grants
do $$
begin
  assert not has_function_privilege('anon', 'public.claim_migrated_customer(uuid)', 'execute'), 'anon cannot claim';
  assert not has_function_privilege('authenticated', 'public.claim_migrated_customer(uuid)', 'execute'), 'authenticated cannot claim';
  assert has_function_privilege('service_role', 'public.claim_migrated_customer(uuid)', 'execute'), 'service_role claims';
  assert not has_function_privilege('anon', 'public.claim_customer_email(uuid, text, uuid)', 'execute'), 'anon cannot claim an email';
  assert not has_function_privilege('authenticated', 'public.claim_customer_email(uuid, text, uuid)', 'execute'), 'authenticated cannot claim an email';
  assert has_function_privilege('service_role', 'public.claim_customer_email(uuid, text, uuid)', 'execute'), 'service_role claims an email';
  assert not has_table_privilege('anon', 'public.customer_emails', 'select'), 'anon cannot read the ledger';
  assert not has_table_privilege('authenticated', 'public.customer_emails', 'select'), 'authenticated cannot read the ledger';
  assert not has_table_privilege('authenticated', 'public.customer_emails', 'insert'), 'authenticated cannot write the ledger';
  assert (select relrowsecurity from pg_class where oid = 'public.customer_emails'::regclass), 'ledger has RLS on';
  assert not exists (select 1 from pg_policies where tablename = 'customer_emails'), 'ledger has no policy';
  -- coupons stays service-role only: its one policy is scoped to service_role.
  assert not exists (select 1 from pg_policies where tablename = 'coupons' and roles <> '{service_role}'),
    'coupons has no client policy';
end $$;

-- A signed-in Customer cannot read their own voucher row, nor anyone's.
set role authenticated;
do $$
begin
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, false);
  assert (select count(*) from coupons) = 0, 'authenticated reads no coupon';
end $$;
reset role;

-- ----------------------------------------------------------------- cleanup
delete from coupons where customer_id in (select id from customers where email like '%@assert05.test');
delete from customers where email like '%@assert05.test';
delete from customer_import_batches where file_name = 'assert-05.csv';
delete from site_settings where key like 'welcome\_voucher\_%';
insert into site_settings (key, value) values
  ('welcome_voucher_enabled', 'false'),
  ('welcome_voucher_valid_days', '60');
select 'slice 05 claim ok';
