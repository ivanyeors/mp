# Slice 05 — Stock-out gating end to end + multi-SKU/BOM availability

Type: AFK
Parent: PRD `money-flow-traceability` (`.claude/PRD/money-flow-traceability-prd.md`)
User stories covered: 28, 29, 30, 31, 32, 33

## What to build

Make live BOM buildable (`variant_stock`) the single availability truth and block out-of-stock buying at every layer, not just checkout.

- Join `variant_stock` in storefront product loaders and expose `stock_available` in the public product list/detail payloads.
- Switch all storefront gating to `stock_available` (drop the `stock_quantity` fallback): product detail, product grid card, variant selector (disable, not just style, out-of-stock options).
- Extend `variant_stock` so bolster variants resolve through `bolster_buildable`.
- Cap cart quantities to `stock_available` and re-validate the cart before checkout.
- Disable out-of-stock cover/case options in the customizer.
- Keep checkout server validation as the final authority.

## Acceptance criteria

- [ ] Public product list/detail responses include `stock_available` from `variant_stock`.
- [ ] Out-of-stock variants cannot be added to cart from the product page or grid; sold-out options are disabled in the variant selector.
- [ ] Bolster availability reflects `bolster_buildable`, not the stale `stock_quantity`.
- [ ] Cart quantity cannot exceed `stock_available`; cart re-validates before checkout and surfaces shortages.
- [ ] Customizer disables out-of-stock cover/case options.
- [ ] A composed (multi-part) product shows availability equal to the min buildable across its BOM.
- [ ] `stock` module/view has a test covering pillow buildable, bolster buildable, item on-hand, and `track_inventory=false`.

## Blocked by

- Slice 04 (price source) - ensures variants are correctly linked to their BOM so buildable resolves.
