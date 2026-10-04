# Slice 05 — Invites: email, Invited state, resend, revoke

Type: AFK
Parent: PRD `users-permissions-rbac`
Triage: ready
Status: done (migration file written and checked locally; not yet applied to production)
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

- [x] Email render test (subject, inviter, role, link) in `lib/email/__tests__`.
- [x] Route tests: create, duplicate 409, resend rate limit, revoke refused for an Active Member.
- [x] Invited Member shows "Invited · sent <time>" with Resend / Revoke; binds to Active on first sign-in.
- [x] Email preview available through the existing email preview guard (`lib/email/preview-guard.ts`) if other templates use it.
- [x] `graphify-out/` refreshed.

## Decisions made while building

- **Revoke and Resend follow the same Member rules** as a role change (`canUpdateMember`): not yourself, Owner invites only by an Owner, and only for a role the actor could have given. Both are refused (409) once the Member has signed in.
- **Resend inside a minute is a 429** with "The invite just went out. Wait a minute before resending."
- **A failed send leaves `invite_sent_at` null**, so the row reads "Invited · email not sent" and Resend is available at once; a successful send stamps it.
- **The invite email is registered** (`auth.admin_invite`) so it appears on the email preview surface and passes the shared email contract tests; it uses the staff audience shell.
- **Sign-in link** is `/<default locale>/account/login?next=/<default locale>/settings` on the site origin.
- **First profile name** defaults from `defaultProfileName` (now in the pure `lib/staff/profile-name.ts`, so the dialog shows the same placeholder the server will use).
- Audit order on invite: `staff_profile.create` then `member.invite` (with `emailSent`); revoke records profiles that were archived and moved to the revoker because Results name them.

## Blocked by

- Slice 04 — Members tab.
- Slice 07 — creating a Staff profile under a Member.
