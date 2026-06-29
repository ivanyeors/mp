-- Slice 05: make variant_stock the single availability truth for bolster variants too.
--
-- Bolster e-commerce variants carry no pillow_product_id and no item_id, so they
-- previously fell through to the raw product_variants.stock_quantity column —
-- effectively untracked. Resolve them through the existing bolster_buildable view
-- (min buildable across the bolster BOM), matching the variant's option1
-- (e.g. "medium") to the bolster BOM variant. Pillow / item / track_inventory
-- branches are unchanged.
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
    when p.product_type = 'bolster' then
      coalesce((select bb.buildable from bolster_buildable bb where bb.bolster_variant::text = lower(pv.option1)), 0)
    else pv.stock_quantity
  end as stock_available
from product_variants pv
join products p on p.id = pv.product_id;
