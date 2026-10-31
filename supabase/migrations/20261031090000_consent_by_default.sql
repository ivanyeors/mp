-- Marketing consent by default (PRD-campaign-audiences, owner decisions of
-- 2026-10-31; ADR 0037).
--
-- The owner's call: every imported customer starts subscribed, and the
-- checkout box is ticked by default. Each is recorded under its own source, so
-- the Customer page and the history say how a person came to be subscribed,
-- and each can be counted, or taken back, by source.
--
-- 1. Three consent sources:
--      import_default        subscribed because they were imported, though the
--                            Shopify export did not say yes
--      shopify_unsubscribed  on the list of people who unsubscribed in Shopify.
--                            The export's "no" cannot tell them from people
--                            nobody asked, so the owner exports that list too.
--      checkout              the box at checkout, ticked by default
--
-- 2. set_marketing_email(): the moves each source may make, now:
--      account               the customer, signed in, from their Profile: either way
--      shopify_import        subscribe, only someone nobody has asked
--      import_default        subscribe, only someone nobody has asked
--      checkout              subscribe, only someone nobody has asked
--      unsubscribe_link      unsubscribe
--      complaint             unsubscribe
--      support               unsubscribe
--      shopify_unsubscribed  unsubscribe, except someone who chose to subscribe
--                            here, from their Profile, since
--    "Only someone nobody has asked" is quiet: anyone else is skipped, not an
--    error. A box nobody unticked, or a default, never re-subscribes someone
--    who said no, and never replaces a choice they made.
--
-- 3. subscribe_migrated_customers(list, apply): first unsubscribes every
--    Customer on Shopify's unsubscribed list, then subscribes every other
--    Migrated customer nobody has asked, as `import_default`. With apply false
--    it only counts, which is the Admin Panel's preview. Idempotent: run again
--    after a later Import batch, with the list exported again.
--
-- 4. Undoing an Import batch treats `import_default` as the import's own, like
--    `shopify_import`: a Customer the batch created is still removed, and a
--    Customer it merged into goes back to `not_subscribed` while that default
--    is still their consent. Once unlinked they are no longer a Migrated
--    customer, which is the only reason they were subscribed.
--
-- Idempotent.

-- ---------------------------------------------------------------------
-- 1. The sources
-- ---------------------------------------------------------------------
alter table public.customers drop constraint if exists customers_marketing_email_source_check;
alter table public.customers add constraint customers_marketing_email_source_check check (
  marketing_email_source in (
    'shopify_import', 'import_default', 'shopify_unsubscribed', 'checkout',
    'account', 'unsubscribe_link', 'complaint', 'support'
  )
);

alter table public.customer_consent_events drop constraint if exists customer_consent_events_source_check;
alter table public.customer_consent_events add constraint customer_consent_events_source_check check (
  source in (
    'shopify_import', 'import_default', 'shopify_unsubscribed', 'checkout',
    'account', 'unsubscribe_link', 'complaint', 'support'
  )
);

