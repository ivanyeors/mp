-- ADR 0039: a Fitting import attaches each row by email, then by mobile,
-- fills only nulls, refuses a chunk out of order, reconciles, imports the same
-- rows again as nothing, and undo removes only what nobody has signed in to or
-- referenced since. Everything is rolled back.

begin;

create function pg_temp.t_row(i int, k text, email text, phone text, name text, serviced text default null)
returns jsonb language sql as $$
  select jsonb_build_object(
    'i', i, 'key', k, 'email', email, 'phone', phone, 'name', name,
    'fitting', jsonb_build_object(
      'fitted_at', '2026-10-17T01:24:28+08:00',
      'name_on_form', name,
      'email_on_form', email,
      'mobile_on_form', phone,
      'shoulder_length_in', 18,
      'neck_to_back_in', 2.5,
      'head_to_back_in', 0,
      'neck_length_in', 3.5,
      'recommended_size', 'M',
      'configuration_type', 'T12',
      'profile_side', 'M-LN',
      'sleep_symptoms', jsonb_build_array('Neck pain', 'Snoring'),
      'acid_reflux', false,
      'uses_bolster', true,
      'serviced_by', serviced,
      'drive_files', jsonb_build_array(jsonb_build_object('slot', 'back_photo', 'file_id', 'drive-file-1')),
      'other_answers', jsonb_build_object('Favourite colour', 'Blue'),
      -- Columns the import must never take from a row.
      'customer_id', '00000000-0000-0000-0000-000000000000',
      'batch_id', '00000000-0000-0000-0000-000000000000',
      'source_key', 'x'
    )
  )
$$;

do $$
declare
  v_mei     uuid;
  v_ali     uuid;
  v_sophie  uuid;
  v_batch   uuid;
  v_batch2  uuid;
  v_user    uuid;
  res       jsonb;
  c0        jsonb;
  c1        jsonb;
  b         public.fitting_import_batches%rowtype;
  f         public.customer_fittings%rowtype;
  v_zariah  uuid;
