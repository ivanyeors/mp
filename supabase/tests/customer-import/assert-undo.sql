-- Slice 03: a batch stopped part-way resumes from rows_done and reconciles;
-- its undo is previewed, then removes what it created that nobody has claimed
-- or referenced since, unlinks what it merged into, keeps the rest, and
-- reports both counts. Everything is rolled back.

begin;
\ir seed.sql

do $$
declare
  doc   jsonb := (select t.doc from t_cases t);
  c0    jsonb := doc->'chunks'->0;
  c1    jsonb := doc->'chunks'->1;
  n0    int := jsonb_array_length(doc->'chunks'->0);
  n     int := jsonb_array_length(doc->'chunks'->0) + jsonb_array_length(doc->'chunks'->1);
  v_batch   uuid;
  v_user    uuid;
  v_order   uuid;
  res       jsonb;
  preview   jsonb;
  b         public.customer_import_batches%rowtype;
  id_of     jsonb;
begin
  insert into public.customer_import_batches (source, file_name, file_sha256, rows_total, exported_at)
  values ('shopify_customers_csv', 'undo.csv', repeat('d', 64), n, '2026-10-19')
  returning id into v_batch;

  -- ── The tab closes after the first chunk ──────────────────────────────────
  res := public.import_shopify_customers(v_batch, 0, c0);
  select * into b from public.customer_import_batches where id = v_batch;
  assert b.rows_done = n0 and b.applied_at is null, 'stopped at the end of chunk 1, not applied';

  -- Picking the same file again: the page continues from rows_done. Its first
  -- chunk would be refused; the next one lands.
  res := public.import_shopify_customers(v_batch, 0, c0);
  assert res->>'reason' = 'out_of_order' and (res->>'rows_done')::int = n0, 'the page learns where to resume';
  res := public.import_shopify_customers(v_batch, (res->>'rows_done')::int, c1);
  assert res->>'status' = 'applied', format('resumed: %s', res);
  res := public.finish_shopify_import(v_batch);
  assert res->>'status' = 'applied', format('the resumed batch reconciles: %s', res);
  select * into b from public.customer_import_batches where id = v_batch;
  assert b.rows_total = b.created + b.merged + b.already_imported + public.customer_import_skipped_total(b.skipped)
    and b.created = 5 and b.merged = 3, 'every row counted once';

  -- ── Since the import ──────────────────────────────────────────────────────
  select jsonb_object_agg(c.email, c.id) into id_of
    from public.customers c join public.migrated_customers m on m.customer_id = c.id
   where m.batch_id = v_batch and m.created_by_import;
  -- One signs in (linkCustomerToAuthUser binds the row) ...
  insert into auth.users (email) values ('buyer201@example.com') returning id into v_user;
  update public.customers set auth_user_id = v_user where id = (id_of->>'buyer201@example.com')::uuid;
  -- ... one buys, one has a Result, and Staff add an address for another.
  insert into public.orders (customer_id, email, shipping_address, subtotal, total)
  values ((id_of->>'buyer215@example.com')::uuid, 'buyer215@example.com', '{}', 0, 0)
  returning id into v_order;
  insert into public.mp_config_responses (customer_id) values ((id_of->>'buyer216@example.com')::uuid);
  insert into public.customer_addresses (customer_id, recipient, line1, city, postal_code, country)
  values ((id_of->>'buyer217@example.com')::uuid, 'Staff', '1 Added Road', 'Singapore', '238801', 'SG');
  -- buyer218 is untouched: the only one an undo removes.

  -- Any foreign key counts, not a fixed list: a table a later slice adds (here
  -- one that would cascade, like Customer notes) keeps the row too. Rolled
  -- back with the rest.
  create table public.customer_import_test_later_slice (
    customer_id uuid not null references public.customers(id) on delete cascade
  );
  insert into public.customer_import_test_later_slice values ((id_of->>'buyer218@example.com')::uuid);
  preview := public.preview_shopify_import_undo(v_batch);
  assert preview->>'removed' = '0' and preview->>'kept_referenced' = '4',
    format('a reference from a table nobody listed keeps the row: %s', preview);
  drop table public.customer_import_test_later_slice;
  -- A merged row that has been Claimed (slice 05 stamps claimed_at) is kept,
  -- link and all: the Claim and its voucher hang on it.
  update public.migrated_customers set claimed_at = now()
   where customer_id = '00000000-0000-4000-8000-000000000102';
  preview := public.preview_shopify_import_undo(v_batch);
  assert preview = '{"removed": 1, "unlinked": 2, "kept": 5, "kept_claimed": 2, "kept_referenced": 3}',
    format('a Claimed merge is kept: %s', preview);
  update public.migrated_customers set claimed_at = null
   where customer_id = '00000000-0000-4000-8000-000000000102';

  -- ── Preview first ─────────────────────────────────────────────────────────
  preview := public.preview_shopify_import_undo(v_batch);
  assert preview = '{"removed": 1, "unlinked": 3, "kept": 4, "kept_claimed": 1, "kept_referenced": 3}',
    format('the undo preview: %s', preview);
  assert exists (select 1 from public.customers where id = (id_of->>'buyer218@example.com')::uuid)
    and (select rolled_back_at from public.customer_import_batches where id = v_batch) is null,
    'the preview writes nothing';

  -- ── Then the undo ─────────────────────────────────────────────────────────
  res := public.undo_shopify_import(v_batch);
  assert res = preview || '{"status": "undone"}', format('the undo does what it previewed: %s', res);

  -- Created and unclaimed, referenced by nothing: gone, with its address and
  -- migrated_customers row.
  assert not exists (select 1 from public.customers where id = (id_of->>'buyer218@example.com')::uuid), 'removed';
  assert not exists (select 1 from public.migrated_customers where customer_id = (id_of->>'buyer218@example.com')::uuid)
    and not exists (select 1 from public.customer_addresses where customer_id = (id_of->>'buyer218@example.com')::uuid),
    'the cascade takes its migrated row and address';
  -- Claimed or referenced: kept whole, still a Migrated customer.
  assert (select count(*) from public.customers c join public.migrated_customers m on m.customer_id = c.id
           where c.id in ((id_of->>'buyer201@example.com')::uuid, (id_of->>'buyer215@example.com')::uuid,
                          (id_of->>'buyer216@example.com')::uuid, (id_of->>'buyer217@example.com')::uuid)) = 4,
    'claimed and referenced rows are kept';
  assert (select customer_id from public.orders where id = v_order) = (id_of->>'buyer215@example.com')::uuid,
    'the order still names its Customer';
  assert exists (select 1 from public.customer_addresses a join public.migrated_customers m on m.created_address_id = a.id
                  where a.customer_id = (id_of->>'buyer201@example.com')::uuid), 'a kept row keeps its import address';

  -- Merged: the link and the import's address go; the filled nulls stay.
  assert not exists (select 1 from public.migrated_customers m where m.batch_id = v_batch and not m.created_by_import),
    'merged rows are unlinked';
  assert not exists (select 1 from public.customer_addresses where customer_id = '00000000-0000-4000-8000-000000000101'),
    'the address the import gave Kim is removed';
  assert (select count(*) from public.customer_addresses where customer_id = '00000000-0000-4000-8000-000000000102') = 1,
    'Lee keeps her own address';
  assert (select last_name || ' ' || phone from public.customers where id = '00000000-0000-4000-8000-000000000101')
    = 'Tan +6590000001', 'nothing on customers is reverted';
  -- The earlier batch's Migrated customers are not this batch's to undo.
  assert (select count(*) from public.migrated_customers where shopify_customer_id in (7000000000101, 7000000000102)) = 2,
    'other batches are untouched';

  select * into b from public.customer_import_batches where id = v_batch;
  assert b.rolled_back_at is not null and b.undo_counts = preview, 'the batch records the undo and its counts';
  assert b.applied_at is not null and b.created = 5, 'the import''s own counts stay, for the history';

  -- ── Once ──────────────────────────────────────────────────────────────────
  res := public.undo_shopify_import(v_batch);
  assert res = preview || '{"status": "already_undone"}', format('a second undo does nothing: %s', res);
  res := public.import_shopify_customers(v_batch, n, c1);
  assert res->>'reason' = 'undone', 'an undone batch takes no rows';

  -- The undo frees the file: it can be imported again, and the kept rows read
  -- as already imported.
  insert into public.customer_import_batches (source, file_name, file_sha256, rows_total, exported_at)
  values ('shopify_customers_csv', 'undo.csv', repeat('d', 64), n, '2026-10-19')
  returning id into v_batch;
  perform public.import_shopify_customers(v_batch, 0, c0);
  perform public.import_shopify_customers(v_batch, n0, c1);
  res := public.finish_shopify_import(v_batch);
  assert res->>'status' = 'applied' and (res->>'created')::int = 1 and (res->>'merged')::int = 3
    and (res->>'already_imported')::int = 3 + 4, format('the re-import after undo: %s', res);
end $$;

rollback;
select 'customer import: resume and undo ok';
