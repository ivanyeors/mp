-- Reviews on the Customer overview (CRM PRD slice 12; ADR 0028 (k)).
--
-- `create or replace view admin_customer_overview` keeps every column the
-- last definition had, in order: migration 12's; CRM 11's account_providers,
-- has_phone and phone_valid (20261020200000); migration slice 06's
-- claim_link_first_clicked_at and welcome_voucher_state (20261020200100);
-- CRM 06's open_followups (20261020200200); CRM 04's paid_orders,
-- first_paid_at, last_paid_at, bought, last_readjusted_at and search_text
-- (20261020200300); and migration slice 07's marketing_email and
-- marketing_email_updated_at (20261020200400). It adds at the end:
--   review_requested_at     "Asked on": the earlier sent_at of the email and
--                           the WhatsApp ledger rows for
--                           aftercare.review_request (CRM slice 07). A claimed
--                           request that never went out is not asked.
--   review_link_clicked_at  customer_review_requests.first_clicked_at: a hint,
--                           never proof (mail scanners prefetch links)
--   google_review_rating    the linked Google review's stars (Staff-confirmed,
--   google_reviewed_at      customer_google_reviews, 20261020134000) and its
--                           own date; the latest one if there are several
--   shop_reviews_count      their Shop reviews (product_reviews.customer_id),
--   shop_review_avg_rating  whatever their moderation status: they wrote them.
--                           The average to one decimal; null with none.
--   review_rating           what the Review column and the Rating filter read:
--                           the Google rating when one is linked, else the
--                           shop average rounded to whole stars
-- Facts, not statuses: each is read from the tables that hold it, never
-- stored.
--
-- Review data drives CRM lists, never who receives a Review request (README,
-- sixth hazard): the request job reads none of these columns, and its guard
-- test (lib/aftercare/__tests__/review-request.test.ts) fails if it starts to.
--
-- This file holds the redefinition only, so a slice extending the view in
-- parallel adds its columns here, in a later file, rather than racing it.
-- lib/crm/customer-overview.ts lists the same columns, and
-- lib/crm/__tests__/customer-overview-view.test.ts keeps the two equal.
-- Idempotent.

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
  -- Migration slice 06 (20261020200100): the Claim link and the voucher.
  (select min(cl.first_clicked_at)
     from public.customer_claim_links cl
    where cl.customer_id = c.id)                               as claim_link_first_clicked_at,
  coalesce(public.welcome_voucher_state(v.usage_count, v.is_active, v.expires_at), 'none')
                                                              as welcome_voucher_state,
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
  -- CRM slice 12: reviews.
  rq.asked_at                        as review_requested_at,
  rr.first_clicked_at                as review_link_clicked_at,
  gr.star_rating                     as google_review_rating,
  gr.reviewed_at                     as google_reviewed_at,
  coalesce(sr.shop_reviews_count, 0) as shop_reviews_count,
  sr.shop_review_avg_rating,
  coalesce(gr.star_rating::int, round(sr.shop_review_avg_rating)::int) as review_rating
from public.customers c
left join public.migrated_customers m on m.customer_id = c.id
-- At most one: coupons_one_per_customer_purpose (20261020112100).
left join public.coupons v on v.customer_id = c.id and v.issued_for = 'welcome_back'
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
) sr on sr.customer_id = c.id;

revoke all on public.admin_customer_overview from anon, authenticated;
