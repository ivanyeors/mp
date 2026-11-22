# Slice 01 — Glossary, ADR 0055 accepted, catalog Edit and tab keys (no behaviour change)

Type: AFK
Parent: PRD `permissions-view-edit`
Triage: ready (owner decisions, 2026-11-22)
Status: todo
User stories covered: 2, 4, 11

## What to build

1. **Glossary.** Add **View**, **Edit**, **Tab row** and **Read-only mode** to `CONTEXT.md`, and amend **Permission** (PRD "Domain language"). Mark ADR 0055 Accepted with the owner's answers.
2. **Catalog** (`lib/auth/permissions.ts`):
   - Add `<page>-edit` for every page in the PRD table that has an Edit key, with no href, `requires: [<page>]`, and the label "<Page>: make changes".
   - Add the tab rows the owner confirmed: `users-roles`, `users-roles-edit`, `shipping-couriers`, `shipping-couriers-edit` and `campaigns-send` (edit-only, requires `campaigns-edit`).
   - Add the Refund money rows: `orders-refund` (requires `orders-edit`) and `returns-refund` (requires `returns-edit`), both labelled "Refund money".
   - Leave `customers-edit`, `customer-import` and `categories` as they are.
3. **`unlocks` field.** Each Admin Panel entry gets one plain line saying what it unlocks. The Roles grid reads it in slice 03.
4. **Seed matrix.** `ROLE_PERMISSIONS` (seed and tests only) gives every legacy role that holds a page its Edit and tab keys too.
5. **No guard changes.** No route or action names a new key yet, so nobody's access changes.

## Acceptance criteria

- [ ] `permissions.test.ts`: every Admin Panel key has a non-empty `unlocks`.
- [ ] `permissions.test.ts`: every `-edit` key requires its page, and its page has an href.
- [ ] Every page listed in the PRD with "none" in the Edit column has no `-edit` key, and every other page has one.
- [ ] The existing "a key without a page is a tab reached through one that has" test still passes, with the new keys included.
- [ ] `permission-matrix.test.ts`, three cases:
  - Ticking `orders-edit` on a role without `orders` adds `orders`, with the note.
  - Unticking `orders` removes `orders-edit`, with the note.
  - Unticking `users` removes `users-roles` and `users-roles-edit`.
  - Ticking `orders-refund` adds `orders-edit` and `orders`. Unticking `orders-edit` removes `orders-refund`.
- [ ] Test: `permissionsForRoleRow({ grants_all: true })` contains every new key.
- [ ] Lint, typecheck and unit tests pass.

## Blocked by

None. Owner decisions answered 2026-11-22.
