# Slice 04 — Users & permissions page + Members tab + redirects

Type: AFK
Parent: PRD `users-permissions-rbac`
Triage: ready
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

- [ ] Users & permissions is the only people/access entry in the sidebar; old URLs redirect to the right tab.
- [ ] Role-policy unit tests: self-change, last Owner, Owner-only Owner, subset rule (allow and refuse cases).
- [ ] Route tests: PATCH refuses each forbidden case with 400/403 and a readable message.
- [ ] Every Member change writes `admin_audit_log` (`member.update`) with before/after.
- [ ] Settings mobile check (`settings-mobile.check.ts`) updated for the renamed entry.
- [ ] `graphify-out/` refreshed.

## Blocked by

- Slice 03 — roles come from `admin_roles`.
