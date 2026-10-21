-- The Customer overview gains Contact status (PRD customer-crm slice 11;
-- ADR 0028 (j)): the sign-in methods, and whether a mobile is on file and
-- valid, for the list's Account column and its Google and Mobile filters.
--
-- Every column of the previous definition, in its order, then the new ones at
-- the end (Postgres refuses a reorder or a drop). The same columns are in
-- CUSTOMER_OVERVIEW_COLUMNS (lib/crm/customer-overview.ts), and
-- lib/crm/__tests__/customer-overview-view.test.ts keeps the two equal.
--
-- - account_providers: customers.account_providers (20261020123000).
-- - has_phone:   a number is on file (not `!phone?.trim()`).
-- - phone_valid: it passes isValidPhone (public.is_valid_phone).
--   *Mobile: on file* is phone_valid, *missing* is not has_phone, and
--   *invalid* is has_phone and not phone_valid.
--
-- WhatsApp is not here: matching whatsapp_inbound to a Customer takes
-- phonesMatch, which belongs on the Customer page, not in a list query.
--
-- Server-only, like before: security_invoker, and no grant to anon or
-- authenticated.

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
  public.is_valid_phone(c.phone)     as phone_valid
from public.customers c
left join public.migrated_customers m on m.customer_id = c.id;

revoke all on public.admin_customer_overview from anon, authenticated;
