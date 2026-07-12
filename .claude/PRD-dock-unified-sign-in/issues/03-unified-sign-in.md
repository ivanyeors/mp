# Slice 03 — Unified Sign in page + redirects + light polish

Type: AFK
Parent: PRD `dock-unified-sign-in` (`.claude/PRD-dock-unified-sign-in/dock-unified-sign-in-prd.md`)
Triage: needs-triage
User stories covered: 1–6, 18–19, 30–31, 33, 39, 43

## What to build

Make `/[lang]/account/login` the canonical **Sign in** page:

- Heading **Sign In**; short neutral subtitle
- Keep `LoginForm` with Google + magic link for customers
- Light mobile polish: centered `min-h-svh` stack, clearer Google primary hierarchy

Redirect `/[lang]/settings/login` to account login with `?next=` pointing at Admin Panel (or preserved deep link).

Point the Admin Panel unauth gate at `/account/login?next=...` instead of `/settings/login`.

Leave Result “Sign up / sign in” magic-link cards working. User-facing “Staff sign in” copy removed from the old staff login path via redirect.

## Acceptance criteria

- [ ] Canonical Sign in URL is `/[lang]/account/login` with heading **Sign In**.
- [ ] Google and magic link remain available on that page.
- [ ] `/settings/login` redirects to account login with an Admin Panel `next` (or equivalent deep link).
- [ ] Settings unauth gate sends users to `/account/login?next=...`.
- [ ] Sign in page has light mobile polish (centered full-viewport-friendly layout).
- [ ] Result status magic-link Sign in / Sign up entry still works.
- [ ] Slice 02 redirect helper is used for already-signed-in / post-auth behavior on this page.

## Blocked by

- Slice 02 — Post-auth redirect helper + callback + login already-signed-in
