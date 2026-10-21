-- The Customer overview gains Marketing consent (PRD-shopify-customer-migration,
-- slice 07; ADR 0028 k).
--
-- admin_customer_overview adds `marketing_email` and
-- `marketing_email_updated_at`, at the end: the Customers list filters on the
-- first (*Email consent*), and slice 08's audience reads both. Every column the
-- previous definition has is kept, in its order, including CRM slice 11's
-- contact status (20261020200000); Postgres refuses a drop or a reorder. CUSTOMER_OVERVIEW_COLUMNS (lib/crm/customer-overview.ts) lists the
-- same columns, and lib/crm/__tests__/customer-overview-view.test.ts holds the
-- two equal.
--
-- Its own file, timestamped after every other migration, because several
-- slices redefine this view and the last `create or replace` wins.
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
  c.account_providers,
  not public.is_blank_phone(c.phone) as has_phone,
  public.is_valid_phone(c.phone)     as phone_valid,
  c.marketing_email,
  c.marketing_email_updated_at
from public.customers c
left join public.migrated_customers m on m.customer_id = c.id;

revoke all on public.admin_customer_overview from anon, authenticated;
