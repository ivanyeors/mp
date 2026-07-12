# Slice 04 — Landing Menu pill: Sign in / Profile / Admin Panel

Type: AFK
Parent: PRD `dock-unified-sign-in` (`.claude/PRD-dock-unified-sign-in/dock-unified-sign-in-prd.md`)
Triage: done
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

- [x] Guest Menu last pill is **Sign in** → locale account login.
- [x] Signed-in customer last pill is **Profile** → `/account` (no extra dock Profile icon).
- [x] Staff on storefront last pill is **Admin Panel** → `/settings`.
- [x] Staff identity wins over customer when both could apply.
- [x] Other bubble pills (Basic, Shop, Support, etc.) unchanged.
- [x] After logout, landing Menu shows **Sign in** again for guests.

## Blocked by

- Slice 03 — Unified Sign in page + redirects + light polish

## Proof (2026-07-12)

**Automated:** `3/3` dock-chrome tests + `6/6` post-auth still pass; `dock-chrome.check.ts: ok`

```bash
npm test -- lib/auth/__tests__/dock-chrome.test.ts lib/auth/__tests__/post-auth-redirect.test.ts
npx tsx lib/auth/dock-chrome.check.ts
```

**Source matrix:** `6/6`

| Check | Evidence |
|-------|----------|
| Guest / customer / staff pill map | `landingAuthPill` → Sign in `/account/login`, Profile `/account`, Admin Panel `/settings` |
| Staff wins | `resolveDockSessionRole(true, true)` + `(false, true)` → `staff` |
| Wired as last Bubble Menu pill | `app-dock.tsx` last item = `authPill.label` / `withLocale(authPill.href)` |
| No Settings pill | no `label: 'Settings'` under `components/ui` |
| No extra Profile dock icon | `dockItems` = Home / Mpillow Config / Bolster Config only |
| Logout → guest again | `onAuthStateChange` → re-fetch user + `/api/admin/context` |
| Other pills unchanged | Basic, Premium, Mbolster, Mpillow Care, Shop, Blogs, Support |
