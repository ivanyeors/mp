-- Slice 07 (PRD-shopify-customer-migration): Marketing consent with
-- provenance, asserted against real Postgres
-- (20261020120000_marketing_consent.sql, 20261020120100_customer_import_marketing_consent.sql,
-- 20261020200000_customer_overview_marketing_consent.sql).
--
-- Run from the repository root against a database with every migration
-- applied (a throwaway local one, never production). It prints one line,
-- `slice 07 marketing consent ok`:
--
--   psql -d <db> -v ON_ERROR_STOP=1 -q -X -t -A -f supabase/tests/customer-migration/assert-07-marketing-consent.sql
--
-- Everything runs in one transaction that is rolled back. The backfill is
-- asserted by running the migration again over seeded rows: it is idempotent,
-- and a re-run is exactly what a later deploy or a branch reset does.

\set ON_ERROR_STOP 1
set client_min_messages = error;
begin;

-- ---------------------------------------------------------------- structure
do $$
begin
  assert has_column_privilege('authenticated', 'public.customers', 'marketing_email', 'select'),
    'the customer reads their own marketing_email';
  assert not has_column_privilege('authenticated', 'public.customers', 'marketing_email_source', 'select'),
    'the source is Staff-facing';
  assert not has_column_privilege('authenticated', 'public.customers', 'marketing_email_updated_at', 'select'),
    'the date is Staff-facing';
  -- Writing it with their own key is refused by RLS (no update policy on
  -- customers); asserted as the customer below.
  assert not exists (select 1 from pg_policies where tablename = 'customers' and cmd in ('UPDATE', 'ALL')
                       and roles && array['authenticated', 'public']::name[]),
    'no customer policy lets them update their row';
  assert not has_table_privilege('authenticated', 'public.customer_consent_events', 'select'), 'events: no select';
  assert not has_table_privilege('anon', 'public.customer_consent_events', 'select'), 'events: no anon select';
  assert not has_table_privilege('authenticated', 'public.customer_consent_events', 'insert'), 'events: no insert';
  assert (select relrowsecurity from pg_class where oid = 'public.customer_consent_events'::regclass), 'events: RLS on';
  assert not exists (select 1 from pg_policies where tablename = 'customer_consent_events'), 'events: no policy';
  assert not has_function_privilege('authenticated', 'public.set_marketing_email(uuid, text, text, timestamptz, uuid)', 'execute'),
    'authenticated cannot call set_marketing_email';
  assert not has_function_privilege('anon', 'public.set_marketing_email(uuid, text, text, timestamptz, uuid)', 'execute'),
    'anon cannot call set_marketing_email';
  assert has_function_privilege('service_role', 'public.set_marketing_email(uuid, text, text, timestamptz, uuid)', 'execute'),
    'the service role calls set_marketing_email';
  assert not has_function_privilege('authenticated', 'public.revert_shopify_email_consent(uuid)', 'execute'),
    'authenticated cannot revert consent';
  assert (select count(*) from information_schema.columns
           where table_name = 'admin_customer_overview'
             and column_name in ('marketing_email', 'marketing_email_updated_at')) = 2,
    'the overview carries the state and its date';
end $$;

-- ---------------------------------------------------------------- fixtures
insert into auth.users (id, email) values ('07070707-0000-4000-8000-0000000000a1', 'own@assert07.test');

insert into customer_import_batches (id, source, file_name, file_sha256, rows_total, exported_at)
values ('07070707-0000-4000-8000-0000000000b0', 'shopify_customers_csv', 'assert-07.csv', repeat('7', 64), 5, '2026-10-15');

insert into customers (id, email, auth_user_id) values
  ('07070707-0000-4000-8000-000000000001', 'yes@assert07.test', null),
  ('07070707-0000-4000-8000-000000000002', 'no@assert07.test', null),
  ('07070707-0000-4000-8000-000000000003', 'unsub@assert07.test', null),
  ('07070707-0000-4000-8000-000000000004', 'own@assert07.test', '07070707-0000-4000-8000-0000000000a1'),
  ('07070707-0000-4000-8000-000000000005', 'platform@assert07.test', null);

