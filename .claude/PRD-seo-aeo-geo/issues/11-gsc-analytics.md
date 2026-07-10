# Slice 11 — GSC verification + analytics migration

Type: OPS
Parent: PRD `seo-aeo-geo` (`.claude/PRD-seo-aeo-geo/seo-aeo-geo-prd.md`)
Triage: needs-triage
User stories covered: 36, 37

## What to build

- Add `GoogleAnalytics` / GTM component wired via env vars (`NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`)
- Document GSC verification steps for `custom.mpillow.com` in OPS checklist
- Add Google site verification meta tag support via env (`NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`)
- Wire analytics into root layout (production only)

## Acceptance criteria

- [ ] GTM or gtag loads in production when env var set
- [ ] `.env.example` documents analytics + GSC verification env vars
- [ ] OPS checklist includes GSC property setup + sitemap resubmit steps
- [ ] Site verification meta tag renders when env set

## Blocked by

Slices 00, 04
