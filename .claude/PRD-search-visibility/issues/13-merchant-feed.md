# Slice 13 — Merchant Center feed + free listings

Type: AFK + OPS
Parent: PRD `search-visibility` (`.claude/PRD-search-visibility/search-visibility-prd.md`)
Triage: needs-triage
User stories covered: 33, 34

## What to build

- `lib/merchant/feed.ts` + `app/api/merchant-feed/route.ts` (token-protected): **Storefront products** / **Variants** with price from **Costings**, availability, GTIN/MPN or `identifier_exists=no`, images, `product_type`
- v1: fixed-price storefront products only; composed sellables only if a truthful per-variant landing price exists (decision in triage)
- OPS: create/verify Merchant Center for `custom.mpillow.com`, enable free listings, schedule the feed fetch

## Acceptance criteria

- [ ] Feed price equals the PDP price for every row (test)
- [ ] Merchant Center diagnostics show zero disapprovals for price mismatch
- [ ] Free listings enabled

## Blocked by

None
