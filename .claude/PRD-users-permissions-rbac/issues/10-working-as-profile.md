# Slice 10 — "Working as" profile on shared logins

Type: AFK
Parent: PRD `users-permissions-rbac`
Triage: ready (confirmed, PRD decision 4)
Status: done (migration file written and checked locally; not yet applied to production)
User stories covered: 38

## What to build

On a login with more than one active Staff profile, let the person at the device say who they are.

- Admin Panel header: "Working as <name> ▾" picker listing the Member's active profiles; hidden when the Member has one profile.
- Choice stored in an httpOnly cookie (`mp_working_as=<profileId>`); the server re-validates on every read that the profile belongs to the signed-in Member and is active, else ignores it. It is attribution, not authorisation — it never changes permissions.
- New Results created from a Staff session default `measured_by_staff_id` to the working-as profile.
- `admin_audit_log` + `actor_profile_id uuid` (nullable); `recordAdminAction` fills it from the cookie; Audit Log shows "email · profile".

## Acceptance criteria

- [x] A cookie naming another Member's profile is ignored (test).
- [x] Permissions identical regardless of cookie (test).
- [x] `graphify-out/` refreshed.

## Decisions made while building

- **`validWorkingAs(memberId, value)`** is the one check: a UUID naming a live profile of that login, else ignored. `getWorkingAs` reads the cookie (outside a request it returns null). Nothing in `getAdminContext` or any guard reads the cookie; a test asserts the context is identical with and without it.
- **Cookie:** `mp_working_as`, httpOnly, `sameSite=lax`, one year (a device preference, not a session), set by `POST /api/admin/working-as` (any signed-in Member, own profiles only; `null` clears it).
- **The picker sits in the Admin Panel header** and renders only when the login has two or more live profiles. The layout reads the login's profiles and the current choice on the server.
- **Results default:** a Draft Result created by a Staff session with no "measured by" in the request is stamped `staff` + the working-as profile. The configurator never sends one on create, so this is the path every in-store Result takes.
- **Audit:** `recordAdminAction` adds `actor_profile_id` only when a valid profile is chosen (so an older schema never sees the column), for any actor passed with a `memberId` (every `AdminContext` is). The Audit Log shows "email · profile".

## Blocked by

- Slice 07.
