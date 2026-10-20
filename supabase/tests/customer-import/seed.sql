-- Seeds AGREEMENT_SEED (lib/customer-migration/__tests__/fixtures.ts) from
-- cases.json, inside the including file's transaction: the Customers already
-- on the platform, an earlier batch, and its Migrated customers. Included by
-- each assert file with \ir; run from the repository root.

\set cases `cat supabase/tests/customer-import/cases.json`
create temp table t_cases on commit drop as select (:'cases')::jsonb as doc;

do $$
declare
  doc     jsonb := (select t.doc from t_cases t);
  c       jsonb;
  v_user  uuid;
  v_prior uuid;
  v_n     int;
begin
  select count(*) into v_n from jsonb_array_elements(doc->'seed') s where s->>'migrated' is not null;
  insert into public.customer_import_batches
    (source, file_name, file_sha256, rows_total, rows_done, created, exported_at, applied_at)
  values ('shopify_customers_csv', 'earlier.csv', repeat('0', 64), v_n, v_n, v_n, '2026-01-01', now())
  returning id into v_prior;

  for c in select value from jsonb_array_elements(doc->'seed') loop
    v_user := null;
    if (c->>'has_account')::boolean then
      insert into auth.users (email) values (lower(c->>'email')) returning id into v_user;
    end if;
    insert into public.customers
      (id, email, first_name, last_name, phone, auth_user_id, tags, notes, total_orders, total_spent)
    values (
      (c->>'id')::uuid, c->>'email', c->>'first_name', c->>'last_name', c->>'phone', v_user,
      array(select jsonb_array_elements_text(c->'tags')), c->>'notes',
      (c->>'total_orders')::int, (c->>'total_spent')::numeric
    );
    if jsonb_typeof(c->'address') = 'object' then
      insert into public.customer_addresses (customer_id, recipient, line1, city, postal_code, country, is_default)
      values (
        (c->>'id')::uuid, c->'address'->>'recipient', c->'address'->>'line1', c->'address'->>'city',
        c->'address'->>'postal_code', c->'address'->>'country', true
      );
    end if;
    if c->>'migrated' is not null then
      insert into public.migrated_customers
        (customer_id, shopify_customer_id, batch_id, created_by_import, email_marketing_at_export, exported_at)
      values ((c->>'id')::uuid, (c->>'migrated')::bigint, v_prior, true, 'no', '2026-01-01');
    end if;
  end loop;
end $$;