begin
  insert into customers (email, first_name, phone) values ('mei@example.com', 'Mei', null) returning id into v_mei;
  insert into customers (email, first_name, last_name, phone) values ('ali@example.com', 'Ali', 'Tan', '9123 4567') returning id into v_ali;
  insert into customers (email, phone) values ('twin1@example.com', '+6588880000'), ('twin2@example.com', '8888 0000');
  insert into mp_staff (name) values ('Sophie') returning id into v_sophie;
  insert into mp_staff (name) values ('Ray'), ('ray');

  c0 := jsonb_build_array(
    pg_temp.t_row(0, 'k0', 'zariah@example.com', '+6597887699', 'Zariah', 'sophie '),
    pg_temp.t_row(1, 'k1', 'mei@example.com', '+6581112222', 'Mei Ling', 'Ray'),
    pg_temp.t_row(2, 'k2', null, '+6591234567', 'Ali'),
    jsonb_build_object('i', 3, 'skip', 'no_timestamp'),
    pg_temp.t_row(4, 'k4', null, '+6588880000', 'Twin')
  );
  c1 := jsonb_build_array(
    pg_temp.t_row(5, 'k5', null, '+6590000000', 'Nobody'),
    pg_temp.t_row(6, 'k6', 'zariah@example.com', null, 'Zariah'),
    pg_temp.t_row(7, 'k7', 'new2@example.com', null, 'New Two'),
    pg_temp.t_row(8, 'k8', 'new3@example.com', null, 'New Three'),
    pg_temp.t_row(9, 'k9', 'gone@example.com', null, 'Gone')
  );

  insert into public.fitting_import_batches (file_name, file_sha256, date_order, rows_total)
  values ('forms.csv', repeat('a', 64), 'mdy', 10)
  returning id into v_batch;

  -- ── Chunk 1 ───────────────────────────────────────────────────────────────
  res := public.import_fitting_rows(v_batch, 0, c0);
  assert res->>'status' = 'applied', format('chunk 1 applied: %s', res);
  assert res->'outcomes' = '[
    {"i":0,"outcome":"created"},
    {"i":1,"outcome":"matched_email"},
    {"i":2,"outcome":"matched_phone"},
    {"i":3,"outcome":"skip","reason":"no_timestamp"},
    {"i":4,"outcome":"skip","reason":"mobile_matches_several"}
  ]'::jsonb, format('chunk 1 outcomes: %s', res->'outcomes');

  -- A new Customer, with no login, named and numbered from the form.
  select id into v_zariah from customers where email = 'zariah@example.com';
  assert (select first_name = 'Zariah' and last_name is null and phone = '+6597887699' and auth_user_id is null
            from customers where id = v_zariah), 'the created Customer carries the form''s name and mobile';

  -- A match fills only nulls: Mei keeps her name and gains the mobile.
  assert (select first_name = 'Mei' and phone = '+6581112222' from customers where id = v_mei),
    'an email match fills the null phone and keeps the name';
  -- Ali's stored number is the same mobile written differently; nothing changes on his row.
  assert (select first_name = 'Ali' and last_name = 'Tan' and phone = '9123 4567' from customers where id = v_ali),
    'a mobile match changes nothing that is set';

  select * into f from public.customer_fittings where customer_id = v_zariah;
  assert f.created_customer and f.matched_by = 'email' and f.batch_id = v_batch, 'zariah: created by email in this batch';
  assert f.source_key = public.fitting_source_key('k0'), 'the stored key is the hash, not the payload''s';
  assert f.serviced_by_staff_id = v_sophie, 'serviced by matches the Staff profile, ignoring case and spaces';
  assert f.shoulder_length_in = 18 and f.neck_to_back_in = 2.5 and f.head_to_back_in = 0 and f.neck_length_in = 3.5,
    'measurements as recorded';
  assert f.sleep_symptoms = array['Neck pain', 'Snoring'] and f.acid_reflux = false and f.uses_bolster,
    'answers kept in their types';
  assert f.drive_files = '[{"slot":"back_photo","file_id":"drive-file-1"}]'::jsonb, 'drive files kept';
  assert f.other_answers = '{"Favourite colour":"Blue"}'::jsonb, 'unknown columns kept';
  assert f.fitted_at = '2026-10-16T17:24:28Z'::timestamptz, 'the form time, in Singapore time';
  assert (select serviced_by_staff_id is null and serviced_by = 'Ray' from public.customer_fittings where customer_id = v_mei),
    'two profiles share the name: no link, the text is kept';
  assert (select matched_by = 'phone' and not created_customer from public.customer_fittings where customer_id = v_ali),
    'ali: matched by mobile';

  -- ── The same chunk again is refused, not counted twice ────────────────────
  res := public.import_fitting_rows(v_batch, 0, c0);
  assert res->>'status' = 'refused' and res->>'reason' = 'out_of_order' and (res->>'rows_done')::int = 5,
    format('a resent chunk is refused: %s', res);

  res := public.finish_fitting_import(v_batch);
  assert res->>'status' = 'incomplete', format('half a file does not finish: %s', res);

  -- ── Chunk 2 ───────────────────────────────────────────────────────────────
  res := public.import_fitting_rows(v_batch, 5, c1);
  assert res->'outcomes' = '[
    {"i":5,"outcome":"skip","reason":"no_customer_for_mobile"},
    {"i":6,"outcome":"matched_email"},
    {"i":7,"outcome":"created"},
    {"i":8,"outcome":"created"},
    {"i":9,"outcome":"created"}
  ]'::jsonb, format('chunk 2 outcomes: %s', res->'outcomes');
  assert (select count(*) from public.customer_fittings where customer_id = v_zariah) = 2,
    'a second fitting of one person is a second record';
  assert not exists (select 1 from customers where email is null or phone = '+6590000000'),
    'no phone-only Customer is ever created';

  res := public.finish_fitting_import(v_batch);
  assert res->>'status' = 'applied' and (res->>'newly_applied')::boolean, format('the batch reconciles: %s', res);
  select * into b from public.fitting_import_batches where id = v_batch;
  assert b.created = 4 and b.matched_email = 2 and b.matched_phone = 1 and b.already_imported = 0
     and b.skipped = '{"no_timestamp":1,"mobile_matches_several":1,"no_customer_for_mobile":1}'::jsonb,
    format('batch counts: %s', row_to_json(b));
  res := public.import_fitting_rows(v_batch, 10, c1);
  assert res->>'reason' = 'applied', 'an applied batch takes no more rows';

  -- ── The same rows in a new file: nothing new; one new row of Zariah's ─────
  insert into public.fitting_import_batches (file_name, file_sha256, date_order, rows_total)
  values ('forms-again.csv', repeat('b', 64), 'mdy', 6)
  returning id into v_batch2;
  res := public.import_fitting_rows(v_batch2, 0, (c0 - 4 - 3) || jsonb_build_array(
    pg_temp.t_row(3, 'k7', 'new2@example.com', null, 'New Two'),
    pg_temp.t_row(4, 'k-later', 'zariah@example.com', null, 'Zariah'),
    pg_temp.t_row(5, 'k9', 'gone@example.com', null, 'Gone')
  ));
  assert res->'outcomes' = '[
    {"i":0,"outcome":"already_imported"},
    {"i":1,"outcome":"already_imported"},
    {"i":2,"outcome":"already_imported"},
    {"i":3,"outcome":"already_imported"},
    {"i":4,"outcome":"matched_email"},
    {"i":5,"outcome":"already_imported"}
  ]'::jsonb, format('re-import outcomes: %s', res->'outcomes');
  res := public.finish_fitting_import(v_batch2);
  assert res->>'status' = 'applied', format('the second batch reconciles: %s', res);

  -- ── Undo the first batch ──────────────────────────────────────────────────
  insert into orders (customer_id, email, shipping_address, subtotal, total)
  select id, email, '{}', 1, 1 from customers where email = 'new2@example.com';
  insert into auth.users (email) values ('new3@example.com') returning id into v_user;
  update customers set auth_user_id = v_user where email = 'new3@example.com';

  res := public.preview_fitting_import_undo(v_batch);
  assert res = '{"fittings_removed":7,"customers_removed":1,"customers_kept":3,"kept_signed_in":1,"kept_referenced":2}'::jsonb,
    format('undo preview: %s', res);
  assert (select count(*) from public.customer_fittings where batch_id = v_batch) = 7, 'the preview writes nothing';

  res := public.undo_fitting_import(v_batch);
  assert res->>'status' = 'undone' and (res->>'fittings_removed')::int = 7 and (res->>'customers_removed')::int = 1,
    format('undo: %s', res);
  assert not exists (select 1 from customers where email = 'gone@example.com'), 'the unreferenced created Customer is removed';
  assert exists (select 1 from customers where email = 'zariah@example.com'), 'zariah has a Fitting record from batch 2: kept';
  assert exists (select 1 from customers where email = 'new2@example.com'), 'an Order keeps the Customer';
  assert exists (select 1 from customers where email = 'new3@example.com'), 'a sign-in keeps the Customer';
  assert (select phone = '+6581112222' from customers where id = v_mei), 'filled nulls are not reverted';
  assert (select count(*) from public.customer_fittings where batch_id = v_batch2) = 1, 'the other batch is untouched';

  res := public.undo_fitting_import(v_batch);
  assert res->>'status' = 'already_undone', 'undo twice is a no-op';
  res := public.import_fitting_rows(v_batch, 0, c0);
  assert res->>'reason' = 'undone', 'an undone batch takes no rows';

  -- Undo freed the file: it can be imported again.
  insert into public.fitting_import_batches (file_name, file_sha256, date_order, rows_total)
  values ('forms.csv', repeat('a', 64), 'mdy', 10)
  returning id into v_batch;

  -- ── Bad input is refused whole ────────────────────────────────────────────
  begin
    perform public.import_fitting_rows(v_batch, 0, jsonb_build_array(jsonb_build_object('i', 0, 'skip', 'made_up')));
    assert false, 'an unknown skip is refused';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.import_fitting_rows(v_batch, 0, jsonb_build_array(pg_temp.t_row(0, 'k0', 'Upper@Example.com', null, 'X')));
    assert false, 'an email that is not lowercased is refused';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.import_fitting_rows(v_batch, 0, jsonb_build_array(pg_temp.t_row(0, 'k0', null, '9788 7699', 'X')));
    assert false, 'a mobile that is not E.164 is refused';
  exception when sqlstate '22023' then null;
  end;
  assert (select rows_done from public.fitting_import_batches where id = v_batch) = 0, 'a refused chunk writes nothing';
end $$;

select 'assert-import ok';
rollback;
