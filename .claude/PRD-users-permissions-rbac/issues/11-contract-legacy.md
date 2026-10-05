# Slice 11 — Contract: drop legacy columns and code paths

Type: AFK
Parent: PRD `users-permissions-rbac`
Triage: ready
User stories covered: —

## What to build

After slices 03–08 have run in production for a week without rollback:

- Migration: drop `admin_users.role` (and its check), `telegram_operators.display_name`, `telegram_operators.role`.
- Remove `ROLE_PERMISSIONS`, `ADMIN_ROLES`, `isAdminRole`, `roleHasPermission`, `TELEGRAM_ROLES`, `telegramRoleCan` and their tests (seed-equivalence test moves to a migration fixture).
- Delete the redirect-only `settings/admins` and `settings/staff-management` folders only if analytics shows no hits in the soak week; otherwise keep the redirects.
- `CONTEXT.md` / ADR 0023 "Consequences" updated to past tense.
- Drop the expand-phase triggers and functions with the columns: `admin_users_sync_role`, `telegram_operators_sync_role`, `telegram_operators_resync` (and its three triggers), `telegram_legacy_role`, `telegram_legacy_profile`, `telegram_legacy_owner`, `mp_staff_default_member`.
- Lift the seeded-role delete guard (`SEEDED_ROLE_KEYS` in `lib/auth/role-policy.ts`) and the reserved keys in `roleKeyFor`.
- Check for gaps left by old code writing between the migrations and the deploy: a Member with no Staff profile (re-run the first-profile insert from `20261004110000`), and profiles the legacy Telegram trigger created that no link uses any more.

## Acceptance criteria

- [ ] `grep` finds no reads of the dropped columns.
- [ ] Lint, typecheck, unit tests pass; `graphify-out/` refreshed (re-run `graphify label . --missing-only` — subsystem removed).

## Blocked by

- Slices 03–08 deployed and soaked.
