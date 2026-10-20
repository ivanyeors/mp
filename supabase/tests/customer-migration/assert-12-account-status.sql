-- Migration slice 12: Account status and the Customer overview
-- (20261020111000_customer_account_status_and_overview.sql).
--
-- Run against a database with every migration applied (a local Postgres with
-- the Supabase roles, or a Supabase branch), as the owner role:
--
--   psql -v ON_ERROR_STOP=1 -q -X -f supabase/tests/customer-migration/assert-12-account-status.sql
--
-- Everything runs in one transaction that is rolled back, so it leaves no
-- rows behind. Not part of CI. A failed assert stops with its message.

begin;

-- ---------------------------------------------------------------------
-- The backfill and the invariant: a date exactly when there is a login
-- ---------------------------------------------------------------------
do $$
begin
  assert not exists (
    select 1 from public.customers where (auth_user_id is null) <> (account_linked_at is null)
  ), 'a linked row without account_linked_at, or an unlinked row with one';
  assert exists (
    select 1 from pg_constraint where conname = 'customers_account_linked_at_with_login'
  ), 'the check holding account_linked_at to auth_user_id is missing';
end $$;

-- ---------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------
insert into auth.users (id, email, created_at) values
  ('a0000000-0000-4000-8000-000000000001', 'm12-pre@x.test',   '2026-01-05T10:00:00Z'),
  ('a0000000-0000-4000-8000-000000000002', 'm12-later@x.test', now()),
  ('a0000000-0000-4000-8000-000000000003', 'm12-other@x.test', now());

insert into public.customers (id, email, auth_user_id, account_linked_at) values
  -- Inserted without a login: a supplied date is dropped.
  ('c0000000-0000-4000-8000-000000000001', 'm12-guest@x.test', null, '2020-01-01'),
  -- Inserted with a login: stamped, whatever was supplied.
  ('c0000000-0000-4000-8000-000000000002', 'm12-pre@x.test', 'a0000000-0000-4000-8000-000000000001', '2020-01-01'),
  ('c0000000-0000-4000-8000-000000000003', 'm12-s1@x.test', null, null),
  ('c0000000-0000-4000-8000-000000000004', 'm12-s2@x.test', null, null);

do $$
begin
  assert (select account_linked_at is null from public.customers where id = 'c0000000-0000-4000-8000-000000000001'),
    'an insert without a login kept a supplied account_linked_at';
  assert (select account_linked_at = now() from public.customers where id = 'c0000000-0000-4000-8000-000000000002'),
    'an insert with a login was not stamped now()';
end $$;

-- ---------------------------------------------------------------------
-- Signing in sets it once; a later sign-in does not move it
-- ---------------------------------------------------------------------
update public.customers set auth_user_id = 'a0000000-0000-4000-8000-000000000002'
 where id = 'c0000000-0000-4000-8000-000000000001';

do $$
begin
  assert (select account_linked_at = now() from public.customers where id = 'c0000000-0000-4000-8000-000000000001'),
    'linking a login did not stamp account_linked_at';
end $$;

-- now() is fixed inside this transaction, so move the date into the past by
-- hand (an update that leaves auth_user_id out does not fire the trigger),
-- then sign in again.
update public.customers set account_linked_at = '2026-02-01T00:00:00Z'
 where id = 'c0000000-0000-4000-8000-000000000001';
update public.customers set auth_user_id = 'a0000000-0000-4000-8000-000000000002', first_name = 'Later'
 where id = 'c0000000-0000-4000-8000-000000000001';
update public.customers set auth_user_id = auth_user_id, account_linked_at = '2000-01-01'
 where id = 'c0000000-0000-4000-8000-000000000001';

do $$
begin
  assert (select account_linked_at = '2026-02-01T00:00:00Z' from public.customers
           where id = 'c0000000-0000-4000-8000-000000000001'),
    'a later sign-in (the same login written again) moved account_linked_at';
end $$;

-- Moving to another login re-stamps: the date describes the current login.
update public.customers set auth_user_id = 'a0000000-0000-4000-8000-000000000003'
 where id = 'c0000000-0000-4000-8000-000000000001';
do $$
begin
  assert (select account_linked_at = now() from public.customers where id = 'c0000000-0000-4000-8000-000000000001'),
    'a new login did not re-stamp account_linked_at';
