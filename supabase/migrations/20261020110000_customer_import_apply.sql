-- Shopify customer import: apply, reconcile and undo an Import batch
-- (PRD-shopify-customer-migration, slice 03; ADR 0028 b, c, e).
--
-- The Admin Panel page (Customers → Import from Shopify) reads the export in
-- the browser and sends it a chunk of 100 rows at a time. Every write goes
-- through the functions below, and each call is one transaction:
--
--  import_shopify_customers(batch, start_index, rows)
--    Re-decides every row against the rows as they are now, and writes it. The
--    preview (`planCustomerRow`, lib/customer-migration/plan.ts) is a forecast;
--    this is the authority. A chunk must start at the batch's `rows_done`, so a
--    chunk sent twice, or from a second tab, is refused rather than counted
--    twice. It adds the chunk's outcomes to the batch itself: the counts are
--    the server's, never the browser's.
--  finish_shopify_import(batch)
--    Reconciles, and only then stamps `applied_at`. A batch that does not
--    reconcile stays unapplied, so a mismatch is never quietly accepted. A
--    CHECK on the table makes the same promise.
--  preview_shopify_import_undo(batch) / undo_shopify_import(batch)
--    What an undo would do, then the undo. A Customer the batch created is
--    removed while it is unclaimed and nothing references it; one the batch
--    merged into loses its migrated_customers row and the address the import
--    added, and nothing on `customers` is reverted. Both share one plan,
--    customer_import_undo_plan.
--
-- The import creates Customers, never auth users (ADR 0028 b). A merge fills
-- only null names and phone, and never touches email, auth_user_id, tags,
-- notes or total_* (ADR 0028 c). Shopify tags, note, totals and consent go to
-- migrated_customers only (ADR 0028 d).
--
-- Every function is executable by the service role only. The definer ones run
-- as the owner, so they are revoked from anon and authenticated explicitly, as
-- 20260917033807_security_advisor_hardening.sql does for the older two.
--
-- Idempotent.

-- ------------------------------------------------------------------
-- 1. The batch: the export's date, the undo's outcome, one live batch per file
-- ------------------------------------------------------------------
-- The CSV carries no export date, and migrated_customers.exported_at (consent
-- provenance) needs one: the operator gives it on the apply step. NOT NULL with
-- no default is safe because nothing wrote a batch before this slice.
alter table public.customer_import_batches
  add column if not exists exported_at date not null,
  -- { removed, unlinked, kept, kept_claimed, kept_referenced }, set by the undo.
  add column if not exists undo_counts jsonb null
    check (undo_counts is null or jsonb_typeof(undo_counts) = 'object');

-- One batch per file that is not undone: an applied file is not imported twice,
-- and a stopped one is resumed rather than started again. Undo frees the file.
create unique index if not exists customer_import_batches_live_file_idx
  on public.customer_import_batches (file_sha256)
  where rolled_back_at is null;

create or replace function public.customer_import_skipped_total(p_skipped jsonb)
returns int
language sql
immutable
set search_path = public
as $$
  select coalesce(sum(value::int), 0)::int from jsonb_each_text(coalesce(p_skipped, '{}'::jsonb));
$$;

revoke execute on function public.customer_import_skipped_total(jsonb) from public, anon, authenticated;
grant execute on function public.customer_import_skipped_total(jsonb) to service_role;

-- Applied means reconciled: every row is accounted for exactly once.
alter table public.customer_import_batches
  drop constraint if exists customer_import_batches_applied_reconciles;
alter table public.customer_import_batches
  add constraint customer_import_batches_applied_reconciles check (
    applied_at is null or (
      rows_done = rows_total
      and rows_total = created + merged + already_imported + public.customer_import_skipped_total(skipped)
    )
  );

