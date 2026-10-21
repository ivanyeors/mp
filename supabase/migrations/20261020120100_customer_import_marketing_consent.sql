-- Shopify customer import: Marketing consent at import, and an undo that
-- reads past it (PRD-shopify-customer-migration, slice 07; ADR 0029 e, h).
--
-- Replaces three functions of 20261020110000_customer_import_apply.sql, which
-- stays as it was. Everything else about them is unchanged.
--
--  import_shopify_customers
--    After writing a row's migrated_customers row, applies its Shopify
--    consent through apply_shopify_email_consent (20261020120000), the same
--    rule the backfill used: an explicit "yes" subscribes a Customer who is
--    `not_subscribed`, with source `shopify_import`, dated the export day. A
--    Customer who unsubscribed, or who is already subscribed, is left as they
--    are, and so is a row the import skips or finds already imported. Shopify's
--    "no" changes nothing: it may mean "never asked".
--
--  customer_import_undo_plan
--    The import now writes a customer_consent_events row for every created
--    Customer whose export said "yes". Read as a foreign key like any other,
--    it would mark each of them referenced, and undo would keep them all. So
--    the import's own events (source `shopify_import`) are left out, as
--    migrated_customers is; any other consent event still keeps the row. An
--    unsubscribe is a fact about the person that must survive the undo: a
--    re-import would otherwise create them afresh, and subscribed.
--
--  undo_shopify_import
--    Takes back the consent the batch gave. A removed Customer takes its
--    events with it (the cascade). A merged Customer whose consent still comes
--    from the import goes back to `not_subscribed`, and the import's event is
--    removed with the batch's other writes (revert_shopify_email_consent), so
--    an undo nothing has touched since restores the prior state. A wrong file
--    must not leave anyone subscribed. A Customer who has changed their
--    consent since keeps it: that change is theirs, not the batch's.
--
-- Every function stays executable by the service role only.
--
-- Idempotent.

-- ------------------------------------------------------------------
-- 1. import_shopify_customers, now with consent
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

          -- Consent moves with its provenance (ADR 0029 h), by the backfill's
          -- rule: only an explicit yes, only for someone nobody has asked.
          perform public.apply_shopify_email_consent(
            v_customer,
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
-- 2. customer_import_undo_plan, past the import's own consent events
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
-- row will read as referenced. customer_consent_events is half that case: the
-- import writes its `shopify_import` events, which do not count, and nothing
-- else, so every other consent event does.
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
         and con.conrelid not in (
           'public.migrated_customers'::regclass,
           'public.customer_addresses'::regclass,
           'public.customer_consent_events'::regclass
         )
    loop
      execute format('select array_agg(distinct t.%1$I) from %2$s t where t.%1$I = any($1)', fk.col, fk.tbl)
        into v_found using v_ids;
      v_referenced := v_referenced || coalesce(v_found, '{}');
    end loop;

    select v_referenced || coalesce(array_agg(distinct r.customer_id), '{}')
      into v_referenced
      from public.mp_config_responses r
     where r.customer_id = any(v_ids);

    -- An unsubscribe, or the customer's own Profile choice, keeps the row.
    select v_referenced || coalesce(array_agg(distinct e.customer_id), '{}')
      into v_referenced
      from public.customer_consent_events e
     where e.customer_id = any(v_ids)
       and e.source <> 'shopify_import';

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

-- ------------------------------------------------------------------
-- 3. undo_shopify_import, taking back the consent it gave
-- ------------------------------------------------------------------
-- A merged Customer whose consent still comes from the import goes back to
-- `not_subscribed`, and the import's event goes with it, as the batch's
-- migrated_customers row and address do: an undo nothing has touched since
-- restores the prior state (supabase/tests/customer-import/assert-restore.sql).
-- Its `shopify_import` event is the only one such a Customer can have, since
-- nothing moves anyone back to `not_subscribed` but this. A Customer who has
-- changed their consent since keeps it, and their whole history. Returns
-- whether it reverted.
create or replace function public.revert_shopify_email_consent(p_customer_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from customers
   where id = p_customer_id and marketing_email_source = 'shopify_import'
     for update;
  if not found then
    return false;
  end if;

  -- The one delete customer_consent_events lets through (20261020120000).
  perform set_config('mp.customer_import_undo', 'on', true);
  delete from customer_consent_events
   where customer_id = p_customer_id and source = 'shopify_import';
  perform set_config('mp.customer_import_undo', '', true);

  update customers
     set marketing_email = 'not_subscribed',
         marketing_email_source = null,
         marketing_email_updated_at = null
   where id = p_customer_id;
  return true;
end;
$$;

revoke execute on function public.revert_shopify_email_consent(uuid) from public, anon, authenticated;
grant execute on function public.revert_shopify_email_consent(uuid) to service_role;

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

  -- The consent this batch gave a Customer it merged into, while it is still
  -- the import's. A removed Customer's goes with the row (the cascade).
  perform public.revert_shopify_email_consent(u.id) from unnest(v_unlink) as u(id);

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
