-- Google Form fittings: the Fitting record and the Fitting import (ADR 0042).
--
-- customer_fittings: one in-store fitting from before this platform, as the
-- old Google Form recorded it, linked to a Customer. Every answer the form had
-- is kept, the measurements in inches as recorded. A column the import does
-- not know goes into `other_answers` under its header. Health answers live
-- here and never on `customers`, which the customer can read
-- (0037_customer_auth.sql).
--
-- fitting_import_batches: one row per Fitting import that writes. The file's
-- name and SHA-256, the counts by outcome, the resume point, and who ran it.
-- It never holds a customer's email or name, and the file itself is never
-- stored anywhere (ADR 0029 a, which this import follows).
--
-- Both are server-only, as migrated_customers: RLS on with no policy, and no
-- grant to the client roles. The service role bypasses RLS.
--
-- The import, as the Shopify one (20261020110000_customer_import_apply.sql):
--
--  fitting_import_preview_matches(emails, phones, keys)
--    The read behind the preview: who holds these emails and mobiles, and
--    which rows are already imported. Reads only.
--  import_fitting_rows(batch, start_index, rows)
--    Re-decides every row against the rows as they are now, and writes it.
--    The preview (lib/fitting-import/plan.ts) is a forecast; this is the
--    authority. A chunk must start at the batch's `rows_done`.
--  finish_fitting_import(batch)
--    Reconciles, and only then stamps `applied_at`.
--  preview_fitting_import_undo(batch) / undo_fitting_import(batch)
--    Removes the batch's Fitting records, and the Customers it created that
--    nobody has signed in to or referenced since.
--
-- Matching (ADR 0042 c): one person, one Customer. A customer comes back, and
-- each visit is another form row with its own measurements; every one of them
-- is its own Fitting record on the same Customer.
--  1. already_imported: a Fitting record has this row's key.
--  2. A usable email: the Customer holding it (matched_email); else the one
--     Customer with this mobile and this name, the same person under another
--     email (matched_phone); else a new Customer with no login (created).
--  3. No email, a usable mobile: the one Customer with it, or the one of
--     several with this name (matched_phone); else a skip.
-- The browser sends every row with a usable email first (`importOrder`,
-- lib/fitting-import/google-form-csv.ts), so a visit noted with only a mobile
-- finds the Customer another visit's email creates. Names compare as
-- fitting_name_key reads them. A phone-only Customer is never created. A
-- match fills only a null name or phone.
--
-- Every function is executable by the service role only. Idempotent.

-- ------------------------------------------------------------------
-- 1. Tables
-- ------------------------------------------------------------------
create table if not exists public.fitting_import_batches (
  id                uuid primary key default gen_random_uuid(),
  source            text not null default 'google_form_csv' check (source in ('google_form_csv')),
  -- As picked in the browser, for the history list.
  file_name         text not null check (char_length(file_name) between 1 and 255),
  -- Computed in the browser; a label, not a control.
  file_sha256       text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  -- How the file's dates were read: month first or day first.
  date_order        text not null check (date_order in ('mdy', 'dmy')),
  rows_total        int  not null check (rows_total >= 1),
  rows_done         int  not null default 0 check (rows_done between 0 and rows_total),
  -- Outcomes. A created Customer and a match each add one Fitting record.
  created           int  not null default 0 check (created >= 0),
  matched_email     int  not null default 0 check (matched_email >= 0),
  matched_phone     int  not null default 0 check (matched_phone >= 0),
  already_imported  int  not null default 0 check (already_imported >= 0),
  -- { reason: count }
  skipped           jsonb not null default '{}' check (jsonb_typeof(skipped) = 'object'),
  run_by_user_id    uuid null references auth.users(id) on delete set null,
  run_by_profile_id uuid null references public.mp_staff(id) on delete set null,
  applied_at        timestamptz null,
  rolled_back_at    timestamptz null,
  -- { fittings_removed, customers_removed, customers_kept, kept_signed_in, kept_referenced }
  undo_counts       jsonb null check (undo_counts is null or jsonb_typeof(undo_counts) = 'object'),
  created_at        timestamptz not null default now()
);

