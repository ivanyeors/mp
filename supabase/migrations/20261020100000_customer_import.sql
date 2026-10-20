-- Shopify customer import: the Import batch and the Migrated customer
-- (PRD-shopify-customer-migration, slice 02; ADR 0028).
--
-- customer_import_batches: one row per import that writes (slice 03). It names
-- the file as the browser picked it and its SHA-256, the counts by outcome, the
-- resume point, and who ran it. It never holds a customer's email or name, and
-- the file itself is never stored anywhere.
--
-- migrated_customers: the Shopify-era facts about a Customer the import created
-- or enriched, kept beside `customers` rather than on it. A signed-in Customer
-- can read every column of their own `customers` row (0037_customer_auth.sql),
-- and Shopify notes and tags are Staff-facing (ADR 0028 d). Shopify totals stay
-- here too: `customers.total_*` are platform figures that updateCustomerStats
-- recomputes.
--
-- Both tables are server-only, like the newest tables (20261019152211,
-- 20261020024120): RLS on with no policy, and no grant to the client roles.
-- The service role bypasses RLS.
--
-- customer_import_preview_matches: the read behind the Admin Panel preview
-- (Customers → Import from Shopify). For a chunk of rows it returns the
-- Customers that already hold those emails, matched on lower(email) as the
-- unique index is, and the Shopify ids already imported. It reads only, and it
-- is executable by the service role only.
--
-- Idempotent.

create table if not exists public.customer_import_batches (
  id               uuid primary key default gen_random_uuid(),
  source           text not null check (source in ('shopify_customers_csv')),
  -- As picked in the browser, for the history list.
  file_name        text not null,
  -- Computed in the browser; a label, not a control.
  file_sha256      text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  rows_total       int  not null check (rows_total >= 0),
  -- Resume point (slice 03).
  rows_done        int  not null default 0 check (rows_done between 0 and rows_total),
  -- false = the conservative import, without addresses (slice 03).
  with_addresses   boolean not null default true,
  created          int  not null default 0 check (created >= 0),
  merged           int  not null default 0 check (merged >= 0),
  already_imported int  not null default 0 check (already_imported >= 0),
  -- { reason: count }
  skipped          jsonb not null default '{}' check (jsonb_typeof(skipped) = 'object'),
  run_by_user_id    uuid null references auth.users(id) on delete set null,
  run_by_profile_id uuid null references public.mp_staff(id) on delete set null,
  applied_at       timestamptz,
  rolled_back_at   timestamptz,
  created_at       timestamptz not null default now()
);

create table if not exists public.migrated_customers (
  customer_id          uuid primary key references public.customers(id) on delete cascade,
  shopify_customer_id  bigint unique,
  batch_id             uuid not null references public.customer_import_batches(id),
  -- false = merged into an existing Customer.
  created_by_import    boolean not null,
  created_address_id   uuid null references public.customer_addresses(id) on delete set null,
  shopify_orders_count int not null default 0 check (shopify_orders_count >= 0),
  shopify_amount_spent numeric(12,2) not null default 0 check (shopify_amount_spent >= 0),
  shopify_tags         text[] not null default '{}',
  shopify_note         text null,
  email_marketing_at_export text not null check (email_marketing_at_export in ('yes', 'no')),
  -- The export's date, for consent provenance.
  exported_at          date not null,
  imported_at          timestamptz not null default now(),
  claimed_at           timestamptz null
);

create index if not exists migrated_customers_claimed_at_idx on public.migrated_customers (claimed_at);
create index if not exists migrated_customers_batch_id_idx on public.migrated_customers (batch_id);

alter table public.customer_import_batches enable row level security;
alter table public.migrated_customers enable row level security;
revoke all on public.customer_import_batches from anon, authenticated;
revoke all on public.migrated_customers from anon, authenticated;

-- One row per match. `match` = 'email': a Customer holds that lower(email),
-- with which of the fields a merge may fill are already set, and whether it is
-- a Migrated customer. `match` = 'shopify_id': that Shopify id is already
-- imported. Shopify ids travel as text, so a JSON number never rounds one.
create or replace function public.customer_import_preview_matches(
  p_emails text[],
  p_shopify_ids text[]
)
returns table (
  match text,
  key text,
  customer_id uuid,
  has_account boolean,
  has_first_name boolean,
  has_last_name boolean,
  has_phone boolean,
  has_address boolean,
  migrated boolean,
  migrated_shopify_customer_id text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    'email',
    lower(c.email),
    c.id,
    c.auth_user_id is not null,
    c.first_name is not null,
    c.last_name is not null,
    c.phone is not null,
    exists (select 1 from customer_addresses a where a.customer_id = c.id),
    m.customer_id is not null,
    m.shopify_customer_id::text
  from customers c
  left join migrated_customers m on m.customer_id = c.id
  where lower(c.email) = any(coalesce(p_emails, '{}'))
  union all
  select
    'shopify_id',
    m.shopify_customer_id::text,
    m.customer_id,
    null, null, null, null, null,
    true,
    m.shopify_customer_id::text
  from migrated_customers m
  where m.shopify_customer_id = any(coalesce(p_shopify_ids, '{}')::bigint[]);
$$;

revoke execute on function public.customer_import_preview_matches(text[], text[]) from public, anon, authenticated;
grant execute on function public.customer_import_preview_matches(text[], text[]) to service_role;
