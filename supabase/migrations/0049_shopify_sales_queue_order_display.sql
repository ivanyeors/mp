-- Shopify order display fields (name + created_at) for sales queue UI

alter table shopify_sales_queue
  add column if not exists shopify_order_name text,
  add column if not exists shopify_order_created_at timestamptz;

create index if not exists idx_shopify_sales_queue_status_order_created
  on shopify_sales_queue (status, shopify_order_created_at desc nulls last);