end $$;

-- ---------------------------------------------------------------------
-- Deleting the auth user clears it (on delete set null fires the trigger)
-- ---------------------------------------------------------------------
delete from auth.users where id = 'a0000000-0000-4000-8000-000000000003';
do $$
begin
  assert (select auth_user_id is null and account_linked_at is null from public.customers
           where id = 'c0000000-0000-4000-8000-000000000001'),
    'deleting the login did not clear account_linked_at';
end $$;

-- ---------------------------------------------------------------------
-- The overview and the Migration card against hand-counted queries
-- ---------------------------------------------------------------------
insert into public.customer_import_batches (id, source, file_name, file_sha256, rows_total, rows_done, applied_at)
values ('b0000000-0000-4000-8000-000000000001', 'shopify_customers_csv', 'm12.csv', repeat('c', 64), 4, 4, now());

insert into public.migrated_customers
  (customer_id, shopify_customer_id, batch_id, created_by_import, email_marketing_at_export, exported_at, imported_at)
values
  -- Had an account long before the import: Signed up, before import.
  ('c0000000-0000-4000-8000-000000000002', 912001, 'b0000000-0000-4000-8000-000000000001', false, 'yes', current_date, now() - interval '1 day'),
  -- Its login was deleted above: no account.
  ('c0000000-0000-4000-8000-000000000001', 912002, 'b0000000-0000-4000-8000-000000000001', false, 'no', current_date, now() - interval '1 day'),
  ('c0000000-0000-4000-8000-000000000003', 912003, 'b0000000-0000-4000-8000-000000000001', true, 'yes', current_date, now() - interval '1 day'),
  ('c0000000-0000-4000-8000-000000000004', 912004, 'b0000000-0000-4000-8000-000000000001', true, 'no', current_date, now() - interval '1 day');

-- A created row signs up after its import.
insert into auth.users (id, email) values ('a0000000-0000-4000-8000-000000000004', 'm12-s1@x.test');
update public.customers set auth_user_id = 'a0000000-0000-4000-8000-000000000004'
 where id = 'c0000000-0000-4000-8000-000000000003';

do $$
declare
  view_ids uuid[];
  hand_ids uuid[];
  s record;
  h record;
begin
  -- The "from Shopify + no account" filter.
  select array_agg(id order by id) into view_ids
    from public.admin_customer_overview where from_shopify and not has_account;
  select array_agg(c.id order by c.id) into hand_ids
    from public.migrated_customers m join public.customers c on c.id = m.customer_id
   where c.auth_user_id is null;
  assert view_ids is not distinct from hand_ids,
    format('from Shopify + no account: view %s, by hand %s', view_ids, hand_ids);

  -- The Migration card.
  select * into s from public.admin_customer_migration_summary;
  select count(*) as imported,
         count(*) filter (where m.created_by_import) as created,
         count(*) filter (where not m.created_by_import) as matched,
         count(*) filter (where c.auth_user_id is not null) as signed_up,
         count(*) filter (where c.auth_user_id is not null and c.account_linked_at <= m.imported_at) as before_import
    into h
    from public.migrated_customers m join public.customers c on c.id = m.customer_id;
  assert (s.imported, s.imported_created, s.imported_matched, s.signed_up, s.signed_up_before_import)
         = (h.imported, h.created, h.matched, h.signed_up, h.before_import),
    format('Migration card %s, by hand %s', s, h);
  assert s.batches_applied = (select count(*) from public.customer_import_batches where applied_at is not null),
    'batches_applied disagrees with customer_import_batches';
end $$;

-- ---------------------------------------------------------------------
-- Neither view can be read with the anon key or as a signed-in Customer
-- ---------------------------------------------------------------------
do $$
declare
  r text;
  v text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    foreach v in array array['admin_customer_overview', 'admin_customer_migration_summary'] loop
      assert not has_table_privilege(r, 'public.' || v, 'select'), format('%s can select %s', r, v);
    end loop;
    assert not has_column_privilege(r, 'public.customers', 'account_linked_at', 'select'),
      format('%s can select customers.account_linked_at', r);
    assert not has_column_privilege(r, 'public.customers', 'account_last_seen_at', 'select'),
      format('%s can select customers.account_last_seen_at', r);
  end loop;
end $$;

select 'slice 12 asserts ok';

rollback;