insert into migrated_customers (customer_id, batch_id, created_by_import, email_marketing_at_export, exported_at)
select id, '07070707-0000-4000-8000-0000000000b0', true,
       case when email = 'no@assert07.test' then 'no' else 'yes' end, date '2026-10-15'
  from customers where email like '%@assert07.test' and email <> 'platform@assert07.test';

-- Before the backfill re-runs: one said yes on Shopify and has since
-- unsubscribed; one said yes and has since subscribed on the platform.
do $$
begin
  assert set_marketing_email('07070707-0000-4000-8000-000000000003', 'unsubscribed', 'unsubscribe_link'),
    'not_subscribed -> unsubscribed by the link';
  assert set_marketing_email('07070707-0000-4000-8000-000000000004', 'subscribed', 'account'),
    'not_subscribed -> subscribed by the customer';
end $$;

-- ---------------------------------------------------------------- backfill
-- Replaying this slice's migration puts its own set_marketing_email back for
-- the rest of this rolled-back transaction, as it always did. Since
-- 20261031152709 the current one has a fifth argument, so it is dropped first:
-- two overloads would make every four-argument call ambiguous.
drop function public.set_marketing_email(uuid, text, text, timestamptz, uuid);
\o /dev/null
\ir ../../migrations/20261020120000_marketing_consent.sql
\ir ../../migrations/20261020120000_marketing_consent.sql
\o

do $$
declare c record;
begin
  select * into c from customers where id = '07070707-0000-4000-8000-000000000001';
  assert c.marketing_email = 'subscribed', 'yes at export: subscribed';
  assert c.marketing_email_source = 'shopify_import', 'yes at export: source shopify_import';
  assert c.marketing_email_updated_at = timestamptz '2026-10-15 00:00:00+08', 'dated the export day in Singapore';
  assert (select count(*) from customer_consent_events where customer_id = c.id) = 1,
    'one event, however often the backfill runs';
  assert exists (
    select 1 from customer_consent_events
     where customer_id = c.id and channel = 'email' and from_state = 'not_subscribed'
       and to_state = 'subscribed' and source = 'shopify_import'
       and created_at = timestamptz '2026-10-15 00:00:00+08'
  ), 'the event carries the provenance';

  select * into c from customers where id = '07070707-0000-4000-8000-000000000002';
  assert c.marketing_email = 'not_subscribed' and c.marketing_email_source is null
    and c.marketing_email_updated_at is null, 'no at export: not_subscribed, never unsubscribed';
  assert not exists (select 1 from customer_consent_events where customer_id = c.id), 'no at export: no event';

  select * into c from customers where id = '07070707-0000-4000-8000-000000000003';
  assert c.marketing_email = 'unsubscribed' and c.marketing_email_source = 'unsubscribe_link',
    'the backfill never re-subscribes someone who unsubscribed';
  assert (select count(*) from customer_consent_events where customer_id = c.id) = 1, 'unsubscribed: only their own event';

  select * into c from customers where id = '07070707-0000-4000-8000-000000000004';
  assert c.marketing_email = 'subscribed' and c.marketing_email_source = 'account',
    'already subscribed: the customer''s own provenance stays';

  select * into c from customers where id = '07070707-0000-4000-8000-000000000005';
  assert c.marketing_email = 'not_subscribed', 'a platform Customer is not inferred to agree';
end $$;

-- ---------------------------------------------------------------- the rule
do $$
declare refused boolean;
begin
  -- The import's half: skipped, not an error, so one row cannot fail a chunk.
  assert not set_marketing_email('07070707-0000-4000-8000-000000000003', 'subscribed', 'shopify_import'),
    'the import skips someone who unsubscribed';

  -- No source but the customer's may subscribe at all.
  refused := false;
  begin
    perform set_marketing_email('07070707-0000-4000-8000-000000000003', 'subscribed', 'support');
  exception when invalid_parameter_value then refused := true;
  end;
  assert refused, 'Staff never subscribe anyone';

  -- At the table, whatever the path.
  refused := false;
  begin
    update customers
       set marketing_email = 'subscribed', marketing_email_source = 'shopify_import', marketing_email_updated_at = now()
     where id = '07070707-0000-4000-8000-000000000003';
  exception when check_violation then refused := true;
  end;
  assert refused, 'a direct update cannot re-subscribe someone who unsubscribed';

  -- Nothing moves anyone back to not_subscribed, and provenance holds.
  refused := false;
  begin
    perform set_marketing_email('07070707-0000-4000-8000-000000000001', 'not_subscribed', 'account');
  exception when invalid_parameter_value then refused := true;
  end;
  assert refused, 'not_subscribed is never a target';
  refused := false;
  begin
    update customers set marketing_email_source = null where id = '07070707-0000-4000-8000-000000000001';
  exception when check_violation then refused := true;
  end;
  assert refused, 'a recorded state keeps its provenance';

  -- The customer's own action may.
  assert set_marketing_email('07070707-0000-4000-8000-000000000003', 'subscribed', 'account'),
    'the customer re-subscribes themselves';
  assert exists (
    select 1 from customer_consent_events
     where customer_id = '07070707-0000-4000-8000-000000000003'
       and from_state = 'unsubscribed' and to_state = 'subscribed' and source = 'account'
  ), 'and that is recorded';
