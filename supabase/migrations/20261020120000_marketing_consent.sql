-- Marketing consent with provenance (PRD-shopify-customer-migration, slice 07;
-- ADR 0029 h, i).
--
-- 1. Three columns on customers: the state (`subscribed | not_subscribed |
--    unsubscribed`), and the source and time of the change that set it. A
--    Customer nobody has asked is `not_subscribed` with no provenance; any
--    other state carries both (a check holds them together). Nothing moves a
--    Customer back to `not_subscribed`: Shopify's "no" may mean "never asked",
--    and a "no" given here is `unsubscribed`.
--
--    The customer reads their own `marketing_email` (the Profile's "Email me
--    news and offers" toggle), so it is granted to `authenticated`: CRM slice
--    02 replaced the table grant on customers with column grants, and this
--    slice landed second (PRD-customer-crm README). The Profile itself reads it
--    server-side, keyed by the session's Customer, like the aftercare
--    switches. The source and time are Staff-facing provenance and stay
--    ungranted (lib/ecommerce/__tests__/cost-column-grants.test.ts).
--
-- 2. customer_consent_events: every change, append-only and server-only (RLS
--    on, no policy, no grant to anon or authenticated). It is the history the
--    Customer page shows, and the proof of when and how a Customer agreed.
--
-- 3. set_marketing_email(): the one write path. It writes the three columns
--    and one event together, nothing when the state is unchanged, and only the
--    moves each source may make:
--      account          the customer, signed in, from their Profile: either way
--      shopify_import   the import and its backfill: subscribe, and only from
--                       not_subscribed (an unsubscribed Customer is skipped)
--      unsubscribe_link the one-click link in a marketing email: unsubscribe
--      complaint        a spam complaint (slice 08's webhook): unsubscribe
--      support          Staff, when the customer asks them: unsubscribe
--    Staff never subscribe anyone, so the history stays the customer's own.
--
-- 4. The rule, at the table: nothing moves `unsubscribed` → `subscribed`
--    except the customer's own `account` action. A trigger refuses any other
--    update, whatever path it comes by.
--
-- 5. Backfill from migrated_customers: an explicit "yes" at export subscribes
--    a Customer who is `not_subscribed`, with source `shopify_import`, dated
--    the export day (midnight in Singapore, where the export was taken and the
--    Admin Panel reads dates), and one event each. The importer applies the
--    same rule to later batches (20261020120100).
--
-- Idempotent.

-- ---------------------------------------------------------------------
-- 1. The columns
-- ---------------------------------------------------------------------
-- One statement per column, so the migration scans that list a table's
-- columns (cost-column-grants.test.ts) see each one.
alter table public.customers add column if not exists marketing_email text not null default 'not_subscribed'
  check (marketing_email in ('subscribed', 'not_subscribed', 'unsubscribed'));
alter table public.customers add column if not exists marketing_email_updated_at timestamptz null;
alter table public.customers add column if not exists marketing_email_source text null
  check (marketing_email_source in ('shopify_import', 'account', 'unsubscribe_link', 'complaint', 'support'));

-- Provenance exactly when a choice is recorded.
alter table public.customers drop constraint if exists customers_marketing_email_provenance;
alter table public.customers add constraint customers_marketing_email_provenance check (
  (marketing_email = 'not_subscribed') = (marketing_email_source is null)
  and (marketing_email_source is null) = (marketing_email_updated_at is null)
);

-- The customer's own Profile reads the state; nothing else of it.
grant select (marketing_email) on public.customers to authenticated;

-- Campaign audiences and the Customers list filter select on it.
create index if not exists idx_customers_marketing_email on public.customers (marketing_email);

-- ---------------------------------------------------------------------
-- 2. Every change, append-only
-- ---------------------------------------------------------------------
create table if not exists public.customer_consent_events (
  id          bigserial primary key,
  customer_id uuid not null references public.customers(id) on delete cascade,
  channel     text not null check (channel in ('email')),
  from_state  text not null check (from_state in ('subscribed', 'not_subscribed', 'unsubscribed')),
  to_state    text not null check (to_state in ('subscribed', 'unsubscribed')),
  source      text not null check (source in ('shopify_import', 'account', 'unsubscribe_link', 'complaint', 'support')),
  -- When the change took effect: now(), or the export day for a Shopify one.
  created_at  timestamptz not null default now(),
  check (from_state <> to_state)
);

create index if not exists customer_consent_events_customer_idx
  on public.customer_consent_events (customer_id, created_at desc);

alter table public.customer_consent_events enable row level security;
revoke all on public.customer_consent_events from anon, authenticated;

-- Append-only. A correction is a new event. The only changes let through are
-- the cascade from a deleted Customer, which arrives from the referential
-- trigger one level down (the customer_preference_events pattern), and an
-- undone Import batch taking back its own `shopify_import` events
-- (revert_shopify_email_consent, 20261020120100), which says so for the length
-- of that one delete.
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
     and old.source = 'shopify_import'
     and current_setting('mp.customer_import_undo', true) = 'on' then
    return old;
  end if;
  raise exception 'customer_consent_events is append-only: record a new event, not an edit'
    using errcode = 'insufficient_privilege';
end;
$$;

revoke execute on function public.reject_customer_consent_event_change() from public, anon, authenticated;

drop trigger if exists trg_customer_consent_events_append_only on public.customer_consent_events;
create trigger trg_customer_consent_events_append_only
before update or delete on public.customer_consent_events
for each row execute procedure public.reject_customer_consent_event_change();

-- ---------------------------------------------------------------------
-- 4. The rule, at the table
-- ---------------------------------------------------------------------
create or replace function public.customers_marketing_email_rule()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.marketing_email = 'unsubscribed'
     and new.marketing_email = 'subscribed'
     and new.marketing_email_source is distinct from 'account' then
    raise exception 'Only the customer''s own account action re-subscribes someone who unsubscribed'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.customers_marketing_email_rule() from public, anon, authenticated;

drop trigger if exists trg_customers_marketing_email_rule on public.customers;
create trigger trg_customers_marketing_email_rule
before update of marketing_email on public.customers
for each row execute function public.customers_marketing_email_rule();

-- ---------------------------------------------------------------------
-- 3. The one write path
-- ---------------------------------------------------------------------
-- Returns whether anything changed: false when the state is already that, or
-- when the Shopify import meets someone who unsubscribed. A move the source
-- may never make raises. `p_at` dates the change; null is now().
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
  v_current text;
  v_at      timestamptz := coalesce(p_at, now());
begin
  if p_to is null or p_to not in ('subscribed', 'unsubscribed') then
    raise exception 'A consent change subscribes or unsubscribes, not %', coalesce(p_to, 'null')
      using errcode = 'invalid_parameter_value';
  end if;
  if p_source is null or p_source not in ('shopify_import', 'account', 'unsubscribe_link', 'complaint', 'support') then
    raise exception 'Unknown consent source %', coalesce(p_source, 'null')
      using errcode = 'invalid_parameter_value';
  end if;
  if p_to = 'subscribed' and p_source not in ('account', 'shopify_import') then
    raise exception 'Only the customer, or their Shopify consent, subscribes them (not %)', p_source
      using errcode = 'invalid_parameter_value';
  end if;
  if p_to = 'unsubscribed' and p_source = 'shopify_import' then
    raise exception 'The Shopify import never unsubscribes anyone'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Lock the row so two changes at once cannot both see the old state.
  select marketing_email into v_current from customers where id = p_customer_id for update;
  if not found then
    raise exception 'Customer % not found', p_customer_id using errcode = 'no_data_found';
  end if;

  if v_current = p_to then
    return false;
  end if;
  -- The importer's half of the rule: it subscribes only someone nobody has
  -- asked. The trigger would refuse the update; this skips it quietly, so one
  -- unsubscribed row does not fail an import chunk.
  if p_source = 'shopify_import' and v_current <> 'not_subscribed' then
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

-- Server only: the customer's own key must not change consent over RPC. The
-- Profile reaches it through a server action that resolves the Customer from
-- the session, and the unsubscribe route through a signed link.
revoke execute on function public.set_marketing_email(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.set_marketing_email(uuid, text, text, timestamptz) to service_role;

-- Shopify's consent, as one rule for the backfill and every import: only an
-- explicit "yes" subscribes, dated the export day in Singapore.
create or replace function public.apply_shopify_email_consent(
  p_customer_id uuid,
  p_at_export   text,
  p_exported_at date
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select case
    when p_at_export = 'yes' then
      public.set_marketing_email(
        p_customer_id, 'subscribed', 'shopify_import',
        p_exported_at::timestamp at time zone 'Asia/Singapore'
      )
    else false
  end;
$$;

revoke execute on function public.apply_shopify_email_consent(uuid, text, date) from public, anon, authenticated;
grant execute on function public.apply_shopify_email_consent(uuid, text, date) to service_role;

-- ---------------------------------------------------------------------
-- 5. Backfill from migrated_customers
-- ---------------------------------------------------------------------
-- updated_at keeps meaning "details changed" (as 20261020111000's backfill).
alter table public.customers disable trigger trg_customers_updated_at;

select public.apply_shopify_email_consent(m.customer_id, m.email_marketing_at_export, m.exported_at)
  from public.migrated_customers m
  join public.customers c on c.id = m.customer_id
 where m.email_marketing_at_export = 'yes'
   and c.marketing_email = 'not_subscribed'
 order by m.imported_at, m.customer_id;

alter table public.customers enable trigger trg_customers_updated_at;

comment on table public.customer_consent_events is
  'Marketing consent changes (migration slice 07). Append-only; written only by set_marketing_email().';
comment on column public.customers.marketing_email is
  'Marketing consent (CONTEXT.md): subscribed | not_subscribed | unsubscribed. Written only by set_marketing_email().';
