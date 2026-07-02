-- Slice 09: cost snapshots on order lines + refund-aware realized margin view.

alter table order_items add column if not exists unit_cost numeric(12,2)
  check (unit_cost is null or unit_cost >= 0);
alter table order_items add column if not exists total_cost numeric(12,2)
  check (total_cost is null or total_cost >= 0);

create or replace view order_margins as
with item_cogs as (
  select
    order_id,
    sum(coalesce(total_cost, 0)) as cogs_gross,
    sum(coalesce(unit_cost, 0) * returned_quantity) as cogs_restock
  from order_items
  group by order_id
),
ledger as (
  select
    order_id,
    count(*) > 0 as has_ledger,
    sum(amount) as ledger_sum
  from order_payments
  group by order_id
),
base as (
  select
    o.id as order_id,
    o.order_number,
    o.subtotal as revenue,
    o.discount_amount as discount,
    o.shipping_amount as shipping,
    o.tax_amount as tax,
    coalesce(ic.cogs_gross, 0) - coalesce(ic.cogs_restock, 0) as cogs,
    case
      when coalesce(l.has_ledger, false) then coalesce(l.ledger_sum, 0)
      when o.paid_at is not null then o.total
      else o.subtotal - o.discount_amount + o.shipping_amount + o.tax_amount
    end as net_revenue,
    o.subtotal - o.discount_amount as product_revenue,
    o.total,
    coalesce(l.has_ledger, false) as has_ledger
  from orders o
  left join item_cogs ic on ic.order_id = o.id
  left join ledger l on l.order_id = o.id
),
adjusted as (
  select
    *,
    case
      when has_ledger and total > 0 then product_revenue * (net_revenue / total)
      else product_revenue
    end as adjusted_product_revenue
  from base
)
select
  order_id,
  order_number,
  revenue,
  discount,
  shipping,
  tax,
  cogs,
  net_revenue,
  adjusted_product_revenue - cogs as gross_margin,
  case
    when adjusted_product_revenue > 0
    then (adjusted_product_revenue - cogs) / adjusted_product_revenue * 100
    else null
  end as margin_pct
from adjusted;
