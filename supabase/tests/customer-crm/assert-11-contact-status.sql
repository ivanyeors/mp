-- CRM slice 11: Contact and sign-in status
-- (20261020123000_customer_contact_status.sql, and the overview columns in
-- 20261020200000_customer_overview_contact_status.sql).
--
-- Run from the repository root against a database with every migration
-- applied (a local Postgres with the Supabase roles, or a Supabase branch), as
-- the owner role:
--
--   psql -v ON_ERROR_STOP=1 -q -X -f supabase/tests/customer-crm/assert-11-contact-status.sql
--
-- Everything runs in one transaction that is rolled back, so it leaves no
-- rows behind. Not part of CI. A failed assert stops with its message.

begin;

\set cases `cat supabase/tests/customer-crm/phone-cases.json`
create temp table t_cases on commit drop as
  select (c->>'phone') as phone, (c->>'valid')::boolean as valid, c->>'status' as status, ord::int as i
    from jsonb_array_elements((:'cases')::jsonb->'expected') with ordinality as e(c, ord);

-- ---------------------------------------------------------------------
-- The phone test agrees with isValidPhone on every fixture phone
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  assert (select count(*) from t_cases) > 30, 'phone-cases.json did not load';
  for r in select * from t_cases order by i loop
    assert public.is_valid_phone(r.phone) = r.valid,
      format('is_valid_phone(%L) is %s; isValidPhone says %s', r.phone, public.is_valid_phone(r.phone), r.valid);
    assert public.is_blank_phone(r.phone) = (r.status = 'missing'),
      format('is_blank_phone(%L) is %s; the fixture says %s', r.phone, public.is_blank_phone(r.phone), r.status);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Mobile: on file / missing / invalid list exactly the fixture's buckets
