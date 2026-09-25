# Slice 13 — Merchant Center feed + free listings

Type: AFK + OPS
Parent: PRD `search-visibility` (`.claude/PRD-search-visibility/search-visibility-prd.md`)
Triage: needs-triage
User stories covered: 33, 34

## What to build

- `lib/merchant/feed.ts` + `app/api/merchant-feed/route.ts` (token-protected): **Storefront products** / **Variants** with price from **Costings**, availability, GTIN/MPN or `identifier_exists=no`, images, `product_type`
- **Decision: price range.** Merchant Center accepts one price per item, so the range is expressed as one item per composed **Variant** (pillow size × tier, bolster length), sharing an `item_group_id` per composed product, with `size` / custom-label attributes and each variant's Costings price
- **Variant deep link:** `mp-config` / `mbolster-config` accept a preselect param (e.g. `?variant=<variant_id>`). The configurator starts on that size/tier and displays its price above the fold, and the server-rendered SEO shell shows the same price so Googlebot sees it. An unknown or inactive variant id falls back to the normal flow.
- Configurator Product JSON-LD keeps `AggregateOffer` (low/high) for the unselected page; with `?variant=` it emits a single `Offer` at that price, with a canonical to the base configurator URL
- Fixed-price storefront products (accessories) are listed as ordinary items
- OPS: create/verify Merchant Center for `custom.mpillow.com`, enable free listings, schedule the feed fetch

## Acceptance criteria

- [ ] Feed price equals the landing-page price for every row, including variant deep links (test)
- [ ] `?variant=` preselects the right size/tier and shows the same price server-side and client-side
- [ ] Composed variants share `item_group_id`; Merchant Center groups them as one product
- [ ] Merchant Center diagnostics show zero disapprovals for price mismatch
- [ ] Free listings enabled

## Blocked by

None
