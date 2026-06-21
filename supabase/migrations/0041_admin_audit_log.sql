-- Admin audit log: a tamper-evident record of mutating admin actions.
-- Part of #38 (admin RBAC: audit log).
--
-- Every mutating admin path can call `recordAdminAction` (lib/auth/audit.ts),
-- which inserts a row here capturing who did what to which entity, with
-- before/after snapshots and a timestamp. Access is service-role only; the
-- read-only viewer in settings reads through the server.

create table if not exists admin_audit_log (
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

create index if not exists idx_admin_audit_log_created_at
  on admin_audit_log(created_at desc);

alter table admin_audit_log enable row level security;
drop policy if exists "Service role full access admin_audit_log" on admin_audit_log;
create policy "Service role full access admin_audit_log" on admin_audit_log
  for all
  to service_role
  using (true)
  with check (true);
