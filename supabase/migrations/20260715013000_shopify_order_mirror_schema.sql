-- Slice 02: Shopify order mirror (finance facts) + sync cursor.
-- Mirror ≠ shopify_sales_queue (ops inventory commit). Share shopify_order_id only —
-- this migration does not ALTER/DROP shopify_sales_queue.

-- ============================================================
-- shopify_orders
-- ============================================================
create table if not exists shopify_orders (
  shopify_order_id bigint primary key,
  name text,
  currency text not null default 'SGD',
  paid_at timestamptz,
  financial_status text,
  total_price numeric(12,2) not null default 0,
  amount_refunded numeric(12,2) not null default 0,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shopify_orders_paid_at
  on shopify_orders (paid_at);

-- ============================================================
-- shopify_order_lines
-- ============================================================
create table if not exists shopify_order_lines (
  shopify_line_item_id bigint primary key,
  shopify_order_id bigint not null
    references shopify_orders (shopify_order_id) on delete cascade,
  shopify_variant_id bigint,
  sku text,
  title text,
  quantity int not null check (quantity > 0),
  gross_revenue numeric(12,2) not null default 0,
  unit_cost numeric(12,2) check (unit_cost is null or unit_cost >= 0),
  total_cost numeric(12,2) check (total_cost is null or total_cost >= 0),
  -- ponytail: mapping detail lives on shopify_variant_mappings; mirror stores
  -- variant id + optional kind snapshot + is_others for Analytics until re-resolve.
  mapping_kind text check (mapping_kind is null or mapping_kind in ('pillow', 'bolster', 'part')),
  is_others boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shopify_order_lines_order
  on shopify_order_lines (shopify_order_id);

create index if not exists idx_shopify_order_lines_others
  on shopify_order_lines (is_others)
  where is_others = true;

-- ============================================================
-- shopify_order_refunds (idempotent by Shopify refund id)
-- ============================================================
-- ponytail: line-level refund allocation deferred to ingest (slice 03);
-- order-level amount is enough for net product revenue in v1.
create table if not exists shopify_order_refunds (
  shopify_refund_id bigint primary key,
  shopify_order_id bigint not null
    references shopify_orders (shopify_order_id) on delete cascade,
  amount numeric(12,2) not null default 0,
  currency text not null default 'SGD',
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_shopify_order_refunds_order
  on shopify_order_refunds (shopify_order_id);

-- ============================================================
-- shopify_sync_state (single-row cursor)
-- ============================================================
-- ponytail: cursor_token = Shopify page_info; since_id = order-id watermark.
-- Ingest / catch-up (slices 03/05) own cursor semantics.
create table if not exists shopify_sync_state (
  id int primary key default 1 check (id = 1),
  phase text not null default 'backfill'
    check (phase in ('backfill', 'reconcile')),
  cursor_token text,
  since_id bigint,
  last_success_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into shopify_sync_state (id, phase)
values (1, 'backfill')
on conflict (id) do nothing;
