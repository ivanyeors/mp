# Slice 05 — Admin Panel dock: Home + Logout only on `/settings/*`

Type: AFK
Parent: PRD `dock-unified-sign-in` (`.claude/PRD-dock-unified-sign-in/dock-unified-sign-in-prd.md`)
Triage: done
User stories covered: 22–26, 34, 40

## What to build

When the path is under `/settings` (Admin Panel) and not the login redirect surface, swap App dock chrome to:

- **Home** → locale landing `/`
- **Logout** → existing sign-out route

No Edit / shortcut icons in v1. On storefront routes, keep the landing dock (including Staff’s Admin Panel pill from slice 04). Home from Admin Panel must restore the landing dock. Admin Panel sidebar/RBAC/pages otherwise unchanged; update remaining user-facing “Settings” chrome labels to **Admin Panel** where they mean this surface.

## Acceptance criteria

- [x] On `/settings/*` (excluding login redirect), dock shows **Home** and **Logout** only.
- [x] Home navigates to landing and landing dock reappears.
- [x] Logout clears the session via existing sign-out.
- [x] Storefront routes never show the Admin Panel dock (even while Staff is signed in).
- [x] No Edit/shortcut dock items ship in this slice.
- [x] Admin Panel page features / RBAC unchanged aside from dock + user-facing naming where applicable.

## Blocked by

- Slice 04 — Landing Menu pill: Sign in / Profile / Admin Panel

## Done notes

- Path gate: `isAdminPanelDockPath` in `lib/auth/dock-chrome.ts`
- Admin dock branch in `components/ui/app-dock.tsx` (Home + Logout form → `/auth/signout`)
- Breadcrumb root + sidebar group label → **Admin Panel**
- Automated: `lib/auth/__tests__/dock-chrome.test.ts`
