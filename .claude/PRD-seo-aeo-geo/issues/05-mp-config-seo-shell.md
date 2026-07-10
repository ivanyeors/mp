# Slice 05 — mp-config SEO shell + allow crawl

Type: AFK
Parent: PRD `seo-aeo-geo` (`.claude/PRD-seo-aeo-geo/seo-aeo-geo-prd.md`)
Triage: needs-triage
User stories covered: 21, 24, 30

## What to build

- Replace client-only mp-config layout with server layout + `generateMetadata`
- Extract client shell (cart, currency, animation) to `MpConfigClientShell`
- Server-rendered SEO intro: H1, answer lede, Product JSON-LD for pillow customisation
- Split page into server wrapper + client wizard component
- Target keyword: "customised pillow Singapore"

## Acceptance criteria

- [ ] View source on `/en-US/mp-config` shows title, description, H1, answer lede before JS
- [ ] Product/Offer JSON-LD present in initial HTML
- [ ] Client wizard still functions unchanged below intro
- [ ] Page is crawlable (not in robots disallow)

## Blocked by

Slices 01, 04
