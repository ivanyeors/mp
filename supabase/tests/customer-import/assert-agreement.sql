-- Slice 03: import_shopify_customers decides every row of the agreement
-- fixture as the TS preview did (cases.json `expected`), writes what a create
-- and a merge should, never changes what the platform owns, counts on the
-- server, refuses a chunk sent twice, and reconciles. Everything is rolled back.

begin;
\ir seed.sql

create temp table t_before on commit drop as
  select id, email, auth_user_id, tags, notes, total_orders, total_spent, first_name, last_name, phone
    from public.customers;
create temp table t_totals on commit drop as
  select (select count(*) from public.customers) as customers, (select count(*) from auth.users) as users;

do $$
declare
  doc   jsonb := (select t.doc from t_cases t);
  c0    jsonb := doc->'chunks'->0;
  c1    jsonb := doc->'chunks'->1;
  exp   jsonb := doc->'expected';
  n0    int := jsonb_array_length(doc->'chunks'->0);
  n     int := jsonb_array_length(doc->'chunks'->0) + jsonb_array_length(doc->'chunks'->1);
  v_batch uuid;
  v_again uuid;
  v_late  uuid;
  r0    jsonb;
  r1    jsonb;
  res   jsonb;
  b     public.customer_import_batches%rowtype;
  v     record;
  v_id  uuid;
  n_create int;
  n_merge int;
  n_already int;
  v_skips jsonb;
