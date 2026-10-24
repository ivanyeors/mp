# PRD: Users & permissions (Admin Panel RBAC)

Status: Ready (triaged 2026-10-04)
Source: Request to merge **Admin Users** and **Staff Management** into one RBAC surface (Oct 2026)
ADR: `docs/adr/0023-rbac-roles-are-data-permissions-are-code.md` (Accepted)

## Problem Statement

Who can do what in the Admin Panel is spread across three unrelated lists on two pages, and none of them can be shaped by the business:

- **Admin Users** (`/settings/admins`, `admin_users`) holds the logins. Each login gets one of five roles (`owner | admin | manager | staff | viewer`) whose permissions are hard-coded in `lib/auth/permissions.ts`. Nobody can change what a role can see without a code change and a deploy.
- **Staff Management** (`/settings/staff-management`, `mp_staff`) is a flat list of names used to tag who measured a **Result**. The names belong to no login, so there is no way to say "these four people work on the studio iPad account", and the list is guarded by `results`, not by a staff-management permission.
- **Telegram access** (a tab on Staff Management, `telegram_operators`) is a third list of people with its own two roles, unconnected to any login or role. Deactivating someone in Admin Users does not touch their Telegram buttons.

The permission keys are also coarser than the sidebar. `page-builder` alone unlocks Page Builder, Partners, Partner applications, Partner commissions, FAQ, Forms and Rules Engine; `inventory` unlocks Inventory, Configure and Shopify Link; `results` unlocks Results, Appointments and Staff Management. So even with an editable matrix, there would be no way to say "this person can edit FAQs but not commission schemes".

Invites are silent: inviting an email inserts a row and nothing is sent. The invitee is never told.

## Solution

One Admin Panel entry, **Users & permissions** (`/settings/users`), replaces Admin Users and Staff Management. It is built like GitHub's organisation settings: people, the roles they hold, and what each role can see.

From the user's perspective:

- **Members** tab: every Admin Panel login. Invite by email with a role, and the invitee gets a branded email with a sign-in link. See who is invited, active, or deactivated; change roles; deactivate; resend or revoke a pending invite.
- **Staff profiles** tab: the people who work under each login. One login can hold several staff profiles (a shared studio account with four measuring staff); a personal login holds one. Profiles are what **Results** are tagged "measured by", and what a Telegram account links to.
- **Roles** tab: a permission matrix with one row per Admin Panel page and one row per Telegram action, and one column per role. Tick a box to let a role see a page; untick it and the page disappears from that role's sidebar and its URL and APIs refuse. Create custom roles; Owner and Admin are built in and always have everything.
- **Telegram** tab: who can press buttons on review cards, now part of RBAC. A role decides which Telegram actions are possible; linking a staff profile's Telegram account (one-time `/link` code, as today) turns them on for that person.

Everyone currently in `admin_users` keeps working: existing owners stay **Owner**, everyone else becomes **Admin**. The old `manager`, `staff` and `viewer` matrices are kept as editable custom roles so nothing has to be rebuilt from memory.

From the developer's perspective:

- The **permission catalog** stays in code and is split to one key per sidebar page plus the Telegram actions. Every guard (`requireAdmin`, `assertAdmin`, `requireAdminPage`, …) keeps its signature; only the key it names becomes precise.
- **Roles become data** (`admin_roles`), each with a permission set, and `admin_users` points at a role. `getAdminContext` loads the role's permissions in the same memoised lookup it does today, so every page and API reads the database on each request and a change takes effect on the next one. ADR 0023 records why the matrix moves out of code while the catalog stays in it.
- `mp_staff` gains an owning login. `telegram_operators` gains a staff profile and a set of granted actions; Telegram authorisation becomes role ∩ link grant, and a deactivated login silences everything under it.

## Domain language (lands in `CONTEXT.md` with slice 01)

