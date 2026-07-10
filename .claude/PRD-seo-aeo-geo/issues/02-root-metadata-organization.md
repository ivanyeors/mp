# Slice 02 — Root metadataBase + Organization/WebSite JSON-LD

Type: AFK
Parent: PRD `seo-aeo-geo` (`.claude/PRD-seo-aeo-geo/seo-aeo-geo-prd.md`)
Triage: needs-triage
User stories covered: 4, 6

## What to build

- Set `metadataBase` in root `app/layout.tsx` from `getSiteOrigin()`
- Improve default title/description for Mpillow brand
- Add `Organization` + `WebSite` JSON-LD on homepage via server component

## Acceptance criteria

- [ ] Root layout exports `metadataBase: new URL(getSiteOrigin())`
- [ ] Homepage renders Organization + WebSite JSON-LD in view source
- [ ] OG relative URLs resolve against metadataBase

## Blocked by

Slice 01
