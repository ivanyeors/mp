-- Roles are data (ADR 0023, PRD users-permissions-rbac slice 03).
--
-- admin_roles holds which Admin Panel pages and Telegram actions each role can
-- use. The keys themselves are the code catalog in lib/auth/permissions.ts;
-- a stored key the catalog no longer has is ignored on read. Owner and Admin
-- are system roles with grants_all, so a page added later is theirs without an
-- edit here. Every other role is custom and gets a new page only when someone
-- ticks it on Users & permissions → Roles.
--
-- admin_users.role_id points at the Member's one role. The legacy role text
-- column stays during the expand phase (dropped by slice 11): a trigger keeps
-- the two in step, so app code from before this migration keeps working on
-- either column and a rollback strands nobody.
--
-- Server-only: every reader and writer uses the service role. RLS on with no
-- policies, client grants revoked. Idempotent: safe to run more than once.

create table if not exists admin_roles (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique check (key ~ '^[a-z0-9][a-z0-9-]{0,47}$'),
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  description  text check (description is null or char_length(description) <= 280),
  is_system    boolean not null default false,
  grants_all   boolean not null default false,
  permissions  text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Only the built-in roles grant everything; a custom role is always a list.
  constraint admin_roles_grants_all_is_system check (not grants_all or is_system)
);

create unique index if not exists uq_admin_roles_name on admin_roles (lower(name));

drop trigger if exists trg_admin_roles_updated_at on admin_roles;
create trigger trg_admin_roles_updated_at
before update on admin_roles
for each row execute procedure set_updated_at();

alter table admin_roles enable row level security;
revoke all on public.admin_roles from anon, authenticated;

comment on table admin_roles is
  'Admin Panel roles (ADR 0023). permissions are catalog keys from lib/auth/permissions.ts; unknown keys are ignored on read. grants_all (Owner, Admin) means every key, present and future.';

-- Seed: the two built-in roles, then the old code matrix kept as editable
-- custom roles (expanded to the per-page keys of slice 02). The old `staff`
-- role is renamed Fulfilment because Staff is a glossary term for any
-- signed-in Member. Seeds run only into an empty table, so a re-run never
-- overwrites, renames into, or brings back a role someone has since changed.
insert into admin_roles (key, name, description, is_system, grants_all, permissions)
select * from (values
  ('owner', 'Owner', 'Every page, and the only role that can grant or remove Owner.', true, true, '{}'),
  ('admin', 'Admin', 'Every page, including ones added later.', true, true, '{}'),
  ('manager', 'Manager', 'Day-to-day commerce and the landing site. No users, API configs, audit log or Telegram.', false, false, array[
    'products', 'categories', 'configure', 'rules-engine', 'customers', 'results',
    'appointments', 'orders', 'returns', 'discounts', 'shipping', 'inventory',
    'costings', 'shopify-link', 'analytics', 'page-builder', 'partners',
    'partner-applications', 'partner-commissions', 'blogs', 'faq', 'forms',
    'media', 'showroom'
  ]),
  ('fulfilment', 'Fulfilment', 'Orders, returns, Results, appointments, customers and stock.', false, false, array[
    'orders', 'returns', 'results', 'appointments', 'customers', 'inventory',
    'configure', 'shopify-link'
  ]),
  ('viewer', 'Viewer', 'Orders, returns and analytics.', false, false, array[
    'orders', 'returns', 'analytics'
  ])
) as seed (key, name, description, is_system, grants_all, permissions)
where not exists (select 1 from admin_roles);

alter table admin_users
  add column if not exists role_id uuid references admin_roles(id) on delete restrict;

create index if not exists idx_admin_users_role_id on admin_users (role_id);

-- Backfill (PRD decision 2): owners stay Owner, every other login becomes
-- Admin. Live data on 2026-10-04: three rows, all owner.
update admin_users a
set role_id = r.id, role = r.key
from admin_roles r
where a.role_id is null
  and r.key = case when a.role = 'owner' then 'owner' else 'admin' end;

-- The legacy column may now hold any role key; the check listed five names.
alter table admin_users drop constraint if exists admin_users_role_check;
alter table admin_users alter column role set default 'admin';

-- Keep role and role_id in step while both exist. A write that names only the
-- legacy role (code from before this migration) resolves the role by key, with
-- the old `staff` name mapping to Fulfilment; a write that names role_id
-- stamps the legacy column with a name the old code knows: the seeded role's
-- key (`staff` for Fulfilment), or `viewer` for a custom role, so a
-- rolled-back app gives a custom-role Member the least access rather than
-- none. lib/auth/roles.ts never gives a new role a seeded or legacy key.
create or replace function admin_users_sync_role()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  role_changed boolean := tg_op = 'INSERT' or new.role is distinct from old.role;
  role_id_changed boolean := tg_op = 'INSERT' or new.role_id is distinct from old.role_id;
begin
  if new.role_id is null or (role_changed and not role_id_changed) then
    select id into new.role_id
    from admin_roles
    where key = case coalesce(new.role, 'admin') when 'staff' then 'fulfilment' else coalesce(new.role, 'admin') end;
    if new.role_id is null then
      raise exception 'admin_users.role % names no admin_roles row', new.role;
    end if;
  end if;
  select case
    when key = 'fulfilment' then 'staff'
    when key in ('owner', 'admin', 'manager', 'viewer') then key
    else 'viewer' end into new.role
  from admin_roles
  where id = new.role_id;
  return new;
end;
$$;

drop trigger if exists trg_admin_users_sync_role on admin_users;
create trigger trg_admin_users_sync_role
before insert or update of role, role_id on admin_users
for each row execute procedure admin_users_sync_role();

alter table admin_users alter column role_id set not null;

comment on column admin_users.role_id is
  'The Member''s one role (ADR 0023). Authoritative; admin_users.role mirrors its key until slice 11 drops it.';
comment on column admin_users.role is
  'Legacy (expand phase): mirrors admin_roles.key of role_id via trg_admin_users_sync_role. Read role_id instead. Dropped in slice 11.';