-- ---------------------------------------------------------------------
insert into public.customers (id, email, phone)
select ('c1100000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, format('c11-phone-%s@x.test', i), phone
  from t_cases;

do $$
declare
  v_missing int;
  v_invalid int;
  v_valid   int;
begin
  -- The list's three filters (lib/crm/customer-filters.ts), on the overview.
  assert not exists (
    select 1
      from public.admin_customer_overview o
      join t_cases t on o.email = format('c11-phone-%s@x.test', t.i)
     where (t.status = 'valid')   is distinct from o.phone_valid
        or (t.status = 'missing') is distinct from (not o.has_phone)
        or (t.status = 'invalid') is distinct from (o.has_phone and not o.phone_valid)
  ), 'a fixture Customer lands in a different Mobile bucket than the TypeScript says';

  select count(*) filter (where not has_phone),
         count(*) filter (where has_phone and not phone_valid),
         count(*) filter (where phone_valid)
    into v_missing, v_invalid, v_valid
    from public.admin_customer_overview
   where email like 'c11-phone-%';
  assert v_missing = (select count(*) from t_cases where status = 'missing'), 'Mobile: missing count';
  assert v_invalid = (select count(*) from t_cases where status = 'invalid'), 'Mobile: invalid count';
  assert v_valid   = (select count(*) from t_cases where status = 'valid'),   'Mobile: on file count';
  -- Each Customer is in exactly one.
  assert v_missing + v_invalid + v_valid = (select count(*) from t_cases), 'the buckets do not partition';
  -- *invalid* is exactly the Customers whose phone is on file and fails isValidPhone.
  assert (select array_agg(t.i order by t.i) from t_cases t where t.status <> 'missing' and not t.valid)
       = (select array_agg(t.i order by t.i)
            from public.admin_customer_overview o
            join t_cases t on o.email = format('c11-phone-%s@x.test', t.i)
           where o.has_phone and not o.phone_valid),
    'Mobile: invalid is not exactly the phones on file that fail isValidPhone';
end $$;

-- ---------------------------------------------------------------------
-- account_providers: held to the login
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a1100000-0000-4000-8000-000000000001', 'c11-ana@x.test'),
  ('a1100000-0000-4000-8000-000000000002', 'c11-other@x.test'),
  ('a1100000-0000-4000-8000-000000000003', 'c11-pre@x.test');

insert into public.customers (id, email, auth_user_id, account_providers) values
  -- Inserted without a login: supplied methods are dropped.
  ('c1100000-0000-4000-8000-100000000001', 'c11-guest@x.test', null, '{email}'),
  ('c1100000-0000-4000-8000-100000000002', 'c11-ana@x.test', 'a1100000-0000-4000-8000-000000000001', '{}');

do $$
begin
  assert exists (select 1 from pg_constraint where conname = 'customers_account_providers_with_login'),
    'the check holding account_providers to auth_user_id is missing';
  assert (select account_providers = '{}' from public.customers where id = 'c1100000-0000-4000-8000-100000000001'),
    'an insert without a login kept supplied sign-in methods';
  assert (select account_providers = '{}' from public.customers where id = 'c1100000-0000-4000-8000-100000000002'),
    'a new account starts with no methods recorded';
end $$;

-- linkCustomerToAuthUser's conditional update: written from the identities,
-- matching only while the stored value is the one it read.
do $$
declare
  n int;
begin
  update public.customers set account_providers = '{google}'
   where id = 'c1100000-0000-4000-8000-100000000002'
     and auth_user_id = 'a1100000-0000-4000-8000-000000000001'
     and account_providers = '{}'::text[];
  get diagnostics n = row_count;
  assert n = 1, 'the first write did not match';

  update public.customers set account_providers = '{email,google}'
   where id = 'c1100000-0000-4000-8000-100000000002'
     and auth_user_id = 'a1100000-0000-4000-8000-000000000001'
     and account_providers = '{"google"}'::text[];
  get diagnostics n = row_count;
  assert n = 1, 'the second write (by email code) did not match';

  -- A concurrent load that read the old value matches nothing.
  update public.customers set account_providers = '{email,google}'
   where id = 'c1100000-0000-4000-8000-100000000002'
     and account_providers = '{"google"}'::text[];
  get diagnostics n = row_count;
  assert n = 0, 'a stale conditional update still matched';

  assert (select account_providers = '{email,google}' from public.customers
           where id = 'c1100000-0000-4000-8000-100000000002'), 'Google then email code is not {email,google}';
end $$;

-- The same login written again keeps the methods.
update public.customers set auth_user_id = 'a1100000-0000-4000-8000-000000000001'
 where id = 'c1100000-0000-4000-8000-100000000002';
do $$
begin
  assert (select account_providers = '{email,google}' from public.customers
           where id = 'c1100000-0000-4000-8000-100000000002'), 'rewriting the same login emptied the methods';
end $$;

-- A different login: its methods are not the old one's.
update public.customers set auth_user_id = 'a1100000-0000-4000-8000-000000000002'
 where id = 'c1100000-0000-4000-8000-100000000002';
do $$
begin
  assert (select account_providers = '{}' from public.customers
           where id = 'c1100000-0000-4000-8000-100000000002'), 'a new login kept the old login''s methods';
end $$;

-- The login removed (auth.users delete, on delete set null): emptied.
update public.customers set account_providers = '{email}'
 where id = 'c1100000-0000-4000-8000-100000000002';
delete from auth.users where id = 'a1100000-0000-4000-8000-000000000002';
do $$
begin
  assert (select auth_user_id is null and account_providers = '{}' from public.customers
           where id = 'c1100000-0000-4000-8000-100000000002'), 'a removed login left its methods behind';
end $$;

-- Methods without a login are refused.
do $$
begin
  begin
    update public.customers set account_providers = '{email}'
     where id = 'c1100000-0000-4000-8000-100000000001';
    assert false, 'methods were stored on a Customer with no login';
  exception when check_violation then
    null;
  end;
end $$;

-- ---------------------------------------------------------------------
-- The backfill: a row linked before the migration gets its identities
-- ---------------------------------------------------------------------
insert into auth.identities (user_id, provider, provider_id) values
  ('a1100000-0000-4000-8000-000000000003', 'google', 'g-1'),
  ('a1100000-0000-4000-8000-000000000003', 'email', 'e-1'),
  ('a1100000-0000-4000-8000-000000000003', 'email', 'e-2');
insert into public.customers (id, email, auth_user_id, updated_at) values
  ('c1100000-0000-4000-8000-100000000003', 'c11-pre@x.test', 'a1100000-0000-4000-8000-000000000003',
   '2026-01-01T00:00:00Z');

\ir ../../migrations/20261020123000_customer_contact_status.sql

do $$
begin
  assert (select account_providers = '{email,google}' from public.customers
           where id = 'c1100000-0000-4000-8000-100000000003'), 'the backfill did not read auth.identities';
  assert (select updated_at = '2026-01-01T00:00:00Z' from public.customers
           where id = 'c1100000-0000-4000-8000-100000000003'), 'the backfill moved updated_at';
end $$;

-- ---------------------------------------------------------------------
-- Grants: Staff-only, through the service role
-- ---------------------------------------------------------------------
set local role service_role;
do $$
begin
  assert (select account_providers = '{email,google}' and has_phone = false and phone_valid = false
            from public.admin_customer_overview where id = 'c1100000-0000-4000-8000-100000000003'),
    'the service role cannot read the new overview columns';
end $$;
reset role;

set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claim.sub', 'a1100000-0000-4000-8000-000000000003', true);
  begin
    perform account_providers from public.customers limit 1;
    assert false, 'the customer''s own key can read account_providers';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.is_valid_phone('87805311');
    assert false, 'the customer''s own key can run is_valid_phone';
  exception when insufficient_privilege then
    null;
  end;
end $$;
reset role;

select 'assert-11-contact-status ok';
rollback;
