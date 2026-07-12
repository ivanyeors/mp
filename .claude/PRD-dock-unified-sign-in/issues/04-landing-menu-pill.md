# Slice 04 — Landing Menu pill: Sign in / Profile / Admin Panel

Type: AFK
Parent: PRD `dock-unified-sign-in` (`.claude/PRD-dock-unified-sign-in/dock-unified-sign-in-prd.md`)
Triage: needs-triage
User stories covered: 1, 10–11, 20–21, 27, 41–42, 44

## What to build

On the landing (marketing) App dock Bubble Menu, replace the hardcoded **Settings** pill with a role-aware last pill:

| Session | Label | Destination |
|---------|-------|-------------|
| Guest | Sign in | `/account/login` |
| Customer | Profile | `/account` |
| Staff | Admin Panel | `/settings` |

Staff wins over Profile when admin context is present. No extra Profile dock icon. Other Menu pills unchanged. After staff logout, guest sees **Sign in** again.

Reuse existing session / admin context client patterns (e.g. profile menu / admin context API).

## Acceptance criteria

- [ ] Guest Menu last pill is **Sign in** → locale account login.
- [ ] Signed-in customer last pill is **Profile** → `/account` (no extra dock Profile icon).
- [ ] Staff on storefront last pill is **Admin Panel** → `/settings`.
- [ ] Staff identity wins over customer when both could apply.
- [ ] Other bubble pills (Basic, Shop, Support, etc.) unchanged.
- [ ] After logout, landing Menu shows **Sign in** again for guests.

## Blocked by

- Slice 03 — Unified Sign in page + redirects + light polish