-- ------------------------------------------------------------------
-- 2. import_shopify_customers
-- ------------------------------------------------------------------
-- `p_rows` is a JSON array of rows in file order, starting at `p_start_index`:
--   { "i": n, "skip": reason }   decided before the database: a row with no
--                                usable email, or one whose email or Shopify id
--                                appears twice in the file (the browser holds
--                                the whole file; the server sees one chunk);
--   { "i": n, <NormalisedShopifyRow> }   lib/customer-migration/shopify-csv.ts.
-- Shopify ids travel as text, so a JSON number never rounds one.
--
-- Returns { status: 'applied', rows_done, outcomes: [{ i, outcome, reason? }] },
-- or { status: 'refused', reason, rows_done } with nothing written. Neither
-- carries PII.
create or replace function public.import_shopify_customers(
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
  v_batch     public.customer_import_batches%rowtype;
  v_n         int;
  r           record;
  v_i         int;
  v_outcome   text;
  v_reason    text;
  v_email     text;
  v_id        bigint;
  v_first     text;
  v_last      text;
  v_phone     text;
  v_customer  uuid;
  v_migrated  boolean;
  v_their_id  bigint;
  v_address   jsonb;
  v_address_id uuid;
  v_created   int := 0;
  v_merged    int := 0;
  v_already   int := 0;
  v_skipped   jsonb := '{}'::jsonb;
  v_outcomes  jsonb := '[]'::jsonb;
  v_rows_done int;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'rows must be a JSON array' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(p_rows);
  if v_n < 1 or v_n > 100 then
    raise exception 'send between 1 and 100 rows at a time, not %', v_n using errcode = '22023';
  end if;

  -- One import writes at a time, whichever batch: two batches deciding the
  -- same person at once could otherwise both create, or both link, them.
  perform pg_advisory_xact_lock(hashtext('public.import_shopify_customers'));

  select * into v_batch from public.customer_import_batches where id = p_batch_id for update;
  if not found then
    raise exception 'import batch % not found', p_batch_id using errcode = 'no_data_found';
  end if;
  if v_batch.rolled_back_at is not null then
    return jsonb_build_object('status', 'refused', 'reason', 'undone', 'rows_done', v_batch.rows_done);
  end if;
  if v_batch.applied_at is not null then
    return jsonb_build_object('status', 'refused', 'reason', 'applied', 'rows_done', v_batch.rows_done);
  end if;
  -- The in-order guard: a retried chunk that already landed, or one from a
  -- second tab, starts behind rows_done and is refused, not counted twice.
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
    v_address_id := null;

    if v_reason is not null then
      if v_reason not in ('no_email', 'invalid_email', 'duplicate_email_in_file', 'duplicate_customer_id_in_file') then
        raise exception 'row %: unknown skip reason', v_i using errcode = '22023';
      end if;
      v_outcome := 'skip';
    else
      v_email := r.e->>'email';
      if v_email is null or v_email = '' or v_email <> lower(btrim(v_email)) then
        raise exception 'row %: the email must be trimmed and lowercased', v_i using errcode = '22023';
      end if;
      v_id := nullif(r.e->>'shopify_customer_id', '')::bigint;
      v_first := nullif(btrim(r.e->>'first_name'), '');
      v_last := nullif(btrim(r.e->>'last_name'), '');
      v_phone := nullif(btrim(r.e->>'phone'), '');
      v_address := case
        when v_batch.with_addresses and jsonb_typeof(r.e->'address') = 'object' then r.e->'address'
      end;

      -- The plan rules, in planCustomerRow's order, against the rows as they
      -- are now. 1: this Shopify id is already imported.
      if v_id is not null and exists (
        select 1 from public.migrated_customers m where m.shopify_customer_id = v_id
      ) then
        v_outcome := 'already_imported';
      else
        v_customer := null;
        v_migrated := false;
        v_their_id := null;
        select c.id, m.customer_id is not null, m.shopify_customer_id
          into v_customer, v_migrated, v_their_id
          from public.customers c
          left join public.migrated_customers m on m.customer_id = c.id
         where lower(c.email) = v_email;

        if v_customer is not null and v_migrated then
          -- 2: the email is already a Migrated customer's.
          if v_id is not null and v_their_id is not null and v_id <> v_their_id then
            v_outcome := 'skip';
            v_reason := 'email_already_migrated';
          else
            v_outcome := 'already_imported';
          end if;
        else
          if v_customer is null then
            -- 4: create. A checkout or sign-in may have made the row since the
            -- read above; then the insert does nothing and this is a merge.
            insert into public.customers (email, first_name, last_name, phone, locale)
            values (v_email, v_first, v_last, v_phone, 'en-US')
            on conflict ((lower(email))) do nothing
            returning id into v_customer;
            if v_customer is not null then
              v_outcome := 'create';
            else
              select c.id into v_customer from public.customers c where lower(c.email) = v_email;
            end if;
          end if;

          if v_outcome is null then
            -- 3: merge. Platform data wins: fill nulls, change nothing else.
            v_outcome := 'merge';
            update public.customers c
               set first_name = coalesce(c.first_name, v_first),
                   last_name  = coalesce(c.last_name, v_last),
                   phone      = coalesce(c.phone, v_phone)
             where c.id = v_customer
               and ((c.first_name is null and v_first is not null)
                 or (c.last_name is null and v_last is not null)
                 or (c.phone is null and v_phone is not null));
            -- The address only when the Customer has none.
            if exists (select 1 from public.customer_addresses a where a.customer_id = v_customer) then
              v_address := null;
            end if;
          end if;

          if v_address is not null then
            -- Written explicitly, never left to the column default (PRD trap 3c).
            if coalesce(v_address->>'country', '') !~ '^[A-Z]{2}$' then
              raise exception 'row %: the address needs an ISO-2 country', v_i using errcode = '22023';
            end if;
            insert into public.customer_addresses
              (customer_id, recipient, line1, line2, city, state, postal_code, country, phone, is_default)
            values (
              v_customer,
              v_address->>'recipient',
              v_address->>'line1',
              nullif(v_address->>'line2', ''),
              v_address->>'city',
              nullif(v_address->>'state', ''),
              v_address->>'postal_code',
              v_address->>'country',
              nullif(v_address->>'phone', ''),
              true
            )
            returning id into v_address_id;
          end if;

          insert into public.migrated_customers (
            customer_id, shopify_customer_id, batch_id, created_by_import, created_address_id,
            shopify_orders_count, shopify_amount_spent, shopify_tags, shopify_note,
            email_marketing_at_export, exported_at
          ) values (
            v_customer,
            v_id,
            p_batch_id,
            v_outcome = 'create',
            v_address_id,
            coalesce((r.e->>'shopify_orders_count')::int, 0),
            coalesce((r.e->>'shopify_amount_spent')::numeric, 0),
            case when jsonb_typeof(r.e->'shopify_tags') = 'array'
              then array(select jsonb_array_elements_text(r.e->'shopify_tags'))
              else '{}'::text[] end,
            nullif(r.e->>'shopify_note', ''),
            -- Only an explicit yes is consent.
            case when r.e->>'email_marketing_at_export' = 'yes' then 'yes' else 'no' end,
            v_batch.exported_at
          );
        end if;
      end if;
    end if;

    case v_outcome
      when 'create' then v_created := v_created + 1;
      when 'merge' then v_merged := v_merged + 1;
      when 'already_imported' then v_already := v_already + 1;
      else
        v_skipped := jsonb_set(v_skipped, array[v_reason], to_jsonb(coalesce((v_skipped->>v_reason)::int, 0) + 1));
    end case;
    v_outcomes := v_outcomes || jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object('i', v_i, 'outcome', v_outcome, 'reason', v_reason))
    );
  end loop;

  update public.customer_import_batches b
     set rows_done = b.rows_done + v_n,
         created = b.created + v_created,
         merged = b.merged + v_merged,
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

