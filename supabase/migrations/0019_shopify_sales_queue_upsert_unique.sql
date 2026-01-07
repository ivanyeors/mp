-- Add a unique index that matches the ON CONFLICT column list used by PostgREST upserts.
-- Note: existing migration used a COALESCE-based unique index to handle NULLs, but ON CONFLICT
-- cannot target that expression index via PostgREST's `onConflict` option.

create unique index if not exists idx_shopify_sales_queue_upsert
on shopify_sales_queue (shopify_order_id, shopify_line_item_id, shopify_variant_id, kind);


