-- ADR 0039: import_fitting_rows takes the payload the server action builds
-- (cases.json, written by lib/fitting-import/__tests__/sql-agreement.test.ts)
-- and decides every row as the preview forecast it, against an empty
-- database, keeping every typed answer. Everything is rolled back.

begin;
\set cases `cat supabase/tests/fitting-import/cases.json`
select set_config('t.cases', :'cases', false) \g /dev/null

do $$
declare
  doc     jsonb := current_setting('t.cases')::jsonb;
  v_batch uuid;
  v_avery uuid;
  res     jsonb;
  n       int := jsonb_array_length(doc->'rows');
  f       public.customer_fittings%rowtype;
begin
  assert n >= 5, 'cases.json did not load';
  insert into public.fitting_import_batches (file_name, file_sha256, date_order, rows_total)
  values ('agreement.csv', repeat('c', 64), 'mdy', n)
  returning id into v_batch;

  res := public.import_fitting_rows(v_batch, 0, doc->'rows');
  assert res->'outcomes' = doc->'forecast', format('SQL %s, forecast %s', res->'outcomes', doc->'forecast');
  res := public.finish_fitting_import(v_batch);
  assert res->>'status' = 'applied', format('reconciles: %s', res);

  -- The first row, every typed answer as the TypeScript wrote it.
  select * into f from public.customer_fittings
   where source_key = public.fitting_source_key(doc->'rows'->0->>'key');
  assert f.fitted_at = (doc->'rows'->0->'fitting'->>'fitted_at')::timestamptz, 'fitted_at';
  assert f.shoulder_length_in = 18 and f.neck_to_back_in = 2.5 and f.head_to_back_in = 0 and f.neck_length_in = 3.5, 'inches';
  assert f.configuration_type = 'T12' and f.profile_side = 'M-LN' and f.recommended_size = 'M', 'codes';
  assert f.sleep_symptoms = array['Neck pain', 'Snoring'], 'symptoms';
  assert f.acid_reflux = false and f.ear_discomfort_side_sleep = false and f.uses_bolster = false, 'yes/no';
  assert jsonb_array_length(f.drive_files) = 5 and f.drive_files->0->>'slot' = 'back_photo', 'drive files';
  assert f.created_customer and f.matched_by = 'email', 'created by email';
  assert (select email = 'avery.lim@example.com' and first_name = 'Avery Lim' and phone = '+6591230001'
            from customers where id = f.customer_id), 'the created Customer';
  v_avery := f.customer_id;

  -- Rows are in import order, so each one below is found by what it holds.
  -- The row that kept what it could not read, under its question.
  select * into f from public.customer_fittings
   where source_key = public.fitting_source_key((
     select e->>'key' from jsonb_array_elements(doc->'rows') e where e->'fitting'->>'acid_reflux' = 'true'));
  assert f.other_answers ? 'Upload a photo of your back' and f.acid_reflux, 'unreadable cells kept, readable ones typed';
  assert not f.created_customer and f.customer_id = v_avery,
    'the second fitting of one email matches the Customer the first created';

  -- Avery under another email: the same Customer, matched by mobile and name.
  select * into f from public.customer_fittings
   where source_key = public.fitting_source_key((
     select e->>'key' from jsonb_array_elements(doc->'rows') e where e->>'email' = 'second@example.com'));
  assert f.notes like 'Prefers a lower neck.%months.' and f.referred_by = 'Dr Tan', 'notes and referrer';
  assert f.customer_id = v_avery and f.matched_by = 'phone', 'another email of Avery''s is Avery';
  assert not exists (select 1 from customers where email = 'second@example.com'), 'no second Customer for Avery';

  -- Avery with only the mobile, which Kim holds too: Avery, by name, with this visit's own measurement.
  assert (select count(*) from customers where phone = '+6591230001') = 2, 'Kim holds the mobile too';
  assert exists (select 1 from public.customer_fittings
                  where customer_id = v_avery and matched_by = 'phone' and email_on_form is null
                    and shoulder_length_in = 18.5),
    'the mobile-only visit is on Avery';
  assert (select count(*) from public.customer_fittings where customer_id = v_avery) = 4,
    'all four of Avery''s visits are on one Customer';
end $$;

select 'assert-agreement ok';
rollback;
