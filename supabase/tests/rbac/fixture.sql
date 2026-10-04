-- Minimal stand-in for the live schema the Users & permissions migrations
-- touch (read from project mpillow on 2026-10-04), seeded with the live rows'
-- shape. Used by scripts/check-rbac-migrations.sh against a throwaway local
-- Postgres; never run against a real project.

create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

create schema if not exists auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  last_sign_in_at timestamptz
);
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create table admin_users (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique references auth.users(id) on delete set null,
  email         text not null,
  role          text not null default 'staff'
                  check (role in ('owner', 'admin', 'manager', 'staff', 'viewer')),
  is_active     boolean not null default true,
  assist_code   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index idx_admin_users_email on admin_users(lower(email));
create trigger trg_admin_users_updated_at before update on admin_users
for each row execute procedure set_updated_at();

create table mp_staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index idx_mp_staff_name_unique on mp_staff (lower(name));
create index idx_mp_staff_updated_at on mp_staff (updated_at desc);
alter table mp_staff enable row level security;
create policy "Public read staff" on mp_staff for select using (true);
create policy "Public write staff" on mp_staff for insert with check (true);
create policy "Public update staff" on mp_staff for update using (true) with check (true);
create policy "Public delete staff" on mp_staff for delete using (true);

create table mp_config_responses (
  id uuid primary key default gen_random_uuid(),
  measured_by_type text not null default 'by_user',
  measured_by_staff_id uuid null references mp_staff(id) on delete set null,
  constraint mp_config_responses_measured_by_check check (
    (measured_by_type = 'by_user' and measured_by_staff_id is null) or
    (measured_by_type = 'staff' and measured_by_staff_id is not null)
  )
);

create table telegram_operators (
  id                   uuid primary key default gen_random_uuid(),
  display_name         text not null check (char_length(display_name) between 1 and 80),
  role                 text not null check (role in ('review_manager', 'shop_moderator')),
  is_active            boolean not null default true,
  telegram_user_id     bigint unique,
  telegram_username    text,
  linked_at            timestamptz,
  link_code_hash       text unique,
  link_code_expires_at timestamptz,
  created_by           text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table admin_audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid,
  actor_email  text,
  action       text not null,
  entity_type  text not null,
  entity_id    text,
  before       jsonb,
  after        jsonb,
  created_at   timestamptz not null default now()
);

-- Live rows (2026-10-04): three bound owners, six staff names, one operator.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'sg@mpillow.com'),
  ('00000000-0000-4000-8000-000000000002', 'ivanyeoart@gmail.com'),
  ('00000000-0000-4000-8000-000000000003', 'admin@mpillow.com');
insert into admin_users (auth_user_id, email, role, created_at) values
  ('00000000-0000-4000-8000-000000000001', 'sg@mpillow.com', 'owner', '2026-06-21'),
  ('00000000-0000-4000-8000-000000000002', 'ivanyeoart@gmail.com', 'owner', '2026-07-05'),
  ('00000000-0000-4000-8000-000000000003', 'admin@mpillow.com', 'owner', '2026-07-26');
-- One extra non-owner row that live data does not have, to prove the backfill rule.
insert into admin_users (email, role) values ('fixture-viewer@example.com', 'viewer');
insert into mp_staff (name) values ('Darren'), ('Jess'), ('Ivan'), ('Kai Lin'), ('Wang Ying'), ('Winnie');
insert into mp_config_responses (measured_by_type, measured_by_staff_id)
  select 'staff', id from mp_staff where name = 'Jess';
insert into telegram_operators (display_name, role, telegram_user_id, linked_at)
  values ('Ivan', 'review_manager', 111, now());
