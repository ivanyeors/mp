-- Follow-up from the admin panel load audit.
--
-- 1. Cover the remaining foreign keys the Supabase performance advisor lists
--    as unindexed. All are small tables today; the indexes are cheap and stop
--    the advisor noise from hiding real findings.
-- 2. Run the inventory / margin views with the caller's rights
--    (security_invoker) so the row security enabled on their base tables
--    applies through them too. Staff read the balance views as the
--    authenticated role, so the ledger gets a matching staff read policy;
--    every other reader is the service role.
-- Idempotent.

create index if not exists idx_analytics_events_visitor on public.analytics_events (visitor_id);
create index if not exists idx_bolster_length_config_default_template on public.bolster_length_config (default_filling_template_id);
create index if not exists idx_bolster_template_placements_item on public.bolster_template_placements (item_id);
create index if not exists idx_cart_items_customization on public.cart_items (customization_id) where customization_id is not null;
create index if not exists idx_commission_schemes_partner on public.commission_schemes (partner_id);
create index if not exists idx_customers_data_user on public.customers_data (user_id);
create index if not exists idx_customization_configs_bom_template on public.customization_configs (bom_template_id) where bom_template_id is not null;
create index if not exists idx_customization_configs_ecom_product on public.customization_configs (ecom_product_id) where ecom_product_id is not null;
create index if not exists idx_filling_template_placements_item on public.filling_template_placements (item_id);
create index if not exists idx_media_assets_created_by on public.media_assets (created_by) where created_by is not null;
create index if not exists idx_mp_config_responses_filling_template on public.mp_config_responses (filling_template_id) where filling_template_id is not null;
create index if not exists idx_mp_config_responses_measured_by_staff on public.mp_config_responses (measured_by_staff_id) where measured_by_staff_id is not null;
create index if not exists idx_mp_config_responses_order_item on public.mp_config_responses (order_item_id) where order_item_id is not null;
create index if not exists idx_mp_config_responses_proposed_filling_template on public.mp_config_responses (proposed_filling_template_id) where proposed_filling_template_id is not null;
create index if not exists idx_order_items_customization on public.order_items (customization_id) where customization_id is not null;
create index if not exists idx_orders_coupon on public.orders (coupon_id) where coupon_id is not null;
create index if not exists idx_orders_shipping_method on public.orders (shipping_method_id) where shipping_method_id is not null;
create index if not exists idx_product_reviews_customer on public.product_reviews (customer_id) where customer_id is not null;
create index if not exists idx_product_reviews_order on public.product_reviews (order_id) where order_id is not null;
create index if not exists idx_result_bolster_filling_placements_item on public.result_bolster_filling_placements (item_id);
create index if not exists idx_result_filling_placements_item on public.result_filling_placements (item_id);
create index if not exists idx_shopify_sales_queue_chosen_template on public.shopify_sales_queue (chosen_template_id) where chosen_template_id is not null;
create index if not exists idx_shopify_sales_queue_item on public.shopify_sales_queue (item_id) where item_id is not null;
create index if not exists idx_shopify_variant_mappings_default_template on public.shopify_variant_mappings (default_template_id) where default_template_id is not null;
create index if not exists idx_shopify_variant_mappings_item on public.shopify_variant_mappings (item_id) where item_id is not null;

-- Staff may read the ledger (the balance views aggregate it).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'inventory_transactions'
      and policyname = 'Staff read inventory_transactions'
  ) then
    create policy "Staff read inventory_transactions" on public.inventory_transactions
      for select to authenticated using ((select public.is_admin_user()));
  end if;
end $$;

do $$
declare
  v text;
begin
  foreach v in array array[
    'inventory_balances', 'product_buildable', 'bolster_buildable',
    'variant_stock', 'order_margins'
  ] loop
    if to_regclass('public.' || v) is not null then
      execute format('alter view public.%I set (security_invoker = on)', v);
    end if;
  end loop;
end $$;
