-- Partner identity spine (#71): per-user partner account, application status,
-- and the columns later Partner Hub slices need (questionnaire, agreement,
-- backup email) so no schema change is required later.
--
-- Additive/prod-safe per ADR 0012 expand pattern: deployed code never reads this
-- table, so the migration is invisible to production. Mirrors admin_users
-- (0038_admin_rbac.sql). `partner_id` stays null until an application is approved
-- and linked to a `partners` (Location aggregate) row.

create table if not exists partner_users (
  id                    uuid primary key default gen_random_uuid(),
  auth_user_id          uuid unique references auth.users(id) on delete set null,
  partner_id            uuid references partners(id) on delete set null,   -- null until approved
  email                 text not null,
  application_status    text not null default 'pending'
                          check (application_status in ('pending','approved','rejected')),
  questionnaire         jsonb not null default '{}',
  agreed_version        text,
  agreed_at             timestamptz,
  backup_email          text,
  backup_email_verified boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists idx_partner_users_email on partner_users(lower(email));
create index if not exists idx_partner_users_partner on partner_users(partner_id) where partner_id is not null;
create index if not exists idx_partner_users_backup_email on partner_users(lower(backup_email)) where backup_email is not null;

drop trigger if exists trg_partner_users_updated_at on partner_users;
create trigger trg_partner_users_updated_at
before update on partner_users
for each row execute procedure set_updated_at();

-- All access goes through the server (service role). No anon/authenticated
-- direct access; the guard reads membership server-side.
alter table partner_users enable row level security;
drop policy if exists "Service role full access partner_users" on partner_users;
create policy "Service role full access partner_users" on partner_users
  for all using (true) with check (true);
