-- Contact and sign-in status (PRD customer-crm slice 11; ADR 0027 (j)).
--
-- Every part of a Customer's Contact status is derived from a fact, never a
-- flag Staff set. This migration adds the one fact the platform did not keep,
-- and the phone test the Customers list filters on:
--
-- 1. customers.account_providers: the sign-in methods on the Customer's login
--    ({email}, {google}, {email,google}), sorted and once each. Written by
--    linkCustomerToAuthUser (lib/auth/customer-identity.ts) from the signed-in
--    user's own `identities`, only when it changed, so no runtime code reads
--    auth.users or calls supabase.auth.admin. A trigger empties it whenever
--    the login goes or changes (a new login's methods are not the old one's),
--    and a check keeps it empty without a login.
--    Not granted to the customer's own key: only Staff read it, through the
--    service role (lib/ecommerce/__tests__/cost-column-grants.test.ts lists it
--    hidden).
--
-- 2. Backfill. A row linked before this migration gets its login's methods
--    from auth.identities, the same source GoTrue hands the session. The
--    migration runs as the owner role, which can read auth.identities; nothing
--    at runtime does. The updated_at trigger is held off, as in 20261020111000.
--
-- 3. is_valid_phone(text) and is_blank_phone(text): isValidPhone and
--    `!phone?.trim()` (lib/appointments/phone.ts) in SQL, so the list's
--    *Mobile: invalid* filter and the Customer page's Mobile row cannot
--    disagree. lib/crm/__tests__/phone-agreement.test.ts writes the fixture,
--    supabase/tests/customer-crm/assert-11-contact-status.sql runs it here.
--    JavaScript's trim() whitespace is spelled out, because Postgres' \s
--    depends on the locale.
--
-- The overview columns that use these are in their own migration
-- (20261020200000_customer_overview_contact_status.sql), with every other
-- slice's redefinition of the view.
--
-- Idempotent.

-- ---------------------------------------------------------------------
-- 1. The fact
-- ---------------------------------------------------------------------
alter table public.customers add column if not exists account_providers text[] not null default '{}';

-- ---------------------------------------------------------------------
-- 2. Backfill already-linked rows
-- ---------------------------------------------------------------------
alter table public.customers disable trigger trg_customers_updated_at;

update public.customers c
   set account_providers = p.providers
  from (
    select i.user_id, array_agg(distinct i.provider order by i.provider) as providers
      from auth.identities i
     where i.provider is not null and i.provider <> ''
     group by i.user_id
  ) p
 where p.user_id = c.auth_user_id
   and c.account_providers = '{}';

update public.customers
   set account_providers = '{}'
 where auth_user_id is null
   and account_providers <> '{}';

alter table public.customers enable trigger trg_customers_updated_at;

-- ---------------------------------------------------------------------
-- 1b. The trigger, and the check that holds it to the login
-- ---------------------------------------------------------------------
create or replace function public.customers_reset_account_providers()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.auth_user_id is null then
    new.account_providers := '{}';
  elsif tg_op = 'UPDATE'
        and old.auth_user_id is distinct from new.auth_user_id
        and new.account_providers is not distinct from old.account_providers then
    -- A different login: its methods are recorded on its next account page.
    new.account_providers := '{}';
  end if;
  return new;
end;
$$;

revoke execute on function public.customers_reset_account_providers() from public, anon, authenticated;

drop trigger if exists trg_customers_account_providers on public.customers;
create trigger trg_customers_account_providers
before insert or update of auth_user_id on public.customers
for each row execute function public.customers_reset_account_providers();

alter table public.customers drop constraint if exists customers_account_providers_with_login;
alter table public.customers add constraint customers_account_providers_with_login
  check (auth_user_id is not null or account_providers = '{}');

-- ---------------------------------------------------------------------
-- 3. The phone test, as lib/appointments/phone.ts has it
-- ---------------------------------------------------------------------
-- normalizePhone(raw) != null. Keep the branches in its order: a +65 number
-- of the right length with a bad national part is invalid, and does not fall
-- through to the overseas branch.
create or replace function public.is_valid_phone(raw text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  with d as (
    select (case when raw ~ '^[\u0009-\u000D    -     　﻿]*\+'
                 then '+' else '' end)
           || regexp_replace(coalesce(raw, ''), '[^0-9]', '', 'g') as s
  )
  select case
    when raw is null or d.s in ('', '+')                    then false
    when d.s like '+65%' and length(d.s) = 11               then substr(d.s, 4) ~ '^[689][0-9]{7}$'
    when d.s like '65%'  and length(d.s) = 10               then substr(d.s, 3) ~ '^[689][0-9]{7}$'
    when d.s like '065%' and length(d.s) = 11               then substr(d.s, 4) ~ '^[689][0-9]{7}$'
    when d.s ~ '^[0-9]{8}$'                                 then d.s ~ '^[689][0-9]{7}$'
    else d.s ~ '^\+[0-9]{8,15}$'
  end
  from d
$$;

-- `!phone?.trim()`: no number on file at all.
create or replace function public.is_blank_phone(raw text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select raw is null
      or raw ~ '^[\u0009-\u000D    -     　﻿]*$'
$$;

-- The overview runs as its invoker, the service role.
revoke execute on function public.is_valid_phone(text) from public, anon, authenticated;
revoke execute on function public.is_blank_phone(text) from public, anon, authenticated;
grant execute on function public.is_valid_phone(text) to service_role;
grant execute on function public.is_blank_phone(text) to service_role;

comment on column public.customers.account_providers is
  'Sign-in methods on the current login ({email,google}), from its identities (CRM slice 11). Staff-only.';
