# PRD: Dock + Unified Sign In

Status: Draft (needs-triage)
Source: Grill-with-docs session + plan `dock_and_sign_in_1fe09bc4` (Jul 2026)

## Problem Statement

Shoppers have no clear dock entry to **Sign in**. The Menu’s last pill is labeled **Settings** and sends everyone into the staff back office login (“Staff sign in”), which is the wrong door for customers and the wrong name for staff.

After staff authenticate, the same landing dock stays on screen inside the back office. There is no Admin-focused dock (Home / Logout), and no role-aware Menu language on the storefront (Profile for customers, Admin Panel for staff). Sign-in and staff login are split across two pages with inconsistent copy, even though role is already decided after the session by `admin_users`.

## Solution

From the user’s perspective:

- One **Sign in** entry in the landing Menu (pill renamed from Settings).
- After auth, the system decides: **Staff** → **Admin Panel**; everyone else → **Customer** / **Profile**.
- Customers keep Google + magic link. Staff continue to use Google in practice (membership still gated by `admin_users`).
- On the storefront, the Menu’s last pill becomes **Sign in** (guest), **Profile** (customer), or **Admin Panel** (staff). No extra Profile dock icon.
- Only inside `/settings/*` (not the login redirect) does the dock switch to **Home** + **Logout**. Leaving via Home restores the landing dock.
- Light visual polish on the Sign in screen; user-facing “Settings” / “Staff sign in” become **Admin Panel** / **Sign In**. URL path stays `/settings`.

From the developer’s perspective: unify on `/account/login`, redirect `/settings/login` and the settings unauth gate there with `?next=`, add a pure post-auth redirect helper used by the OAuth callback and the login page, and make `AppDock` route- and role-aware. No schema migration. Per-staff Edit shortcuts are deferred.

## User Stories

