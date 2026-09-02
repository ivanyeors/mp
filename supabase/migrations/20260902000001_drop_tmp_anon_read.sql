-- Removes the temporary anon read policies added by
-- 20260902000000_rls_hardening_and_hot_path_indexes.sql.
--
-- Apply only after the build that reads inventory tables with the
-- cookie-aware (authenticated) browser client is live in production.
-- Idempotent.
do $$
declare
  t text;
begin
  foreach t in array array[
    'items', 'pillow_products', 'bom_lines', 'bolster_bom_lines',
    'product_prices', 'item_prices', 'bom_templates', 'bom_template_lines',
    'bolster_length_config'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'tmp_anon_read ' || t, t);
  end loop;
end $$;
