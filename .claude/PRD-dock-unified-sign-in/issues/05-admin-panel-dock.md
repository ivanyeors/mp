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

- [x] On `/settings/*` (excluding login redirect), dock shows **Home**, **Menu** (nav sheet), and **Logout**.
- [x] Home navigates to landing and landing dock reappears.
- [x] Logout clears the session via existing sign-out.
- [x] Storefront routes never show the Admin Panel dock (even while Staff is signed in).
- [x] No Edit/shortcut dock items ship in this slice.
- [x] Admin Panel page features / RBAC unchanged aside from dock + user-facing naming where applicable.

## Blocked by

- Slice 04 — Landing Menu pill: Sign in / Profile / Admin Panel

## Proof (2026-07-12)

**Automated:** `3/3` dock-chrome + `6/6` post-auth; `dock-chrome.check.ts: ok`; breadcrumbs check ok

```bash
npm test -- lib/auth/__tests__/dock-chrome.test.ts lib/auth/__tests__/post-auth-redirect.test.ts
npx tsx lib/auth/dock-chrome.check.ts
npx tsx components/settings/settings-breadcrumbs.check.ts
```

**Source matrix:** `6/6`

| Check | Evidence |
|-------|----------|
| Admin dock = Home + Menu + Logout | `app-dock.tsx` `adminDock` branch; Menu opens sidebar sheet via `admin-panel-menu` bus |
| Home → landing | `Link href={to("/")}` |
| Logout → existing sign-out | `POST /auth/signout?next=…` → `app/auth/signout/route.ts` |
| Path gate excludes login | `isAdminPanelDockPath("/settings/login") === false`; storefront paths false |
| No Edit/shortcuts | no Edit/shortcut strings in `app-dock.tsx` (Menu = nav sheet only) |
| Naming → Admin Panel | breadcrumb root, sidebar group, dock menu aria, error heading |

**Live (local):** `/en-US/settings/login` → `NEXT_REDIRECT … /en-US/account/login?next=%2Fen-US%2Fsettings`; login path keeps landing dock (not Admin dock).

**Note:** Admin dock Menu (mobile nav sheet) is an intentional add beyond the original “Home + Logout only” line — keeps Admin Panel IA reachable after the header hamburger moved to the dock.
