-- The Customer overview and the Migration card learn what the Claim link and
-- the Welcome-back voucher make knowable (PRD-shopify-customer-migration
-- slice 06; ADR 0029 (k)).
--
-- Both views are redefined in full, with every column the previous definition
-- had, in the same order, and the new ones at the end (Postgres refuses a
-- reorder or a drop). The overview's previous definition is CRM 11's
-- (20261020200000_customer_overview_contact_status.sql), whose Contact status
-- columns come before this slice's. The same columns are in CUSTOMER_OVERVIEW_COLUMNS
-- (lib/crm/customer-overview.ts) and MIGRATION_SUMMARY_COLUMNS
-- (lib/customer-migration/overview.ts); lib/crm/__tests__/
-- customer-overview-view.test.ts keeps them equal. A later redefinition must
-- carry these columns too.
--
-- admin_customer_overview adds:
--   claim_link_first_clicked_at  the first click of any of the Customer's
--                                Claim links (20261020121000)
--   welcome_voucher_state        none | issued | used | expired, by
--                                welcome_voucher_state() (20261020121100).
--                                The Customers list's Voucher filter reads it;
--                                "issued" is the list to nudge before expiry.
--
-- admin_customer_migration_summary adds, for the Migration card:
--   clicked          Migrated customers who opened a Claim link
--   vouchers_issued  Migrated customers holding a Welcome-back voucher
--   vouchers_used    of those, redeemed
--   voucher_orders   paid Orders whose coupon is a Welcome-back voucher
--   voucher_revenue  their total. Paid means paid_at is set, as the Stripe
--                    webhook sets it; a later refund is not subtracted. There
--                    is no new revenue path: these are ordinary Orders.
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
  (select min(l.first_clicked_at)
     from public.customer_claim_links l
    where l.customer_id = c.id)                               as claim_link_first_clicked_at,
  coalesce(public.welcome_voucher_state(v.usage_count, v.is_active, v.expires_at), 'none')
                                                              as welcome_voucher_state
from public.customers c
left join public.migrated_customers m on m.customer_id = c.id
-- At most one: coupons_one_per_customer_purpose (20261020112100).
left join public.coupons v on v.customer_id = c.id and v.issued_for = 'welcome_back';

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
      and ord.paid_at is not null)                            as voucher_revenue
from public.admin_customer_overview o
where o.from_shopify;

revoke all on public.admin_customer_migration_summary from anon, authenticated;