revoke execute on function public.import_shopify_customers(uuid, int, jsonb) from public, anon, authenticated;
grant execute on function public.import_shopify_customers(uuid, int, jsonb) to service_role;

-- ------------------------------------------------------------------
-- 3. finish_shopify_import: reconcile, then applied
-- ------------------------------------------------------------------
-- rows_total = created + merged + already_imported + Σ skipped, and the rows
-- migrated_customers holds for the batch match created and merged. Returns the
-- counts with a status: 'applied' (newly_applied when this call stamped it),
-- 'incomplete' (rows remain), 'mismatch' (left unapplied) or 'undone'.
create or replace function public.finish_shopify_import(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch        public.customer_import_batches%rowtype;
  v_skipped      int;
  v_created_rows int;
  v_merged_rows  int;
  v_counts       jsonb;
begin
  select * into v_batch from public.customer_import_batches where id = p_batch_id for update;
  if not found then
    raise exception 'import batch % not found', p_batch_id using errcode = 'no_data_found';
  end if;

  v_skipped := public.customer_import_skipped_total(v_batch.skipped);
  select count(*) filter (where m.created_by_import), count(*) filter (where not m.created_by_import)
    into v_created_rows, v_merged_rows
    from public.migrated_customers m
   where m.batch_id = p_batch_id;

  v_counts := jsonb_build_object(
    'rows_total', v_batch.rows_total,
    'rows_done', v_batch.rows_done,
    'created', v_batch.created,
    'merged', v_batch.merged,
    'already_imported', v_batch.already_imported,
    'skipped', v_batch.skipped,
    'skipped_total', v_skipped,
    'created_rows', v_created_rows,
    'merged_rows', v_merged_rows
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
  if v_batch.rows_total <> v_batch.created + v_batch.merged + v_batch.already_imported + v_skipped
     or v_created_rows <> v_batch.created
     or v_merged_rows <> v_batch.merged then
    return v_counts || jsonb_build_object('status', 'mismatch');
  end if;

  update public.customer_import_batches set applied_at = now() where id = p_batch_id
  returning applied_at into v_batch.applied_at;
  return v_counts || jsonb_build_object('status', 'applied', 'newly_applied', true, 'applied_at', v_batch.applied_at);
end;
$$;

revoke execute on function public.finish_shopify_import(uuid) from public, anon, authenticated;
grant execute on function public.finish_shopify_import(uuid) to service_role;

-- ------------------------------------------------------------------
-- 4. Undo
-- ------------------------------------------------------------------
-- One row per migrated_customers row of the batch, with what an undo does:
--  'remove'  a Customer the batch created, unclaimed and referenced by nothing:
--            the row is deleted, and the cascade takes migrated_customers and
--            the address;
--  'unlink'  a Customer the batch merged into: its migrated_customers row and
--            the address the import added go, and `customers` is untouched,
--            because the filled nulls are true facts about the person;
--  'keep'    Claimed (`claimed_at`), whichever way it came in; or, for a row
--            the batch created, signed in since (`auth_user_id`) or referenced.
--            A merged Customer that already had a login is still unlinked:
--            that login predates the import.
--
-- Referenced means anything points at the Customer. Every foreign key to
-- `customers` is read from the catalog, not listed: an Order, a cart, a review,
-- a Return, a Re-adjustment booking, and whatever a later slice adds, such as
-- Customer notes, which would otherwise cascade away unseen. (`wishlists`,
-- which the PRD lists, was dropped in 0029; a fixed list would have named a
-- missing table.) Plus a Result, whose customer_id has no foreign key
-- (0045_result_customer_access), and an address the import did not write.
-- migrated_customers is the batch's own row. A later slice whose import writes
-- another per-customer row must exclude its table beside it, or every created
-- row will read as referenced.
create or replace function public.customer_import_undo_plan(p_batch_id uuid)
returns table (
  customer_id uuid,
  created_by_import boolean,
  created_address_id uuid,
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
  select coalesce(array_agg(m.customer_id), '{}')
    into v_ids
    from public.migrated_customers m
   where m.batch_id = p_batch_id and m.created_by_import;

  if cardinality(v_ids) > 0 then
    for fk in
      select con.conrelid::regclass as tbl, att.attname as col
        from pg_constraint con
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
       where con.contype = 'f'
         and con.confrelid = 'public.customers'::regclass
         and cardinality(con.conkey) = 1
         and con.conrelid not in ('public.migrated_customers'::regclass, 'public.customer_addresses'::regclass)
    loop
      execute format('select array_agg(distinct t.%1$I) from %2$s t where t.%1$I = any($1)', fk.col, fk.tbl)
        into v_found using v_ids;
      v_referenced := v_referenced || coalesce(v_found, '{}');
    end loop;

    select v_referenced || coalesce(array_agg(distinct r.customer_id), '{}')
      into v_referenced
      from public.mp_config_responses r
     where r.customer_id = any(v_ids);

    select v_referenced || coalesce(array_agg(distinct a.customer_id), '{}')
      into v_referenced
      from public.customer_addresses a
      join public.migrated_customers m on m.customer_id = a.customer_id
     where a.customer_id = any(v_ids)
       and a.id is distinct from m.created_address_id;
  end if;

  return query
    select m.customer_id,
           m.created_by_import,
           m.created_address_id,
           case
             when m.claimed_at is not null or (m.created_by_import and c.auth_user_id is not null) then 'keep'
             when m.created_by_import and m.customer_id = any(v_referenced) then 'keep'
             when m.created_by_import then 'remove'
             else 'unlink'
           end,
           case
             when m.claimed_at is not null or (m.created_by_import and c.auth_user_id is not null) then 'claimed'
             when m.created_by_import and m.customer_id = any(v_referenced) then 'referenced'
           end
      from public.migrated_customers m
      join public.customers c on c.id = m.customer_id
     where m.batch_id = p_batch_id;
end;
$$;

revoke execute on function public.customer_import_undo_plan(uuid) from public, anon, authenticated;
grant execute on function public.customer_import_undo_plan(uuid) to service_role;

-- What an undo would do, written nowhere.
create or replace function public.preview_shopify_import_undo(p_batch_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'removed', count(*) filter (where p.action = 'remove'),
    'unlinked', count(*) filter (where p.action = 'unlink'),
    'kept', count(*) filter (where p.action = 'keep'),
    'kept_claimed', count(*) filter (where p.keep_reason = 'claimed'),
    'kept_referenced', count(*) filter (where p.keep_reason = 'referenced')
  )
  from public.customer_import_undo_plan(p_batch_id) p;
$$;

revoke execute on function public.preview_shopify_import_undo(uuid) from public, anon, authenticated;
grant execute on function public.preview_shopify_import_undo(uuid) to service_role;

-- Returns { status: 'undone' | 'already_undone', removed, unlinked, kept,
-- kept_claimed, kept_referenced }.
create or replace function public.undo_shopify_import(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch      public.customer_import_batches%rowtype;
  v_remove     uuid[];
  v_unlink     uuid[];
  v_addresses  uuid[];
  v_claimed    int;
  v_referenced int;
  v_removed    int;
  v_unlinked   int;
  v_counts     jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('public.import_shopify_customers'));

  select * into v_batch from public.customer_import_batches where id = p_batch_id for update;
  if not found then
    raise exception 'import batch % not found', p_batch_id using errcode = 'no_data_found';
  end if;
  if v_batch.rolled_back_at is not null then
    return jsonb_build_object('status', 'already_undone') || coalesce(v_batch.undo_counts, '{}'::jsonb);
  end if;

  -- Lock every Customer a removal could delete before deciding, so an Order,
  -- a cart or a sign-in cannot reach one between the check and the delete: a
  -- new foreign key to the row waits on this lock, and then finds it gone.
  perform 1
     from public.customers c
    where c.id in (
      select m.customer_id from public.migrated_customers m
       where m.batch_id = p_batch_id and m.created_by_import
    )
    for update;

  select coalesce(array_agg(p.customer_id) filter (where p.action = 'remove'), '{}'),
         coalesce(array_agg(p.customer_id) filter (where p.action = 'unlink'), '{}'),
         coalesce(array_agg(p.created_address_id) filter (where p.action = 'unlink' and p.created_address_id is not null), '{}'),
         count(*) filter (where p.keep_reason = 'claimed'),
         count(*) filter (where p.keep_reason = 'referenced')
    into v_remove, v_unlink, v_addresses, v_claimed, v_referenced
    from public.customer_import_undo_plan(p_batch_id) p;

  delete from public.migrated_customers m where m.customer_id = any(v_unlink) and m.batch_id = p_batch_id;
  get diagnostics v_unlinked = row_count;
  delete from public.customer_addresses a where a.id = any(v_addresses) and a.customer_id = any(v_unlink);
  delete from public.customers c where c.id = any(v_remove);
  get diagnostics v_removed = row_count;

  v_counts := jsonb_build_object(
    'removed', v_removed,
    'unlinked', v_unlinked,
    'kept', v_claimed + v_referenced,
    'kept_claimed', v_claimed,
    'kept_referenced', v_referenced
  );
  update public.customer_import_batches
     set rolled_back_at = now(), undo_counts = v_counts
   where id = p_batch_id;

  return jsonb_build_object('status', 'undone') || v_counts;
end;
$$;

revoke execute on function public.undo_shopify_import(uuid) from public, anon, authenticated;
grant execute on function public.undo_shopify_import(uuid) to service_role;
