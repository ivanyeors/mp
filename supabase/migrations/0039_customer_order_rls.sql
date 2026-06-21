-- Customer order visibility under RLS.
-- Part of #32 (customer account: order history + tracking).
--
-- The original ecommerce policies were defined as `for all using (true)` with no
-- role, which applies to PUBLIC and would let any signed-in shopper read every
-- order and order item. Now that customers authenticate and read their own data
-- through the anon/SSR client under RLS, we:
--   1. Scope the blanket "service role full access" policies to `service_role`
--      (the service role bypasses RLS anyway, so server-side access is unchanged).
--   2. Add narrow SELECT policies so an authenticated customer can read only
--      their own orders and the items belonging to those orders.

-- Resolve the customer id owned by the current auth user, if any.
-- SECURITY DEFINER so it can read `customers` without depending on (or
-- recursing through) that table's own RLS policies.
create or replace function current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from customers where auth_user_id = auth.uid() limit 1;
$$;

revoke all on function current_customer_id() from public;
grant execute on function current_customer_id() to authenticated, service_role;

-- ORDERS ---------------------------------------------------------------------
drop policy if exists "Service role full access orders" on orders;
create policy "Service role full access orders" on orders
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Customers read own orders" on orders;
create policy "Customers read own orders" on orders
  for select
  to authenticated
  using (customer_id is not null and customer_id = current_customer_id());

-- ORDER ITEMS ----------------------------------------------------------------
drop policy if exists "Service role full access order_items" on order_items;
create policy "Service role full access order_items" on order_items
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Customers read own order_items" on order_items;
create policy "Customers read own order_items" on order_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from orders o
      where o.id = order_items.order_id
        and o.customer_id = current_customer_id()
    )
  );
