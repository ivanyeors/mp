-- What each Customer bought, in SQL (CRM PRD slice 04; ADR 0028, ADR 0029 (k)).
--
-- customer_purchase_lines: one row per goods line on a counted Order, saying
-- what the line was: product_type pillow | bolster | accessory, and tier
-- premium | basic | null. The Customer overview's `bought` column and the
-- Customers list's *Bought* filter read it.
--
-- It is classifyOrderLine (lib/readjustment/purchases.ts) in SQL, with the same
-- precedence:
--   1. a Service line is never a purchase: only kind = 'goods' is listed;
--   2. a Result order line carries its build in customization_snapshot
--      (result_id a JSON string, product_type pillow or bolster); a pillow's
--      tier is its assigned_tier;
--   3. the variant's product is a bolster;
--   4. a pillow: the variant's product is a pillow, or there is a pillow
--      product id on the variant or, as a JSON number, in the snapshot; the
--      tier is that pillow_products.kind;
--   5. any other goods line is an accessory (classifyOrderLine's null).
-- "Counted" is purchases.ts's rule: paid_at is set and the status is not one of
-- NOT_A_PURCHASE (pending, cancelled, refunded, payment_failed).
--
-- TypeScript and SQL must agree. lib/crm/purchase-lines.check.ts runs both
-- over fixture lines and over every line in a database, and fails on any
-- difference. purchases.ts still classifies in TypeScript; switching it to read
-- this view is a later choice.
--
-- Lines are listed whoever the Order belongs to (customer_id may be null on a
-- guest Order), so the check covers every line; the overview joins on
-- customer_id.
--
-- security_invoker, server-only: no grant to anon or authenticated, like the
-- overview it feeds. Idempotent.

create or replace view public.customer_purchase_lines with (security_invoker = true) as
select
  o.customer_id,
  o.id    as order_id,
  i.id    as order_item_id,
  o.paid_at,
  case
    when r.is_result               then r.snap_type
    when p.product_type = 'bolster' then 'bolster'
    when p.product_type = 'pillow'
      or pid.pillow_id is not null  then 'pillow'
    else 'accessory'
  end as product_type,
  case
    when r.is_result then
      case when r.snap_type = 'pillow' and s.snap ->> 'assigned_tier' in ('basic', 'premium')
           then s.snap ->> 'assigned_tier' end
    when p.product_type = 'bolster' then null
    when p.product_type = 'pillow'
      or pid.pillow_id is not null then
      case when pp.kind in ('basic', 'premium') then pp.kind end
  end as tier
from public.orders o
join public.order_items i on i.order_id = o.id
left join public.product_variants v on v.id = i.variant_id
left join public.products p on p.id = v.product_id
cross join lateral (
  select coalesce(i.customization_snapshot, '{}'::jsonb) as snap
) s
cross join lateral (
  select coalesce(jsonb_typeof(s.snap -> 'result_id') = 'string'
                  and s.snap ->> 'product_type' in ('pillow', 'bolster'), false) as is_result,
         s.snap ->> 'product_type' as snap_type
) r
cross join lateral (
  -- The variant's pillow product, else the snapshot's when it is a JSON number
  -- (classifyOrderLine's `variant.pillow_product_id ?? snapshot`). numeric, not
  -- bigint: a cast would round 2.5 to a real id, where TypeScript finds none.
  select coalesce(
    v.pillow_product_id::numeric,
    case when jsonb_typeof(s.snap -> 'pillow_product_id') = 'number'
         then (s.snap ->> 'pillow_product_id')::numeric end
  ) as pillow_id
) pid
left join public.pillow_products pp on pp.id = pid.pillow_id
where i.kind = 'goods'
  and o.paid_at is not null
  and o.status not in ('pending', 'cancelled', 'refunded', 'payment_failed');

revoke all on public.customer_purchase_lines from anon, authenticated;
