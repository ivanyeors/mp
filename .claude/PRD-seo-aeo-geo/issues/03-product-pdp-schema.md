# Slice 03 — Product PDP full JSON-LD + review aggregate + seo_answer field

Type: AFK
Parent: PRD `seo-aeo-geo` (`.claude/PRD-seo-aeo-geo/seo-aeo-geo-prd.md`)
Triage: needs-triage
User stories covered: 7, 8, 9, 10, 17, 19, 32

## What to build

- Add `seo_answer` to `LocalizedProductContent` type and product settings UI
- Server-fetch review aggregate in product layout
- Full Product JSON-LD: SKU, real availability, AggregateRating (if count≥1), BreadcrumbList
- Display answer lede under H1 on product detail client
- Use `buildPageMetadata` in product layout

## Acceptance criteria

- [x] PDP JSON-LD includes BreadcrumbList and variant SKU
- [x] AggregateRating present only when approved review count ≥ 1
- [x] Answer lede visible under product H1 (from seo_answer or fallback)
- [x] Product settings has seo_answer textarea per locale
- [x] `jsonld-product` test passes

## Blocked by

Slice 01
