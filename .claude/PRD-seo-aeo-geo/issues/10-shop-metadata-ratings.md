# Slice 10 — Shop index metadata + accessory card ratings

Type: AFK
Parent: PRD `seo-aeo-geo` (`.claude/PRD-seo-aeo-geo/seo-aeo-geo-prd.md`)
Triage: needs-triage
User stories covered: 31, 33, 34, 35

## What to build

- Add `app/[lang]/shop/layout.tsx` with `generateMetadata` for shop index
- Category-aware metadata when `?category=` present
- noindex on cart, checkout, account pages via metadata
- Accessory product cards show review stars (server-passed aggregates or client fetch)
- Add `ProductCardRating` component for shop listing

## Acceptance criteria

- [ ] `/en-US/shop` has title, description, canonical
- [ ] Accessory cards show star rating when reviews exist
- [ ] Cart/checkout/account pages have `robots: { index: false }`

## Blocked by

Slice 03