1. As a guest on the storefront, I want the Menu’s last pill labeled **Sign in**, so that I can find authentication without hunting for Settings.
2. As a guest tapping **Sign in**, I want to land on a single Sign in page, so that I am not sent to a staff-only screen.
3. As a guest on Sign in, I want the heading to read **Sign In**, so that the page does not say “Staff sign in” or over-specify “your account.”
4. As a guest on Sign in, I want a short neutral subtitle, so that both shoppers and staff understand the page without role jargon.
5. As a customer, I want to sign in with Google, so that I can reach my Profile quickly.
6. As a customer, I want to sign in with an email magic link, so that I can authenticate without Google.
7. As a customer whose email is not in `admin_users`, I want to be treated as a customer after Sign in, so that I reach Profile / account flows—not the Admin Panel.
8. As a customer completing Sign in with no special `next`, I want to land on my account (**Profile**), so that the default destination is useful.
9. As a customer signing in from a Result status card with a `next` to that Result, I want to return to that Result, so that I can save and track customisation.
10. As a signed-in customer on the storefront, I want the Menu’s last pill labeled **Profile**, so that I can open my account from the same Menu slot as Sign in.
11. As a signed-in customer, I do not want a separate Profile icon on the dock, so that chrome stays consistent with staff’s Admin Panel pill pattern.
12. As a signed-in customer, I want to log out from inside account / Profile UI, so that logout is an account action—not a storefront Menu item.
13. As **Staff** (row in `admin_users` or bootstrap allowlist), I want Google Sign in on the same page as customers, so that I do not need a separate staff login URL.
14. As Staff completing Sign in with the default destination, I want to land in the **Admin Panel**, so that back-office work starts immediately.
15. As Staff opening a deep `next` under `/settings/...`, I want to land on that Admin Panel page after auth, so that gated deep links still work.
16. As Staff signing in with a `next` to a Result or other non-settings path, I want that `next` honored, so that operator/shopper dual use does not force Admin Panel.
17. As a non-staff user whose `next` points under `/settings`, I want to be sent to account instead, so that I cannot enter the Admin Panel by URL alone.
18. As Staff already signed in visiting `/settings/login` or the old staff login entry, I want to be redirected into the Admin Panel, so that I am not stuck on a login form.
19. As a guest hitting a protected Admin Panel route, I want to be sent to `/account/login?next=...`, so that one Sign in page serves the gate.
20. As Staff on the storefront, I want the landing dock unchanged except the Menu’s last pill reading **Admin Panel**, so that marketing chrome stays familiar.
21. As Staff tapping **Admin Panel**, I want to enter `/settings`, so that I can re-enter the back office from Home after leaving.
22. As Staff inside the Admin Panel, I want a different dock with **Home** and **Logout** only, so that back-office navigation is focused.
23. As Staff tapping **Home** on the Admin dock, I want to go to the landing page and see the landing dock again, so that dock context follows the route—not a sticky session chrome.
24. As Staff tapping **Logout** on the Admin dock, I want my session cleared, so that I can sign out without hunting through settings pages.
25. As Staff browsing the storefront while still signed in, I do not want an Admin dock, so that Home/Shop/etc. keep the marketing dock.
26. As Staff on the storefront, I accept that logout is only on the Admin dock, so that the landing Menu stays clean.
27. As a user who is both Staff and could also be a Customer record, I want the Menu to prefer **Admin Panel** over **Profile**, so that staff identity wins on the storefront pill.
28. As a visitor reading UI copy, I want the back office referred to as **Admin Panel**, so that “Settings” is not the user-facing name for staff tools.
29. As a developer, I want the URL path to remain `/settings`, so that we avoid a route migration in this PRD.
30. As a mobile visitor on Sign in, I want a centered, full-viewport-friendly layout with clear primary Google CTA hierarchy, so that the page is easier to use on a phone.
31. As a mobile visitor on Sign in, I still want magic link available when offered, so that customer auth methods are not reduced in this PRD.
32. As a developer, I want a pure post-auth redirect helper, so that callback and login-page “already signed in” branches share one rule set.
33. As a developer, I want `/settings/login` to redirect to the unified Sign in page, so that bookmarks and old links keep working.
34. As a developer, I want AppDock to swap chrome only when the path is under `/settings` and not the login redirect target, so that the Sign in page keeps landing-dock behavior if shown with marketing chrome.
35. As a developer, I want domain glossary terms for Sign in, Admin Panel, Profile, Staff, and Customer in CONTEXT.md, so that language stays consistent.
36. As a QA tester, I want a staging checklist for guest / customer / staff dock pills and Admin dock Home/Logout, so that role chrome can be signed off on a device.
37. As a product owner, I want per-staff Edit dock shortcuts deferred, so that v1 ships without unproven personalization scope.
38. As a product owner, I do not want `/settings` renamed to `/admin` in this PRD, so that URL churn is avoided.
39. As a customer on Result “Sign up / sign in” cards, I want existing magic-link entry points to keep working, so that Result save flows are not broken.
40. As Staff using the Admin Panel sidebar and pages, I want existing RBAC and page content unchanged except dock and naming where user-facing, so that this PRD stays focused on entry and chrome.
41. As a guest opening Menu items other than the last pill (Basic, Shop, Support, etc.), I want those pills unchanged, so that only auth/admin entry language changes.
42. As a signed-in customer, I want Profile to open `/account`, so that the pill destination matches account home.
43. As an unauthenticated user, I want Sign in to open `/account/login` (locale-prefixed), so that the canonical Sign in URL is stable.
44. As Staff after Logout, I want to be treated as a guest on the landing dock (Sign in pill), so that session end is visible in chrome.
45. As a developer, I want automated checks only on post-auth redirect behavior, so that role routing cannot regress silently while visual dock work stays manual.

## Implementation Decisions

### Modules

