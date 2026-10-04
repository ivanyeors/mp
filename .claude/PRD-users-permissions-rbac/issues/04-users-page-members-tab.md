# Slice 04 — Users & permissions page + Members tab + redirects

Type: AFK
Parent: PRD `users-permissions-rbac`
Triage: ready
Status: done
User stories covered: 1–3, 10–13, 15

## What to build

The new entry point, with the Members tab carrying everything Admin Users does today.

- Route `app/[lang]/settings/users/page.tsx` guarded by `requireAdminPage("users")`, tabs `members | profiles | roles | telegram` driven by `?tab=` (only Members is live in this slice; the others render the current Staff Management staff list and Telegram tab unchanged until slices 06–08 replace them).
- Sidebar: General group loses **Admin Users** and **Staff Management**, gains **Users & permissions** (`/settings/users`, icon `ShieldCheck`, perm `users`). Catalog href updated. Breadcrumbs and mobile tiles follow.
- Redirects: `/settings/admins` → `/settings/users?tab=members`; `/settings/staff-management` → `?tab=profiles`, `?tab=telegram` preserved. Server redirects, locale-aware.
- **Members tab:** table of Members — email, status pill (Invited / Active / Deactivated), role select (roles from `admin_roles`), profile count, last sign-in (`auth.users.last_sign_in_at` via service role), actions (Deactivate / Reactivate). Mobile: stacked cards like other settings tables.
- **Write rules** moved into `lib/auth/role-policy.ts` (pure) and enforced in `PATCH /api/admin/users/[id]`: not yourself; only Owners grant/remove Owner; ≥1 active Owner; non-`grants_all` actor may only assign roles ⊆ own permissions. Role select disables options the actor may not assign, with a tooltip saying why.
- Existing invite form stays (role select from DB) until slice 05 replaces it.

## Acceptance criteria

- [x] Users & permissions is the only people/access entry in the sidebar; old URLs redirect to the right tab.
- [x] Role-policy unit tests: self-change, last Owner, Owner-only Owner, subset rule (allow and refuse cases).
- [x] Route tests: PATCH refuses each forbidden case with 400/403 and a readable message.
- [x] Every Member change writes `admin_audit_log` (`member.update`) with before/after.
- [x] Settings mobile check (`settings-mobile.check.ts`) updated for the renamed entry.
- [x] `graphify-out/` refreshed.

## Decisions made while building

- **The client runs the same role policy** (`lib/auth/role-policy.ts` is pure) to disable role options and Deactivate buttons, with the server's sentence as the reason. The server re-checks every write against fresh rows.
- **A Member whose current role the actor could not assign is locked for that actor** (no role change, no deactivate), as well as Owners for non-Owners. Without it, a narrower user-manager could deactivate an Admin.
- **Profile count** is not on the Members table yet: Members don't own profiles until slice 07, which adds the column.
- **Mobile:** one card per Member below `sm`, table from `sm` up.
- `/api/admin/users` GET returns `{ members, roles }` (roles with member counts) for every tab; the old `rows` shape is gone with the old page.
- The invite form stays inline until slice 05, but only lists roles the inviter may assign; invites are audited as `member.invite`.
- The last-active-Owner rule is covered in `role-policy.test.ts`; through the API the actor is always an active Owner too, so a request only reaches it with stale rows.

## Blocked by

- Slice 03 — roles come from `admin_roles`.
