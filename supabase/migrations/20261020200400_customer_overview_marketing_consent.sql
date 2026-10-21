-- The Customer overview gains Marketing consent (PRD-shopify-customer-migration,
-- slice 07; ADR 0028 k).
--
-- admin_customer_overview adds `marketing_email` and
-- `marketing_email_updated_at`, at the end: the Customers list filters on the
-- first (*Email consent*), and slice 08's audience reads both. Every column the
-- previous definition has is kept, in its order, with its joins: CRM slice 11's
-- contact status (20261020200000), migration slice 06's Claim link and
-- Welcome-back voucher (20261020200100), and CRM slice 06's open Follow-ups
-- (20261020200200). Postgres refuses a drop or a reorder.
-- CUSTOMER_OVERVIEW_COLUMNS (lib/crm/customer-overview.ts) lists the same
-- columns, and lib/crm/__tests__/customer-overview-view.test.ts holds the two
-- equal. A later redefinition must carry these columns too.
--
-- Its own file, timestamped after every other migration, because several
-- slices redefine this view and the last `create or replace` wins.
-- admin_customer_migration_summary is unchanged (slice 06's definition stands).
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
  -- Migration 06 (20261020200100): the Claim link and the Welcome-back voucher.
  (select min(l.first_clicked_at)
     from public.customer_claim_links l
    where l.customer_id = c.id)                               as claim_link_first_clicked_at,
  coalesce(public.welcome_voucher_state(v.usage_count, v.is_active, v.expires_at), 'none')
                                                              as welcome_voucher_state,
  -- CRM 06 (20261020200200): Follow-ups not done yet.
  coalesce(f.open_followups, 0)::int as open_followups,
  -- Migration 07: Marketing consent.
  c.marketing_email,
  c.marketing_email_updated_at
from public.customers c
left join public.migrated_customers m on m.customer_id = c.id
-- At most one: coupons_one_per_customer_purpose (20261020112100).
left join public.coupons v on v.customer_id = c.id and v.issued_for = 'welcome_back'
left join (
  select customer_id, count(*) as open_followups
  from public.customer_followups
  where done_at is null
  group by customer_id
) f on f.customer_id = c.id;

revoke all on public.admin_customer_overview from anon, authenticated;
