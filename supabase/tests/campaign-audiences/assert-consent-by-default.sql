-- Marketing consent by default (20261031144524_consent_by_default.sql;
-- PRD-campaign-audiences, ADR 0039), asserted against real Postgres.
--
-- Run from the repository root against a database with every migration
-- applied (a throwaway local one, never production). It prints one line,
-- `consent by default ok`:
--
--   psql -d <db> -v ON_ERROR_STOP=1 -q -X -t -A -f supabase/tests/campaign-audiences/assert-consent-by-default.sql
--
-- Everything runs in one transaction that is rolled back.

\set ON_ERROR_STOP 1
set client_min_messages = error;
begin;

do $$
begin
  assert not has_function_privilege('authenticated', 'public.subscribe_migrated_customers(text[], boolean)', 'execute'),
    'authenticated cannot subscribe the Migrated customers';
  assert not has_function_privilege('anon', 'public.subscribe_migrated_customers(text[], boolean)', 'execute'),
    'anon cannot subscribe the Migrated customers';
  assert has_function_privilege('service_role', 'public.subscribe_migrated_customers(text[], boolean)', 'execute'),
    'the service role subscribes the Migrated customers';
end $$;

do $$
declare
  v_batch  uuid;
  v_never  uuid;  -- imported, export said no, nobody asked
  v_yes    uuid;  -- imported, export said yes
  v_left   uuid;  -- imported, unsubscribed here since
  v_listed uuid;  -- imported, on Shopify's unsubscribed list
  v_chose  uuid;  -- on the list, but subscribed here from their Profile since
  v_merged uuid;  -- an existing Customer the batch merged into, export said no
  v_shop   uuid;  -- bought here, never imported
  res      jsonb;
  ok       boolean;
