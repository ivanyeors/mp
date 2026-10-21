-- Account status on every Customer, and the Customer overview
-- (PRD-shopify-customer-migration, slice 12; ADR 0028 (k), (l)).
--
-- 1. Two facts on customers, both timestamps, never a status:
--    - account_linked_at: when the current login was bound to the row. Set by
--      a trigger on every path that writes auth_user_id, so no app code can
--      forget it: null to a login (or one login to another) stamps now(); a
--      login removed (auth.users delete, `on delete set null`) clears it. A
--      later sign-in, which rewrites the same auth_user_id or none at all,
--      leaves it alone. A check keeps it set exactly when auth_user_id is.
--    - account_last_seen_at: the last time the Customer opened an account
--      page while signed in, to the hour. Written by linkCustomerToAuthUser
--      (lib/auth/customer-identity.ts), at most once an hour. Not the last
--      site visit, and not auth.users.last_sign_in_at, which records sign-ins:
--      a month-long session would show a month-old date however often they
--      come back.
--    Neither is granted to the customer's own key: only Staff read them,
--    through the service role (20261020101000 revoked the table-level grant;
--    lib/ecommerce/__tests__/cost-column-grants.test.ts lists them hidden).
--
-- 2. Backfill. A row linked before this migration gets its login's
--    auth.users.created_at, the closest fact there is (the Admin Panel says so
--    in a tooltip). The migration runs as the owner role, which can read
--    auth.users; nothing at runtime joins it. The updated_at trigger is held
--    off for the backfill, so updated_at keeps meaning "details changed".
--
-- 3. admin_customer_overview: the one read model the Admin Panel lists
--    Customers from. Statuses are derived here from the facts (has_account,
--    from_shopify), never stored as text, so they cannot drift. Columns are
--    listed, never `c.*`: a view freezes `*` when it is created, and a listed
--    column cannot ride along by accident. security_invoker, so the RLS on
--    migrated_customers (service role only) still applies, and no grant to
--    anon or authenticated: the service role reads it.
--
--    Later slices EXTEND it with `create or replace view`, adding columns at
--    the END only (Postgres refuses a reorder or a drop), and add the same
--    column to CUSTOMER_OVERVIEW_COLUMNS in lib/crm/customer-overview.ts.
--    lib/crm/__tests__/customer-overview-view.test.ts keeps the two equal.
--
-- 4. admin_customer_migration_summary: one row, the Customers page's
--    Migration card, counted from the overview so the card and the list's
--    "from Shopify" filter cannot disagree. Slices 06 and 08 add their funnel
--    columns at the end, the same way. Server-only, like the overview.
--
-- Idempotent.

-- ---------------------------------------------------------------------
-- 1. The two facts
-- ---------------------------------------------------------------------
alter table public.customers
  add column if not exists account_linked_at    timestamptz null,
  add column if not exists account_last_seen_at timestamptz null;

-- ---------------------------------------------------------------------
-- 2. Backfill already-linked rows
-- ---------------------------------------------------------------------
alter table public.customers disable trigger trg_customers_updated_at;

-- auth.users.created_at is set by GoTrue on every row; the coalesce only keeps
-- the check below from failing on a hand-made user without one.
update public.customers c
   set account_linked_at = coalesce(u.created_at, c.created_at)
  from auth.users u
 where u.id = c.auth_user_id
   and c.account_linked_at is null;

-- A row without a login never carries a date.
update public.customers
   set account_linked_at = null
 where auth_user_id is null
   and account_linked_at is not null;

alter table public.customers enable trigger trg_customers_updated_at;

-- ---------------------------------------------------------------------
-- 1b. The trigger, and the check that holds it to the login
-- ---------------------------------------------------------------------
create or replace function public.customers_stamp_account_linked_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.auth_user_id is null then
    new.account_linked_at := null;
  elsif tg_op = 'INSERT' or old.auth_user_id is distinct from new.auth_user_id then
    new.account_linked_at := now();
  else
    -- The same login written again: the date stays the one it was linked on.
    new.account_linked_at := old.account_linked_at;
  end if;
  return new;
end;
$$;

revoke execute on function public.customers_stamp_account_linked_at() from public, anon, authenticated;

drop trigger if exists trg_customers_account_linked_at on public.customers;
create trigger trg_customers_account_linked_at
before insert or update of auth_user_id on public.customers
for each row execute function public.customers_stamp_account_linked_at();

alter table public.customers drop constraint if exists customers_account_linked_at_with_login;
alter table public.customers add constraint customers_account_linked_at_with_login
  check ((auth_user_id is null) = (account_linked_at is null));

-- ---------------------------------------------------------------------
-- 3. The Customer overview
-- ---------------------------------------------------------------------
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
  m.shopify_amount_spent
from public.customers c
left join public.migrated_customers m on m.customer_id = c.id;

revoke all on public.admin_customer_overview from anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. The Migration card
-- ---------------------------------------------------------------------
-- imported:                 Migrated customers, whatever batch made them
-- imported_created/matched: created by the import / merged into a Customer
-- signed_up:                of those, the ones with an account now
-- signed_up_before_import:  of those, linked no later than imported, so they
--                           had an account before the import reached them
-- batches_applied:          Import batches ever applied; the card shows from 1
create or replace view public.admin_customer_migration_summary with (security_invoker = true) as
select
  count(*)                                                    as imported,
  count(*) filter (where o.created_by_import)                 as imported_created,
  count(*) filter (where not o.created_by_import)             as imported_matched,
  count(*) filter (where o.has_account)                       as signed_up,
  count(*) filter (where o.has_account
                     and o.account_linked_at <= o.imported_at) as signed_up_before_import,
  (select count(*)
     from public.customer_import_batches b
    where b.applied_at is not null)                           as batches_applied
from public.admin_customer_overview o
where o.from_shopify;

revoke all on public.admin_customer_migration_summary from anon, authenticated;
