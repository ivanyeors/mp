-- The Customer overview and the Migration card learn what the campaign sent
-- (PRD-shopify-customer-migration slice 08; ADR 0028 k).
--
-- admin_customer_overview adds `last_campaign_sent_at`, at the end: the
-- latest campaign email the provider accepted for this Customer (sent, or
-- since bounced or complained), from customer_campaign_sends
-- (20261020130000). Every column the previous definition has is kept, in its
-- order, with its joins: CRM slice 11's contact status (20261020200000),
-- migration slice 06's Claim link and Welcome-back voucher (20261020200100),
-- CRM slice 06's open Follow-ups (20261020200200), CRM slice 04's purchase,
-- re-adjustment and search columns (20261020200300) and migration slice 07's
-- Marketing consent (20261020200400). Postgres refuses a drop or a reorder.
--
-- admin_customer_migration_summary adds, for the Migration card's *Emailed*:
--   emailed            Migrated customers the campaign has emailed
--   emails_bounced     of all Migrated customers, those with a bounced send
--   emails_complained  ...and those with a complaint
-- Every column of slice 06's definition (20261020200100) is kept.
--
-- CUSTOMER_OVERVIEW_COLUMNS (lib/crm/customer-overview.ts) and
-- MIGRATION_SUMMARY_COLUMNS (lib/customer-migration/overview.ts) list the same
-- columns, and lib/crm/__tests__/customer-overview-view.test.ts holds them
-- equal. A later redefinition must carry these columns too.
--
-- Its own file, timestamped after every other migration, because several
-- slices redefine these views and the last `create or replace` wins.
--
-- Still security_invoker, still server-only.
--
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
  -- Migration 08: the latest campaign email the provider accepted.
  (select max(cs.sent_at)
     from public.customer_campaign_sends cs
    where cs.customer_id = c.id
      and cs.status in ('sent', 'bounced', 'complained'))      as last_campaign_sent_at
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
) rb on rb.customer_id = c.id;

revoke all on public.admin_customer_overview from anon, authenticated;

create or replace view public.admin_customer_migration_summary with (security_invoker = true) as
select
  count(*)                                                    as imported,
  count(*) filter (where o.created_by_import)                 as imported_created,
  count(*) filter (where not o.created_by_import)             as imported_matched,
  count(*) filter (where o.has_account)                       as signed_up,
  count(*) filter (where o.has_account
                     and o.account_linked_at <= o.imported_at) as signed_up_before_import,
  (select count(*)
     from public.customer_import_batches b
    where b.applied_at is not null)                           as batches_applied,
  count(*) filter (where o.claim_link_first_clicked_at is not null) as clicked,
  count(*) filter (where o.welcome_voucher_state <> 'none')   as vouchers_issued,
  count(*) filter (where o.welcome_voucher_state = 'used')    as vouchers_used,
  (select count(*)
     from public.orders ord
     join public.coupons wb on wb.id = ord.coupon_id
    where wb.issued_for = 'welcome_back'
      and ord.paid_at is not null)                            as voucher_orders,
  (select coalesce(sum(ord.total), 0)
     from public.orders ord
     join public.coupons wb on wb.id = ord.coupon_id
    where wb.issued_for = 'welcome_back'
      and ord.paid_at is not null)                            as voucher_revenue,
  -- Migration 08: the campaign.
  count(*) filter (where o.last_campaign_sent_at is not null) as emailed,
  (select count(distinct cs.customer_id)
     from public.customer_campaign_sends cs
     join public.migrated_customers mc on mc.customer_id = cs.customer_id
    where cs.bounced_at is not null)                          as emails_bounced,
  (select count(distinct cs.customer_id)
     from public.customer_campaign_sends cs
     join public.migrated_customers mc on mc.customer_id = cs.customer_id
    where cs.complained_at is not null)                       as emails_complained
from public.admin_customer_overview o
where o.from_shopify;

revoke all on public.admin_customer_migration_summary from anon, authenticated;
