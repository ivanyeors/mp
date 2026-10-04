# Slice 03 — Roles as data: `admin_roles`, `role_id`, backfill, context from DB

Type: AFK
Parent: PRD `users-permissions-rbac`
Triage: needs-triage
User stories covered: 4, 19, 22, 23, 24

## What to build

Move the role → permission matrix from code into `admin_roles` and make every guard read it. After this slice the Admin Panel behaves exactly as before for everyone, except that non-Owners are now Admins (PRD open question 2).

**Migration (`supabase/migrations/<ts>_admin_roles.sql`):**

- Create `admin_roles` (PRD schema). RLS on, no policies, client grants revoked (service-role only, like `telegram_operators`).
- Seed `owner`, `admin` (system, `grants_all`), `manager`, `fulfilment`, `viewer` (custom; slice 02's expanded key lists).
- `admin_users`: add `role_id uuid references admin_roles(id)`; backfill `owner` → owner role, every other row → admin role; set `not null`. Keep the `role` text column, relax its check to allow any value, and keep writing it (`owner` / `admin` / role key) for rollback.
- Comment on both tables pointing to ADR 0023.

**Code:**

- `getAdminContext` selects `admin_users` + `admin_roles` in one query; returns `memberId`, `roleId`, `roleKey`, `isOwner`, `permissions` (all catalog keys when `grants_all`, else stored keys ∩ catalog). Bootstrap-provisioned rows get the owner role id.
- Add `hasPermission(ctx, p)`; guards use it. Replace every `roleHasPermission(ctx.role, …)` call site (mp-config pages, results access, shipping, staff-management page, tests) with `hasPermission(ctx, …)`.
- `ROLE_PERMISSIONS` stays only as the seed source for the migration test and is not read at runtime.
- `/api/admin/context` and the settings layout send `[...ctx.permissions]`.
- Existing Admin Users page keeps working: role select lists roles from `admin_roles`; PATCH accepts `role_id`.

**Before running in production:** read live `admin_users` (count by role, who is owner) and record the result here.

## Acceptance criteria

- [ ] Migration is idempotent and re-runnable (`if not exists`, `on conflict do nothing` seeds).
- [ ] Test: Owner/Admin context includes a permission key that is not in any stored array (`grants_all` covers future keys).
- [ ] Test: a custom role's stored unknown key is ignored; a missing key is refused by `requireAdmin`.
- [ ] Test: deactivated Member → `getAdminContext` null (unchanged).
- [ ] Test: changing a role's permissions changes the next request's guard result (no in-process cache).
- [ ] Every current login signs in and sees the same or more pages than before (staging check).
- [ ] `graphify-out/` refreshed.

## Blocked by

- Slice 02 — the seed uses the split keys.
