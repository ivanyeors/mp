-- Purchase filters (PRD-campaign-audiences slice 04): *Didn't buy*, *Pillow
-- size*, *Delivered* and the Stage filter's sub-statuses, so the retention
-- loop's Playbook audiences ("Bought Premium · Didn't buy Mbolster ·
-- Delivered over 30 days ago") are a link, a Segment and an Audience.
--
-- *Didn't buy* reads the overview's `bought`, which is already there. The rest
-- need three columns, appended to the overview, and one to the view under it:
--
-- 1. customer_purchase_lines gains `size`, appended: a pillow line's size, as
--    `classifyOrderLine` (lib/readjustment/purchases.ts) reads it and
--    lib/crm/purchase-lines.ts's `purchaseLine` passes it on. A Result's
--    build carries it in the snapshot (`assigned_size`, a JSON string); a shop
--    pillow, or a legacy cart customisation, is its pillow product's
--    `pillow_products.size`. Null for a bolster, an accessory, and a pillow of
--    no known pillow product. lib/crm/purchase-lines.check.ts compares it on
--    every line, as it does the type and Tier.
--
-- 2. admin_customer_overview appends, after `attended_bookings`:
--      pillow_sizes        the sizes of every pillow on a counted Order, in
--                          XS, S, M, L, XL order, trimmed and upper-cased,
--                          '{}' for none. The *Pillow size* filter (`size=m,l`)
--                          is an overlap, as *Bought* is.
--      last_delivered_at   the latest purchase's `delivered_at`, the same
--                          Order whose delivery gives a New Customer's
--                          sub-status; null while it is on its way, or with no
--                          purchase here. The *Delivered* filter counts days
--                          from it (`delivered=over:30`, `within:14`), because
--                          Playbooks are timed in days.
--      lifecycle_statuses  the stage and, when there is one, its sub-status:
--                          `{at_risk,lapsed}`, `{new,awaiting_delivery}`,
--                          `{lead}`. A sub-status name never repeats a stage's,
--                          and names one stage, so *Stage* (`stage=new,
--                          at-risk:lapsed`) is one overlap, never an `or`
--                          (ADR 0028 (d)). Main stages alone still filter on
--                          `lifecycle_stage`.
--    Every other column keeps its place, expression and joins; `pl` gains the
--    sizes beside `bought`. CUSTOMER_OVERVIEW_COLUMNS
--    (lib/crm/customer-overview.ts) lists the same columns, and
--    lib/crm/__tests__/customer-overview-view.test.ts holds them equal.
--
-- Nothing on `main` reads the new columns before the code that does, so this
-- is safe to apply first. The views stay security_invoker and server-only;
-- the grants are restated. Idempotent.

-- ---------------------------------------------------------------------
-- 1. What each line was, with its size
-- ---------------------------------------------------------------------
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
  end as tier,
  -- Slice 04: classifyOrderLine's size, for a pillow only.
  case
    when r.is_result then
      case when r.snap_type = 'pillow' and jsonb_typeof(s.snap -> 'assigned_size') = 'string'
           then s.snap ->> 'assigned_size' end
    when p.product_type = 'bolster' then null
    when p.product_type = 'pillow'
      or pid.pillow_id is not null then pp.size
  end as size
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
grant select on public.customer_purchase_lines to service_role;

