-- Customer accounts: link Supabase auth users to customer records.
-- Part of #30 (customer sign up / sign in + identity linking).

alter table customers
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

-- One auth user maps to at most one customer.
create unique index if not exists idx_customers_auth_user_id
  on customers(auth_user_id)
  where auth_user_id is not null;

-- Allow a signed-in shopper to read their own customer record under RLS.
-- (Service-role access from the server remains via the existing policy.)
drop policy if exists "Customers can read own record" on customers;
create policy "Customers can read own record" on customers
  for select
  to authenticated
  using (auth_user_id = auth.uid());