begin
  insert into public.customer_import_batches (source, file_name, file_sha256, rows_total, exported_at)
  values ('shopify_customers_csv', 'default.csv', repeat('e', 64), 6, '2026-10-19')
  returning id into v_batch;

  insert into public.customers (email) values ('never@example.com') returning id into v_never;
  insert into public.customers (email) values ('yes@example.com') returning id into v_yes;
  insert into public.customers (email) values ('left@example.com') returning id into v_left;
  insert into public.customers (email) values ('Listed@Example.com') returning id into v_listed;
  insert into public.customers (email) values ('chose@example.com') returning id into v_chose;
  insert into public.customers (email) values ('merged@example.com') returning id into v_merged;
  insert into public.customers (email) values ('shop@example.com') returning id into v_shop;

  insert into public.migrated_customers (customer_id, batch_id, created_by_import, email_marketing_at_export, exported_at)
  values (v_never, v_batch, true, 'no', '2026-10-19'),
         (v_yes, v_batch, true, 'yes', '2026-10-19'),
         (v_left, v_batch, true, 'no', '2026-10-19'),
         (v_listed, v_batch, true, 'no', '2026-10-19'),
         (v_chose, v_batch, true, 'no', '2026-10-19'),
         (v_merged, v_batch, false, 'no', '2026-10-19');

  perform public.apply_shopify_email_consent(v_yes, 'yes', '2026-10-19');
  perform public.set_marketing_email(v_left, 'unsubscribed', 'unsubscribe_link');
  perform public.set_marketing_email(v_chose, 'subscribed', 'account');

  -- ── The sources' moves ────────────────────────────────────────────────────
  begin
    perform public.set_marketing_email(v_shop, 'unsubscribed', 'checkout');
    assert false, 'the checkout box never unsubscribes';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.set_marketing_email(v_shop, 'unsubscribed', 'import_default');
    assert false, 'the import default never unsubscribes';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.set_marketing_email(v_shop, 'subscribed', 'shopify_unsubscribed');
    assert false, 'Shopify''s list never subscribes';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.subscribe_migrated_customers(null);
    assert false, 'the run needs a list, even an empty one';
  exception when invalid_parameter_value then null;
  end;

  -- The box at checkout subscribes someone nobody has asked, and never
  -- someone who said no.
  ok := public.set_marketing_email(v_shop, 'subscribed', 'checkout');
  assert ok and (select marketing_email_source from public.customers where id = v_shop) = 'checkout',
    'the checkout box subscribes someone nobody has asked';
  ok := public.set_marketing_email(v_left, 'subscribed', 'checkout');
  assert not ok and (select marketing_email from public.customers where id = v_left) = 'unsubscribed',
    'the checkout box skips, quietly, someone who unsubscribed';

  -- ── The preview counts and changes nothing ────────────────────────────────
  res := public.subscribe_migrated_customers(array[' listed@example.com ', 'chose@example.com', 'gone@example.com', '']);
  assert res = jsonb_build_object(
    'imported', 6, 'already_subscribed', 1, 'to_subscribe', 2, 'stay_unsubscribed', 1,
    'listed', 3, 'listed_customers', 2, 'to_unsubscribe', 1
  ), format('preview: %s', res);
  assert (select marketing_email from public.customers where id = v_never) = 'not_subscribed', 'the preview writes nothing';

  -- ── The run ───────────────────────────────────────────────────────────────
  res := public.subscribe_migrated_customers(array['listed@example.com', 'chose@example.com'], true);
  assert (res->>'subscribed')::int = 2 and (res->>'unsubscribed')::int = 1, format('run: %s', res);

  assert (select marketing_email || '/' || marketing_email_source from public.customers where id = v_never)
    = 'subscribed/import_default', 'nobody asked: subscribed by default';
  assert (select marketing_email || '/' || marketing_email_source from public.customers where id = v_merged)
    = 'subscribed/import_default', 'a merged Customer nobody asked: subscribed by default';
  assert (select marketing_email || '/' || marketing_email_source from public.customers where id = v_yes)
    = 'subscribed/shopify_import', 'an explicit yes keeps its own source';
  assert (select marketing_email || '/' || marketing_email_source from public.customers where id = v_left)
    = 'unsubscribed/unsubscribe_link', 'an unsubscribe here stands';
  assert (select marketing_email || '/' || marketing_email_source from public.customers where id = v_listed)
    = 'unsubscribed/shopify_unsubscribed', 'on Shopify''s list: unsubscribed, never subscribed';
  assert (select marketing_email || '/' || marketing_email_source from public.customers where id = v_chose)
    = 'subscribed/account', 'their own choice here outranks Shopify''s list';
  assert (select marketing_email from public.customers where id = v_shop) = 'subscribed', 'never imported: untouched';
  assert (select count(*) from public.customer_consent_events where source = 'import_default') = 2,
    'one event for each default';
  assert (select count(*) from public.customer_consent_events where source = 'shopify_unsubscribed') = 1,
    'one event for the list';

  -- Run again: nothing more to do.
  res := public.subscribe_migrated_customers(array['listed@example.com', 'chose@example.com'], true);
  assert (res->>'subscribed')::int = 0 and (res->>'unsubscribed')::int = 0 and (res->>'to_subscribe')::int = 0,
    format('a second run changes nothing: %s', res);

  -- ── Undoing the batch takes the default back ──────────────────────────────
  res := public.undo_shopify_import(v_batch);
  assert res->>'status' = 'undone', format('undo: %s', res);
  assert not exists (select 1 from public.customers where id = v_never),
    'a created Customer subscribed only by default is removed, not kept as referenced';
  assert exists (select 1 from public.customers where id = v_listed),
    'a created Customer on Shopify''s list is kept: the unsubscribe must survive a re-import';
  assert (select marketing_email from public.customers where id = v_merged) = 'not_subscribed'
     and (select marketing_email_source from public.customers where id = v_merged) is null,
    'a merged Customer goes back to nobody having asked';
  assert not exists (select 1 from public.customer_consent_events where customer_id = v_merged),
    'and the default''s event goes with it';

  -- The history stays append-only outside an undo.
  begin
    delete from public.customer_consent_events where source = 'shopify_unsubscribed';
    assert false, 'consent events are append-only';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
select 'consent by default ok';
