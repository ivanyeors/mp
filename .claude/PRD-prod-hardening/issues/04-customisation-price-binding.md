# 04: Bind a customised checkout line to its build: product match, price recomputed on the server, stock per Variant

**Type:** AFK
**Blocked by:** none
**User stories:** 8, 9, 10
**Labels:** `bug`, `needs-triage`, `P0`, `area:checkout`

## Goal

The amount charged for a customised line is always the **Composed sellable** that will actually be built, whatever `variant_id` the client sends.

## The gap, precisely

**How the price is stored.** `app/api/shop/customize/route.ts` (`handleApply`):
- It checks the posted variant against `pillow_product_id` (`:603-611`).
- It prices the build from Costings: `priceApply` then `customizationDelta(result, sellable.msrp)` (`:554`, `:653-667`). So the delta is **composed subtotal − that size and Tier's MSRP**.
- It inserts `customization_configs` with `pillow_product_id` and `total_addon_price`, **but not the variant** (`:676-693`).

**How checkout uses it.** `app/api/shop/checkout/route.ts`:
- `:50-54, 120-142`: `variant_id` and `customization_id` are posted independently.
- `:151-165`: only rejects a pillow or bolster variant *without* a customisation. An accessory variant *with* a pillow customisation passes and skips the standard stock check.
- `:355-362`: `subtotal += quantity * variant.price + quantity * cfg.total_addon_price`.
- `lib/stripe/checkout.ts:107-108`: when the delta is 0, Stripe bills the variant's own catalog Price.

**After payment**, the webhook builds what the config says (`lib/ecommerce/mp-config-sync.ts:195-197`), and stock is deducted as the accessory (`lib/ecommerce/inventory-deduction.ts:229-236`).

**Exploit:** customise a pillow, then check out with a cheap accessory `variant_id` and that `customization_id`. You pay the accessory price plus the delta, and a full build is queued.

**Separately, stock is checked per line** (`checkout/route.ts:190-198`). Posting the same `variant_id` on two lines, each within stock, oversells.

## Scope

- **Product match.** For each customised line, load the Variant's `pillow_product_id` (or bolster linkage) and require it to match `cfg.pillow_product_id` or `cfg.bolster_variant`. Otherwise return 400 before any write.
- **Recompute the price.** Compute the customised unit price on the server with the same pricing path the customise route uses (`priceApply` / `priceCustomizedBuild` in `lib/shop/customization-price.ts`).
  - Charge the composed subtotal.
  - Treat `total_addon_price` as a display snapshot only.
  - If the recomputed price differs from the snapshot, charge the recomputed one; don't 400. A Costings change between customise and checkout is legitimate.
- **Stripe line.** The value passed to `lib/stripe/checkout.ts` (unit amount or delta) must come from the recomputed price, so the catalog-Price shortcut can only fire when the recomputed delta really is 0 for the matching Variant.
- **Stock.** Sum `quantity` by `variant_id` across standard lines before comparing with `variant_stock`.

## Acceptance criteria

- [ ] vitest (checkout route): a pillow customisation posted with an accessory `variant_id` returns 400, and no Order row or Stripe session is created. Fails on today's code.
- [ ] vitest: a pillow customisation posted with a Variant of a *different* pillow product returns 400.
- [ ] vitest: with a matching Variant, the Stripe line amount equals the composed subtotal, even when the config's stored `total_addon_price` was tampered with in the DB.
- [ ] vitest: two lines of the same Variant, each quantity 3 against stock 5, return 400.
- [ ] An honest customised checkout on preview still reaches Stripe with the same total the configurator showed.