-- ---------------------------------------------------------------------
-- 2. The Customer overview
-- ---------------------------------------------------------------------
create or replace view public.admin_customer_overview with (security_invoker = true) as
select
  c.id,
  c.email,
  c.first_name,
  c.last_name,
  c.phone,
  c.tags,
  c.total_orders,
  c.total_spent,
  c.created_at,
  c.auth_user_id is not null as has_account,
  c.account_linked_at,
  c.account_last_seen_at,
  m.customer_id is not null  as from_shopify,
  m.created_by_import,
  m.imported_at,
  m.claimed_at,
  m.shopify_orders_count,
  m.shopify_amount_spent,
  -- CRM 11 (20261020200000): Contact status.
  c.account_providers,
  not public.is_blank_phone(c.phone) as has_phone,
  public.is_valid_phone(c.phone)     as phone_valid,
  -- Migration slice 06 (20261020200100): the Claim link.
  (select min(cl.first_clicked_at)
     from public.customer_claim_links cl
    where cl.customer_id = c.id)                               as claim_link_first_clicked_at,
  -- PRD-loyalty-points slice 06: Points, and the Claim bonus.
  coalesce(pt.points_available, 0)::int as points_available,
  pt.claim_bonus_at,
  -- CRM 06 (20261020200200): Follow-ups not done yet.
  coalesce(f.open_followups, 0)::int as open_followups,
  -- CRM slice 04 (20261020200300): what they bought, when, and whether they were re-adjusted.
  coalesce(po.paid_orders, 0)        as paid_orders,
  po.first_paid_at,
  po.last_paid_at,
  coalesce(pl.bought, '{}'::text[])  as bought,
  rb.last_readjusted_at,
  lower(c.email || ' ' || coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) as search_text,
  -- Migration 07 (20261020200400): Marketing consent.
  c.marketing_email,
  c.marketing_email_updated_at,
  -- CRM slice 12 (20261020200500): reviews.
  rq.asked_at                        as review_requested_at,
  rr.first_clicked_at                as review_link_clicked_at,
  gr.star_rating                     as google_review_rating,
  gr.reviewed_at                     as google_reviewed_at,
  coalesce(sr.shop_reviews_count, 0) as shop_reviews_count,
  sr.shop_review_avg_rating,
  coalesce(gr.star_rating::int, round(sr.shop_review_avg_rating)::int) as review_rating,
  -- Migration 08 (20261020200700): the latest campaign email the provider accepted.
  (select max(cs.sent_at)
     from public.customer_campaign_sends cs
    where cs.customer_id = c.id
      and cs.status in ('sent', 'bounced', 'complained'))      as last_campaign_sent_at,
  -- PRD-crm-retention-loop slice 03: the Lifecycle stage. Purchases here plus
  -- the Shopify-era count until slice 09 imports those Orders; attended
  -- Re-adjustment bookings; and the unsubscribe, if they are unsubscribed.
  coalesce(pu.purchases, 0) + coalesce(m.shopify_orders_count, 0) as purchases,
  pu.last_purchase_at,
  public.customer_lifecycle_stage(
    coalesce(pu.purchases, 0) + coalesce(m.shopify_orders_count, 0),
    pu.last_purchase_at,
    coalesce(rb.attended_bookings, 0), rb.last_readjusted_at,
    case when c.marketing_email = 'unsubscribed' then c.marketing_email_updated_at end,
    now())                                                     as lifecycle_stage,
  public.customer_lifecycle_detail(
    coalesce(pu.purchases, 0) + coalesce(m.shopify_orders_count, 0),
    pu.last_purchase_at, pu.last_purchase_delivered_at,
    coalesce(rb.attended_bookings, 0), rb.last_readjusted_at,
    case when c.marketing_email = 'unsubscribed' then c.marketing_email_updated_at end,
    now())                                                     as lifecycle_detail,
  coalesce(m.shopify_orders_count, 0) > 0
    and pu.last_purchase_at is null                            as lifecycle_undated,
  -- The funnel (owner, 2026-10-28): attended Re-adjustment bookings.
  coalesce(rb.attended_bookings, 0)                            as attended_bookings,
  -- Campaign audiences slice 04 (this file): the sizes of the pillows they
  -- bought, the latest purchase's delivery, and the stage with its sub-status.
  coalesce(pl.pillow_sizes, '{}'::text[])                       as pillow_sizes,
  pu.last_purchase_delivered_at                                as last_delivered_at,
  array_remove(array[
    public.customer_lifecycle_stage(
      coalesce(pu.purchases, 0) + coalesce(m.shopify_orders_count, 0),
      pu.last_purchase_at,
      coalesce(rb.attended_bookings, 0), rb.last_readjusted_at,
      case when c.marketing_email = 'unsubscribed' then c.marketing_email_updated_at end,
      now()),
    public.customer_lifecycle_detail(
      coalesce(pu.purchases, 0) + coalesce(m.shopify_orders_count, 0),
      pu.last_purchase_at, pu.last_purchase_delivered_at,
      coalesce(rb.attended_bookings, 0), rb.last_readjusted_at,
      case when c.marketing_email = 'unsubscribed' then c.marketing_email_updated_at end,
      now())
  ], null)                                                     as lifecycle_statuses
