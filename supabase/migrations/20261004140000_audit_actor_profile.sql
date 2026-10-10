-- "Working as" on shared logins (PRD users-permissions-rbac slice 10).
--
-- On a login with several Staff profiles, the person at the device can pick
-- who they are. The Audit Log records that profile beside the login, so an
-- entry reads "studio@… · Jess". Attribution only: it never changes access.
--
-- Idempotent: safe to run more than once.

alter table admin_audit_log
  add column if not exists actor_profile_id uuid references mp_staff(id) on delete set null;

-- Deleting a profile (a revoked invite) nulls its references: keep that a lookup.
create index if not exists idx_admin_audit_log_actor_profile_id on admin_audit_log (actor_profile_id);

comment on column admin_audit_log.actor_profile_id is
  'The Staff profile the actor was working as (mp_working_as cookie, re-validated against the login). Null when not chosen.';
