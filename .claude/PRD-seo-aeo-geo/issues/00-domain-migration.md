# Slice 00 — Domain migration work.mpillow.com → custom.mpillow.com

Type: OPS
Parent: PRD `seo-aeo-geo` (`.claude/PRD-seo-aeo-geo/seo-aeo-geo-prd.md`)
Triage: needs-triage
User stories covered: 1, 36

## What to build

Migrate canonical production domain from `work.mpillow.com` to `custom.mpillow.com` before SEO slices ship.

- Update `NEXT_PUBLIC_SITE_URL` default/fallback to `https://custom.mpillow.com` in code and `.env.example`
- Add 301 redirects: `work.mpillow.com/*` → `custom.mpillow.com/*` (Next.js `redirects` in `next.config.ts`)
- Update Supabase Auth redirect URLs to include `https://custom.mpillow.com/**`
- Document OPS checklist: DNS, Vercel domain, SSL, GSC property, sitemap resubmit

## Acceptance criteria

- [x] `getSiteOrigin()` prod fallback is `https://custom.mpillow.com`
- [x] `.env.example` documents `https://custom.mpillow.com` as production value
- [x] `next.config.ts` redirects `work.mpillow.com` host to `custom.mpillow.com` with 301
- [x] OPS checklist file exists with DNS/Vercel/GSC steps
- [x] `curl -I https://work.mpillow.com` returns 301 to custom (after deploy — manual OPS)

## Blocked by

None — can start immediately.
