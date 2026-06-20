-- Admin RBAC: per-user staff identity, role, and active status.
-- Part of #31 (per-user login + roles + first-admin bootstrap).
--
-- The role→permission matrix is defined in application code
-- (lib/auth/permissions.ts); this table stores who is staff, their role, and
-- whether they are active. The first owner is bootstrapped via the
-- ADMIN_BOOTSTRAP_EMAILS allowlist before any rows exist.

create table if not exists admin_users (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique references auth.users(id) on delete set null,
  email         text not null,
  role          text not null default 'staff'
                  check (role in ('owner', 'admin', 'manager', 'staff', 'viewer')),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists idx_admin_users_email on admin_users(lower(email));

drop trigger if exists trg_admin_users_updated_at on admin_users;
create trigger trg_admin_users_updated_at
before update on admin_users
for each row execute procedure set_updated_at();

-- All access goes through the server (service role). No anon/authenticated
-- direct access; the guard reads membership server-side.
alter table admin_users enable row level security;
drop policy if exists "Service role full access admin_users" on admin_users;
create policy "Service role full access admin_users" on admin_users
  for all using (true) with check (true);
