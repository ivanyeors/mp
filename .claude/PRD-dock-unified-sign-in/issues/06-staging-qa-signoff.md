# Slice 06 — Staging QA signoff

Type: HITL
Parent: PRD `dock-unified-sign-in` (`.claude/PRD-dock-unified-sign-in/dock-unified-sign-in-prd.md`)
Triage: awaiting-HITL (AFK preflight + prod deploy done; device matrix open)
User stories covered: 36–38

## What to build

Human staging / device sign-off for dock + unified Sign in. No new product features — verify slices 01–05 on a real session matrix.

### Checklist

**Guest**

- [ ] Menu last pill = **Sign in** → account login
- [ ] Heading = **Sign In** (not Staff sign in)
- [ ] Google + magic link both present
- [ ] Light mobile layout usable (centered, thumb-friendly)

**Customer**

- [ ] After Sign in (non-staff email), land on account / Profile path
- [ ] Menu last pill = **Profile** → `/account`
- [ ] No extra Profile dock icon
- [ ] Logout from account UI works; Menu returns to **Sign in**
- [ ] Result magic-link save path still works
- [ ] `next` under `/settings` does not open Admin Panel

**Staff**

- [ ] Same Sign in page; after auth with default next → Admin Panel
- [ ] Storefront Menu last pill = **Admin Panel**
- [ ] Inside `/settings/*`, dock = Home + Logout; **mobile also shows Menu** (opens nav sheet)
- [ ] Home → landing dock; Admin Panel pill still available when signed in
- [ ] Logout only from Admin dock; after logout guest **Sign in** pill returns
- [ ] Deep link `next` under `/settings/...` still works when staff
- [ ] Mobile: dock Menu opens Admin Panel nav sheet (header hamburger gone)

**Scope guard**

- [ ] No Edit dock shortcuts
- [ ] URL still `/settings` (not renamed to `/admin`)

## Acceptance criteria

- [ ] Checklist above completed on staging (mobile Safari and/or Chrome as available).
- [ ] Any blockers filed; no silent skips of failed rows.
- [ ] Product owner confirms out-of-scope items (Edit shortcuts, `/admin` rename) stay out.

> **AFK cannot tick the boxes above.** They require a human guest / customer / staff session pass on a real device.

## Blocked by

- Slice 01 — Domain glossary
- Slice 02 — Post-auth redirect
- Slice 03 — Unified Sign in
- Slice 04 — Landing Menu pill
- Slice 05 — Admin Panel dock

---

## Preflight (AFK) — 2026-07-12

### Deploy gate — **closed**

Production READY on commit `3dd921a2` (slices 01–05 + mobile Admin dock Menu).

| Field | Value |
|-------|-------|
| Deploy | `dpl_2CdmPHW9Utkxy7yaqimm1m6LVeGa` |
| State | READY (production) |
| SHA | `3dd921a2` |
| Inspector | https://vercel.com/ivanyeors-projects/mp-inv/2CdmPHW9Utkxy7yaqimm1m6LVeGa |
| Base URL | `https://custom.mpillow.com` (aliases: `work.mpillow.com`, `mp-inv.vercel.app`) |

**QA paths (locale = `en-US`):**

| Surface | URL |
|---------|-----|
| Sign in | https://custom.mpillow.com/en-US/account/login |
| Legacy staff login redirect | https://custom.mpillow.com/en-US/settings/login |
| Admin Panel | https://custom.mpillow.com/en-US/settings |
| Account / Profile | https://custom.mpillow.com/en-US/account |
| Landing (Menu pill) | https://custom.mpillow.com/en-US |

### Live HTTP smoke (2026-07-12)

| Check | Result |
|-------|--------|
| `/en-US/account/login` | **200** — heading **Sign In**, subtitle `Use Google or a magic link to continue.`, Google CTA, `min-h-svh` |
| `/en-US/settings/login` | Soft redirect → `/en-US/account/login?next=%2Fen-US%2Fsettings` (`NEXT_REDIRECT`) |
| No `Staff sign in` in `ts/tsx` | Pass |

### Automated checks (all ok)

```bash
npm test -- lib/auth/__tests__/post-auth-redirect.test.ts lib/auth/__tests__/dock-chrome.test.ts
# → 9/9 passed

npx tsx lib/auth/dock-chrome.check.ts
# → dock-chrome.check.ts: ok

npx tsx lib/auth/admin-panel-menu.check.ts
# → admin-panel-menu.check.ts: ok

npx tsx components/settings/settings-breadcrumbs.check.ts
# → settings-breadcrumbs: all checks passed
```

### Code-audit wiring (AFK proxy — not a device pass)

| Checklist theme | Evidence |
|-----------------|----------|
| Guest Sign in pill | `landingAuthPill("guest")` → `/account/login`; last Bubble Menu item |
| Sign In heading + Google + magic | Live HTML + `LoginForm` |
| Customer Profile pill | `landingAuthPill("customer")` → `/account`; no Profile in `dockItems` |
| Non-staff blocked from `/settings` next | `resolvePostAuthRedirect` tests |
| Staff → Admin Panel default | post-auth tests + `landingAuthPill("staff")` |
| Admin dock Home + Logout | `app-dock.tsx` `adminDock`; desktop = Home/Logout only |
| Mobile Admin Menu | `isMobile &&` Menu → `openAdminPanelMenu()` → sidebar sheet |
| Logout via existing sign-out | `POST /auth/signout` |
| No Edit shortcuts | no Edit/shortcut in `app-dock.tsx` |
| URL still `/settings` | path unchanged; breadcrumbs/sidebar say **Admin Panel** |
| Glossary | `CONTEXT.md` Sign in / Admin Panel / Profile / Staff / Customer |

### HITL session matrix (you run)

Use one browser profile per role (or clear cookies between). Prefer **mobile Safari** + desktop Chrome.

1. **Guest** — open landing → Menu → last pill Sign in → confirm page chrome.
2. **Customer** — magic link or Google with non-staff email → land on `/account` → Menu shows Profile → logout from account UI → pill back to Sign in → try `?next=/en-US/settings` stays off Admin Panel.
3. **Staff (desktop)** — Google with `admin_users` email → Admin Panel → dock Home+Logout only → sidebar trigger still works → Home restores landing dock with Admin Panel pill → Logout → guest Sign in.
4. **Staff (mobile)** — same auth → dock Home + Menu + Logout → Menu opens nav sheet → Logout → guest Sign in → deep-link `/settings/orders` via login `next` still works.

### Scope confirmation (PO)

- Edit dock shortcuts: **out** (deferred).
- `/settings` → `/admin` rename: **out**.
- Mobile Admin Menu on dock: **in** (intentional; not Edit shortcuts).
