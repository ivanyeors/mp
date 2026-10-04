# Slice 06 — Roles tab: permission matrix editor + custom roles

Type: AFK
Parent: PRD `users-permissions-rbac`
Triage: needs-triage
User stories covered: 14, 16–22

## What to build

The "page to set all permissions for page access".

- **Roles tab, matrix view (default):** rows = catalog permissions grouped exactly like the sidebar (General, Inventory, Store, Landing Site, Insights, Showroom, Integration) then a **Telegram** group; columns = roles (Owner, Admin, then custom roles alphabetically) with a Member-count chip in each header. Cells are checkboxes. Owner / Admin columns render ticked and locked with a "Built-in: always every page" tooltip. A sticky first column and horizontal scroll keep it usable at phone width; on mobile the default is a per-role list instead (pick a role → its grouped checklist).
- **Editing:** changes are staged per column; a column shows "Unsaved" with Save / Discard. Ticking a page with `requires` ticks its dependencies and shows "Also turned on Media — Page Builder uses it". Unticking a dependency still required by another ticked page is blocked with that reason.
- **Role detail sheet:** name, description, Members holding it (links to Members tab), Delete.
- **Create role:** name, description, optionally "start from" an existing role's permissions.
- **API:** `GET/POST /api/admin/roles`, `PATCH/DELETE /api/admin/roles/[id]`, all `users`. Server applies `requires`, refuses edits to system roles, refuses delete with Members (409 + count), enforces the subset rule for non-`grants_all` actors, validates keys against the catalog. Audit `role.create | role.update | role.delete` with before/after permission arrays.
- Header copy: "Members get exactly the pages their role has. New pages are off for custom roles until you turn them on."

## Acceptance criteria

- [ ] Role-policy tests: system role edit refused; delete with Members refused; subset rule on create and edit; `requires` closure applied server-side even if the client omits it.
- [ ] Route tests for each endpoint's allow/refuse.
- [ ] Changing a role's matrix and reloading as a Member of that role shows the sidebar change immediately (manual check, recorded in slice 12).
- [ ] Matrix renders the catalog, not a hard-coded list (adding a catalog entry adds a row with no UI change).
- [ ] `graphify-out/` refreshed.

## Blocked by

- Slice 04 — page shell and role policy module.
