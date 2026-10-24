-- Invites (PRD users-permissions-rbac slice 05).
--
-- An invite is an admin_users row with no auth user bound yet (Invited). These
-- columns record who invited the Member and when the email last went out, so
-- the Members tab can show "Invited · sent 2h ago" and rate-limit Resend.
-- There is no token and no expiry: signing in with the invited email binds the
-- row (getAdminContext), and Revoke deletes it.
--
-- Idempotent: safe to run more than once.

alter table admin_users
  add column if not exists invited_by uuid references admin_users(id) on delete set null,
  add column if not exists invited_at timestamptz,
  add column if not exists invite_sent_at timestamptz;

comment on column admin_users.invited_by is 'Member who sent the invite. Null for Members from before invites were recorded.';
comment on column admin_users.invite_sent_at is 'When the invite email last went out; null if it never sent. Resend is refused within a minute of it.';
