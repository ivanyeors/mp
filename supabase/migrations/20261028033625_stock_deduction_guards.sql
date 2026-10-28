-- Two guards against taking the same goods out of stock twice.

-- 1. An in-store cart sells in one insert, each row tagged with the cart's
--    sale_id and its line. A resubmitted cart (double click, retry after a
--    timeout) collides here and inserts nothing (`sellCart`).
create unique index if not exists idx_inventory_transactions_sale_line_item
  on public.inventory_transactions ((metadata->>'sale_id'), (metadata->>'sale_line'), item_id)
  where metadata ? 'sale_id';

-- 2. orders.inventory_deducted_at is now the one-time claim for every Order,
--    not only shop Orders paid through the webhook. Result Orders accepted since
--    20261022120000 wrote their sale rows without setting it. Claim every Order
--    whose stock already left, so nothing deducts it again.
update public.orders o
set inventory_deducted_at = s.first_sale_at
from (
  select metadata->>'order_id' as order_id, min(created_at) as first_sale_at
  from public.inventory_transactions
  where reason = 'sale' and metadata ? 'order_id'
  group by metadata->>'order_id'
) s
where s.order_id = o.id::text
  and o.inventory_deducted_at is null;
