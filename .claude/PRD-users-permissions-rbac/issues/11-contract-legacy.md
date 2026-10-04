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

## Acceptance criteria

- [ ] `grep` finds no reads of the dropped columns.
- [ ] Lint, typecheck, unit tests pass; `graphify-out/` refreshed (re-run `graphify label . --missing-only` — subsystem removed).

## Blocked by

- Slices 03–08 deployed and soaked.
