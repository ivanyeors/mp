-- Customer-managed saved shipping addresses under RLS.
-- Part of #34 (customer account: saved shipping addresses).
--
-- `customer_addresses` previously had only a blanket `for all using (true)`
-- policy with no role, which applies to PUBLIC and would let any signed-in
-- shopper read/write every customer's addresses. Now that customers manage
-- their own addresses from the account area through the anon/SSR client under
-- RLS, we:
--   1. Scope the blanket policy to `service_role` (server-side admin access is
--      unchanged; the service role bypasses RLS anyway).
--   2. Add own-row SELECT/INSERT/UPDATE/DELETE policies keyed on
--      `current_customer_id()` (defined in migration 0039).
--   3. Enforce at most one default address per customer at the database level.

-- One default per customer ------------------------------------------------
-- Collapse any pre-existing duplicate defaults to the most recently updated
-- one before adding the partial unique index, so the index can be created.
update customer_addresses a
set is_default = false
where a.is_default = true
  and exists (
    select 1
    from customer_addresses b
    where b.customer_id = a.customer_id
      and b.is_default = true
      and (b.updated_at > a.updated_at
           or (b.updated_at = a.updated_at and b.id > a.id))
  );

create unique index if not exists idx_customer_addresses_one_default
  on customer_addresses(customer_id)
  where is_default;

-- RLS ---------------------------------------------------------------------
drop policy if exists "Service role full access customer_addresses" on customer_addresses;
create policy "Service role full access customer_addresses" on customer_addresses
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Customers read own addresses" on customer_addresses;
create policy "Customers read own addresses" on customer_addresses
  for select
  to authenticated
  using (customer_id = current_customer_id());

drop policy if exists "Customers insert own addresses" on customer_addresses;
create policy "Customers insert own addresses" on customer_addresses
  for insert
  to authenticated
  with check (customer_id = current_customer_id());

drop policy if exists "Customers update own addresses" on customer_addresses;
create policy "Customers update own addresses" on customer_addresses
  for update
  to authenticated
  using (customer_id = current_customer_id())
  with check (customer_id = current_customer_id());

drop policy if exists "Customers delete own addresses" on customer_addresses;
create policy "Customers delete own addresses" on customer_addresses
  for delete
  to authenticated
  using (customer_id = current_customer_id());
