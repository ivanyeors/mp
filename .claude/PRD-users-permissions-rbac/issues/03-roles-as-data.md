# Slice 03 — Roles as data: `admin_roles`, `role_id`, backfill, context from DB

Type: AFK
Parent: PRD `users-permissions-rbac`
Triage: ready
Status: done (migration file written and checked locally; not yet applied to production)
User stories covered: 4, 19, 22, 23, 24

## What to build

Move the role → permission matrix from code into `admin_roles` and make every guard read it. After this slice the Admin Panel behaves exactly as before for everyone, except that non-Owners are now Admins (PRD decision 2 — today there are none).

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

**Live data (2026-10-04):** 3 `admin_users`, all `owner`, all active and bound. Backfill sets all three to the Owner role; the Admin role starts empty. Re-check before running in production.

## Acceptance criteria

- [x] Migration is idempotent and re-runnable (`if not exists`, `on conflict do nothing` seeds).
- [x] Test: Owner/Admin context includes a permission key that is not in any stored array (`grants_all` covers future keys).
- [x] Test: a custom role's stored unknown key is ignored; a missing key is refused by `requireAdmin`.
- [x] Test: deactivated Member → `getAdminContext` null (unchanged).
- [x] Test: changing a role's permissions changes the next request's guard result (no in-process cache).
- [ ] (slice 12) Every current login signs in and sees the same or more pages than before (staging check).
- [x] `graphify-out/` refreshed.

## Decisions made while building

- **A trigger keeps `role` and `role_id` in step** (`trg_admin_users_sync_role`). A write naming only the legacy `role` (app code from before the migration, e.g. during the deploy window) resolves `role_id` by key, with `staff` → Fulfilment; a write naming `role_id` stamps `role` with the key (`staff` for Fulfilment). So the migration can run before the deploy, and a rolled-back app still reads a role it knows.
- **The one-time backfill follows PRD decision 2** (owner → Owner, everything else → Admin); the trigger maps legacy writes faithfully instead, so a pre-deploy invite as `viewer` stays narrow rather than becoming Admin.
- **Only system roles can be `grants_all`** (check constraint), and role names are unique case-insensitively.
- **Bootstrap inserts carry the Owner role id** and return null if the Owner role cannot be read, rather than granting a context with no row behind it.
- **An unbound, deactivated Member row is no longer bound on sign-in** (it was bound and then refused).
- **Migration check:** `scripts/check-rbac-migrations.sh` runs the migrations twice against a throwaway local Postgres seeded like production (`supabase/tests/rbac/fixture.sql`) and runs `assert-03.sql`.
- The Admin Users page lists roles from `admin_roles` and sends `role_id`; the last-Owner check reads the Owner role id. Slice 04 replaces this page.
- **Seeds run only into an empty `admin_roles`**, so a re-run never brings back or collides with a seed someone renamed or deleted (second review).
- **The legacy `role` column reads `viewer` for a custom role**, so a rolled-back app gives that Member the least access rather than none. New roles never get a seeded or legacy key (`owner`, `admin`, `manager`, `fulfilment`, `staff`, `viewer` → `-2`), and the three seeded custom roles (Manager, Fulfilment, Viewer) can't be deleted until slice 11: the old code names them.
- **Member and role writes are conditional on what the policy judged** (`role_id`/`is_active` for a Member, `updated_at` for a role): a concurrent change gives 409, not a silent overwrite. Two Owners removing each other at once: whoever commits second finds no Owner left and is put back (409).

## Blocked by

- Slice 02 — the seed uses the split keys.
