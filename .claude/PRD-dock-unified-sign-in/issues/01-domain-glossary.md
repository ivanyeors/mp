# Slice 01 — Domain glossary: Sign in / Admin Panel / Profile / Staff / Customer

Type: AFK
Parent: PRD `dock-unified-sign-in` (`.claude/PRD-dock-unified-sign-in/dock-unified-sign-in-prd.md`)
Triage: needs-triage
User stories covered: 28, 35

## What to build

Update `CONTEXT.md` Language (and Relationships / example dialogue as needed) with domain terms for this auth/chrome work:

- **Sign in** — unified auth entry at `/account/login`; role decided after session
- **Admin Panel** — staff back office at `/settings`; avoid user-facing “Settings” for this surface
- **Profile** — signed-in customer account entry from the Menu pill
- **Staff** — authorized back-office actor (`admin_users` / bootstrap)
- **Customer** — shopper account identity (distinct from Staff; shared Supabase session possible)

Keep definitions domain-facing (not implementation dumps). No code changes in this slice.

## Acceptance criteria

- [ ] `CONTEXT.md` defines **Sign in**, **Admin Panel**, **Profile**, **Staff**, and **Customer** in the Language section.
- [ ] User-facing “Settings” for the back office is listed as an avoid-term under **Admin Panel**.
- [ ] Relationships note that Menu prefers **Admin Panel** when the session is **Staff**.
- [ ] No schema, route, or UI changes in this slice.

## Blocked by

None — can start immediately.
