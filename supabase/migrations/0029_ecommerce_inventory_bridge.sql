-- ============================================================
-- E-Commerce ↔ Inventory Bridge
-- Customization configs, API configs, bolster buildable,
-- drop wishlists/collections, alter cart_items/order_items
-- ============================================================

-- ============================================================
-- API CONFIGS (extensible external API registry)
-- ============================================================
create table if not exists api_configs (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  base_url    text,
  api_key     text,
  config      jsonb not null default '{}',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_api_configs_updated_at on api_configs;
create trigger trg_api_configs_updated_at
before update on api_configs
for each row execute procedure set_updated_at();

alter table api_configs enable row level security;
create policy "Service role full access api_configs" on api_configs
  for all using (true) with check (true);

-- Seed default API configs
insert into api_configs (slug, name, config) values
  ('llm-customization', 'Pillow Customization LLM', '{"model":"mock-v1","temperature":0.7}'),
  ('stripe', 'Stripe', '{}')
on conflict (slug) do nothing;

-- ============================================================
-- CUSTOMIZATION CONFIGS
-- ============================================================
create table if not exists customization_configs (
  id                uuid primary key default gen_random_uuid(),
  pillow_product_id bigint not null references pillow_products(id),
  bom_template_id   bigint references bom_templates(id) on delete set null,
  config_lines      jsonb not null default '[]',
  filling_lines     jsonb not null default '[]',
  cover_variant     text,
  case_variant      text,
  llm_metadata      jsonb default '{}',
  summary           text,
  total_addon_price numeric(10,2) not null default 0,
  created_at        timestamptz not null default now()
);

create index idx_customization_configs_pillow on customization_configs(pillow_product_id);

alter table customization_configs enable row level security;
create policy "Service role full access customization_configs" on customization_configs
  for all using (true) with check (true);

-- ============================================================
-- ALTER PRODUCTS: is_auto_generated flag
-- ============================================================
alter table products
  add column if not exists is_auto_generated boolean not null default false;

-- ============================================================
-- ALTER CART_ITEMS: customization reference
-- ============================================================
alter table cart_items
  add column if not exists customization_id uuid references customization_configs(id) on delete set null;

-- Replace old unique constraint with one that includes customization_id
alter table cart_items drop constraint if exists cart_items_cart_id_variant_id_key;
create unique index if not exists idx_cart_items_unique
  on cart_items (cart_id, variant_id, coalesce(customization_id, '00000000-0000-0000-0000-000000000000'));

-- ============================================================
-- ALTER ORDER_ITEMS: customization reference + snapshot
-- ============================================================
alter table order_items
  add column if not exists customization_id uuid references customization_configs(id) on delete set null;
alter table order_items
  add column if not exists customization_snapshot jsonb;

-- ============================================================
-- BOLSTER BUILDABLE VIEW
-- ============================================================
create or replace view bolster_buildable as
select
  bbl.variant as bolster_variant,
  min(floor(coalesce(bal.on_hand, 0) / bbl.quantity))::bigint as buildable
from bolster_bom_lines bbl
left join inventory_balances bal on bal.item_id = bbl.item_id
group by bbl.variant;

-- ============================================================
-- UPDATE VARIANT_STOCK VIEW (add bolster support)
-- ============================================================
drop view if exists variant_stock;
create or replace view variant_stock as
select
  pv.id as variant_id,
  pv.product_id,
  pv.sku,
  case
    when pv.track_inventory = false then 999999
    when pv.pillow_product_id is not null then
      coalesce((select buildable from product_buildable pb where pb.product_id = pv.pillow_product_id), 0)
    when pv.item_id is not null then
      coalesce((select on_hand from inventory_balances ib where ib.item_id = pv.item_id), 0)
    else pv.stock_quantity
  end as stock_available
from product_variants pv;

-- ============================================================
-- DROP UNUSED TABLES (wishlists, collections)
-- ============================================================
drop table if exists wishlist_items cascade;
drop table if exists wishlists cascade;
drop table if exists collection_products cascade;
drop table if exists collections cascade;
