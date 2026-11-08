-- Past-purchase points (ADR 0030, amendment of 2026-11-08): a Migrated
-- customer's points for what they spent on the old shop, granted once by a
-- Staff run, asserted against real Postgres
-- (20261108100100_past_purchase_points.sql).
--
-- Run from the repository root against a database with every migration
-- applied (a throwaway local one, never production). It prints one line,
-- `points past purchases ok`:
--
--   psql -d <db> -v ON_ERROR_STOP=1 -q -X -t -A -f supabase/tests/loyalty-points/assert-10-past-purchases.sql
--
-- A run grants every candidate in the database, so this needs one whose only
-- Migrated customers with Shopify-era spend are its own, or that is fine to
-- grant them.

\set ON_ERROR_STOP 1
set client_min_messages = error;

-- ---------------------------------------------------------------- cleanup
delete from customers where email like '%@assertpts10.test';
delete from partner_users where email like '%@assertpts10.test';
delete from customer_import_batches where file_name = 'assert-pts10.csv';
create temp table t_settings as select key, value from site_settings where key = 'points_earn_per_dollar';
delete from site_settings where key = 'points_earn_per_dollar';
insert into site_settings (key, value) values ('points_earn_per_dollar', '1');

-- ---------------------------------------------------------------- structure
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.past_purchase_points_preview()',
    'public.grant_past_purchase_points(uuid, integer, bigint)'
  ] loop
    assert not has_function_privilege('anon', f, 'execute'), 'anon executes ' || f;
    assert not has_function_privilege('authenticated', f, 'execute'), 'authenticated executes ' || f;
    assert has_function_privilege('service_role', f, 'execute'), 'service_role cannot execute ' || f;
  end loop;
  assert not has_table_privilege('anon', 'public.points_past_purchase_candidates', 'select'), 'anon reads the candidates';
  assert not has_table_privilege('authenticated', 'public.points_past_purchase_candidates', 'select'), 'authenticated reads the candidates';
end $$;

-- ---------------------------------------------------------------- fixtures
insert into customer_import_batches (id, source, file_name, file_sha256, rows_total, exported_at)
values ('10100101-0000-4000-8000-0000000000b0', 'shopify_customers_csv', 'assert-pts10.csv', repeat('d', 64), 5, '2026-10-20');
insert into customers (id, email, first_name) values
  ('10100101-0000-4000-8000-000000000001', 'ana@assertpts10.test', 'Ana'),    -- S$458.00: 458
  ('10100101-0000-4000-8000-000000000002', 'bo@assertpts10.test', 'Bo'),      -- S$0.50: under a point
  ('10100101-0000-4000-8000-000000000003', 'cy@assertpts10.test', 'Cy'),      -- no spend
  ('10100101-0000-4000-8000-000000000004', 'di@assertpts10.test', 'Di'),      -- S$8,445.36: 8,445, and an earn here
  ('10100101-0000-4000-8000-000000000005', 'ed@assertpts10.test', 'Ed'),      -- a partner
  ('10100101-0000-4000-8000-000000000006', 'fay@assertpts10.test', 'Fay');    -- never a Migrated customer
insert into migrated_customers (customer_id, batch_id, created_by_import, email_marketing_at_export, exported_at, shopify_orders_count, shopify_amount_spent)
select id, '10100101-0000-4000-8000-0000000000b0', true, 'no', '2026-10-20', n, spend
  from (values
    ('10100101-0000-4000-8000-000000000001'::uuid, 2, 458.00),
    ('10100101-0000-4000-8000-000000000002'::uuid, 1, 0.50),
    ('10100101-0000-4000-8000-000000000003'::uuid, 0, 0.00),
    ('10100101-0000-4000-8000-000000000004'::uuid, 5, 8445.36),
    ('10100101-0000-4000-8000-000000000005'::uuid, 1, 100.00)
  ) v(id, n, spend);
insert into partner_users (email, application_status) values ('ed@assertpts10.test', 'approved');
-- Points earned here, which the run neither reads nor changes.
insert into points_ledger (customer_id, kind, points) values ('10100101-0000-4000-8000-000000000004', 'earn', 30);