end $$;

-- ------------------------------------------------- unsubscribe is idempotent
do $$
begin
  assert set_marketing_email('07070707-0000-4000-8000-000000000001', 'unsubscribed', 'unsubscribe_link'),
    'a valid link unsubscribes';
  assert not set_marketing_email('07070707-0000-4000-8000-000000000001', 'unsubscribed', 'unsubscribe_link'),
    'a second click changes nothing';
  assert not set_marketing_email('07070707-0000-4000-8000-000000000001', 'unsubscribed', 'complaint'),
    'nor does a complaint after it';
  assert (select count(*) from customer_consent_events where customer_id = '07070707-0000-4000-8000-000000000001') = 2,
    'one event per change';
end $$;

-- ------------------------------------------------------------ append-only
do $$
declare refused boolean;
begin
  refused := false;
  begin
    update customer_consent_events set source = 'support' where customer_id = '07070707-0000-4000-8000-000000000001';
  exception when insufficient_privilege then refused := true;
  end;
  assert refused, 'an event is never edited';
  refused := false;
  begin
    delete from customer_consent_events where customer_id = '07070707-0000-4000-8000-000000000001';
  exception when insufficient_privilege then refused := true;
  end;
  assert refused, 'an event is never deleted';
end $$;

-- ------------------------------------------- the customer reads their own
set role authenticated;
do $$
begin
  perform set_config('request.jwt.claim.sub', '07070707-0000-4000-8000-0000000000a1', true);
  assert (select marketing_email from customers) = 'subscribed', 'own row: subscribed';
  update customers set marketing_email = 'unsubscribed', marketing_email_source = 'account',
                       marketing_email_updated_at = now();
end $$;
reset role;
do $$
begin
  assert (select marketing_email = 'subscribed' and marketing_email_source = 'account'
            from customers where id = '07070707-0000-4000-8000-000000000004'),
    'the customer''s own key changes nothing: the Profile goes through the server';
end $$;
set role authenticated;
do $$
declare refused boolean := false;
begin
  perform set_config('request.jwt.claim.sub', '07070707-0000-4000-8000-0000000000a1', true);
  begin
    perform marketing_email_source from customers;
  exception when insufficient_privilege then refused := true;
  end;
  assert refused, 'own row: the source is not theirs to read';
end $$;
reset role;

-- ------------------------------------------------- import, then undo
do $$
declare
  v_batch uuid;
  v_again uuid;
  res     jsonb;
  rows    jsonb;
