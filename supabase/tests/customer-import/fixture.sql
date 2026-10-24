-- Minimal stand-in for the live schema the Shopify customer import migrations
-- touch (PRD-shopify-customer-migration, slices 02 and 03), with the columns
-- the import reads and every table that references a Customer. Used by
-- scripts/check-customer-import-sql.sh against a throwaway local Postgres;
-- never run against a real project.

create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role bypassrls; end if;
end $$;

create schema if not exists auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  last_sign_in_at timestamptz
);

grant usage on schema public, auth to anon, authenticated, service_role;
-- Supabase's default privileges: the client roles hold every new table and
-- function in public until a migration revokes them, as on the hosted project.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create table mp_staff (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

-- 0028_ecommerce.sql, with auth_user_id from 0037_customer_auth.sql.
create table customers (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  first_name   text,
  last_name    text,
  phone        text,
  locale       text not null default 'en-US' check (locale in ('en-US', 'zh-CN')),
  tags         text[] not null default '{}',
  notes        text,
  total_orders integer not null default 0,
  total_spent  numeric(12,2) not null default 0,
  auth_user_id uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index idx_customers_email on customers(lower(email));
create trigger trg_customers_updated_at before update on customers
for each row execute procedure set_updated_at();

create table customer_addresses (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id) on delete cascade,
  label        text,
  recipient    text not null,
  line1        text not null,
  line2        text,
  city         text not null,
  state        text,
  postal_code  text not null,
  country      text not null default 'MY',
  phone        text,
  is_default   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger trg_customer_addresses_updated_at before update on customer_addresses
for each row execute procedure set_updated_at();

-- Every table with a foreign key to customers, with its ON DELETE as live
-- (wishlists, which 0028 created, was dropped by 0029).
create table orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  email text not null,
  shipping_address jsonb not null,
  subtotal numeric(12,2) not null,
  total numeric(12,2) not null
);
create table carts (id uuid primary key default gen_random_uuid(), customer_id uuid references customers(id) on delete set null);
create table product_reviews (id uuid primary key default gen_random_uuid(), customer_id uuid references customers(id) on delete set null);
create table rma_requests (id uuid primary key default gen_random_uuid(), customer_id uuid not null references customers(id) on delete cascade);
create table readjustment_bookings (id uuid primary key default gen_random_uuid(), customer_id uuid not null references customers(id));
-- A Result names its Customer with no foreign key (0045_result_customer_access.sql).
create table mp_config_responses (id uuid primary key default gen_random_uuid(), customer_id uuid);