| Term | Meaning | Avoid |
|------|---------|-------|
| **Member** | One Admin Panel login: an `admin_users` row bound to an auth user on first sign-in. Holds exactly one **Role**. States: **Invited** (no auth user yet), **Active**, **Deactivated**. A signed-in active Member is **Staff**. | "admin user" (collides with the **Admin** role); "user" in code (collides with Customer and `by_user`) |
| **Role** | A named set of **Permissions** (`admin_roles`). **Owner** and **Admin** are built in, locked, and grant every permission including ones added later. Every other role is a **custom role**: editable, and granted nothing new by default. | Treating the role name as the authority — code checks permissions, never role names |
| **Permission** | One entry in the code catalog: an Admin Panel **page** (sidebar entry) or a **Telegram action**. A role either has it or does not; there is no per-member override. | "scope"; per-user exceptions |
| **Owner** | Built-in role. Only an Owner can grant or remove Owner. There is always at least one active Owner. | |
| **Staff profile** | A named person who works under a **Member** (`mp_staff`). A personal login has one; a shared login has several. A **Result** is "measured by" a Staff profile; a Telegram account links to a Staff profile. A profile never has more access than its Member. Archived, never deleted, so historical attribution survives. | "staff member" (ambiguous with **Staff**); a profile as a login — it cannot sign in |
| **Telegram link** | A Staff profile's bound Telegram user id plus the Telegram actions granted to it. Effective access = the Member's role permissions ∩ the link's granted actions, and only while the profile and Member are both active. | **Telegram operator** as a list separate from logins (that is what this replaces) |
| **Users & permissions** | The Admin Panel page at `/settings/users` that manages all of the above. | "Admin Users", "Staff Management" (retired page names) |

## User Stories

### Entry point
1. As an Owner, I want one sidebar entry called **Users & permissions**, so that people, roles and Telegram access are managed in one place.
2. As Staff with an old bookmark to `/settings/admins` or `/settings/staff-management`, I want to land on the matching Users & permissions tab, so that links keep working.
3. As Staff without the `users` permission, I do not want to see Users & permissions in the sidebar, so that the back office only shows what I can use.

### Members and invites
4. As an Owner, I want every email that is an Admin Panel login today to be an **Admin** (and existing owners to stay **Owner**), so that nobody loses access when roles become editable.
5. As a Member with the `users` permission, I want to invite someone by email with a role, so that they can sign in to the Admin Panel.
6. As an invitee, I want an email telling me I was invited, by whom, with a button that takes me to Sign in, so that I know to sign in with that address.
7. As an invitee, I want to become an active Member the first time I sign in with the invited email (Google or magic link), so that there is no second acceptance step.
8. As an inviter, I want to see who is still **Invited**, resend the email, or revoke the invite, so that stale invites do not linger.
9. As an inviter, I want an invite to create the invitee's first Staff profile (name defaulting from the email), so that they can be tagged on Results immediately.
10. As an admin, I want to change a Member's role from the Members table, so that access changes in one click.
11. As an admin, I want to deactivate a Member and have every Staff profile and Telegram link under that login stop working at once, so that offboarding is one action.
12. As an admin, I cannot change my own role or deactivate myself, so that I cannot lock myself out.
13. As an Owner, I want only Owners to grant or remove the Owner role, and the system to refuse removing the last active Owner, so that the business always has an owner.
14. As a Member who can manage users but is not an Owner or Admin, I cannot assign a role that grants a permission I do not have, so that managing users is not a path to more access.
15. As an admin, I want each Member row to show role, status, how many staff profiles it holds, and when it last signed in, so that I can audit access at a glance.

### Roles and the permission matrix
16. As an Owner, I want a matrix of every Admin Panel page (grouped as the sidebar is) against every role, so that I can see and set page access in one view.
17. As an Owner, I want to create a custom role, name and describe it, and tick the pages it can see, so that access fits a real job.
18. As an Owner, I want Owner and Admin columns shown locked and fully ticked, so that it is obvious they cannot be narrowed.
19. As an Owner, I want a newly built Admin Panel page to be off for every custom role until someone ticks it, so that new features are never exposed by default.
20. As an Owner, I want pages that depend on another page's data (e.g. Page Builder needs Media to pick images) to tick their dependency automatically, with a note why, so that a role never gets a page that cannot work.
21. As an Owner, I want to see how many Members hold each role, and be stopped from deleting a role that still has Members until I move them, so that nobody is left without a role.
22. As an Owner, I want the old Manager / Fulfilment / Viewer access kept as starting custom roles, so that I can assign them without rebuilding them.
23. As a Member whose role loses a page, I want the page to vanish from my sidebar and its URL to send me to the Admin Panel home with a "you don't have access to that page" notice on my next navigation, so that the change is immediate and not confusing.
24. As a Member, I want every API behind a page I cannot see to refuse me (403), so that hiding is not the only protection.