begin
  -- A platform Customer the import will merge into, and one who unsubscribed.
  insert into customers (id, email) values
    ('07070707-0000-4000-8000-000000000011', 'merge-yes@assert07.test'),
    ('07070707-0000-4000-8000-000000000012', 'merge-unsub@assert07.test');
  perform set_marketing_email('07070707-0000-4000-8000-000000000012', 'unsubscribed', 'account');

  rows := jsonb_build_array(
    jsonb_build_object('i', 0, 'shopify_customer_id', '7070700000001', 'email', 'create-yes@assert07.test',
                       'email_marketing_at_export', 'yes'),
    jsonb_build_object('i', 1, 'shopify_customer_id', '7070700000002', 'email', 'create-no@assert07.test',
                       'email_marketing_at_export', 'no'),
    jsonb_build_object('i', 2, 'shopify_customer_id', '7070700000003', 'email', 'merge-yes@assert07.test',
                       'email_marketing_at_export', 'yes'),
    jsonb_build_object('i', 3, 'shopify_customer_id', '7070700000004', 'email', 'merge-unsub@assert07.test',
                       'email_marketing_at_export', 'yes'),
    jsonb_build_object('i', 4, 'shopify_customer_id', '7070700000005', 'email', 'create-yes-unsub@assert07.test',
                       'email_marketing_at_export', 'yes')
  );
  insert into customer_import_batches (source, file_name, file_sha256, rows_total, exported_at)
  values ('shopify_customers_csv', 'assert-07-import.csv', repeat('8', 64), 5, '2026-10-18')
  returning id into v_batch;
  res := import_shopify_customers(v_batch, 0, rows);
  assert res->>'status' = 'applied', format('imported: %s', res);
  assert (finish_shopify_import(v_batch))->>'status' = 'applied', 'the batch reconciles';

  assert (select marketing_email = 'subscribed' and marketing_email_source = 'shopify_import'
                 and marketing_email_updated_at = timestamptz '2026-10-18 00:00:00+08'
            from customers where email = 'create-yes@assert07.test'), 'created, yes: subscribed with provenance';
  assert (select marketing_email = 'not_subscribed' from customers where email = 'create-no@assert07.test'),
    'created, no: not_subscribed';
  assert (select marketing_email = 'subscribed' and marketing_email_source = 'shopify_import'
            from customers where email = 'merge-yes@assert07.test'), 'merged, yes: subscribed';
  assert (select marketing_email = 'unsubscribed' and marketing_email_source = 'account'
            from customers where email = 'merge-unsub@assert07.test'), 'the import never re-subscribes';

  -- Running the same rows in a new batch changes nothing.
  insert into customer_import_batches (source, file_name, file_sha256, rows_total, exported_at)
  values ('shopify_customers_csv', 'assert-07-again.csv', repeat('6', 64), 5, '2026-10-19')
  returning id into v_again;
  res := import_shopify_customers(v_again, 0, rows);
  assert (select count(*) from jsonb_array_elements(res->'outcomes') o where o->>'outcome' = 'already_imported') = 5,
    format('the same rows again are already imported: %s', res);
  assert (select count(*) from customer_consent_events e join customers c on c.id = e.customer_id
           where c.email like '%@assert07.test' and e.source = 'shopify_import'
             and c.email in ('create-yes@assert07.test', 'merge-yes@assert07.test', 'create-yes-unsub@assert07.test')) = 3,
    'a re-import writes no second event';

  -- One created Customer unsubscribes from a link before the undo.
  perform set_marketing_email((select id from customers where email = 'create-yes-unsub@assert07.test'),
                              'unsubscribed', 'unsubscribe_link');

  -- The import's own event does not keep a row; any other consent event does.
  res := preview_shopify_import_undo(v_batch);
  assert res = '{"removed": 2, "unlinked": 2, "kept": 1, "kept_claimed": 0, "kept_referenced": 1}',
    format('undo plan: %s', res);
  res := undo_shopify_import(v_batch);
  assert res->>'status' = 'undone', format('undone: %s', res);

  assert not exists (select 1 from customers where email in ('create-yes@assert07.test', 'create-no@assert07.test')),
    'untouched creates are removed, events and all';
  assert (select marketing_email = 'unsubscribed' and marketing_email_source = 'unsubscribe_link'
            from customers where email = 'create-yes-unsub@assert07.test'),
    'the Customer who unsubscribed is kept, still unsubscribed';
  assert (select marketing_email = 'not_subscribed' and marketing_email_source is null
                 and marketing_email_updated_at is null
            from customers where email = 'merge-yes@assert07.test'),
    'a merged Customer''s import consent is taken back';
  assert not exists (select 1 from customer_consent_events
                      where customer_id = '07070707-0000-4000-8000-000000000011'),
    'with its event';
  assert (select marketing_email = 'unsubscribed' and marketing_email_source = 'account'
            from customers where email = 'merge-unsub@assert07.test'),
    'a merged Customer''s own choice survives the undo';
  assert (select count(*) from customer_consent_events
           where customer_id = '07070707-0000-4000-8000-000000000012') = 1, 'and its history';
end $$;

rollback;
select 'slice 07 marketing consent ok';