| Module | Responsibility |
|--------|----------------|
| **Post-auth redirect** | Pure helper: given `next`, `isStaff`, and locale defaults, return the safe post-auth path (staff default → Admin Panel; non-staff blocked from `/settings` next; honor non-settings `next` for staff) |
| **Dock session role** | Client-side guest / customer / staff classification for the Menu pill; staff wins if admin context is present |
| **Landing App dock** | Existing marketing dock; last bubble pill becomes Sign in \| Profile \| Admin Panel |
| **Admin Panel dock** | Home + Logout only when pathname is under `/settings` (exclude login); Home → landing; Logout → existing sign-out |
| **Unified Sign in page** | Canonical `/account/login`; heading Sign In; light mobile polish; keep LoginForm magic link; `/settings/login` + settings unauth gate redirect here with `?next=` |
| **Domain glossary** | CONTEXT.md terms for Sign in, Admin Panel, Profile, Staff, Customer |

### Technical clarifications

1. **Canonical Sign in URL:** `/[lang]/account/login`. `/[lang]/settings/login` redirects to it with `next` pointing at Admin Panel (or preserved deep link).
2. **Role source:** Staff = successful `getAdminContext()` / admin API (`admin_users` or bootstrap). Else customer once authenticated.
3. **Auth methods:** Customers keep Google + magic link. No removal of magic link in this PRD. Staff membership still requires `admin_users` (or bootstrap); Google-only is not enforced as a separate customer policy.
4. **Menu pill (landing dock only):** Guest → Sign in → `/account/login`. Customer → Profile → `/account`. Staff → Admin Panel → `/settings`. No extra Profile dock icon.
5. **Admin dock scope:** Only on Admin Panel routes under `/settings/*`, not on storefront, not as a global sticky staff chrome. v1 items: Home, Logout only.
6. **Logout:** Customer → account UI. Staff → Admin dock only.
7. **Rename:** User-facing Settings / Staff sign in → Admin Panel / Sign In. Keep `/settings` path.
8. **Shared session:** One Supabase session; Menu prefers Admin Panel when staff. No requirement to prevent `customers` row creation for staff emails in v1.
9. **Visual scope:** Light Sign in page polish only (centered `min-h-svh` stack, clearer Google primary hierarchy). No broad mobile redesign.
10. **No ADR** for this work (reversible UI/routing).
11. **No schema / new API** beyond wiring existing admin context and sign-out.

### Schema / API

No database migrations. Reuse existing admin context endpoint and `/auth/callback` / `/auth/signout`. Add or adjust only the pure redirect helper and dock/login redirects.

## Testing Decisions

### What makes a good test

- Test external behavior of `resolvePostAuthRedirect` (inputs → path), not React trees, dock animation, or Tailwind classes.
- Do not snapshot BubbleMenu GSAP or dock magnification.

### Modules to test

| Module | Automated? | Rationale |
|--------|------------|-----------|
| Post-auth redirect | **Yes** | High regression risk; role + `next` matrix |
| Dock session role / App dock | **No** | Visual + session wiring; staging QA |
| Unified Sign in page copy/layout | **No** | Visual; staging QA |
| Domain glossary | **No** | Docs |

### Prior art

- `lib/auth/__tests__/admin-guard.test.ts` for staff vs non-staff session behavior
- Small assert/`*.check.ts` helpers elsewhere in the repo

Cover at least: staff + default account next → Admin Panel; non-staff + settings next → account; staff + `/results/...` next → honor next.

## Out of Scope

- Per-staff personalized **Edit** dock shortcuts
- Renaming `/settings` → `/admin` (or other URL migration)
- Removing customer magic link / Google-only customers
- Extra Profile icon on the dock
- Broad mobile redesign of landing, shop, or Admin Panel pages beyond Sign in polish
- Changing Admin Panel RBAC matrix, sidebar IA, or back-office page features
- Mutual exclusion of Staff vs Customer database rows
- New signup providers beyond existing Google + magic link

## Further Notes

- Vertical slices live in `.claude/PRD-dock-unified-sign-in/issues/`.
- Implement glossary updates when the first auth/dock slice lands (or as a tiny first slice).
- Configurator flows that hide the dock via `body.dock-hidden` remain unchanged.
- Header `ProfileMenu` on marketing routes may remain as-is; this PRD’s customer entry is the Menu pill.
