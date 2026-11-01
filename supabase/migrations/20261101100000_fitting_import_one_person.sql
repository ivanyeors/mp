-- One person, many fittings (ADR 0039 c, amended 2026-11-01).
--
-- A customer comes back: each visit is another row of the Google Form, with
-- its own measurements, and every one of them must land on the same Customer
-- as its own Fitting record. The first import already gave the second visit
-- of one email to the Customer the first created. Two ways one person still
-- split in two:
--
--  * A visit with only a mobile, before the visit whose email creates the
--    Customer. The browser now sends every row with a usable email first
--    (`importOrder`, lib/fitting-import/google-form-csv.ts), so the
--    mobile-only visit finds them. Nothing here depends on that order; it
--    only decides what a row finds.
--  * A visit under another email (a new one, or a typo). A row whose email
--    no Customer holds now attaches to the one Customer with the same mobile
--    and the same name before a new Customer is made (rule 2b). The record is
--    matched by mobile, and keeps the email as the form had it.
--
-- And a mobile several Customers share now attaches a row with no email to
-- the one of them with the same name, instead of skipping it (rule 3).
--
-- Names compare as `fitting_name_key` reads them, the twin of `nameKey` in
-- google-form-csv.ts. A Customer's name is first and last joined, as a
-- Customer the import creates holds the form's whole name in `first_name`.
--
-- fitting_import_preview_matches gains `name_key` on its 'phone' rows, so the
-- preview forecasts the same; its return type changes, so it is dropped and
-- made again. import_fitting_rows is replaced whole: rules 2 and 3 are new,
-- everything else is as 20261031120000_customer_fittings.sql has it.
--
-- Every function is executable by the service role only. Idempotent.

-- ------------------------------------------------------------------
-- 1. fitting_name_key
-- ------------------------------------------------------------------
-- Lowercase, every run of whitespace one space, no ends; null when empty.
-- The whitespace is what JavaScript's \s matches, spelt out, as phone_e164
-- spells out its own.
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
-- 2. The preview's read, with each mobile holder's name
-- ------------------------------------------------------------------
-- As before, one row per match, and `name_key` on a 'phone' row: that
-- Customer's name as fitting_name_key reads it.
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
-- 3. import_fitting_rows, with rules 2b and 3
-- ------------------------------------------------------------------
-- Input and output as before (20261031120000_customer_fittings.sql). Rules:
--  1. already_imported: a Fitting record has this row's key.
--  2. A usable email: the Customer holding it (matched_email); else (2b) the
--     one Customer with this mobile and this name (matched_phone); else (2c)
--     a new Customer with no login (created).
--  3. No email, a usable mobile: the one Customer with it, or the one of
--     several with this name (matched_phone); else a skip.
-- A match fills only a null name or phone, as before.
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
      raise exception 'rows must run in file order from row %', p_start_index using errcode = '22023';
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