### Staff profiles
25. As an admin, I want to see every Staff profile grouped by the login it works under, so that I know who uses the studio account.
26. As an admin, I want to add, rename, move between logins, and archive Staff profiles, so that the list tracks real people.
27. As an admin, I want archived profiles to keep their name on historical Results but drop out of pickers, so that attribution is never lost.
28. As Staff tagging a Result's "measured by", I want the picker grouped by login with archived profiles hidden, so that I pick the right person.
29. As an admin migrating, I want the existing staff names attached to one login (`sg@mpillow.com`), and reassignable afterwards, so that the move is lossless.

### Telegram
30. As an Owner, I want the Telegram actions (reply to Google reviews, moderate shop reviews) to be rows in the same permission matrix, so that Telegram access is governed by roles like everything else.
31. As an admin, I want to link a Staff profile's Telegram account by issuing a one-time `/link` code, as today, so that the linking flow is familiar.
32. As an admin, I want to choose which Telegram actions a linked profile has, limited to what its login's role allows, so that a shared login can still have one review manager and one shop moderator.
33. As a review manager, I want my buttons to stop working when my login is deactivated or my role loses the Telegram permission, so that Telegram is never a side door.
34. As an admin, I want the existing Telegram operators carried over with the same access they have today, so that review handling does not pause during the move.
35. As an admin, I want "Send preview" to stay on the Telegram tab, so that I can still check setup end to end.

### Accountability
36. As an Owner, I want every invite, role change, matrix edit, profile change and Telegram link change written to the Audit Log with before/after, so that access changes are traceable.
37. As a developer, I want automated checks that every sidebar page has exactly one catalog permission and every catalog page has a sidebar entry, so that the matrix and the sidebar cannot drift.

### Working as (slice 10)
38. As Staff on a shared login, I want to choose "working as" one of my login's Staff profiles, so that new Results default their "measured by" and audit entries name the person.

## Implementation Decisions

### Permission catalog (code)

