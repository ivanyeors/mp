# Slice 02 — Role migration: every role keeps Edit on what it has

Type: AFK
Parent: PRD `permissions-view-edit`
Triage: blocked by 01 (owner decision 9: every role keeps Edit on what it holds)
Status: todo
User stories covered: 5
Owner review: touches `supabase/`; the owner applies it or says to

## What to build

A migration `supabase/migrations/<ts>_view_edit_keys.sql`:

- For every row of `admin_roles` where `grants_all` is false: for each page key it holds that has an Edit key, add `<page>-edit`. For each tab row under a page it holds, add the tab's View and Edit keys.
- For every role holding `orders`, add `orders-refund`. For every role holding `returns`, add `returns-refund`. Today those keys let a role refund, so nobody loses it (owner decision 5).
- `customers-edit`, `customer-import` and `categories` are left as they are. They are already stored where they apply.
- It only adds keys, never removes them. It is idempotent: `array(select distinct unnest(...))`, ordered, so a second run changes nothing.
- It names the live roles it expects in a comment.
- Before applying, re-read the live roles. If any role differs from what this slice records, stop and ask.

Live roles (read 2026-11-22; re-read before applying):
- admin and owner: `grants_all`, skipped.
- custom: fulfilment (0 active members), manager (1), marketing (1), viewer (0).

Applying order: this migration goes **before** any slice that moves a guard (04–08). Old code ignores keys it doesn't know (`permissionsForRoleRow` filters with `isPermission`), so it is safe while the current build serves.

## Acceptance criteria

- [ ] A check, run against a local Postgres seeded like production (extend `scripts/check-rbac-migrations.sh`), asserts:
  - For every role, the stored permissions after the migration are a superset of before.
  - The added keys are exactly the expected `-edit`, tab and refund keys.
  - Every role holding `orders` or `returns` ends with the matching refund key.
  - A second run changes nothing.
- [ ] Shown failing against a stub migration that forgets one page.
- [ ] After applying in production: query the live roles, and paste before/after per role in the pull request.

## Blocked by

- Slice 01 (the keys must exist in the catalog, or the Roles grid would drop them on the next save).
