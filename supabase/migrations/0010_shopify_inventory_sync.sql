-- Shopify inventory sync support
-- Stores mapping from Shopify variant -> internal stock unit (pillow size / bolster variant / part item)
-- and idempotency for webhook processing.

create table if not exists shopify_variant_mappings (
  shopify_variant_id bigint primary key,
  kind text not null check (kind in ('pillow','bolster','part')),
  pillow_size text check (pillow_size in ('XS','S','M','L','XL')),
  bolster_variant text check (bolster_variant in ('short','medium','long')),
  item_id bigint references items(id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (kind = 'pillow' and pillow_size is not null and bolster_variant is null and item_id is null)
    or (kind = 'bolster' and pillow_size is null and bolster_variant is not null and item_id is null)
    or (kind = 'part' and pillow_size is null and bolster_variant is null and item_id is not null)
  )
);

create index if not exists idx_shopify_variant_mappings_kind on shopify_variant_mappings (kind);

drop trigger if exists trg_shopify_variant_mappings_updated_at on shopify_variant_mappings;
create trigger trg_shopify_variant_mappings_updated_at
before update on shopify_variant_mappings
for each row execute procedure set_updated_at();

-- Idempotency table for Shopify order webhooks (Shopify retries webhooks on non-2xx).
create table if not exists shopify_processed_orders (
  shopify_order_id bigint primary key,
  webhook_id uuid,
  topic text,
  shop_domain text,
  processed_at timestamptz not null default now(),
  payload jsonb
);

create index if not exists idx_shopify_processed_orders_processed_at on shopify_processed_orders (processed_at);


