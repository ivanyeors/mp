-- Track fulfillment status for queued Shopify sales lines.
-- Shopify can return null / unfulfilled, partial, fulfilled, etc. Keep as raw text.

alter table shopify_sales_queue
  add column if not exists fulfillment_status text;