-- ---------------------------------------------------------------------
-- 2. The one write path
-- ---------------------------------------------------------------------
-- As 20261020120000, with the three sources. Returns whether anything changed.
create or replace function public.set_marketing_email(
  p_customer_id uuid,
  p_to          text,
  p_source      text,
  p_at          timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current        text;
  v_current_source text;
  v_at             timestamptz := coalesce(p_at, now());
begin
  if p_to is null or p_to not in ('subscribed', 'unsubscribed') then
    raise exception 'A consent change subscribes or unsubscribes, not %', coalesce(p_to, 'null')
      using errcode = 'invalid_parameter_value';
  end if;
  if p_source is null or p_source not in (
    'shopify_import', 'import_default', 'shopify_unsubscribed', 'checkout',
    'account', 'unsubscribe_link', 'complaint', 'support'
  ) then
    raise exception 'Unknown consent source %', coalesce(p_source, 'null')
      using errcode = 'invalid_parameter_value';
  end if;
  if p_to = 'subscribed' and p_source not in ('account', 'shopify_import', 'import_default', 'checkout') then
    raise exception 'Only the customer, the import or the checkout box subscribes them (not %)', p_source
      using errcode = 'invalid_parameter_value';
  end if;
  if p_to = 'unsubscribed' and p_source in ('shopify_import', 'import_default', 'checkout') then
    raise exception 'The source % never unsubscribes anyone', p_source
      using errcode = 'invalid_parameter_value';
  end if;

  -- Lock the row so two changes at once cannot both see the old state.
  select marketing_email, marketing_email_source
    into v_current, v_current_source
    from customers where id = p_customer_id for update;
  if not found then
    raise exception 'Customer % not found', p_customer_id using errcode = 'no_data_found';
  end if;

  if v_current = p_to then
    return false;
  end if;
  -- The import, its default and the checkout box subscribe only someone
  -- nobody has asked. The trigger would refuse an unsubscribed one; this skips
  -- it quietly, so one row does not fail an import chunk or a checkout.
  if p_source in ('shopify_import', 'import_default', 'checkout') and v_current <> 'not_subscribed' then
    return false;
  end if;
  -- Shopify's list is older than a choice the customer made here.
  if p_source = 'shopify_unsubscribed' and v_current_source = 'account' then
    return false;
  end if;

  update customers
     set marketing_email = p_to,
         marketing_email_source = p_source,
         marketing_email_updated_at = v_at
   where id = p_customer_id;

  insert into customer_consent_events (customer_id, channel, from_state, to_state, source, created_at)
  values (p_customer_id, 'email', v_current, p_to, p_source, v_at);

  return true;
end;
$$;

revoke execute on function public.set_marketing_email(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.set_marketing_email(uuid, text, text, timestamptz) to service_role;

-- ---------------------------------------------------------------------
-- 3. Subscribe the Migrated customers
-- ---------------------------------------------------------------------
-- `p_unsubscribed`: the emails on Shopify's unsubscribed list (Customers →
-- filter "Email subscription: Unsubscribed" → Export), any case. An empty list
-- is the owner saying nobody unsubscribed in Shopify.
--
-- Returns, before any change (so a preview and the run that follows agree):
--   imported            Migrated customers
--   already_subscribed  of them, subscribed and not on the list
--   to_subscribe        of them, nobody has asked and not on the list
--   stay_unsubscribed   of them, unsubscribed already
--   listed              distinct emails on the list
--   listed_customers    Customers with one of those emails
--   to_unsubscribe      of those, not yet unsubscribed and not subscribed by
--                       their own choice here
-- and, with p_apply, what changed: `subscribed`, `unsubscribed`.
create or replace function public.subscribe_migrated_customers(
  p_unsubscribed text[],
  p_apply        boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_list         text[];
  v_unsub        uuid[];
  v_sub          uuid[];
  v_counts       jsonb;
  v_id           uuid;
  v_subscribed   int := 0;
  v_unsubscribed int := 0;
begin
  if p_unsubscribed is null then
    raise exception 'Give Shopify''s unsubscribed list, or an empty one if nobody unsubscribed there'
      using errcode = 'invalid_parameter_value';
  end if;

  select coalesce(array_agg(distinct lower(btrim(e))), '{}')
    into v_list
    from unnest(p_unsubscribed) as e
   where btrim(e) <> '';

  -- One writer at a time, with the import: a chunk landing mid-run would
  -- otherwise add Migrated customers this run did not count.
  if p_apply then
    perform pg_advisory_xact_lock(hashtext('public.import_shopify_customers'));
  end if;

  select coalesce(array_agg(c.id order by c.id), '{}')
    into v_unsub
    from customers c
   where lower(c.email) = any(v_list)
     and c.marketing_email <> 'unsubscribed'
     and c.marketing_email_source is distinct from 'account';

  select coalesce(array_agg(c.id order by m.imported_at, c.id), '{}')
    into v_sub
    from migrated_customers m
    join customers c on c.id = m.customer_id
   where c.marketing_email = 'not_subscribed'
     and not (lower(c.email) = any(v_list));

  select jsonb_build_object(
           'imported', count(*),
           'already_subscribed', count(*) filter (where c.marketing_email = 'subscribed' and not (lower(c.email) = any(v_list))),
           'to_subscribe', cardinality(v_sub),
           'stay_unsubscribed', count(*) filter (where c.marketing_email = 'unsubscribed'),
           'listed', cardinality(v_list),
           'listed_customers', (select count(*) from customers x where lower(x.email) = any(v_list)),
           'to_unsubscribe', cardinality(v_unsub)
         )
    into v_counts
    from migrated_customers m
    join customers c on c.id = m.customer_id;

  if not p_apply then
    return v_counts;
  end if;

  -- The list first, so nobody on it is subscribed by the default below.
  foreach v_id in array v_unsub loop
    if public.set_marketing_email(v_id, 'unsubscribed', 'shopify_unsubscribed') then
      v_unsubscribed := v_unsubscribed + 1;
    end if;
  end loop;

  foreach v_id in array v_sub loop
    if public.set_marketing_email(v_id, 'subscribed', 'import_default') then
      v_subscribed := v_subscribed + 1;
    end if;
  end loop;

  return v_counts || jsonb_build_object('subscribed', v_subscribed, 'unsubscribed', v_unsubscribed);
end;
$$;

revoke execute on function public.subscribe_migrated_customers(text[], boolean) from public, anon, authenticated;
grant execute on function public.subscribe_migrated_customers(text[], boolean) to service_role;

-- ---------------------------------------------------------------------
-- 4. The import's undo, past its default
-- ---------------------------------------------------------------------
-- As 20261020120000: append-only, with the cascade, and the undo taking back
-- its own events, now `import_default` beside `shopify_import`.
create or replace function public.reject_customer_consent_event_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE'
     and old.source in ('shopify_import', 'import_default')
     and current_setting('mp.customer_import_undo', true) = 'on' then
    return old;
  end if;
  raise exception 'customer_consent_events is append-only: record a new event, not an edit'
    using errcode = 'insufficient_privilege';
end;
$$;

revoke execute on function public.reject_customer_consent_event_change() from public, anon, authenticated;

-- As 20261020120100, with `import_default` beside `shopify_import`: neither
-- marks a created Customer referenced. Shopify's unsubscribed list does, as
-- any unsubscribe does: it must survive an undo and a re-import.
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
       and e.source not in ('shopify_import', 'import_default');

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

-- As 20261020120100, with `import_default`: a merged Customer whose consent
-- still comes from the import, or from its default, goes back to
-- `not_subscribed`, and that one event goes with it. Nothing moves anyone to
-- `not_subscribed` but this, so a Customer whose consent is either has no
-- other event. One who changed their consent since keeps it, and their history.
create or replace function public.revert_shopify_email_consent(p_customer_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from customers
   where id = p_customer_id and marketing_email_source in ('shopify_import', 'import_default')
     for update;
  if not found then
    return false;
  end if;

  -- The one delete customer_consent_events lets through.
  perform set_config('mp.customer_import_undo', 'on', true);
  delete from customer_consent_events
   where customer_id = p_customer_id and source in ('shopify_import', 'import_default');
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

comment on table public.customer_consent_events is
  'Marketing consent changes. Append-only; written only by set_marketing_email(). Sources: 20261031090000_consent_by_default.sql.';
