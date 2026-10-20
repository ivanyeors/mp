-- Staff notes customers cannot read (ADR 0027 (a), PRD-customer-crm slice 02).
--
-- DEPLOY ORDER: apply only AFTER the code that ships with it is live. Older
-- code reads `orders` with `select *` as the signed-in customer
-- (lib/shop/customer-orders.ts), and /account/orders would 500. Never roll that
-- code back without restoring the table grants.
--
-- The exposure this closes: "Customers can read own record" (0037) and
-- "Customers read own orders" (0039) cover the whole row, so a signed-in
-- customer could read customers.notes, customers.tags and orders.internal_notes
-- with their own key, straight from PostgREST:
--   GET /rest/v1/customers?select=notes,tags
--   GET /rest/v1/orders?select=internal_notes
--
-- 1. customer_notes: a dated, authored remark by Staff about a Customer.
--    Server-only: RLS on, a service-role policy, nothing for anon or
--    authenticated. Notes are never edited; a correction is a new note, and a
--    deletion is soft.
-- 2. Every non-empty customers.notes becomes one note, with no author and the
--    row's updated_at as its date (the Admin Panel shows it as "Notes before
--    {date}"). customers.notes is then left unwritten; dropping it is a later
--    migration, once a release has run without it. A note longer than the
--    5,000-character limit is cut there, and the full text stays in
--    customers.notes until that drop, which must check for one first.
-- 3. Column grants, following 20260915170000_hide_variant_cost_price.sql: a
--    column-level REVOKE does nothing while a table-level SELECT grant exists,
--    so the table grant is revoked and SELECT re-granted column by column. The
--    service role keeps its table grant and bypasses RLS: server code is
--    unchanged.
--
-- App readers under the authenticated role (checked 2026-10-20):
-- lib/shop/customer-addresses.ts selects customers.id; lib/shop/customer-orders.ts
-- lists its orders columns (CUSTOMER_ORDER_COLUMNS). The RLS policies on
-- customers, orders, order_items and customer_addresses read only id,
-- customer_id and auth_user_id. A `select=*` on customers or orders as
-- anon/authenticated now fails with "permission denied".
--
-- NEW COLUMNS on customers and orders are NOT readable by the customer until
-- granted explicitly, e.g.
--   grant select (new_col) on public.customers to authenticated;
-- lib/ecommerce/__tests__/cost-column-grants.test.ts fails until a new column
-- is either granted or added to its hidden list.
--
-- Idempotent.

-- ---------------------------------------------------------------------
-- 1. customer_notes
-- ---------------------------------------------------------------------
create table if not exists customer_notes (
  id                    uuid primary key default gen_random_uuid(),
  customer_id           uuid not null references customers(id) on delete cascade,
  body                  text not null check (length(btrim(body)) between 1 and 5000),
  -- The Staff profile the author was working as; null on a note moved from
  -- customers.notes, or once the profile is gone.
  author_profile_id     uuid null references mp_staff(id) on delete set null,
  -- The author's login. Deleting is allowed to the author's login, never to a
  -- profile: "working as" is attribution only.
  author_user_id        uuid null references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  deleted_at            timestamptz null,
  deleted_by_profile_id uuid null references mp_staff(id) on delete set null
);

create index if not exists idx_customer_notes_customer_created
  on customer_notes (customer_id, created_at desc)
  where deleted_at is null;

alter table customer_notes enable row level security;
drop policy if exists "Service role full access customer_notes" on customer_notes;
create policy "Service role full access customer_notes" on customer_notes
  for all
  to service_role
  using (true)
  with check (true);
revoke all on public.customer_notes from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Backfill: customers.notes becomes the Customer's first note
-- ---------------------------------------------------------------------
insert into customer_notes (customer_id, body, created_at)
select c.id, left(btrim(c.notes), 5000), c.updated_at
from customers c
where c.notes is not null
  and btrim(c.notes) <> ''
  and not exists (select 1 from customer_notes n where n.customer_id = c.id);

-- ---------------------------------------------------------------------
-- 3. Column grants: hide notes and tags, and orders.internal_notes
-- ---------------------------------------------------------------------
revoke select on public.customers from anon, authenticated;
grant select (
  id, email, first_name, last_name, phone, locale, auth_user_id,
  total_orders, total_spent, created_at, updated_at
) on public.customers to authenticated;

revoke select on public.orders from anon, authenticated;
grant select (
  id, order_number, customer_id, email, phone, status, currency,
  subtotal, shipping_amount, tax_amount, discount_amount, total,
  shipping_address, billing_address, shipping_method_id, coupon_id, coupon_code,
  notes, payment_method, payment_reference, paid_at,
  tracking_number, tracking_url, shipped_at, delivered_at, cancelled_at,
  shopify_order_id, stripe_session_id, locale, created_at, updated_at,
  refund_request_status, refund_requested_at, refund_request_note, refund_return_acknowledged_at,
  amount_captured, amount_refunded, needs_attention,
  partner_id, ref_code, self_purchase_partner_id, self_purchase_units, attribution_source,
  shipping_courier, shipping_tracking_status, shipping_min_days, shipping_max_days
) on public.orders to authenticated;