-- One batch per file that is not undone: an applied file is not imported
-- twice, and a stopped one is continued rather than started again.
create unique index if not exists fitting_import_batches_live_file_idx
  on public.fitting_import_batches (file_sha256)
  where rolled_back_at is null;

create table if not exists public.customer_fittings (
  id                    uuid primary key default gen_random_uuid(),
  customer_id           uuid not null references public.customers(id) on delete cascade,
  batch_id              uuid not null references public.fitting_import_batches(id),
  source                text not null default 'google_form' check (source in ('google_form')),
  -- sha256 of the row's own key: its timestamp, contact and name (ADR 0042 d).
  source_key            text not null check (source_key ~ '^[0-9a-f]{64}$'),
  -- The import created the Customer for this row (Undo may remove it).
  created_customer      boolean not null,
  matched_by            text not null check (matched_by in ('email', 'phone')),
  -- The form's Timestamp, read as Singapore time.
  fitted_at             timestamptz not null,
  -- As typed on the form. The Customer's own fields may differ.
  name_on_form          text null check (char_length(name_on_form) <= 200),
  email_on_form         text null check (char_length(email_on_form) <= 254),
  mobile_on_form        text null check (char_length(mobile_on_form) <= 40),
  -- A) to D), in inches as recorded.
  shoulder_length_in    numeric(5,2) null check (shoulder_length_in between 0 and 99),
  neck_to_back_in       numeric(5,2) null check (neck_to_back_in between 0 and 99),
  head_to_back_in       numeric(5,2) null check (head_to_back_in between 0 and 99),
  neck_length_in        numeric(5,2) null check (neck_length_in between 0 and 99),
  recommended_size      text null check (char_length(recommended_size) <= 40),
  -- The old studio's codes, e.g. T12 and M-LN. Not Filling Templates.
  configuration_type    text null check (char_length(configuration_type) <= 80),
  profile_side          text null check (char_length(profile_side) <= 80),
  sleeper_type          text null check (char_length(sleeper_type) <= 200),
  sleep_symptoms        text[] not null default '{}' check (cardinality(sleep_symptoms) <= 30),
  blood_pressure        text null check (char_length(blood_pressure) <= 80),
  acid_reflux           boolean null,
  ear_discomfort_side_sleep boolean null,
  bed_firmness          text null check (char_length(bed_firmness) <= 80),
  uses_bolster          boolean null,
  age_group             text null check (char_length(age_group) <= 40),
  gender                text null check (char_length(gender) <= 40),
  discovery_source      text null check (char_length(discovery_source) <= 200),
  referred_by           text null check (char_length(referred_by) <= 200),
  serviced_by           text null check (char_length(serviced_by) <= 200),
  -- The Staff profile whose name is `serviced_by`, when exactly one is.
  serviced_by_staff_id  uuid null references public.mp_staff(id) on delete set null,
  notes                 text null check (char_length(notes) <= 5000),
  -- [{ "slot": "back_photo" | "side_photo" | "back_sleep_preview" |
  --    "side_sleep_preview" | "customisation_form", "file_id": "<Drive id>" }]
  drive_files           jsonb not null default '[]'
    check (jsonb_typeof(drive_files) = 'array' and jsonb_array_length(drive_files) <= 50),
  -- { "<header>": "<answer>" } for the form's columns the import does not know.
  other_answers         jsonb not null default '{}' check (jsonb_typeof(other_answers) = 'object'),
  imported_at           timestamptz not null default now(),
  unique (source, source_key)
);

create index if not exists customer_fittings_customer_idx
  on public.customer_fittings (customer_id, fitted_at desc);
create index if not exists customer_fittings_batch_idx
  on public.customer_fittings (batch_id);

alter table public.fitting_import_batches enable row level security;
alter table public.customer_fittings enable row level security;
revoke all on public.fitting_import_batches from anon, authenticated;
revoke all on public.customer_fittings from anon, authenticated;

comment on table public.customer_fittings is
  'Fitting records: in-store fittings from the old Google Form, Staff-only (ADR 0042).';
comment on table public.fitting_import_batches is
  'Fitting imports: one row per Google Form CSV import that writes (ADR 0042).';

