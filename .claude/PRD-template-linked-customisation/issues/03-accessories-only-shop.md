# Slice 03 — Accessories-only shop catalog

Type: AFK
Parent: PRD `template-linked-customisation` (`.claude/PRD-template-linked-customisation/template-linked-customisation-prd.md`)
User stories covered: 1, 2

## What to build

Shop sells only accessories and other non-custom **Sellable items**. Mpillow and mbolster are not buyable from the shop catalog.

- Exclude auto-generated pillow/bolster storefront products from the public shop listing and product detail purchase path (archive, status, or query filter — smallest change that holds).
- Remove or hide plain Add to Cart for composed main products if any PDP remains reachable by URL (prefer not found / redirect to customisation entry).
- Keep publish-from-inventory accessories working.
- Customisation entry routes (mp-config, mbolster-config) remain available outside the shop catalog.
- Free-form product create stays disabled (no regression that re-enables it).

## Acceptance criteria

- [x] Public shop listing does not show mpillow-basic, mpillow-premium, or mbolster (or equivalent auto-generated main products).
- [x] Direct product URL for those products does not allow plain purchase (404, redirect to customisation, or no cart action).
- [x] Published accessory **Sellable items** still appear and can be added to cart.
- [x] mp-config and mbolster-config routes remain reachable.
- [x] Free-form storefront product create API/UI remains disabled.

## Verified (2026-07-04)

Against PRD Catalog + US1–2: `isShopCatalogProduct` / `getProducts` / `getProductBySlug` / `getFeaturedProducts` / public `/api/shop/products` exclude pillow/bolster; checkout rejects plain pillow/bolster lines; free-form create still 400; customisation routes untouched.

## Status

**Done** on `cursor/domain-glossary-tier-result`.

- `getProducts` / `getProductBySlug` / `getFeaturedProducts` and public `/api/shop/products` exclude `product_type` pillow/bolster
- Admin products list passes `include_custom=true`
- Checkout rejects plain pillow/bolster cart lines (no `customization_id`)
- Free-form create remains 400; customisation routes untouched

## Blocked by

- Slice 01 (glossary)
