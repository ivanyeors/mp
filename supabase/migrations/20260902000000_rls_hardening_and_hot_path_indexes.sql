-- RLS hardening + hot-path indexes (admin panel load audit, Sep 2026).
--
-- Findings this fixes (all confirmed against the live project):
--   * 46 policies named "Service role full access <table>" were created
--     without a TO clause, so they applied to `public` (anon included).
--     The service role bypasses RLS anyway; scope them to service_role.
--   * mp_config_responses / mp_maker_configs / mp_staff carried explicit
--     "Public read/write/update/delete" policies. Every code path that
--     touches them runs through server routes with the service-role
--     client, so the public policies are dropped.
--   * 26 tables had RLS disabled while exposed through PostgREST.
--   * The admin pages that read inventory tables from the browser now do
--     so as the signed-in staff member (authenticated role). is_admin_user()
--     gates those reads to active admin_users rows.
--   * inventory_transactions / bom_lines had no item_id index, so the
--     variant_stock view re-scanned the whole ledger per variant.
--
-- Idempotent: safe to run more than once.

-- ---------------------------------------------------------------------
-- 1. Staff predicate used by RLS policies (SECURITY DEFINER so the check
--    can read admin_users, which is itself service-role only).
-- ---------------------------------------------------------------------
create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users a
    where a.auth_user_id = auth.uid()
      and coalesce(a.is_active, false)
  );
$$;

revoke all on function public.is_admin_user() from public;
revoke all on function public.is_admin_user() from anon;
grant execute on function public.is_admin_user() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Scope the misnamed "Service role full access" policies to the
--    service role only.
-- ---------------------------------------------------------------------
do $$
declare
  p record;
begin
  for p in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and policyname like 'Service role full access%'
      and roles = '{public}'
  loop
    execute format('alter policy %I on public.%I to service_role', p.policyname, p.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. Drop the open "Public ..." policies on tables only the server touches.
-- ---------------------------------------------------------------------
drop policy if exists "Public delete mp-config responses" on public.mp_config_responses;
drop policy if exists "Public read mp-config responses"   on public.mp_config_responses;
drop policy if exists "Public update mp-config responses" on public.mp_config_responses;
drop policy if exists "Public write mp-config responses"  on public.mp_config_responses;

drop policy if exists "Public delete configs" on public.mp_maker_configs;
drop policy if exists "Public read configs"   on public.mp_maker_configs;
drop policy if exists "Public update configs" on public.mp_maker_configs;
drop policy if exists "Public write configs"  on public.mp_maker_configs;

drop policy if exists "Public delete staff" on public.mp_staff;
drop policy if exists "Public read staff"   on public.mp_staff;
drop policy if exists "Public update staff" on public.mp_staff;
drop policy if exists "Public write staff"  on public.mp_staff;

-- Explicit service-role policies so intent is visible in the dashboard.
do $$
declare
  t text;
begin
  foreach t in array array['mp_config_responses', 'mp_maker_configs', 'mp_staff'] loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t
        and policyname = 'Service role full access ' || t
    ) then
      execute format(
        'create policy %I on public.%I for all to service_role using (true) with check (true)',
        'Service role full access ' || t, t
      );
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Enable RLS on every public table that still had it off.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'bolster_bom_lines', 'bolster_length_config', 'bolster_template_placements',
    'bom_lines', 'bom_template_lines', 'bom_templates', 'customers_data',
    'exchange_rates', 'filling_template_placements', 'inventory_transactions',
    'item_prices', 'item_thresholds', 'items', 'landing_sections',
    'pillow_products', 'product_prices', 'result_bolster_filling_placements',
    'result_filling_placements', 'shopify_order_lines', 'shopify_order_refunds',
    'shopify_orders', 'shopify_processed_orders', 'shopify_sales_queue',
    'shopify_sync_state', 'shopify_variant_mappings', 'shopify_variant_overrides'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. Staff read access (authenticated + active admin) on the inventory,
--    BOM and pricing tables the admin pages read directly, plus a
--    TEMPORARY anon read policy so the currently deployed build keeps
--    working until the cookie-aware client ships. The follow-up migration
--    20260902000001_drop_tmp_anon_read.sql removes the temporary policies.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'items', 'pillow_products', 'bom_lines', 'bolster_bom_lines',
    'product_prices', 'item_prices', 'bom_templates', 'bom_template_lines',
    'bolster_length_config'
  ] loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = 'Staff read ' || t
    ) then
      execute format(
        'create policy %I on public.%I for select to authenticated using ((select public.is_admin_user()))',
        'Staff read ' || t, t
      );
    end if;
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = 'tmp_anon_read ' || t
    ) then
      execute format(
        'create policy %I on public.%I for select to anon using (true)',
        'tmp_anon_read ' || t, t
      );
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 6. Hot-path indexes.
-- ---------------------------------------------------------------------
create index if not exists idx_inventory_transactions_item
  on public.inventory_transactions (item_id);
create index if not exists idx_bom_lines_item
  on public.bom_lines (item_id);
create index if not exists idx_bolster_bom_lines_item
  on public.bolster_bom_lines (item_id);
create index if not exists idx_bom_template_lines_item
  on public.bom_template_lines (item_id);
create index if not exists idx_product_variants_item
  on public.product_variants (item_id) where item_id is not null;
create index if not exists idx_product_variants_pillow_product
  on public.product_variants (pillow_product_id) where pillow_product_id is not null;

create index if not exists idx_orders_paid_at
  on public.orders (paid_at desc) where paid_at is not null;
create index if not exists idx_customers_created_at
  on public.customers (created_at desc);
create index if not exists idx_products_created_at
  on public.products (created_at desc);

create extension if not exists pg_trgm with schema extensions;
create index if not exists idx_customers_email_trgm
  on public.customers using gin (email extensions.gin_trgm_ops);
create index if not exists idx_orders_order_number_trgm
  on public.orders using gin (order_number extensions.gin_trgm_ops);
create index if not exists idx_products_slug_trgm
  on public.products using gin (slug extensions.gin_trgm_ops);
create index if not exists idx_media_assets_name_trgm
  on public.media_assets using gin (name extensions.gin_trgm_ops);
