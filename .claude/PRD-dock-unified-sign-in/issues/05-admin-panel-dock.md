# Slice 05 — Admin Panel dock: Home + Logout only on `/settings/*`

Type: AFK
Parent: PRD `dock-unified-sign-in` (`.claude/PRD-dock-unified-sign-in/dock-unified-sign-in-prd.md`)
Triage: needs-triage
User stories covered: 22–26, 34, 40

## What to build

When the path is under `/settings` (Admin Panel) and not the login redirect surface, swap App dock chrome to:

- **Home** → locale landing `/`
- **Logout** → existing sign-out route

No Edit / shortcut icons in v1. On storefront routes, keep the landing dock (including Staff’s Admin Panel pill from slice 04). Home from Admin Panel must restore the landing dock. Admin Panel sidebar/RBAC/pages otherwise unchanged; update remaining user-facing “Settings” chrome labels to **Admin Panel** where they mean this surface.

## Acceptance criteria

- [ ] On `/settings/*` (excluding login redirect), dock shows **Home** and **Logout** only.
- [ ] Home navigates to landing and landing dock reappears.
- [ ] Logout clears the session via existing sign-out.
- [ ] Storefront routes never show the Admin Panel dock (even while Staff is signed in).
- [ ] No Edit/shortcut dock items ship in this slice.
- [ ] Admin Panel page features / RBAC unchanged aside from dock + user-facing naming where applicable.

## Blocked by

- Slice 04 — Landing Menu pill: Sign in / Profile / Admin Panel