-- ---------------------------------------------------------------- the candidates
do $$
begin
  assert (select array_agg(customer_id::text || ':' || points order by customer_id)
            from points_past_purchase_candidates
           where customer_id::text like '10100101-%')
       = array['10100101-0000-4000-8000-000000000001:458', '10100101-0000-4000-8000-000000000004:8445'],
    'candidates: a point or more, partners left out';
end $$;

-- ---------------------------------------------------------------- the run
create temp table t_preview as select * from past_purchase_points_preview();

do $$
declare
  p record;
begin
  select * into p from t_preview;
  assert p.customers >= 2 and p.points >= 458 + 8445, 'preview counts the fixture';
  assert p.earn_per_dollar = 1, 'preview: the rate';
  assert p.largest >= 8445, 'preview: the largest grant';
  assert p.partners_left_out >= 1, 'preview: the partner left out';
  -- Numbers that are not the preview's are refused, and nothing is written.
  begin
    perform grant_past_purchase_points(null, p.customers, p.points + 1);
    assert false, 'a run with other numbers is refused';
  exception when check_violation then null;
  end;
  assert not exists (select 1 from points_ledger where kind = 'past_purchases' and customer_id::text like '10100101-%'),
    'nothing written by a refused run';
end $$;

create temp table t_grant as
  select g.* from t_preview p, grant_past_purchase_points(null, p.customers, p.points) g;

do $$
begin
  assert (select customers from t_grant) = (select customers from t_preview), 'the run grants the preview''s customers';
  assert (select points from t_grant) = (select points from t_preview), 'the run grants the preview''s points';
  assert (select array_agg(customer_id::text || ':' || points || ':' || note order by customer_id)
            from points_ledger where kind = 'past_purchases' and customer_id::text like '10100101-%')
       = array[
           '10100101-0000-4000-8000-000000000001:458:S$458.00 spent on the old shop',
           '10100101-0000-4000-8000-000000000004:8445:S$8,445.36 spent on the old shop'
         ],
    'one entry each, with what they spent';
  assert (select available from points_balance('10100101-0000-4000-8000-000000000004')) = 8445 + 30, 'the balance holds both';
  -- Rule (t): milestones count earn less clawback, never these.
  assert (select earned from points_milestone_progress where customer_id = '10100101-0000-4000-8000-000000000004') = 30,
    'milestones do not count past purchases';
  assert (select past_purchase_points from admin_points_summary) >= 458 + 8445, 'the cost summary counts them';
end $$;

-- A second run grants nobody twice; a later import is granted once.
do $$
declare
  g record;
begin
  select * into g from grant_past_purchase_points(null, 0, 0);
  assert g.customers = 0 and g.points = 0, 'a second run grants nothing';

  insert into customers (id, email, first_name) values ('10100101-0000-4000-8000-000000000007', 'gil@assertpts10.test', 'Gil');
  insert into migrated_customers (customer_id, batch_id, created_by_import, email_marketing_at_export, exported_at, shopify_orders_count, shopify_amount_spent)
  values ('10100101-0000-4000-8000-000000000007', '10100101-0000-4000-8000-0000000000b0', true, 'no', '2026-10-20', 1, 33.33);
  select * into g from grant_past_purchase_points(null, 1, 33);
  assert g.customers = 1 and g.points = 33, 'a later import is granted';

  begin
    insert into points_ledger (customer_id, kind, points) values ('10100101-0000-4000-8000-000000000001', 'past_purchases', 5);
    assert false, 'one past_purchases entry per Customer';
  exception when unique_violation then null;
  end;
  begin
    insert into points_ledger (customer_id, kind, points) values ('10100101-0000-4000-8000-000000000006', 'past_purchases', -5);
    assert false, 'past_purchases is never negative';
  exception when check_violation then null;
  end;
end $$;

-- ---------------------------------------------------------------- cleanup
delete from customers where email like '%@assertpts10.test';
delete from partner_users where email like '%@assertpts10.test';
delete from customer_import_batches where file_name = 'assert-pts10.csv';
delete from site_settings where key = 'points_earn_per_dollar';
insert into site_settings (key, value) select key, value from t_settings;

select 'points past purchases ok';
