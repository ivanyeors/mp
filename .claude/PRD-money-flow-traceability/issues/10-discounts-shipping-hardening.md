# Slice 10 — Discounts & shipping hardening + order display fixes

Type: AFK
Parent: PRD `money-flow-traceability` (`.claude/PRD/money-flow-traceability-prd.md`)
User stories covered: 34, 35, 36, 37, 38, 39

## What to build

Close the remaining discount/shipping enforcement gaps and fix the order screens, end to end.

- Discounts: enforce `per_customer_limit` via customer order history; expose `applies_to` (product/category scoping) in the discount editor; validate the coupon when applied in the cart (show the real discount before checkout); add the missing `increment_coupon_usage` RPC or use the manual update path.
- Shipping: filter the public list to `is_active`; fix the checkout client to read the `{ rows }` shape; drive the free-shipping progress bar from the method's `free_above` instead of a hardcoded value.
- Orders display: fix dashboard revenue/avg-order-value keys, order-detail response shape, and item-count join.

## Acceptance criteria

- [x] A coupon past its `per_customer_limit` for a customer is rejected.
- [x] The discount editor can scope a coupon to products/categories, and that scoping is enforced.
- [x] Applying a coupon in the cart validates it and shows the real discount amount before checkout.
- [x] Coupon usage increments reliably (RPC or manual path).
- [x] The storefront shipping list shows only active methods; the checkout page lists them correctly (no empty list from the `{ rows }` shape).
- [x] The free-shipping bar reflects the selected method's `free_above`.
- [x] Orders dashboard shows correct revenue/avg order value; order detail loads correctly; item counts are accurate.

## Blocked by

- Slice 03 (currency unify) for correct amount display; otherwise independent.
