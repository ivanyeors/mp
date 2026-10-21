-- The Customer overview gains open_followups (PRD-customer-crm slice 06).
--
-- Kept in a file of its own, sorted after every other definition of the view,
-- because Postgres keeps whichever `create or replace view` runs last: this
-- definition carries every column of the previous one
-- (20261020200100_customer_overview_claim_and_voucher.sql, migration slice 06,
-- which carries CRM 11's Contact status), in the same order, plus the new one
-- at the end. lib/crm/customer-overview.ts lists the same columns, and
-- lib/crm/__tests__/customer-overview-view.test.ts keeps the two equal. A later
-- redefinition must carry open_followups too.
--
-- open_followups: how many of the Customer's Follow-ups are not done
-- (customer_followups, 20261020132000_customer_followups.sql). The Customers
-- list's *has an open follow-up* filter reads it. Derived, never stored.
--
-- admin_customer_migration_summary reads this view but none of the new column,
-- so it is left as migration slice 06 defined it.
--
-- Server-only, like before: security_invoker, and no grant to anon or
-- authenticated.
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
  -- CRM 06: Follow-ups not done yet.
  coalesce(f.open_followups, 0)::int as open_followups
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
