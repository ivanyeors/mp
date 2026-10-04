# Slice 10 — "Working as" profile on shared logins (optional)

Type: AFK
Parent: PRD `users-permissions-rbac`
Triage: needs-triage — build only if confirmed (PRD open question 4)
User stories covered: 38

## What to build

On a login with more than one active Staff profile, let the person at the device say who they are.

- Admin Panel header: "Working as <name> ▾" picker listing the Member's active profiles; hidden when the Member has one profile.
- Choice stored in an httpOnly cookie (`mp_working_as=<profileId>`); the server re-validates on every read that the profile belongs to the signed-in Member and is active, else ignores it. It is attribution, not authorisation — it never changes permissions.
- New Results created from a Staff session default `measured_by_staff_id` to the working-as profile.
- `admin_audit_log` + `actor_profile_id uuid` (nullable); `recordAdminAction` fills it from the cookie; Audit Log shows "email · profile".

## Acceptance criteria

- [ ] A cookie naming another Member's profile is ignored (test).
- [ ] Permissions identical regardless of cookie (test).
- [ ] `graphify-out/` refreshed.

## Blocked by

- Slice 07.
