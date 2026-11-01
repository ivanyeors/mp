-- Reach filters (PRD-campaign-audiences slice 05): *Ships to*, *Language*,
-- *Campaign* and *Last emailed*, so "At risk · Ships to Singapore · Not
-- emailed in 30 days" is a link, a Segment and an Audience. (The issue's
-- *Points expire within* is not built: points never expire, ADR 0030 decision
-- 17, 20261031032017_points_never_expire.sql.)
--
-- admin_customer_overview appends five columns, after `lifecycle_statuses`:
--
--   ship_country       where they are, as an ISO-2 code: the latest counted
--                      Order's shipping country (a self-collect or re-adjustment
--                      Order is the studio's, 'SG'), else their default
--                      address's, else the address they saved last. Null when
--                      none names a two-letter country: *Unknown*, its own
--                      value, never taken for Singapore. A Shopify-era buyer
--                      with no Order here and no address is Unknown.
--   locale             `customers.locale` ('en-US' or 'zh-CN'): the language
--                      they read the site and its emails in.
--   campaigns_sent     the ids of the campaigns the provider accepted for them
--                      (sent, or since bounced or complained), as
--                      `email_campaign_stats` counts a campaign's *Sent*; text,
--                      as every array the filters read; '{}' for none.
--   campaigns_clicked  those whose email they clicked (slice 08's counted
--                      click, `first_clicked_at`); '{}' for none.
--   last_emailed_at    `last_campaign_sent_at`, or '-infinity' when no campaign
--                      reached them: *Not emailed in the last 30 days*
--                      (`emailed=over:30`) is then one `lt` that keeps the
--                      never-emailed, with no `or` (ADR 0028 (d)). Only that
--                      filter reads it; a page shows `last_campaign_sent_at`.
--
-- Every other column keeps its place, expression and joins. The new joins
-- each give at most one row per Customer. CUSTOMER_OVERVIEW_COLUMNS
-- (lib/crm/customer-overview.ts) lists the same columns, and
-- lib/crm/__tests__/customer-overview-view.test.ts holds them equal.
--
-- Nothing on `main` reads the new columns before the code that does, so this
-- is safe to apply first. The view stays security_invoker and server-only;
-- the grants are restated. Idempotent.

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
  ], null)                                                     as lifecycle_statuses,
  -- Campaign audiences slice 05 (this file): where they are, what they read,
  -- and what campaigns they got and clicked.
  coalesce(so.country, ad.country)                             as ship_country,
  c.locale,
  coalesce(cs.campaigns_sent, '{}'::text[])                    as campaigns_sent,
  coalesce(cs.campaigns_clicked, '{}'::text[])                 as campaigns_clicked,
  coalesce((select max(cs2.sent_at)
              from public.customer_campaign_sends cs2
             where cs2.customer_id = c.id
               and cs2.status in ('sent', 'bounced', 'complained')),
           '-infinity'::timestamptz)                           as last_emailed_at
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
) pu on pu.customer_id = c.id
-- Slice 05: the latest counted Order's country, when it names one.
left join lateral (
  select upper(btrim(o.shipping_address ->> 'country')) as country
    from public.orders o
   where o.customer_id = c.id
     and o.paid_at is not null
     and o.status not in ('pending', 'cancelled', 'refunded', 'payment_failed')
     and upper(btrim(o.shipping_address ->> 'country')) ~ '^[A-Z]{2}$'
   order by o.paid_at desc, o.id desc
   limit 1
) so on true
-- Else the default address, else the latest one saved.
left join lateral (
  select upper(btrim(a.country)) as country
    from public.customer_addresses a
   where a.customer_id = c.id
     and upper(btrim(a.country)) ~ '^[A-Z]{2}$'
   order by a.is_default desc, a.updated_at desc, a.id desc
   limit 1
) ad on true
-- The campaigns the provider accepted for them, and those they clicked.
-- A migration-wave send has no campaign and is not one.
left join (
  select s.customer_id,
         array_agg(distinct s.campaign_id::text)
           filter (where s.status in ('sent', 'bounced', 'complained')) as campaigns_sent,
         array_agg(distinct s.campaign_id::text)
           filter (where s.first_clicked_at is not null)               as campaigns_clicked
    from public.customer_campaign_sends s
   where s.campaign_id is not null
   group by s.customer_id
) cs on cs.customer_id = c.id;

-- Server-only, as every definition before: read with the service role after
-- the `customers` permission check.
revoke all on public.admin_customer_overview from anon, authenticated;
grant select on public.admin_customer_overview to service_role;
