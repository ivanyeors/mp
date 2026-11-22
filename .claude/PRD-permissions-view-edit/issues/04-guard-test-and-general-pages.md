# Slice 04 — Write-guard test + General, Users, Appointments, Analytics, read-only pages

Type: AFK
Parent: PRD `permissions-view-edit`
Triage: blocked by 02 applied in production
Status: todo
User stories covered: 6, 7, 11

## What to build

1. **`lib/auth/__tests__/page-write-guard.test.ts`.** Generalise `customers-write-guard.test.ts` (keep it, or fold Customers in as the first row):
   - It holds a table of page → folders → Edit key.
   - For every exported `POST`/`PUT`/`PATCH`/`DELETE` and every `"use server"` export in those folders, the guard must name a key whose `requires` closure includes the page's Edit key.
   - A tab's folders map to the tab's Edit key.
2. **Pages in this slice** (the rule in `issues/README.md` applies to each):

   | Page | Writes move to | Notes |
   |---|---|---|
   | General (`/settings/general`) | `api-configs-edit` | `/api/settings/api-configs`, `claude-key`, `ai-writing` PUT. The Review SLA section is slice 09. |
   | Users & permissions | `users-edit`; Roles tab → `users-roles-edit` | `/api/admin/users*`, `/api/staff` POST, `/api/staff/[id]`, Telegram links → `users-edit`; `/api/admin/roles*` → `users-roles-edit`. Roles tab hidden without `users-roles`. |
   | Appointments | `appointments-edit` | `/api/settings/appointments` PUT, locations, readjustments |
   | Analytics | `analytics-edit` | `seo-actions.ts`, `actions.ts`, `drop-off-actions.ts`, `unsubscribe-reasons-actions.ts` writes. Pure reads in those files stay on `analytics`. |
   | Audit log, Docs, Showroom | none | The test asserts they have no write paths. |

3. **Subset rule check.** A role editor with `users-roles-edit` but not `orders-edit` cannot tick Orders Edit for another role. Covered by `role-policy.ts` unchanged; add one test.

## Acceptance criteria

- [ ] `page-write-guard.test.ts` shown failing on this slice's pages before the move (it lists each write path still on the View key) and passing after.
- [ ] One route-gate test per page: View-only gets 403 on a write, Edit is served.
- [ ] Read-only render tests: with `canEdit={false}`, General and Appointments have no Save in the DOM; Users without `users-roles` has no Roles tab.
- [ ] Preview screenshots as a View-only role (`--as` a fixture user with View only), desktop and phone.
- [ ] Lint baseline does not grow.

## Blocked by

- Slice 02 applied in production. Otherwise roles without the Edit key would lose writes they have today.
