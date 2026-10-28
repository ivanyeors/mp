-- The Lifecycle stage becomes the owner's funnel (PRD-crm-retention-loop
-- slice 03; owner decision 4, 2026-10-28; CONTEXT.md **Lifecycle stage**):
--
--   Lead > New > Loyal (subscribers / repeat purchases / bookings)
--        > At risk (Lapsed) > Lost
--
-- the brackets being sub-statuses within the stage. It replaces the six
-- stages of 20261028033330_lifecycle_stage.sql, whose thresholds stay
-- (owner, 2026-10-27): 12 months to *At risk*, 24 to *Lapsed*.
--
-- The stage now reads three facts:
--   - **purchases**, as before: counted Orders with a goods line, plus the
--     Shopify-era count until slice 09 (`pu`, `m`);
--   - **attended bookings**: Re-adjustment bookings with status `attended`
--     (a re-adjustment, complimentary or paid, including one booked from the
--     check-up reminder), dated by `start_at` (`rb`, which already gave
--     `last_readjusted_at`). Not a **Visit**, which is a browsing session;
--   - **the unsubscribe**: `marketing_email = 'unsubscribed'`, dated by
--     `marketing_email_updated_at`. Only the customer or Staff on their
--     request set it; the Shopify import never does (20261020120000).
--
-- 1. The rule, as two functions the view calls with now(), so a check can
--    call them with any `now` (lib/crm/lifecycle-stage.check.ts).
--    lib/crm/lifecycle-stage.ts mirrors them, and
--    lib/crm/__tests__/lifecycle-stage-sql.test.ts holds this file's numbers
--    and words equal to its constants.
--
--    customer_lifecycle_stage(purchases, last_purchase_at, bookings,
--    last_booking_at, unsubscribed_at, now), checked in order:
--      lost     unsubscribed, and no purchase or attended booking after it.
--               The owner's rule is "cancels the subscription and
--               unsubscribes"; until Renew exists nobody has one to cancel.
--      lead     no purchase and no attended booking.
--      at_risk  the latest purchase or attended booking is before now less
--               12 months. Not for a buyer with no dates yet: one whose
--               every purchase is Shopify-era (purchases, no
--               last_purchase_at) is placed by count until slice 09.
--      loyal    2 or more purchases, or an attended booking.
--      new      one purchase.
--    The cut-offs are strict, as the *Last order* filter's (`monthsBefore`).
--    Months and days are counted in UTC whatever the session's TimeZone, as
--    `monthsBefore` counts them.
--
--    customer_lifecycle_detail(purchases, last_purchase_at,
--    last_purchase_delivered_at, bookings, last_booking_at, unsubscribed_at,
--    now), the sub-status:
--      new      awaiting_delivery (not delivered), delivered (under 30 days
--               ago), settled (30 days or more: the return window has
--               closed, as Points release); null for an undated New.
--      loyal    repeat_purchases (2 or more purchases), else bookings.
--               Renew's *subscriber* will come first.
--      at_risk  lapsed (before now less 24 months), else null.
--      null for lead and lost.
--
--    The previous functions, customer_lifecycle_stage(int, timestamptz,
--    timestamptz) and customer_lifecycle_delivery(int, timestamptz,
--    timestamptz, timestamptz), are no longer called once the view is
--    replaced below. The next migration, drop_six_stage_lifecycle_functions,
--    drops them.
--
-- 2. admin_customer_overview: `lifecycle_delivery` is renamed
--    `lifecycle_detail`, in its place, and `attended_bookings` is appended.
--    `lifecycle_stage` reads the new rule. Every other column keeps its
--    place, expression and joins (search_text must stay
--    idx_customers_search_text_trgm's); `rb` gains a count, which changes no
--    existing column. Postgres refuses a drop or a reorder, so the rename is
--    an `alter view` before the `create or replace`.
--    CUSTOMER_OVERVIEW_COLUMNS (lib/crm/customer-overview.ts) lists the same
--    columns; lib/crm/__tests__/customer-overview-view.test.ts holds them equal.
--    No code on `main` reads any lifecycle column, so this is safe to apply
--    before the code that does.
--
-- The view stays security_invoker and server-only; the grants are restated
-- below. The functions are server-only too: execute only for the service role.
--
-- Idempotent.

-- ---------------------------------------------------------------------
-- 1. The rule
-- ---------------------------------------------------------------------
create or replace function public.customer_lifecycle_stage(
  p_purchases        int,
  p_last_purchase_at timestamptz,
  p_bookings         int,
  p_last_booking_at  timestamptz,
  p_unsubscribed_at  timestamptz,
  p_now              timestamptz
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_unsubscribed_at is not null
     and not coalesce(greatest(p_last_purchase_at, p_last_booking_at) > p_unsubscribed_at, false) then 'lost'
    when coalesce(p_purchases, 0) <= 0 and coalesce(p_bookings, 0) <= 0                     then 'lead'
    when not (coalesce(p_purchases, 0) > 0 and p_last_purchase_at is null)
     and greatest(p_last_purchase_at, p_last_booking_at) < ((p_now at time zone 'UTC') - interval '12 months') at time zone 'UTC' then 'at_risk'
    when coalesce(p_purchases, 0) >= 2 or coalesce(p_bookings, 0) >= 1                      then 'loyal'
    else                                                                                         'new'
  end
$$;

create or replace function public.customer_lifecycle_detail(
  p_purchases                  int,
  p_last_purchase_at           timestamptz,
  p_last_purchase_delivered_at timestamptz,
  p_bookings                   int,
  p_last_booking_at            timestamptz,
  p_unsubscribed_at            timestamptz,
  p_now                        timestamptz
)
returns text
language sql
stable
set search_path = ''
as $$
  select case public.customer_lifecycle_stage(
                p_purchases, p_last_purchase_at, p_bookings, p_last_booking_at, p_unsubscribed_at, p_now)
    when 'new' then case
      when p_last_purchase_at is null                                     then null
      when p_last_purchase_delivered_at is null                           then 'awaiting_delivery'
      when p_last_purchase_delivered_at > ((p_now at time zone 'UTC') - interval '30 days') at time zone 'UTC' then 'delivered'
      else                                                                     'settled'
    end
    when 'loyal' then case
      when coalesce(p_purchases, 0) >= 2                                  then 'repeat_purchases'
      else                                                                     'bookings'
    end
    when 'at_risk' then case
      when greatest(p_last_purchase_at, p_last_booking_at) < ((p_now at time zone 'UTC') - interval '24 months') at time zone 'UTC' then 'lapsed'
    end
  end
$$;

revoke execute on function public.customer_lifecycle_stage(int, timestamptz, int, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.customer_lifecycle_stage(int, timestamptz, int, timestamptz, timestamptz, timestamptz) to service_role;
revoke execute on function public.customer_lifecycle_detail(int, timestamptz, timestamptz, int, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.customer_lifecycle_detail(int, timestamptz, timestamptz, int, timestamptz, timestamptz, timestamptz) to service_role;

-- ---------------------------------------------------------------------
-- 2. The Customer overview
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name = 'admin_customer_overview'
                and column_name = 'lifecycle_delivery') then
    alter view public.admin_customer_overview rename column lifecycle_delivery to lifecycle_detail;
  end if;
end $$;

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
  coalesce(rb.attended_bookings, 0)                            as attended_bookings
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