-- ------------------------------------------------------------------
-- 2. Helpers
-- ------------------------------------------------------------------
-- normalizePhone (lib/appointments/phone.ts): E.164, or null when it is not a
-- usable number. The branches in its order, as public.is_valid_phone has them.
create or replace function public.phone_e164(raw text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  with d as (
    select (case when raw ~ '^[\u0009-\u000D    -     　﻿]*\+'
                 then '+' else '' end)
           || regexp_replace(coalesce(raw, ''), '[^0-9]', '', 'g') as s
  ),
  n as (
    select d.s,
      case
        when raw is null or d.s in ('', '+')      then null
        when d.s like '+65%' and length(d.s) = 11 then substr(d.s, 4)
        when d.s like '65%'  and length(d.s) = 10 then substr(d.s, 3)
        when d.s like '065%' and length(d.s) = 11 then substr(d.s, 4)
        when d.s ~ '^[0-9]{8}$'                   then d.s
      end as national
    from d
  )
  select case
    when n.national is not null then
      case when n.national ~ '^[689][0-9]{7}$' then '+65' || n.national end
    when raw is null or n.s in ('', '+') then null
    when n.s like '+65%' and length(n.s) = 11 then null
    when n.s ~ '^\+[0-9]{8,15}$' then n.s
  end
  from n
$$;

revoke execute on function public.phone_e164(text) from public, anon, authenticated;
grant execute on function public.phone_e164(text) to service_role;

-- The stored form of a row's key.
create or replace function public.fitting_source_key(p_key text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select encode(pg_catalog.sha256(convert_to(p_key, 'UTF8')), 'hex')
$$;

revoke execute on function public.fitting_source_key(text) from public, anon, authenticated;
grant execute on function public.fitting_source_key(text) to service_role;

create or replace function public.fitting_import_skipped_total(p_skipped jsonb)
returns int
language sql
immutable
set search_path = public
as $$
  select coalesce(sum(value::int), 0)::int from jsonb_each_text(coalesce(p_skipped, '{}'::jsonb));
$$;

revoke execute on function public.fitting_import_skipped_total(jsonb) from public, anon, authenticated;
grant execute on function public.fitting_import_skipped_total(jsonb) to service_role;

-- Applied means reconciled: every row is accounted for exactly once.
alter table public.fitting_import_batches
  drop constraint if exists fitting_import_batches_applied_reconciles;
alter table public.fitting_import_batches
  add constraint fitting_import_batches_applied_reconciles check (
    applied_at is null or (
      rows_done = rows_total
      and rows_total = created + matched_email + matched_phone + already_imported
                       + public.fitting_import_skipped_total(skipped)
    )
  );

-- A name as two records of one person are compared (ADR 0042 c), the twin of
-- nameKey in lib/fitting-import/google-form-csv.ts: lowercase, every run of
-- whitespace one space, no ends; null when empty. The whitespace is what
-- JavaScript's \s matches, spelt out, as phone_e164 spells out its own.
create or replace function public.fitting_name_key(p_name text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(
    pg_catalog.lower(pg_catalog.btrim(pg_catalog.regexp_replace(
      coalesce(p_name, ''),
      '[\u0009-\u000D\u0020\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+',
      ' ',
      'g'
    ))),
    ''
  )
$$;

revoke execute on function public.fitting_name_key(text) from public, anon, authenticated;
grant execute on function public.fitting_name_key(text) to service_role;

-- ------------------------------------------------------------------
-- 3. The preview's read
-- ------------------------------------------------------------------
-- One row per match. `match` = 'email': a Customer holds that lower(email).
-- 'phone': a Customer whose mobile is that E.164 number (several rows when
-- several do), with `name_key`, that Customer's name as fitting_name_key reads
-- it. 'key': that row key is already imported. Reads only. Dropped first, so
-- an earlier shape of it never blocks this one.
drop function if exists public.fitting_import_preview_matches(text[], text[], text[]);
create function public.fitting_import_preview_matches(
  p_emails text[],
  p_phones text[],
  p_keys text[]
)
returns table (
  match text,
  key text,
  customer_id uuid,
  has_name boolean,
  has_phone boolean,
  name_key text
)
language sql
stable
security invoker
set search_path = public
as $$
  select 'email', lower(c.email), c.id,
         c.first_name is not null or c.last_name is not null,
         c.phone is not null,
         null::text
    from customers c
   where lower(c.email) = any(coalesce(p_emails, '{}'))
  union all
  select 'phone', public.phone_e164(c.phone), c.id,
         c.first_name is not null or c.last_name is not null,
         true,
         public.fitting_name_key(concat_ws(' ', c.first_name, c.last_name))
    from customers c
   where cardinality(coalesce(p_phones, '{}')) > 0
     and c.phone is not null
     and public.phone_e164(c.phone) = any(p_phones)
  union all
  select 'key', k.key, f.customer_id, null, null, null
    from unnest(coalesce(p_keys, '{}')) as k(key)
    join customer_fittings f
      on f.source = 'google_form' and f.source_key = public.fitting_source_key(k.key);
$$;

revoke execute on function public.fitting_import_preview_matches(text[], text[], text[]) from public, anon, authenticated;
grant execute on function public.fitting_import_preview_matches(text[], text[], text[]) to service_role;

-- ------------------------------------------------------------------
-- 4. import_fitting_rows
-- ------------------------------------------------------------------
-- `p_rows` is a JSON array of rows in import order, starting at `p_start_index`:
--   { "i": n, "skip": reason }   decided before the database: no readable
--                                timestamp, no usable email or mobile, or the
--                                same row twice in the file;
--   { "i": n, "key": text, "email": text|null, "phone": text|null,
--     "name": text|null, "fitting": { customer_fittings columns } }
--     lib/fitting-import/apply.ts. `email` is trimmed and lowercased, `phone`
--     is E.164.
--
-- Returns { status: 'applied', rows_done, outcomes: [{ i, outcome, reason? }] },
-- or { status: 'refused', reason, rows_done } with nothing written. Neither
-- carries PII.
-- Rules as at the top of this file.
create or replace function public.import_fitting_rows(
  p_batch_id uuid,
  p_start_index int,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch      public.fitting_import_batches%rowtype;
  v_n          int;
  r            record;
  v_i          int;
  v_outcome    text;
  v_reason     text;
  v_key        text;
  v_email      text;
  v_phone      text;
  v_name       text;
  v_name_key   text;
  v_named      int;
  v_named_id   uuid;
  v_customer   uuid;
  v_matches    int;
  v_matched_by text;
  v_staff      uuid;
  v_created    int := 0;
  v_email_n    int := 0;
  v_phone_n    int := 0;
  v_already    int := 0;
  v_skipped    jsonb := '{}'::jsonb;
  v_outcomes   jsonb := '[]'::jsonb;
  v_rows_done  int;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'rows must be a JSON array' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(p_rows);
  if v_n < 1 or v_n > 100 then
    raise exception 'send between 1 and 100 rows at a time, not %', v_n using errcode = '22023';
  end if;

  -- One import writes at a time, whichever batch, and never beside the Shopify
  -- import: both may create the same person.
  perform pg_advisory_xact_lock(hashtext('public.import_shopify_customers'));

  select * into v_batch from public.fitting_import_batches where id = p_batch_id for update;
  if not found then
    raise exception 'fitting import % not found', p_batch_id using errcode = 'no_data_found';
  end if;
  if v_batch.rolled_back_at is not null then
    return jsonb_build_object('status', 'refused', 'reason', 'undone', 'rows_done', v_batch.rows_done);
  end if;
  if v_batch.applied_at is not null then
    return jsonb_build_object('status', 'refused', 'reason', 'applied', 'rows_done', v_batch.rows_done);
  end if;
  -- A retried chunk that already landed, or one from a second tab, starts
  -- behind rows_done and is refused, not counted twice.
  if p_start_index is distinct from v_batch.rows_done then
    return jsonb_build_object('status', 'refused', 'reason', 'out_of_order', 'rows_done', v_batch.rows_done);
  end if;
  if v_batch.rows_done + v_n > v_batch.rows_total then
    return jsonb_build_object('status', 'refused', 'reason', 'past_end', 'rows_done', v_batch.rows_done);
  end if;

  for r in
    select x.value as e, (x.ordinality - 1)::int as k
      from jsonb_array_elements(p_rows) with ordinality as x
  loop
    v_i := (r.e->>'i')::int;
    if v_i is distinct from p_start_index + r.k then
      raise exception 'rows must run in import order from row %', p_start_index using errcode = '22023';
    end if;
    v_outcome := null;
    v_reason := r.e->>'skip';
    v_customer := null;
    v_matched_by := null;

    if v_reason is not null then
      if v_reason not in ('no_timestamp', 'no_contact', 'duplicate_in_file') then
        raise exception 'row %: unknown skip reason', v_i using errcode = '22023';
      end if;
      v_outcome := 'skip';
    else
      v_key := r.e->>'key';
      if v_key is null or v_key = '' then
        raise exception 'row %: the row needs its key', v_i using errcode = '22023';
      end if;
      if jsonb_typeof(r.e->'fitting') is distinct from 'object'
         or nullif(r.e->'fitting'->>'fitted_at', '') is null then
        raise exception 'row %: the row needs its fitting and its time', v_i using errcode = '22023';
      end if;
      v_email := nullif(r.e->>'email', '');
      if v_email is not null and v_email <> lower(btrim(v_email)) then
        raise exception 'row %: the email must be trimmed and lowercased', v_i using errcode = '22023';
      end if;
      v_phone := nullif(r.e->>'phone', '');
      if v_phone is not null and v_phone is distinct from public.phone_e164(v_phone) then
        raise exception 'row %: the mobile must be E.164', v_i using errcode = '22023';
      end if;
      v_name := nullif(btrim(r.e->>'name'), '');
      v_name_key := public.fitting_name_key(v_name);
      v_key := public.fitting_source_key(v_key);

      if exists (select 1 from public.customer_fittings f where f.source = 'google_form' and f.source_key = v_key) then
        -- 1: this form row is already a Fitting record.
        v_outcome := 'already_imported';
      elsif v_email is not null then
        -- 2: the Customer holding the email.
        select c.id into v_customer from public.customers c where lower(c.email) = v_email;
        if v_customer is not null then
          v_matched_by := 'email';
          v_outcome := 'matched_email';
        else
          -- 2b: the same person under another email: the one Customer with
          -- this mobile and this name.
          if v_phone is not null and v_name_key is not null then
            select count(*), min(c.id::text)::uuid into v_named, v_named_id
              from public.customers c
             where c.phone is not null and public.phone_e164(c.phone) = v_phone
               and public.fitting_name_key(concat_ws(' ', c.first_name, c.last_name)) = v_name_key;
            if v_named = 1 then
              v_customer := v_named_id;
              v_matched_by := 'phone';
              v_outcome := 'matched_phone';
            end if;
          end if;
          if v_customer is null then
            -- 2c: a new Customer. A checkout or sign-in may have made the row
            -- since; then the insert does nothing and the row matches it.
            v_matched_by := 'email';
            insert into public.customers (email, first_name, phone, locale)
            values (v_email, v_name, v_phone, 'en-US')
            on conflict ((lower(email))) do nothing
            returning id into v_customer;
            if v_customer is not null then
              v_outcome := 'created';
            else
              select c.id into v_customer from public.customers c where lower(c.email) = v_email;
              v_outcome := 'matched_email';
            end if;
          end if;
        end if;
      elsif v_phone is not null then
        -- 3: no email. The one Customer with this mobile; when several share
        -- it, the one of them with this name; otherwise a skip.
        v_matched_by := 'phone';
        select count(*), min(c.id::text)::uuid,
               count(*) filter (where public.fitting_name_key(concat_ws(' ', c.first_name, c.last_name)) = v_name_key),
               min(c.id::text) filter (where public.fitting_name_key(concat_ws(' ', c.first_name, c.last_name)) = v_name_key)::uuid
          into v_matches, v_customer, v_named, v_named_id
          from public.customers c
         where c.phone is not null and public.phone_e164(c.phone) = v_phone;
        if v_matches = 1 then
          v_outcome := 'matched_phone';
        elsif v_matches > 1 and v_named = 1 then
          v_customer := v_named_id;
          v_outcome := 'matched_phone';
        else
          v_outcome := 'skip';
          v_reason := case when v_matches = 0 then 'no_customer_for_mobile' else 'mobile_matches_several' end;
          v_customer := null;
        end if;
      else
        v_outcome := 'skip';
        v_reason := 'no_contact';
      end if;

      if v_outcome in ('matched_email', 'matched_phone') then
        -- Platform data wins: fill a null name or phone, change nothing else.
        update public.customers c
           set first_name = coalesce(c.first_name, case when c.last_name is null then v_name end),
               phone      = coalesce(c.phone, v_phone)
         where c.id = v_customer
           and ((c.first_name is null and c.last_name is null and v_name is not null)
             or (c.phone is null and v_phone is not null));
      end if;

      if v_outcome in ('created', 'matched_email', 'matched_phone') then
        -- Serviced by: the Staff profile with that name, when exactly one has it.
        select case when count(*) = 1 then min(s.id::text)::uuid end into v_staff
          from public.mp_staff s
         where lower(btrim(s.name)) = lower(btrim(r.e->'fitting'->>'serviced_by'));

        insert into public.customer_fittings (
          customer_id, batch_id, source, source_key, created_customer, matched_by, fitted_at,
          name_on_form, email_on_form, mobile_on_form,
          shoulder_length_in, neck_to_back_in, head_to_back_in, neck_length_in,
          recommended_size, configuration_type, profile_side, sleeper_type, sleep_symptoms,
          blood_pressure, acid_reflux, ear_discomfort_side_sleep, bed_firmness, uses_bolster,
          age_group, gender, discovery_source, referred_by, serviced_by, serviced_by_staff_id,
          notes, drive_files, other_answers
        )
        select v_customer, p_batch_id, 'google_form', v_key, v_outcome = 'created', v_matched_by, f.fitted_at,
               f.name_on_form, f.email_on_form, f.mobile_on_form,
               f.shoulder_length_in, f.neck_to_back_in, f.head_to_back_in, f.neck_length_in,
               f.recommended_size, f.configuration_type, f.profile_side, f.sleeper_type,
               coalesce(f.sleep_symptoms, '{}'),
               f.blood_pressure, f.acid_reflux, f.ear_discomfort_side_sleep, f.bed_firmness, f.uses_bolster,
               f.age_group, f.gender, f.discovery_source, f.referred_by, f.serviced_by, v_staff,
               f.notes, coalesce(f.drive_files, '[]'::jsonb), coalesce(f.other_answers, '{}'::jsonb)
          from jsonb_populate_record(null::public.customer_fittings, r.e->'fitting') f;
      end if;
    end if;

    case v_outcome
      when 'created' then v_created := v_created + 1;
      when 'matched_email' then v_email_n := v_email_n + 1;
      when 'matched_phone' then v_phone_n := v_phone_n + 1;
      when 'already_imported' then v_already := v_already + 1;
      else
        v_skipped := jsonb_set(v_skipped, array[v_reason], to_jsonb(coalesce((v_skipped->>v_reason)::int, 0) + 1));
    end case;
    v_outcomes := v_outcomes || jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object('i', v_i, 'outcome', v_outcome, 'reason', v_reason))
    );
  end loop;

  update public.fitting_import_batches b
     set rows_done = b.rows_done + v_n,
         created = b.created + v_created,
         matched_email = b.matched_email + v_email_n,
         matched_phone = b.matched_phone + v_phone_n,
         already_imported = b.already_imported + v_already,
         skipped = (
           select coalesce(jsonb_object_agg(s.reason, s.total), '{}'::jsonb)
             from (
               select t.key as reason, sum(t.value::int)::int as total
                 from (
                   select key, value from jsonb_each_text(b.skipped)
                   union all
                   select key, value from jsonb_each_text(v_skipped)
                 ) t
                group by t.key
             ) s
         )
   where b.id = p_batch_id
  returning b.rows_done into v_rows_done;

  return jsonb_build_object('status', 'applied', 'rows_done', v_rows_done, 'outcomes', v_outcomes);
end;
$$;

revoke execute on function public.import_fitting_rows(uuid, int, jsonb) from public, anon, authenticated;
grant execute on function public.import_fitting_rows(uuid, int, jsonb) to service_role;

-- ------------------------------------------------------------------
-- 5. finish_fitting_import: reconcile, then applied
-- ------------------------------------------------------------------
-- rows_total = created + matched_email + matched_phone + already_imported
-- + Σ skipped, and the Fitting records the batch holds match those outcomes.
-- Returns the counts with a status: 'applied' (newly_applied when this call
-- stamped it), 'incomplete', 'mismatch' (left unapplied) or 'undone'.
create or replace function public.finish_fitting_import(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch    public.fitting_import_batches%rowtype;
  v_skipped  int;
  v_records  int;
  v_creates  int;
  v_by_email int;
  v_counts   jsonb;
begin
  select * into v_batch from public.fitting_import_batches where id = p_batch_id for update;
  if not found then
    raise exception 'fitting import % not found', p_batch_id using errcode = 'no_data_found';
  end if;

  v_skipped := public.fitting_import_skipped_total(v_batch.skipped);
  select count(*), count(*) filter (where f.created_customer), count(*) filter (where f.matched_by = 'email')
    into v_records, v_creates, v_by_email
    from public.customer_fittings f
   where f.batch_id = p_batch_id;

  v_counts := jsonb_build_object(
    'rows_total', v_batch.rows_total,
    'rows_done', v_batch.rows_done,
    'created', v_batch.created,
    'matched_email', v_batch.matched_email,
    'matched_phone', v_batch.matched_phone,
    'already_imported', v_batch.already_imported,
    'skipped', v_batch.skipped,
    'skipped_total', v_skipped,
    'fitting_records', v_records
  );

  if v_batch.rolled_back_at is not null then
    return v_counts || jsonb_build_object('status', 'undone');
  end if;
  if v_batch.applied_at is not null then
    return v_counts || jsonb_build_object('status', 'applied', 'newly_applied', false, 'applied_at', v_batch.applied_at);
  end if;
  if v_batch.rows_done < v_batch.rows_total then
    return v_counts || jsonb_build_object('status', 'incomplete');
  end if;
  if v_batch.rows_total <> v_batch.created + v_batch.matched_email + v_batch.matched_phone
                           + v_batch.already_imported + v_skipped
     or v_records <> v_batch.created + v_batch.matched_email + v_batch.matched_phone
     or v_creates <> v_batch.created
     or v_by_email <> v_batch.created + v_batch.matched_email then
    return v_counts || jsonb_build_object('status', 'mismatch');
  end if;

  update public.fitting_import_batches set applied_at = now() where id = p_batch_id
  returning applied_at into v_batch.applied_at;
  return v_counts || jsonb_build_object('status', 'applied', 'newly_applied', true, 'applied_at', v_batch.applied_at);
end;
$$;

revoke execute on function public.finish_fitting_import(uuid) from public, anon, authenticated;
grant execute on function public.finish_fitting_import(uuid) to service_role;

-- ------------------------------------------------------------------
-- 6. Undo
-- ------------------------------------------------------------------
-- One row per Customer the batch created, with what an undo does to it:
--  'remove'  nobody has signed in to it and nothing else references it;
--  'keep'    signed in since (`auth_user_id`), or referenced.
-- The batch's Fitting records always go.
--
-- Referenced means anything points at the Customer besides this batch's own
-- Fitting records: every foreign key to `customers` is read from the catalog,
-- as customer_import_undo_plan does, so a Fitting record from another batch,
-- an Order, a note, a Migrated customer row and whatever a later slice adds
-- all keep it. Plus a Result, whose customer_id has no foreign key, and any
-- address.
create or replace function public.fitting_import_undo_plan(p_batch_id uuid)
returns table (
  customer_id uuid,
  action text,
  keep_reason text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  fk           record;
  v_ids        uuid[];
  v_found      uuid[];
  v_referenced uuid[] := '{}';
begin
  select coalesce(array_agg(distinct f.customer_id), '{}')
    into v_ids
    from public.customer_fittings f
   where f.batch_id = p_batch_id and f.created_customer;

  if cardinality(v_ids) > 0 then
    for fk in
      select con.conrelid::regclass as tbl, att.attname as col
        from pg_constraint con
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
       where con.contype = 'f'
         and con.confrelid = 'public.customers'::regclass
         and cardinality(con.conkey) = 1
    loop
      if fk.tbl = 'public.customer_fittings'::regclass then
        select array_agg(distinct f.customer_id) into v_found
          from public.customer_fittings f
         where f.customer_id = any(v_ids) and f.batch_id <> p_batch_id;
      else
        execute format('select array_agg(distinct t.%1$I) from %2$s t where t.%1$I = any($1)', fk.col, fk.tbl)
          into v_found using v_ids;
      end if;
      v_referenced := v_referenced || coalesce(v_found, '{}');
    end loop;

    select v_referenced || coalesce(array_agg(distinct r.customer_id), '{}')
      into v_referenced
      from public.mp_config_responses r
     where r.customer_id = any(v_ids);
  end if;

  return query
    select c.id,
           case
             when c.auth_user_id is not null then 'keep'
             when c.id = any(v_referenced) then 'keep'
             else 'remove'
           end,
           case
             when c.auth_user_id is not null then 'signed_in'
             when c.id = any(v_referenced) then 'referenced'
           end
      from public.customers c
     where c.id = any(v_ids);
end;
$$;

revoke execute on function public.fitting_import_undo_plan(uuid) from public, anon, authenticated;
grant execute on function public.fitting_import_undo_plan(uuid) to service_role;

-- What an undo would do, written nowhere.
create or replace function public.preview_fitting_import_undo(p_batch_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'fittings_removed', (select count(*) from public.customer_fittings f where f.batch_id = p_batch_id),
    'customers_removed', count(*) filter (where p.action = 'remove'),
    'customers_kept', count(*) filter (where p.action = 'keep'),
    'kept_signed_in', count(*) filter (where p.keep_reason = 'signed_in'),
    'kept_referenced', count(*) filter (where p.keep_reason = 'referenced')
  )
  from public.fitting_import_undo_plan(p_batch_id) p;
$$;

revoke execute on function public.preview_fitting_import_undo(uuid) from public, anon, authenticated;
grant execute on function public.preview_fitting_import_undo(uuid) to service_role;

-- Returns { status: 'undone' | 'already_undone', fittings_removed,
-- customers_removed, customers_kept, kept_signed_in, kept_referenced }.
create or replace function public.undo_fitting_import(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch      public.fitting_import_batches%rowtype;
  v_remove     uuid[];
  v_signed_in  int;
  v_referenced int;
  v_fittings   int;
  v_removed    int;
  v_counts     jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('public.import_shopify_customers'));

  select * into v_batch from public.fitting_import_batches where id = p_batch_id for update;
  if not found then
    raise exception 'fitting import % not found', p_batch_id using errcode = 'no_data_found';
  end if;
  if v_batch.rolled_back_at is not null then
    return jsonb_build_object('status', 'already_undone') || coalesce(v_batch.undo_counts, '{}'::jsonb);
  end if;

  -- Lock every Customer a removal could delete before deciding, so an Order,
  -- a cart or a sign-in cannot reach one between the check and the delete.
  perform 1
     from public.customers c
    where c.id in (
      select f.customer_id from public.customer_fittings f
       where f.batch_id = p_batch_id and f.created_customer
    )
    for update;

  select coalesce(array_agg(p.customer_id) filter (where p.action = 'remove'), '{}'),
         count(*) filter (where p.keep_reason = 'signed_in'),
         count(*) filter (where p.keep_reason = 'referenced')
    into v_remove, v_signed_in, v_referenced
    from public.fitting_import_undo_plan(p_batch_id) p;

  delete from public.customer_fittings f where f.batch_id = p_batch_id;
  get diagnostics v_fittings = row_count;
  delete from public.customers c where c.id = any(v_remove);
  get diagnostics v_removed = row_count;

  v_counts := jsonb_build_object(
    'fittings_removed', v_fittings,
    'customers_removed', v_removed,
    'customers_kept', v_signed_in + v_referenced,
    'kept_signed_in', v_signed_in,
    'kept_referenced', v_referenced
  );
  update public.fitting_import_batches
     set rolled_back_at = now(), undo_counts = v_counts
   where id = p_batch_id;

  return jsonb_build_object('status', 'undone') || v_counts;
end;
$$;

revoke execute on function public.undo_fitting_import(uuid) from public, anon, authenticated;
grant execute on function public.undo_fitting_import(uuid) to service_role;
