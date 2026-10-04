# Slice 05 — Invites: email, Invited state, resend, revoke

Type: AFK
Parent: PRD `users-permissions-rbac`
Triage: ready
User stories covered: 5–9

## What to build

Turn "invite" from a silent row insert into a real invitation.

- Migration: `admin_users` + `invited_by uuid references admin_users(id)`, `invited_at timestamptz`, `invite_sent_at timestamptz`.
- **Invite dialog** on the Members tab: email, role (only assignable roles, per role policy), first Staff profile name (defaults to the email's local part, title-cased).
- `POST /api/admin/users`: creates the Invited Member, its first Staff profile (slice 07 helper), sends the invite email, writes audit `member.invite`. A duplicate email returns 409 naming whether the existing Member is Invited, Active or Deactivated.
- **Invite email** (`renderAdminInviteEmail` in `lib/email/auth.ts`, sent via `getDefaultTransport()`): inviter's email, role name, "Sign in with <invited email>" button → `/account/login?next=/settings`, plain note that Google or email sign-in both work as long as the address matches. Uses the shared shell with the staff audience styling.
- **Resend** (`POST /api/admin/users/[id]/resend-invite`): Invited Members only; refuses if `invite_sent_at` is under 60 s old; bumps `invite_sent_at`; audit `member.invite_resend`.
- **Revoke**: `DELETE /api/admin/users/[id]` allowed only while Invited (no auth user bound); deletes the Member and its untouched profiles (profiles with Result attribution are archived and moved to the inviter instead); audit `member.invite_revoke`.
- First sign-in binding stays the existing email-match path in `getAdminContext`; an email-send failure does not roll back the invite — the row is created and the UI says "Invite saved, email failed — Resend".

## Acceptance criteria

- [ ] Email render test (subject, inviter, role, link) in `lib/email/__tests__`.
- [ ] Route tests: create, duplicate 409, resend rate limit, revoke refused for an Active Member.
- [ ] Invited Member shows "Invited · sent <time>" with Resend / Revoke; binds to Active on first sign-in.
- [ ] Email preview available through the existing email preview guard (`lib/email/preview-guard.ts`) if other templates use it.
- [ ] `graphify-out/` refreshed.

## Blocked by

- Slice 04 — Members tab.
- Slice 07 — creating a Staff profile under a Member.
