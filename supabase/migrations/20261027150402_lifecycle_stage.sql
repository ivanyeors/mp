-- The Lifecycle stage on every Customer (PRD-crm-retention-loop slice 03;
-- CONTEXT.md **Lifecycle stage**). Owner, 2026-10-27: *At risk* from 12 months
-- after the last purchase, *Lapsed* from 24, *Loyal* from 3 purchases.
--
-- A **purchase** is a counted Order (paid; not pending, cancelled, refunded or
-- payment-failed: the overview's `paid_orders` rule, `isCountedOrder` in
-- lib/crm/purchase-lines.ts) with at least one goods line. A re-adjustment fee
-- Order holds only service lines, so it is never a purchase. A refund that
-- leaves none puts the Customer back to *Lead*.
--
-- Shopify customers are in the same stages (owner, 2026-10-27). Until slice 09
-- imports their Orders, `migrated_customers.shopify_orders_count` is added to
-- their purchases. Recency is read from purchases here only, so a Customer
-- whose every purchase is Shopify-era is placed by count and is
-- `lifecycle_undated`: never *At risk* or *Lapsed* until their dates exist.
-- Slice 09 replaces the count with the imported Orders and must stop adding it.
--
-- 1. The rule, as two functions the view calls with now(), so a check can
--    call them with any `now` (lib/crm/lifecycle-stage.check.ts).
--    lib/crm/lifecycle-stage.ts mirrors them, and
--    lib/crm/__tests__/lifecycle-stage-sql.test.ts holds this file's intervals
--    equal to its constants.
--
--    customer_lifecycle_stage(purchases, last_purchase_at, now), checked in
--    order: lapsed (last purchase before now less 24 months), at_risk (before
--    now less 12 months), loyal (3 or more), repeat (2), new (1), lead (none).
--    The cut-offs are strict, as the *Last order* filter's (`monthsBefore`).
--
--    customer_lifecycle_delivery(purchases, last_purchase_at, delivered_at,
--    now): for a dated *New* only, the one purchase's delivery:
--    awaiting_delivery (not delivered), delivered (under 30 days ago), settled
--    (30 days or more: the return window has closed, as Points release);
--    null otherwise.
--
-- 2. admin_customer_overview adds, at the end:
--      purchases           purchases here plus the Shopify-era count
--      last_purchase_at    the latest purchase here; null with none
--      lifecycle_stage     lead, new, repeat, loyal, at_risk, lapsed
--      lifecycle_delivery  awaiting_delivery, delivered, settled, or null
--      lifecycle_undated   placed by the Shopify-era count, with no dates
--    Every column of the previous definition (20261021160000) is kept, in its
--    order, with the same expression and joins (search_text must stay
--    idx_customers_search_text_trgm's). Postgres refuses a drop or a reorder.
--    CUSTOMER_OVERVIEW_COLUMNS (lib/crm/customer-overview.ts) lists the same
--    columns; lib/crm/__tests__/customer-overview-view.test.ts holds them equal.
--
-- `create or replace view` keeps the view's privileges. It is still
-- security_invoker and server-only; the grants are restated below. The
-- functions are server-only too: execute only for the service role.
--
-- Idempotent.

-- ---------------------------------------------------------------------
-- 1. The rule
-- ---------------------------------------------------------------------
create or replace function public.customer_lifecycle_stage(
  p_purchases        int,
  p_last_purchase_at timestamptz,
  p_now              timestamptz
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when coalesce(p_purchases, 0) <= 0                                    then 'lead'
    when p_last_purchase_at < p_now - interval '24 months'                then 'lapsed'
    when p_last_purchase_at < p_now - interval '12 months'                then 'at_risk'
    when p_purchases >= 3                                                 then 'loyal'
    when p_purchases = 2                                                  then 'repeat'
    else                                                                       'new'
  end
$$;

create or replace function public.customer_lifecycle_delivery(
  p_purchases        int,
  p_last_purchase_at timestamptz,
  p_delivered_at     timestamptz,
  p_now              timestamptz
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_last_purchase_at is null
      or public.customer_lifecycle_stage(p_purchases, p_last_purchase_at, p_now) <> 'new' then null
    when p_delivered_at is null                                           then 'awaiting_delivery'
    when p_delivered_at > p_now - interval '30 days'                      then 'delivered'
    else                                                                       'settled'
  end
$$;

revoke execute on function public.customer_lifecycle_stage(int, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.customer_lifecycle_stage(int, timestamptz, timestamptz) to service_role;
revoke execute on function public.customer_lifecycle_delivery(int, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.customer_lifecycle_delivery(int, timestamptz, timestamptz, timestamptz) to service_role;

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
  -- the Shopify-era count until slice 09 imports those Orders.
  coalesce(pu.purchases, 0) + coalesce(m.shopify_orders_count, 0) as purchases,
  pu.last_purchase_at,
  public.customer_lifecycle_stage(
    coalesce(pu.purchases, 0) + coalesce(m.shopify_orders_count, 0),
    pu.last_purchase_at, now())                                as lifecycle_stage,
  public.customer_lifecycle_delivery(
    coalesce(pu.purchases, 0) + coalesce(m.shopify_orders_count, 0),
    pu.last_purchase_at, pu.last_purchase_delivered_at, now()) as lifecycle_delivery,
  coalesce(m.shopify_orders_count, 0) > 0
    and pu.last_purchase_at is null                            as lifecycle_undated
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
         ], null) as bought
    from public.customer_purchase_lines l
   where l.customer_id is not null
   group by l.customer_id
) pl on pl.customer_id = c.id
left join (
  select b.customer_id,
         max(b.start_at) as last_readjusted_at
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
