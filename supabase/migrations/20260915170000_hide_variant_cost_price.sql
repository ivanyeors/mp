-- Hide internal cost columns from the anon and authenticated roles (#173).
--
-- DEPLOY ORDER: apply only AFTER the code that ships with it is live. Older
-- code reads `order_items(*)` as the signed-in customer and /account/orders
-- would 500. Never roll that code back without restoring the table grant.
--
-- * "Public read active product_variants" (0028) lets anyone holding the public
--   anon key read active variants straight from PostgREST, cost_price included:
--   GET /rest/v1/product_variants?select=sku,cost_price
-- * "Customers read own order_items" (0039) lets a signed-in shopper read the
--   unit_cost / total_cost snapshots (20260702120000) on their own order lines,
--   and through the security_invoker order_margins view, their orders' COGS.
--
-- A column-level REVOKE does nothing while a table-level SELECT grant exists,
-- so the table grant is revoked and SELECT re-granted column by column. The
-- service role keeps its table grant and bypasses RLS: server code is unchanged.
--
-- App readers under these roles (checked 2026-09-15): nothing reads
-- product_variants as anon/authenticated; order_items is read by
-- lib/shop/customer-orders.ts, which lists its columns explicitly. A
-- `select=*` (or an embedded `product_variants(*)` / `order_items(*)`) as
-- anon/authenticated now fails with "permission denied".
--
-- NEW COLUMNS on these two tables are NOT readable by anon/authenticated until
-- granted explicitly, e.g.
--   grant select (new_col) on public.product_variants to anon, authenticated;
-- lib/ecommerce/__tests__/cost-column-grants.test.ts fails until a
-- new column is either granted here-style or added to its hidden list.
--
-- Idempotent.

revoke select on public.product_variants from anon, authenticated;
grant select (
  id, product_id, sku, title, option1, option2, option3,
  price, compare_at_price, currency, stock_quantity, track_inventory,
  weight_grams, image_url, is_active, position,
  stripe_price_id, stripe_price_id_test, item_id, pillow_product_id,
  shopify_variant_id, price_key, created_at, updated_at
) on public.product_variants to anon, authenticated;

revoke select on public.order_items from anon, authenticated;
grant select (
  id, order_id, variant_id, sku, product_title, variant_title, image_url,
  quantity, returned_quantity, unit_price, total_price,
  customization_id, customization_snapshot, created_at
) on public.order_items to authenticated;
