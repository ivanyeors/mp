# Slice 09 — Access-denied notice + audit coverage

Type: AFK
Parent: PRD `users-permissions-rbac`
Triage: ready
Status: done
User stories covered: 23, 36

## What to build

- `requireAdminPage` redirects a signed-in Member lacking the page key to `/settings?denied=<key>`; the General page shows a dismissible notice "You don't have access to <catalog label>. Ask an Owner to add it to your role." Unknown `denied` values are ignored.
- Client sidebar: if the current path's page key is not in the Member's permissions (role changed mid-session), navigate to the same notice on the next route change.
- Audit Log page: filter chips for the new entity types (`member`, `role`, `staff_profile`, `telegram_link`) and a readable diff for permission arrays (added / removed keys by label, not raw JSON).

## Acceptance criteria

- [x] Guard test: redirect target carries the key; no key for signed-out (they go to Sign in as today).
- [x] Every write route added in slices 04–08 has a test asserting `recordAdminAction` is called with before/after.
- [x] `graphify-out/` refreshed.

## Decisions made while building

- **`deniedPageLabel`** turns `?denied=` into a catalog label and shows nothing for anything that is not an Admin Panel page key, so a crafted link cannot put text on the page.
- **The sidebar re-reads `/api/admin/context` on each client navigation after the first.** The server layout is not re-run on a soft navigation, so without this a role change would only reach the sidebar on a full reload. If the page being viewed is no longer held, it goes to the same `?denied=` notice the page guards use.
- **Audit Log diff** (`lib/auth/audit-diff.ts`) renders `permissions` (roles) and `actions` (Telegram links) arrays as "+ added / − removed" page labels above the raw JSON. Filter chips are links (`?entity=`), with unknown values ignored.
- Write-route audit tests were added with each slice (04: `member.update`, `member.invite`; later slices add their own).

## Blocked by

- Slice 04.
