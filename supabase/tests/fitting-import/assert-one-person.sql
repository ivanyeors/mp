-- ADR 0039 c: one person, many fittings. Every visit lands on the same
-- Customer as its own Fitting record: under another email when the mobile and
-- the name agree, with no email on a mobile several Customers share when one
-- of them has the name, and with no email after the visit whose email creates
-- them. Made-up people. Everything is rolled back.

begin;

create function pg_temp.t_row(i int, k text, email text, phone text, name text, shoulder numeric)
returns jsonb language sql as $$
  select jsonb_build_object(
    'i', i, 'key', k, 'email', email, 'phone', phone, 'name', name,
    'fitting', jsonb_build_object(
      'fitted_at', '2025-03-01T10:00:00+08:00',
      'name_on_form', name,
      'email_on_form', email,
      'mobile_on_form', phone,
      'shoulder_length_in', shoulder
    )
  )
$$;

do $$
declare
  v_mei   uuid;
  v_ann   uuid;
  v_ben   uuid;
  v_zed   uuid;
  v_batch uuid;
  res     jsonb;
  f       public.customer_fittings%rowtype;
begin
  insert into customers (email, first_name, last_name, phone) values ('mei.tan@example.com', 'Mei', 'Tan', '9123 0007')
  returning id into v_mei;
  insert into customers (email, first_name, last_name, phone) values ('ann.lee@example.com', 'Ann', 'Lee', '+6591230008')
  returning id into v_ann;
  insert into customers (email, first_name, last_name, phone) values ('ben.lee@example.com', 'Ben', 'Lee', '9123 0008')
  returning id into v_ben;

  insert into public.fitting_import_batches (file_name, file_sha256, date_order, rows_total)
  values ('visits.csv', repeat('d', 64), 'mdy', 8)
  returning id into v_batch;

  -- Import order: every row with an email first, then the rest.
  res := public.import_fitting_rows(v_batch, 0, jsonb_build_array(
    pg_temp.t_row(0, 'v0', 'mei.tan@example.com', '+6591230007', 'Mei Tan', 18),
    pg_temp.t_row(1, 'v1', 'meitan@exmaple.com', '+6591230007', '  mei   TAN ', 18.5),
    pg_temp.t_row(2, 'v2', 'kim.tan@example.com', '+6591230007', 'Kim Tan', 17),
    pg_temp.t_row(3, 'v3', 'zed@example.com', '+6591230009', 'Zed Ong', 19),
    pg_temp.t_row(4, 'v4', 'zed.work@example.com', '+6591230009', 'Zed Ong', 19.5),
    pg_temp.t_row(5, 'v5', null, '+6591230009', 'Zed', 18.75),
    pg_temp.t_row(6, 'v6', null, '+6591230008', 'Ben Lee', 16),
    pg_temp.t_row(7, 'v7', null, '+6591230008', 'Cara Lee', 15)
  ));
  assert res->'outcomes' = '[
    {"i":0,"outcome":"matched_email"},
    {"i":1,"outcome":"matched_phone"},
    {"i":2,"outcome":"created"},
    {"i":3,"outcome":"created"},
    {"i":4,"outcome":"matched_phone"},
    {"i":5,"outcome":"matched_phone"},
    {"i":6,"outcome":"matched_phone"},
    {"i":7,"outcome":"skip","reason":"mobile_matches_several"}
  ]'::jsonb, format('outcomes: %s', res->'outcomes');

  -- Another email, the same mobile and name: Mei's second visit, on Mei.
  assert (select count(*) from public.customer_fittings where customer_id = v_mei) = 2, 'both of Mei''s visits are on Mei';
  select * into f from public.customer_fittings where source_key = public.fitting_source_key('v1');
  assert f.customer_id = v_mei and f.matched_by = 'phone' and not f.created_customer
     and f.email_on_form = 'meitan@exmaple.com' and f.shoulder_length_in = 18.5,
    'matched by mobile and name, the email kept as the form had it, its own measurements';
  assert not exists (select 1 from customers where email = 'meitan@exmaple.com'), 'no Customer for the typo';
  assert (select email = 'mei.tan@example.com' from customers where id = v_mei), 'Mei''s email is unchanged';

  -- The same mobile, another name and email: someone else.
  assert exists (select 1 from customers where email = 'kim.tan@example.com' and phone = '+6591230007'),
    'another name on the mobile is another person';

  -- Zed: two emails, then a visit with only the mobile, which only Zed holds.
  select id into v_zed from customers where email = 'zed@example.com';
  assert (select count(*) from public.customer_fittings where customer_id = v_zed) = 3,
    'Zed''s second email and the mobile-only visit are Zed: three visits on one Customer';
  assert (select array_agg(shoulder_length_in order by shoulder_length_in) from public.customer_fittings
           where customer_id = v_zed) = array[18.75, 19, 19.5]::numeric[],
    'each visit keeps its own measurements';
  assert not exists (select 1 from customers where email = 'zed.work@example.com'), 'no second Customer for Zed';

  -- A shared mobile: the one holder with the name, or a skip.
  assert (select customer_id = v_ben from public.customer_fittings where source_key = public.fitting_source_key('v6')),
    'two Customers share the mobile: the one named Ben Lee';
  assert not exists (select 1 from public.customer_fittings where source_key = public.fitting_source_key('v7')),
    'neither holder has the name: skipped';
  assert not exists (select 1 from public.customer_fittings where customer_id = v_ann), 'Ann gets nothing of Ben''s';
end $$;

-- A visit with only a mobile finds the Customer an email row before it created.
do $$
declare
  v_batch uuid;
  res     jsonb;
begin
  insert into public.fitting_import_batches (file_name, file_sha256, date_order, rows_total)
  values ('order.csv', repeat('e', 64), 'mdy', 2)
  returning id into v_batch;
  res := public.import_fitting_rows(v_batch, 0, jsonb_build_array(
    pg_temp.t_row(0, 'o1', 'ivy.ng@example.com', '+6591230010', 'Ivy Ng', 17.5),
    pg_temp.t_row(1, 'o0', null, '+6591230010', 'Ivy', 17)
  ));
  assert res->'outcomes' = '[{"i":0,"outcome":"created"},{"i":1,"outcome":"matched_phone"}]'::jsonb,
    format('order outcomes: %s', res->'outcomes');
  assert (select count(*) from public.customer_fittings f join customers c on c.id = f.customer_id
           where c.email = 'ivy.ng@example.com') = 2, 'both of Ivy''s visits are on Ivy';
  res := public.finish_fitting_import(v_batch);
  assert res->>'status' = 'applied', format('reconciles: %s', res);
end $$;

-- The preview's read names each mobile's holders.
do $$
begin
  assert (select array_agg(m.name_key order by m.name_key)
            from public.fitting_import_preview_matches('{}', array['+6591230008'], '{}') m
           where m.match = 'phone') = array['ann lee', 'ben lee'],
    'preview matches carry each holder''s name key';
end $$;

select 'assert-one-person ok';
rollback;
