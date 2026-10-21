-- The Customer overview gains open_followups (PRD-customer-crm slice 06).
--
-- Kept in a file of its own, sorted after every other definition of the view,
-- because Postgres keeps whichever `create or replace view` runs last: this
-- definition carries every column of the previous one
-- (20261020111000_customer_account_status_and_overview.sql), in the same
-- order, plus the new one at the end. lib/crm/customer-overview.ts lists the
-- same columns, and lib/crm/__tests__/customer-overview-view.test.ts keeps the
-- two equal.
--
-- open_followups: how many of the Customer's Follow-ups are not done
-- (customer_followups, 20261020132000_customer_followups.sql). The Customers
-- list's *has an open follow-up* filter reads it. Derived, never stored.
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
  coalesce(f.open_followups, 0)::int as open_followups
from public.customers c
left join public.migrated_customers m on m.customer_id = c.id
left join (
  select customer_id, count(*) as open_followups
  from public.customer_followups
  where done_at is null
  group by customer_id
) f on f.customer_id = c.id;

revoke all on public.admin_customer_overview from anon, authenticated;
