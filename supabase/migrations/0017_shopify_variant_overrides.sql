-- Shopify per-variant overrides for SKU and pricing.
-- Used by platform-driven "full sync" (prices + SKUs + inventory).

create table if not exists shopify_variant_overrides (
  shopify_variant_id bigint primary key references shopify_variant_mappings(shopify_variant_id) on delete cascade,
  sku text,
  price numeric(12,2) check (price is null or price >= 0),
  compare_at_price numeric(12,2) check (compare_at_price is null or compare_at_price >= 0),
  currency text not null default 'SGD',
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_shopify_variant_overrides_updated_at on shopify_variant_overrides;
create trigger trg_shopify_variant_overrides_updated_at
before update on shopify_variant_overrides
for each row execute procedure set_updated_at();


