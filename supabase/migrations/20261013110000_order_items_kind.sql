-- Service lines on Orders (ADR 0024, PRD-service-fees-readjustment slice 04).
--
-- A Service fee — the Measurement service on a Staff-measured build, or a paid
-- Re-adjustment — is its own order line, so an Order's lines still sum to its
-- subtotal. Before this column every line was a parcel: the courier path labelled
-- a variant-less, snapshot-less line as a "pillow" (lib/shipping/lines.ts). A
-- service line is never shipped, never stock-deducted and never returnable.
--
-- Every existing row backfills to 'goods' through the default.

alter table order_items add column if not exists kind text not null default 'goods';
alter table order_items add column if not exists service_key text null references service_prices(key);

alter table order_items drop constraint if exists order_items_kind_check;
alter table order_items
  add constraint order_items_kind_check check (kind in ('goods', 'service'));

-- A service line names its Service; a goods line never does.
alter table order_items drop constraint if exists order_items_service_key_check;
alter table order_items
  add constraint order_items_service_key_check check ((kind = 'service') = (service_key is not null));

-- order_items hides its cost columns from customers with column-level grants
-- (20260915170000_hide_variant_cost_price.sql), so every new column must be
-- granted explicitly or the customer's own order page cannot read it.
grant select (kind, service_key) on public.order_items to authenticated;