One key per sidebar page, grouped like the sidebar, plus Telegram actions. Proposed keys (the split slice confirms each route's owner):

| Group | Keys |
|-------|------|
| General | `api-configs`, `appointments`, `users` |
| Inventory | `inventory`, `costings` |
| Store | `products`, `categories`, `configure`, `rules-engine`, `customers`, `results`, `orders`, `returns`, `discounts`, `shipping` |
| Landing Site | `page-builder`, `partners`, `partner-applications`, `partner-commissions`, `blogs`, `faq`, `forms`, `media` |
| Insights | `analytics`, `audit-log` |
| Showroom | `showroom` |
| Integration | `shopify-link` |
| Telegram | `telegram.google-review-reply`, `telegram.shop-review-moderate`, `telegram.social-inbox-reply` (PRD-social-inbox) |

Legacy → new mapping applied by the split (no behaviour change because the code matrix is expanded the same way): `staff` → `users`; `results` → `results` + `appointments`; `inventory` → `inventory` + `configure` + `shopify-link`; `orders` → `orders` + `returns`; `page-builder` → `page-builder` + `partners` + `partner-applications` + `partner-commissions` + `faq` + `forms` + `rules-engine` (product-builder sub-pages — mappings, dimensions, filling visuals, calibration — move to `products` or `rules-engine` per route, decided in slice 02).

Each catalog entry carries: `key`, `label`, `group`, `href` (pages only), `surface: "admin-panel" | "telegram"`, and optional `requires: Permission[]` (e.g. `page-builder` and `blogs` require `media`). The sidebar's `perm` comes from the catalog, not a second literal.

**Staff assist mode** stays gated on `results` in v1 (no separate capability key).

### Roles (data)

```
admin_roles
  id           uuid pk
  key          text unique            -- 'owner', 'admin', or slug of a custom role
  name         text not null
  description  text
  is_system    boolean not null       -- owner, admin: locked
  grants_all   boolean not null       -- owner, admin: every permission, present and future
  permissions  text[] not null        -- ignored when grants_all; unknown keys ignored on read
  created_at / updated_at

admin_users
  + role_id uuid not null references admin_roles(id)   -- replaces the role text column
```

- Seed: `owner` (system, grants_all), `admin` (system, grants_all), and custom roles `manager`, `fulfilment` (the old `staff` role — renamed because **Staff** is a glossary term), `viewer`, each with today's matrix expanded to the new keys.
- Backfill: `role = 'owner'` → Owner; every other row → Admin.
- Expand/contract: the `role` text column stays (written alongside `role_id`) until slice 11 drops it, so a rollback of the app does not strand logins.
- `getAdminContext()` selects `admin_users` with its `admin_roles` row in one query and returns `{ memberId, userId, email, roleId, roleKey, permissions: ReadonlySet<Permission>, isOwner }`. Still `cache()`-memoised per request.
- `roleHasPermission(role, p)` is replaced by `hasPermission(ctx, p)`. Guard signatures (`requireAdmin(p)`, `requireAnyAdmin`, `requireAdminContext`, `assertAdmin`, `requireAdminPage`) are unchanged.
- No per-member overrides. A one-off access pattern is a custom role.
- Rules enforced server-side on every write: can't change own role or active state; only Owners grant/remove Owner; at least one active Owner; a non-`grants_all` actor cannot create, edit, or assign a role whose permissions are not a subset of their own; a role with Members cannot be deleted; `requires` is applied on save.

### Staff profiles

```
mp_staff
  + admin_user_id uuid not null references admin_users(id)   -- owning login
  + archived_at   timestamptz
  - unique(lower(name))            → unique(admin_user_id, lower(name)) where archived_at is null
```

- Backfill: existing names attach to `sg@mpillow.com` (decision 1). Every Member without a profile gets one named from the email local part.
- Profiles are archived, never deleted; `measured_by_staff_id` keeps pointing at them.
- `/api/staff` GET (used by Results) returns profiles with owner email and archived flag; the guard is `results` **or** `users`.

### Telegram links

```
telegram_operators   (kept, reinterpreted as Telegram link)
  + staff_profile_id uuid unique references mp_staff(id)
  + actions          text[] not null   -- subset of telegram.* keys
  - display_name, role                 -- read from the profile / replaced by actions; dropped in slice 11
```

- `authorizeTelegramAction(telegramUserId, action)` resolves link → profile (not archived) → Member (active) → role, and allows only when the role grants `telegram.<action>` **and** the link's `actions` includes it. Any failed read refuses, as today.
- Migration: each operator becomes (or matches by name) a Staff profile under `sg@mpillow.com`; `review_manager` → both actions, `shop_moderator` → moderate only. That Member is an Owner, so no existing access narrows.
- `/link CODE` redemption is unchanged apart from writing to the profile-linked row.

### Invites

- `POST /api/admin/users` creates the Invited Member, its first Staff profile, and sends an **invite email** (new template in `lib/email/auth.ts` through the default transport): who invited them, the role name, and a button to `/account/login?next=/settings`. `invited_by`, `invited_at`, `invite_sent_at` columns on `admin_users`.
- First sign-in with that email binds the auth user (existing `getAdminContext` email-match path); no token, no expiry in v1 — revoking deletes the Invited row.
- Resend re-sends and bumps `invite_sent_at` (rate-limited to once a minute per Member).

### Page and routes

- `/settings/users` with tabs `members | profiles | roles | telegram` (`?tab=`), server-rendered with initial data like Staff Management does today. Whole page requires `users`.
- `/settings/admins` → redirect `/settings/users?tab=members`; `/settings/staff-management` → `?tab=profiles` (and `?tab=telegram` → `?tab=telegram`).
- APIs: `/api/admin/users` (+ `[id]`, `[id]/resend-invite`), `/api/admin/roles` (+ `[id]`), `/api/staff` (+ `[id]`), `/api/staff/telegram-operators/*` kept as the Telegram link endpoints. All mutating routes require `users` and call `recordAdminAction`.
- `requireAdminPage` redirects to `/settings?denied=<key>` and the General page shows a dismissible "You don't have access to <page>" notice.
- The mobile tile menu and breadcrumbs pick up the renamed entry from the same nav source.

### Modules

| Module | Responsibility |
|--------|----------------|
| **Permission catalog** (`lib/auth/permissions.ts`) | Keys, labels, groups, hrefs, `requires`; pure helpers `applyRequires`, `isSubset`, `catalogForSurface` |
| **Admin context** (`lib/auth/admin.ts`) | Session → Member + role permissions; guards |
| **Role policy** (`lib/auth/role-policy.ts`, new) | Pure write rules: can actor assign/edit/delete role X, change Member Y; owner invariants |
| **Members** (`lib/auth/members.ts`, new) | Invite, resend, revoke, update; bind on first sign-in |
| **Staff profiles** (`lib/staff/admin.ts`) | List grouped by Member, create, rename, move, archive |
| **Telegram links** (`lib/telegram/operators.ts`) | Issue code, redeem, set actions, authorise via role ∩ link |
| **Users & permissions UI** (`app/[lang]/settings/users/*`) | Four tabs; matrix editor |

## Testing Decisions

### What makes a good test

Test behaviour at the module boundary — inputs to permissions, write rules to allow/refuse, route to status code — not React trees. Follow the existing patterns: `lib/auth/__tests__/permissions.test.ts`, `admin-guard.test.ts`, `settings-routes-guarded.test.ts`, `app/api/__tests__/admin-read-gates.test.ts`, `app/api/staff/telegram-operators/__tests__/route.test.ts`, and `*.check.ts` helpers.

| Module | Automated? | Cover |
|--------|-----------|-------|
| Catalog integrity | Yes | Every sidebar entry maps to one page key and vice versa; every `requires` target exists; legacy expansion is a superset of the old matrix (proves slice 02 changes nothing) |
| Role policy | Yes | Self-change refused; last Owner protected; only Owner grants Owner; subset rule for non-`grants_all`; delete-with-members refused; `requires` applied |
| Admin context | Yes | Permissions come from the role row; `grants_all` includes a key added after the role was saved; inactive Member → null; unknown stored keys ignored |
| Route gates | Yes | Each re-keyed route refuses a role without its new key and allows one with it (extend `settings-routes-guarded` / `admin-read-gates`) |
| Telegram authorise | Yes | Role ∩ link; deactivated Member refuses; archived profile refuses; failed read refuses |
| Migration | Yes (SQL check against a seeded local DB) | Owners stay Owner, others Admin; operators keep their actions; every Member has a profile |
| Invite email | Yes | Renders with inviter, role, link (`lib/email/__tests__` pattern) |
| Matrix UI, tabs, redirects | No | Staging QA (slice 12) |

## Out of Scope

- View-only vs edit levels per page. **Next PRD** (decision 3): a Member who can open a page but not change anything on it. The catalog shape leaves room — a second `<page>:read` key per page, with mutating routes keeping the full key — so nothing in this PRD needs undoing.
- Per-member permission overrides; teams/groups.
- Staff profiles signing in on their own, PINs, or device-level profile locks.
- Moving the **Assist link** from Member to Staff profile (follow-up; today one code per login).
- Partner Hub (`partner_users`) and Customer access — unaffected.
- Renaming `/settings` or `admin_users` / `mp_staff` tables.
- SSO / SCIM / domain-restricted sign-in.

## Decisions (confirmed 2026-10-04)

1. **Today's staff names and Telegram operators move under `sg@mpillow.com`.** Reassignable afterwards with "Move to…".
2. **Existing Owners stay Owner.** All three current logins are `owner` rows, so the backfill changes no one; Admin is seeded but starts with no Members. Bootstrap emails keep auto-provisioning as Owner.
3. **Page-level see / don't-see only.** View-only (open the page, change nothing) is the next PRD, not this one — see Out of Scope.
4. **Slice 10 (working-as profile) is in.** It ships after slice 07.
5. **Invite expiry:** none in v1 (revoke instead). Not raised; default kept.

## Further Notes

- Live data (read 2026-10-04, project `mpillow`):
  - `admin_users`: 3 rows, all `owner`, all active and bound to an auth user — `sg@mpillow.com` (oldest, 2026-06-21), `ivanyeoart@gmail.com`, `admin@mpillow.com`.
  - `mp_staff`: 6 names (Kai Lin, Ivan, Darren, Jess, Wang Ying, Winnie); no `is_active` column; no Result references any of them yet (`measured_by_staff_id` unused).
  - `telegram_operators`: 1 row — "Ivan", `review_manager`, active, linked.
  Re-read before each migration runs in production; the slices note what each one expects.
- Slices live in `.claude/PRD-users-permissions-rbac/issues/`.
- Every slice that changes code refreshes `graphify-out/` in the same commit (CLAUDE.md).
