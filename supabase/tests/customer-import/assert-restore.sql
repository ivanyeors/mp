-- Slice 03: an undo that nothing has touched since restores the prior state.
-- Every table the import writes is compared row for row with a snapshot taken
-- before the import. The only difference allowed is the one the design keeps:
-- a merged Customer's null names and phone stay filled (ADR 0028 e). A batch
-- of creates only must therefore restore everything, to the byte. Rolled back.

begin;
\ir seed.sql

create temp table t_customers on commit drop as select to_jsonb(c) as r from public.customers c;
create temp table t_addresses on commit drop as select to_jsonb(a) as r from public.customer_addresses a;
create temp table t_migrated on commit drop as select to_jsonb(m) as r from public.migrated_customers m;
create temp table t_users on commit drop as select to_jsonb(u) as r from auth.users u;

create or replace function pg_temp.same(now_rows jsonb[], then_rows jsonb[]) returns boolean
language sql immutable as $$
  select not exists (select unnest(now_rows) except all select unnest(then_rows))
     and not exists (select unnest(then_rows) except all select unnest(now_rows));
$$;

do $$
declare
  doc     jsonb := (select t.doc from t_cases t);
  c0      jsonb := doc->'chunks'->0;
  c1      jsonb := doc->'chunks'->1;
  n0      int := jsonb_array_length(doc->'chunks'->0);
  n       int := jsonb_array_length(doc->'chunks'->0) + jsonb_array_length(doc->'chunks'->1);
  creates jsonb;
  v_batch uuid;
  res     jsonb;
  -- What a merge may leave behind, by design.
  kept_fill text[] := array['first_name', 'last_name', 'phone', 'updated_at'];
begin
  -- ── The whole fixture: creates, merges, skips ─────────────────────────────
  insert into public.customer_import_batches (source, file_name, file_sha256, rows_total, exported_at)
  values ('shopify_customers_csv', 'restore.csv', repeat('e', 64), n, '2026-10-19')
  returning id into v_batch;
  perform public.import_shopify_customers(v_batch, 0, c0);
  perform public.import_shopify_customers(v_batch, n0, c1);
  res := public.finish_shopify_import(v_batch);
  assert res->>'status' = 'applied', format('imported: %s', res);
  assert (select count(*) from public.customers) > (select count(*) from t_customers), 'the import wrote rows';

  res := public.undo_shopify_import(v_batch);
  assert res = '{"status": "undone", "removed": 5, "unlinked": 3, "kept": 0, "kept_claimed": 0, "kept_referenced": 0}',
    format('nothing touched since, so every create is removed: %s', res);

  assert pg_temp.same(array(select to_jsonb(a) from public.customer_addresses a), array(select r from t_addresses)),
    'customer_addresses is exactly as before';
  assert pg_temp.same(array(select to_jsonb(m) from public.migrated_customers m), array(select r from t_migrated)),
    'migrated_customers is exactly as before';
  assert pg_temp.same(array(select to_jsonb(u) from auth.users u), array(select r from t_users)),
    'auth.users is exactly as before';
  assert pg_temp.same(array(select to_jsonb(c) - kept_fill from public.customers c), array(select r - kept_fill from t_customers)),
    'customers is exactly as before, apart from filled nulls';
  -- And the filled nulls are only ever nulls that were filled.
  assert not exists (
    select 1 from public.customers c join t_customers t on (t.r->>'id')::uuid = c.id
     where (t.r->>'first_name' is not null and c.first_name is distinct from t.r->>'first_name')
        or (t.r->>'last_name' is not null and c.last_name is distinct from t.r->>'last_name')
        or (t.r->>'phone' is not null and c.phone is distinct from t.r->>'phone')
  ), 'a merge only ever filled a null';

  -- ── Creates only: restored to the byte ────────────────────────────────────
  -- The rows the preview said create, renumbered as a file of their own.
  select jsonb_agg(x.value || jsonb_build_object('i', x.k) order by x.k) into creates
    from (select e.value, row_number() over (order by e.ordinality) - 1 as k
            from jsonb_array_elements(c0 || c1) with ordinality e
           where (doc->'expected'->((e.value->>'i')::int))->>'outcome' = 'create') x;
  insert into public.customer_import_batches (source, file_name, file_sha256, rows_total, exported_at)
  values ('shopify_customers_csv', 'creates.csv', repeat('9', 64), jsonb_array_length(creates), '2026-10-19')
  returning id into v_batch;
  -- The full fixture's merges are still filled from above; snapshot again.
  delete from t_customers;
  insert into t_customers select to_jsonb(c) from public.customers c;
  res := public.import_shopify_customers(v_batch, 0, creates);
  assert (select count(*) from jsonb_array_elements(res->'outcomes') o where o->>'outcome' = 'create') = 5,
    format('five creates: %s', res);
  perform public.finish_shopify_import(v_batch);
  res := public.undo_shopify_import(v_batch);
  assert (res->>'removed')::int = 5, format('all five removed: %s', res);
  assert pg_temp.same(array(select to_jsonb(c) from public.customers c), array(select r from t_customers)),
    'customers is exactly as before, every column';
  assert pg_temp.same(array(select to_jsonb(a) from public.customer_addresses a), array(select r from t_addresses)),
    'customer_addresses is exactly as before';
  assert pg_temp.same(array(select to_jsonb(m) from public.migrated_customers m), array(select r from t_migrated)),
    'migrated_customers is exactly as before';
end $$;

rollback;
select 'customer import: undo restores ok';
