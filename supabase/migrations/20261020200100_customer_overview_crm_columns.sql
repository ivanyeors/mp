-- The CRM's columns on the Customer overview (CRM PRD slice 04; ADR 0027,
-- ADR 0028 (k)).
--
-- `create or replace view admin_customer_overview` keeps every column the
-- last definition had, in order (migration 12's, then CRM 11's
-- account_providers, has_phone and phone_valid from 20261020200000), and adds
-- at the end:
--   paid_orders                  counted platform Orders: paid_at set, status not
--                                pending, cancelled, refunded or payment_failed
--                                (purchases.ts's NOT_A_PURCHASE)
--   first_paid_at, last_paid_at  the first and the latest of those
--   bought                       text[] of premium, basic, mbolster, accessory,
--                                in that order, from customer_purchase_lines
--                                (20261020122000). A pillow of no known Tier
--                                adds nothing.
--   last_readjusted_at           latest start_at of an attended Re-adjustment
--                                booking
--   search_text                  lower(email first last): the list's search is
--                                one escaped ilike on it (ADR 0027 (d)), served
--                                by idx_customers_search_text_trgm
--                                (20261020122100), whose expression it must
--                                stay
-- Facts, not statuses: each is a count, a date or a list read from the tables
-- that hold them, never stored.
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
  c.account_providers,
  not public.is_blank_phone(c.phone) as has_phone,
  public.is_valid_phone(c.phone)     as phone_valid,
  coalesce(po.paid_orders, 0)        as paid_orders,
  po.first_paid_at,
  po.last_paid_at,
  coalesce(pl.bought, '{}'::text[])  as bought,
  rb.last_readjusted_at,
  lower(c.email || ' ' || coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) as search_text
from public.customers c
left join public.migrated_customers m on m.customer_id = c.id
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
