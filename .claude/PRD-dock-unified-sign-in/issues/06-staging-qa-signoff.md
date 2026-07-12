# Slice 06 — Staging QA signoff

Type: HITL
Parent: PRD `dock-unified-sign-in` (`.claude/PRD-dock-unified-sign-in/dock-unified-sign-in-prd.md`)
Triage: needs-triage
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
- [ ] Inside `/settings/*`, dock = Home + Logout only
- [ ] Home → landing dock; Admin Panel pill still available when signed in
- [ ] Logout only from Admin dock; after logout guest **Sign in** pill returns
- [ ] Deep link `next` under `/settings/...` still works when staff

**Scope guard**

- [ ] No Edit dock shortcuts
- [ ] URL still `/settings` (not renamed to `/admin`)

## Acceptance criteria

- [ ] Checklist above completed on staging (mobile Safari and/or Chrome as available).
- [ ] Any blockers filed; no silent skips of failed rows.
- [ ] Product owner confirms out-of-scope items (Edit shortcuts, `/admin` rename) stay out.

## Blocked by

- Slice 01 — Domain glossary
- Slice 02 — Post-auth redirect
- Slice 03 — Unified Sign in
- Slice 04 — Landing Menu pill
- Slice 05 — Admin Panel dock
