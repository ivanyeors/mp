# Slice 09 — Access-denied notice + audit coverage

Type: AFK
Parent: PRD `users-permissions-rbac`
Triage: ready
User stories covered: 23, 36

## What to build

- `requireAdminPage` redirects a signed-in Member lacking the page key to `/settings?denied=<key>`; the General page shows a dismissible notice "You don't have access to <catalog label>. Ask an Owner to add it to your role." Unknown `denied` values are ignored.
- Client sidebar: if the current path's page key is not in the Member's permissions (role changed mid-session), navigate to the same notice on the next route change.
- Audit Log page: filter chips for the new entity types (`member`, `role`, `staff_profile`, `telegram_link`) and a readable diff for permission arrays (added / removed keys by label, not raw JSON).

## Acceptance criteria

- [ ] Guard test: redirect target carries the key; no key for signed-out (they go to Sign in as today).
- [ ] Every write route added in slices 04–08 has a test asserting `recordAdminAction` is called with before/after.
- [ ] `graphify-out/` refreshed.

## Blocked by

- Slice 04.