from public.customers c
left join public.migrated_customers m on m.customer_id = c.id
-- The balance is the sum of the ledger (ADR 0030 (q)); at most one
-- claim_bonus entry per Customer (points_ledger_one_claim_bonus).
left join (
  select l.customer_id,
         sum(l.points)                                          as points_available,
         min(l.created_at) filter (where l.kind = 'claim_bonus') as claim_bonus_at
    from public.points_ledger l
   group by l.customer_id
) pt on pt.customer_id = c.id
left join (
  select customer_id, count(*) as open_followups
  from public.customer_followups
  where done_at is null
  group by customer_id
) f on f.customer_id = c.id
left join (
  select o.customer_id,
         count(*)::int  as paid_orders,
         min(o.paid_at) as first_paid_at,
         max(o.paid_at) as last_paid_at
    from public.orders o
   where o.customer_id is not null
     and o.paid_at is not null
     and o.status not in ('pending', 'cancelled', 'refunded', 'payment_failed')
   group by o.customer_id
) po on po.customer_id = c.id
left join (
  select l.customer_id,
         array_remove(array[
           case when bool_or(l.product_type = 'pillow' and l.tier = 'premium') then 'premium' end,
           case when bool_or(l.product_type = 'pillow' and l.tier = 'basic')   then 'basic' end,
           case when bool_or(l.product_type = 'bolster')                       then 'mbolster' end,
           case when bool_or(l.product_type = 'accessory')                     then 'accessory' end
         ], null) as bought,
         array_remove(array[
           case when bool_or(l.product_type = 'pillow' and upper(btrim(l.size)) = 'XS') then 'XS' end,
           case when bool_or(l.product_type = 'pillow' and upper(btrim(l.size)) = 'S') then 'S' end,
           case when bool_or(l.product_type = 'pillow' and upper(btrim(l.size)) = 'M') then 'M' end,
           case when bool_or(l.product_type = 'pillow' and upper(btrim(l.size)) = 'L') then 'L' end,
           case when bool_or(l.product_type = 'pillow' and upper(btrim(l.size)) = 'XL') then 'XL' end
         ], null) as pillow_sizes
    from public.customer_purchase_lines l
   where l.customer_id is not null
   group by l.customer_id
) pl on pl.customer_id = c.id
left join (
  select b.customer_id,
         max(b.start_at) as last_readjusted_at,
         count(*)::int   as attended_bookings
    from public.readjustment_bookings b
   where b.status = 'attended'
   group by b.customer_id
) rb on rb.customer_id = c.id
-- CRM slice 12: asked on, by either channel.
left join (
  select s.customer_id, min(s.sent_at) as asked_at
    from (
      select e.customer_id, e.sent_at
        from public.customer_emails e
       where e.template = 'aftercare.review_request'
         and e.entity_id = e.customer_id
         and e.status = 'sent'
         and e.sent_at is not null
      union all
      select w.customer_id, w.sent_at
        from public.customer_whatsapp w
       where w.template = 'aftercare.review_request'
         and w.entity_id = w.customer_id
         and w.status = 'sent'
         and w.sent_at is not null
    ) s
   group by s.customer_id
) rq on rq.customer_id = c.id
-- Once per Customer: its primary key is the Customer.
left join public.customer_review_requests rr on rr.customer_id = c.id
left join (
  select distinct on (l.customer_id)
         l.customer_id,
         g.star_rating,
         coalesce(g.review_created_at, g.created_at) as reviewed_at
    from public.customer_google_reviews l
    join public.google_reviews g on g.id = l.google_review_id
   order by l.customer_id, coalesce(g.review_created_at, g.created_at) desc
) gr on gr.customer_id = c.id
left join (
  select r.customer_id,
         count(*)::int              as shop_reviews_count,
         round(avg(r.rating), 1)    as shop_review_avg_rating
    from public.product_reviews r
   where r.customer_id is not null
   group by r.customer_id
) sr on sr.customer_id = c.id
-- Slice 03: purchases, the counted Orders (as `po` above) that hold a goods
-- line, so a re-adjustment fee Order (service lines only) is never one.
left join (
  select o.customer_id,
         count(*)::int  as purchases,
         max(o.paid_at) as last_purchase_at,
         (array_agg(o.delivered_at order by o.paid_at desc, o.id desc))[1] as last_purchase_delivered_at
    from public.orders o
   where o.customer_id is not null
     and o.paid_at is not null
     and o.status not in ('pending', 'cancelled', 'refunded', 'payment_failed')
     and exists (select 1
                   from public.order_items i
                  where i.order_id = o.id
                    and i.kind = 'goods')
   group by o.customer_id
) pu on pu.customer_id = c.id;

-- Server-only, as every definition before: read with the service role after
-- the `customers` permission check.
revoke all on public.admin_customer_overview from anon, authenticated;
grant select on public.admin_customer_overview to service_role;
