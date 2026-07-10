# Slice 01 — SEO foundation module + URL sweep

Type: AFK
Parent: PRD `seo-aeo-geo` (`.claude/PRD-seo-aeo-geo/seo-aeo-geo-prd.md`)
Triage: needs-triage
User stories covered: 2, 3, 5, 38

## What to build

Centralize SEO helpers and eliminate hardcoded URL drift across the app.

- Create `lib/seo/` modules: `locale-url`, `metadata`, `answer-lede`, `jsonld-product`, `jsonld-organization`, `jsonld-article`, `review-aggregate`, `llms-index`
- All SEO consumers use `getSiteOrigin()` + `localeUrl(lang, path)`
- Sweep: robots, sitemap, llms.txt, blog JSON-LD, FAQ metadata, product layout
- Add `CONTEXT.md` SEO/AEO/GEO glossary terms
- Unit tests for `answer-lede`, `seo-metadata`, `llms-index`

## Acceptance criteria

- [x] No hardcoded `www.mpillow.com`, `work.mpillow.com`, or bare `mpillow.com` in SEO code paths
- [x] `buildPageMetadata()` produces canonical + hreflang for any locale-prefixed path
- [x] `resolveAnswerLede()` falls back seo_answer → seo_description → description
- [x] Tests pass for seo module self-checks

## Blocked by

Slice 00 (domain migration config)