begin
  insert into public.customer_import_batches (source, file_name, file_sha256, rows_total, exported_at)
  values ('shopify_customers_csv', 'agreement.csv', repeat('a', 64), n, '2026-10-19')
  returning id into v_batch;

  -- ── Chunks, in order, once ────────────────────────────────────────────────
  r0 := public.import_shopify_customers(v_batch, 0, c0);
  assert r0->>'status' = 'applied', format('chunk 1 applies: %s', r0);
  assert (r0->>'rows_done')::int = n0, 'rows_done moves to the end of chunk 1';

  res := public.import_shopify_customers(v_batch, 0, c0);
  assert res = jsonb_build_object('status', 'refused', 'reason', 'out_of_order', 'rows_done', n0),
    format('a chunk sent twice is refused: %s', res);
  res := public.import_shopify_customers(v_batch, n0 + 1, c1);
  assert res->>'reason' = 'out_of_order', 'a chunk that skips rows is refused';
  select * into b from public.customer_import_batches where id = v_batch;
  assert b.rows_done = n0 and b.created + b.merged + b.already_imported
    + public.customer_import_skipped_total(b.skipped) = n0, 'a refusal writes and counts nothing';

  res := public.finish_shopify_import(v_batch);
  assert res->>'status' = 'incomplete', format('a stopped batch does not finish: %s', res);
  begin
    update public.customer_import_batches set applied_at = now() where id = v_batch;
    assert false, 'an unreconciled batch cannot be marked applied';
  exception when check_violation then null;
  end;

  r1 := public.import_shopify_customers(v_batch, n0, c1);
  assert r1->>'status' = 'applied', format('chunk 2 applies: %s', r1);

  -- ── The agreement ─────────────────────────────────────────────────────────
  assert (r0->'outcomes') || (r1->'outcomes') = exp,
    format(E'the SQL function and the TS preview disagree.\n SQL: %s\n TS:  %s', (r0->'outcomes') || (r1->'outcomes'), exp);

  -- ── The counts are the server's ───────────────────────────────────────────
  select count(*) filter (where e->>'outcome' = 'create'),
         count(*) filter (where e->>'outcome' = 'merge'),
         count(*) filter (where e->>'outcome' = 'already_imported')
    into n_create, n_merge, n_already
    from jsonb_array_elements(exp) e;
  select coalesce(jsonb_object_agg(reason, total), '{}') into v_skips
    from (select e->>'reason' as reason, count(*)::int as total
            from jsonb_array_elements(exp) e where e->>'outcome' = 'skip' group by 1) s;
  select * into b from public.customer_import_batches where id = v_batch;
  assert b.rows_done = n and b.created = n_create and b.merged = n_merge and b.already_imported = n_already
    and b.skipped = v_skips, format('the batch counts its outcomes: %s', to_jsonb(b));
  assert n_create = 5 and n_merge = 3 and n_already = 3, 'the fixture covers every outcome';

  res := public.finish_shopify_import(v_batch);
  assert res->>'status' = 'applied' and (res->>'newly_applied')::boolean, format('finish reconciles: %s', res);
  assert (res->>'created_rows')::int = n_create and (res->>'merged_rows')::int = n_merge,
    'migrated_customers holds one row per create and merge';
  res := public.finish_shopify_import(v_batch);
  assert res->>'status' = 'applied' and not (res->>'newly_applied')::boolean, 'finishing twice applies once';
  res := public.import_shopify_customers(v_batch, n, c1);
  assert res->>'reason' = 'applied', 'an applied batch takes no more rows';

  -- ── The import creates Customers, never auth users ────────────────────────
  assert (select count(*) from auth.users) = (select users from t_totals), 'no auth user is created';
  assert (select count(*) from public.customers) = (select customers from t_totals) + n_create,
    'one Customer per create, and no other';

  -- ── A merge never changes what the platform owns ──────────────────────────
  for v in
    select t.*, c.email as e2, c.auth_user_id as a2, c.tags as t2, c.notes as n2, c.total_orders as o2,
           c.total_spent as s2, c.first_name as f2, c.last_name as l2, c.phone as p2
      from t_before t join public.customers c on c.id = t.id
  loop
    assert v.e2 = v.email and v.a2 is not distinct from v.auth_user_id and v.t2 = v.tags
      and v.n2 is not distinct from v.notes and v.o2 = v.total_orders and v.s2 = v.total_spent,
      format('the import changed email, auth_user_id, tags, notes or total_* on %s', v.id);
    assert (v.f2 is not distinct from v.first_name or v.first_name is null)
       and (v.l2 is not distinct from v.last_name or v.last_name is null)
       and (v.p2 is not distinct from v.phone or v.phone is null),
      format('the import overwrote a name or phone on %s', v.id);
  end loop;

  -- Kim (signed up): fills last name and phone only, gains the import's address.
  select c.first_name, c.last_name, c.phone, m.created_by_import, m.created_address_id, a.is_default, a.id as aid
    into v
    from public.customers c
    join public.migrated_customers m on m.customer_id = c.id
    left join public.customer_addresses a on a.customer_id = c.id
   where c.id = '00000000-0000-4000-8000-000000000101';
  assert v.first_name = 'Kim' and v.last_name = 'Tan' and v.phone = '+6590000001', 'Kim: nulls filled, name kept';
  assert not v.created_by_import and v.created_address_id = v.aid and v.is_default, 'Kim: merged, with the import address';
  -- Lee: already had an address, so none is added.
  assert (select count(*) from public.customer_addresses where customer_id = '00000000-0000-4000-8000-000000000102') = 1
    and (select created_address_id from public.migrated_customers
          where customer_id = '00000000-0000-4000-8000-000000000102') is null, 'Lee: no second address';
  assert (select first_name || ' ' || last_name from public.customers
           where id = '00000000-0000-4000-8000-000000000102') = 'Lee Lee', 'Lee: first name filled, last name kept';
  -- Stored with capitals: found, and left as stored.
  assert (select email from public.customers where id = '00000000-0000-4000-8000-000000000103') = 'Mixed.Case@Example.com',
    'a merge never rewrites the stored email';

  -- ── What a create writes ──────────────────────────────────────────────────
  select c.*, m.created_by_import, m.shopify_customer_id, m.exported_at, m.email_marketing_at_export,
         m.shopify_orders_count, m.shopify_amount_spent, m.batch_id,
         a.postal_code, a.country, a.is_default, a.id = m.created_address_id as linked
    into v
    from public.customers c
    join public.migrated_customers m on m.customer_id = c.id
    join public.customer_addresses a on a.customer_id = c.id
   where c.email = 'buyer201@example.com';
  assert v.locale = 'en-US' and v.auth_user_id is null and v.tags = '{}' and v.notes is null
    and v.total_orders = 0 and v.total_spent = 0, 'a created Customer holds no Shopify facts';
  assert v.created_by_import and v.shopify_customer_id = 7000000000201 and v.batch_id = v_batch
    and v.exported_at = '2026-10-19' and v.email_marketing_at_export = 'yes'
    and v.shopify_orders_count = 1 and v.shopify_amount_spent = 610, 'its Shopify facts are in migrated_customers';
  assert v.postal_code = '018956' and v.country = 'SG' and v.is_default and v.linked, 'its address, repaired and default';

  -- Tags and Note go to migrated_customers only.
  select c.tags, c.notes, m.shopify_tags, m.shopify_note, a.country into v
    from public.customers c
    join public.migrated_customers m on m.customer_id = c.id
    join public.customer_addresses a on a.id = m.created_address_id
   where c.email = 'buyer218@example.com';
  assert v.tags = '{}' and v.notes is null and v.shopify_tags = '{neck,vip}'
    and v.shopify_note = 'Synthetic Shopify note', 'Shopify tags and note never reach customers';
  assert v.country = 'MY', 'the country is written as the file had it, never the default';

  assert (select count(*) from public.customer_addresses a join public.customers c on c.id = a.customer_id
           where c.email in ('buyer215@example.com', 'buyer216@example.com')) = 0,
    'no address without one, or with an incomplete one';
  assert (select m.shopify_customer_id from public.migrated_customers m join public.customers c on c.id = m.customer_id
           where c.email = 'buyer217@example.com') is null, 'no Shopify id: email is the key';
  assert not exists (select 1 from public.customers
                      where lower(email) in ('twin@example.com', 'buyer213@example.com', 'buyer214@example.com', 'not-an-email')),
    'a skipped row writes nothing';

  -- ── Importing it again changes nothing ────────────────────────────────────
  create temp table t_after_first on commit drop as
    select 'c' as t, to_jsonb(c) as r from public.customers c
    union all select 'a', to_jsonb(a) from public.customer_addresses a
    union all select 'm', to_jsonb(m) from public.migrated_customers m;
  insert into public.customer_import_batches (source, file_name, file_sha256, rows_total, exported_at)
  values ('shopify_customers_csv', 'agreement-again.csv', repeat('b', 64), n, '2026-10-20')
  returning id into v_again;
  res := public.import_shopify_customers(v_again, 0, c0);
  res := public.import_shopify_customers(v_again, n0, c1);
  res := public.finish_shopify_import(v_again);
  assert res->>'status' = 'applied' and (res->>'created')::int = 0 and (res->>'merged')::int = 0
    and (res->>'already_imported')::int = n_create + n_merge + n_already,
    format('a fresh export of the same people creates 0 and merges 0: %s', res);
  assert not exists (
    (select 'c', to_jsonb(c) from public.customers c
     union all select 'a', to_jsonb(a) from public.customer_addresses a
     union all select 'm', to_jsonb(m) from public.migrated_customers m)
    except all select t, r from t_after_first
  ) and not exists (
    select t, r from t_after_first
    except all
    (select 'c', to_jsonb(c) from public.customers c
     union all select 'a', to_jsonb(a) from public.customer_addresses a
     union all select 'm', to_jsonb(m) from public.migrated_customers m)
  ), 'the re-run is a no-op: not one row of customers, addresses or migrated_customers changed';

  -- The same file cannot start a second live batch.
  begin
    insert into public.customer_import_batches (source, file_name, file_sha256, rows_total, exported_at)
    values ('shopify_customers_csv', 'agreement.csv', repeat('a', 64), n, '2026-10-19');
    assert false, 'a second live batch for one file must fail';
  exception when unique_violation then null;
  end;

  -- ── A Customer that appears between the preview and the apply ─────────────
  -- The preview said create; a checkout made the row since. A merge, not a
  -- duplicate and not an error.
  insert into public.customer_import_batches (source, file_name, file_sha256, rows_total, exported_at)
  values ('shopify_customers_csv', 'late.csv', repeat('c', 64), 1, '2026-10-20')
  returning id into v_late;
  insert into public.customers (email, first_name) values ('Late.Signup@example.com', 'Late')
  returning id into v_id;
  res := public.import_shopify_customers(v_late, 0, jsonb_build_array(jsonb_build_object(
    'i', 0, 'shopify_customer_id', '7000000000777', 'email', 'late.signup@example.com',
    'first_name', 'Shopify', 'last_name', 'Late', 'phone', null, 'address', null,
    'email_marketing_at_export', 'no', 'shopify_orders_count', 0, 'shopify_amount_spent', 0,
    'shopify_tags', '[]'::jsonb, 'shopify_note', null)));
  assert res->'outcomes' = '[{"i": 0, "outcome": "merge"}]', format('it merges: %s', res);
  assert (select count(*) from public.customers where lower(email) = 'late.signup@example.com') = 1, 'no duplicate';
  assert (select first_name || ' ' || last_name from public.customers where id = v_id) = 'Late Late', 'nulls filled only';
  assert (select customer_id from public.migrated_customers where shopify_customer_id = 7000000000777) = v_id,
    'linked to the row that appeared';

  -- ── What the function refuses outright ────────────────────────────────────
  res := public.import_shopify_customers(v_late, 1, '[{"i": 1, "skip": "no_email"}]');
  assert res->>'reason' = 'past_end', 'rows past the file end are refused';

  insert into public.customer_import_batches (source, file_name, file_sha256, rows_total, exported_at)
  values ('shopify_customers_csv', 'refusals.csv', repeat('f', 64), 500, '2026-10-20')
  returning id into v_late;
  begin
    perform public.import_shopify_customers(v_late, 0, '[{"i": 2, "skip": "no_email"}]');
    assert false, 'rows out of file order must fail';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.import_shopify_customers(v_late, 0, '[{"i": 0, "skip": "looked_wrong"}]');
    assert false, 'an unknown skip must fail';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.import_shopify_customers(v_late, 0, '[{"i": 0, "email": "Shouty@Example.com"}]');
    assert false, 'an email the server did not lowercase must fail';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.import_shopify_customers(v_late, 0,
      (select jsonb_agg(jsonb_build_object('i', g, 'skip', 'no_email')) from generate_series(0, 100) g));
    assert false, 'more than 100 rows must fail';
  exception when invalid_parameter_value then null;
  end;
  assert (select rows_done from public.customer_import_batches where id = v_late) = 0, 'a refusal writes nothing';
  begin
    perform public.import_shopify_customers(gen_random_uuid(), 0, '[{"i": 0, "skip": "no_email"}]');
    assert false, 'an unknown batch must fail';
  exception when no_data_found then null;
  end;
end $$;

rollback;
select 'customer import: agreement ok';
