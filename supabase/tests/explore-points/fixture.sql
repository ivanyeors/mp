-- A stand-in for the parts of the live schema the Explore points migration
-- (20261117100000_explore_welcome_points.sql) touches, as the migrations
-- before it left them. scripts/check-explore-points-sql.sh loads it into a
-- throwaway Postgres; it is never run against a real database.

create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role bypassrls; end if;
end $$;

create table site_settings (key text primary key, value text, updated_at timestamptz default now());
create table mp_staff (id uuid primary key default gen_random_uuid(), name text);
create table customers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  marketing_email text not null default 'not_subscribed',
  marketing_email_source text null,
  marketing_email_updated_at timestamptz null,
  constraint customers_marketing_email_source_check check (marketing_email_source in ('account'))
);
create table orders (id uuid primary key default gen_random_uuid(), order_number text);
create table customer_campaign_sends (id uuid primary key default gen_random_uuid(), customer_id uuid references customers(id) on delete cascade);
create table customer_consent_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  channel text not null,
  from_state text not null,
  to_state text not null,
  source text not null,
  created_at timestamptz not null default now(),
  campaign_send_id uuid null,
  constraint customer_consent_events_source_check check (source in ('account'))
);
create table migrated_customers (customer_id uuid primary key references customers(id) on delete cascade, claimed_at timestamptz);
-- Rule (r), stood in for by a list.
create table partner_stand_in (customer_id uuid primary key);
create function is_partner_customer(p_customer_id uuid) returns boolean language sql stable as $$
  select exists (select 1 from partner_stand_in p where p.customer_id = p_customer_id);
$$;

insert into site_settings (key, value) values ('points_enabled', 'true'), ('points_launch_at', '2026-01-01T00:00:00Z');
create function points_settings()
returns table (enabled boolean, launch_at timestamptz, earn_per_dollar numeric, min_redeem integer,
               max_share numeric, claim_bonus integer, claim_bonus_months integer)
language sql stable as $$
  select
    coalesce((select lower(btrim(value)) = 'true' from site_settings where key = 'points_enabled'), false),
    (select value::timestamptz from site_settings where key = 'points_launch_at'),
    1::numeric, 500, 0.5::numeric, 1000, 3;
$$;

-- points_ledger as 20261108100100_past_purchase_points.sql left it.
create table points_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  kind text not null,
  points integer not null check (points <> 0),
  order_id uuid null references orders(id) on delete set null,
  refund_id text null,
  note text null,
  milestone smallint null,
  created_by_profile_id uuid null references mp_staff(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint points_ledger_kind_check check (kind in
    ('earn', 'claim_bonus', 'milestone_bonus', 'past_purchases', 'spend', 'spend_release', 'clawback', 'adjust')),
  constraint points_ledger_sign check (
    (kind in ('earn', 'claim_bonus', 'milestone_bonus', 'past_purchases', 'spend_release') and points > 0)
    or (kind in ('spend', 'clawback') and points < 0)
    or kind = 'adjust')
);
alter table points_ledger enable row level security;
revoke all on points_ledger from anon, authenticated;
create view points_order_candidates as select null::uuid as customer_id, 0 as points where false;
