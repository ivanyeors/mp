# PRD: End-to-End Money-Flow Traceability

Status: Draft (needs-triage)
Source: Plan `money-flow-traceability` (`.cursor/plans/money-flow-traceability_6a6a8e86.plan.md`)

## Problem Statement

Our settings platform has six silos — inventory, costings, products, orders, discounts, shipping — that do not talk to each other, so money "leaks" between them and cannot be traced end to end:

- I set a product's MSRP in Costings, but the storefront sell price is a separate number I have to type again (it defaults to $0), so pricing lives in two places and drifts.
- When a customer uses a percentage/fixed discount code, our database records the discounted total but Stripe charges the full pre-discount amount — customers are overcharged and the order record does not match what was actually paid.
- I cannot see the real profit on an order, because the part cost never flows from the bill of materials (BOM) to the variant or onto the order line, so there is no cost-to-sale margin anywhere.
- Currency is inconsistent (USD in costings, SGD/MYR in the storefront), so totals and reports are untrustworthy.
- Refunds are crude: a partial refund marks the whole order refunded and restocks everything, a re-delivered refund event double-restocks, and refunding never reverses coupon usage or customer lifetime value. There is no way to issue a refund from our own platform, and disputes are only flagged, never resolved.
- The storefront only half-blocks out-of-stock buying: the product page reads a stale stock column while only checkout knows true buildable stock, the cart has no quantity caps, and bolster stock is not tracked at all.
- The settings sidebar groups interim Shopify tooling with core inventory and buries the workflow, slowing daily operations.

## Solution

Make the six silos one connected, traceable money pipeline:

`part cost -> BOM -> product cost -> MSRP (single source) -> storefront price -> cart -> discount -> shipping -> tax -> Stripe charge == order total -> realized margin`

From the user's perspective:

- I set price in exactly one place (Costings MSRP); the storefront price and the Stripe price follow automatically and cannot be edited by hand.
- Every order's Stripe charge equals the order total in our database, including discounts and tax, and I can reconcile them.
- Tax is computed and filed correctly by Stripe Tax (SG GST), not hand-rolled.
- Each order shows its cost, revenue, discount, shipping, tax, and realized margin; analytics reflect real sold margin, net of refunds.
- Refunds and cancellations are precise: partial refunds are tracked as amounts, nothing double-restocks, coupon usage and customer stats reverse on full refund, and I can issue a refund from the order screen. Restocking stays a deliberate manual action that I can link to the refund that caused it.
- Out-of-stock items cannot be added to the cart or bought anywhere, and a "product" correctly reflects the buildable quantity of its multi-part BOM.
- The settings sidebar matches our actual workflow, and interim Shopify tooling lives in its own Integration section.

## User Stories

1. As a store operator, I want all prices, orders, shipping, and discounts to use a single currency (SGD), so that totals and reports are trustworthy.
2. As a store operator, I want existing USD/MYR figures migrated to SGD, so that historical data is consistent after the change.
3. As a finance user, I want money amounts formatted with one currency helper, so that the UI never shows the wrong symbol (e.g. RM or USD).
4. As a product manager, I want to set a product's MSRP once in Costings, so that I do not maintain price in two places.
5. As a product manager, I want the storefront variant price to be derived from MSRP automatically, so that the price a customer sees always matches the costed price.
6. As a product manager, I want the storefront price field to be read-only, so that no one can accidentally diverge it from MSRP.
7. As a product manager, I want editing MSRP to immediately update the storefront price and the Stripe price, so that a single save propagates everywhere.
8. As a product manager, I want each storefront variant to map unambiguously to its costing source (including premium pillow fabric variants), so that the right MSRP is applied.
9. As a product manager, I want any variant that cannot resolve a price source to be flagged, so that I never accidentally sell something at $0.
10. As a customer, I want a discount code to actually reduce what Stripe charges me, so that I pay the advertised price.
11. As a finance user, I want the Stripe charge to equal the order total in our database, so that I can reconcile payments.
12. As a finance user, I want tax computed by Stripe Tax for SG GST, so that tax is correct and filable.
13. As a finance user, I want the final tax and total written back from the completed Stripe session, so that the order reflects exactly what was charged.
14. As a customer, I want tax computed on the discounted amount, so that I am taxed fairly.
15. As a finance user, I want a reconciliation guard that flags any order whose Stripe total does not match our total, so that mismatches never pass silently.
16. As a finance user, I want each order line to store the cost of goods at order time, so that margin is frozen and accurate even if costs change later.
17. As a finance user, I want each order to show revenue, cost, discount, shipping, tax, and gross margin, so that I can judge profitability per order.
18. As an analyst, I want analytics to reflect realized sold margin net of refunds, so that profit reporting is not overstated.
19. As a support agent, I want to issue a full or partial refund from the order screen, so that I do not need the Stripe dashboard.
20. As a support agent, I want a partial refund to be recorded as an amount and set the order to partially refunded, so that the order is not wrongly marked fully refunded.
21. As a finance user, I want every payment, refund, dispute, and fee recorded in an append-only money ledger, so that an order's net money is fully traceable.
22. As a finance user, I want refund handling to be idempotent, so that a re-delivered Stripe event never double-counts money or stock.
23. As a finance user, I want coupon usage and customer lifetime value to reverse on a full refund, so that reporting and coupon limits stay accurate.
24. As an operator, I want refunds to never auto-restock inventory, so that goodwill or partial refunds do not inflate stock.
25. As an operator, I want to manually restock returned goods and link that restock to the refund that caused it, so that money movement and goods movement are both traceable and reconcilable.
26. As a finance user, I want disputes (chargebacks) to be resolved on close (won/lost) with the dispute amount and fee recorded, so that lost revenue is accounted for.
27. As an operator, I want an alert when a paid order cannot be fulfilled from stock (oversold), so that I can refund or reconcile instead of silently overselling.
28. As a customer, I want out-of-stock items to be unbuyable on the product page, so that I am not misled.
29. As a customer, I want the product grid and variant selector to show and enforce true availability, so that sold-out options are clearly blocked.
30. As a customer, I want the cart to cap quantities at available stock, so that I cannot order more than exists.
31. As an operator, I want a product's availability to reflect the buildable quantity of its multi-part BOM, so that composed products show correct stock.
32. As an operator, I want bolster availability tracked via its BOM (bolster buildable), so that bolsters are not effectively untracked.
33. As a customer customizing a pillow/bolster, I want out-of-stock components disabled, so that I cannot configure something that cannot be made.
34. As a customer, I want a coupon validated when I apply it in the cart, so that I see the real discount before checkout.
35. As a store operator, I want per-customer coupon limits enforced, so that codes are not abused.
36. As a store operator, I want to scope a coupon to specific products/categories in the discount editor, so that promotions are targeted.
37. As a store operator, I want shipping methods filtered to active ones on the storefront, so that inactive methods never appear.
38. As a customer, I want the free-shipping progress bar to reflect the real method threshold, so that the incentive shown is accurate.
39. As a store operator, I want the orders dashboard and order detail to show correct revenue, totals, and item counts, so that I can trust the screens.
40. As a staff user, I want the settings sidebar ordered to match our workflow (Inventory below General, then Store, Landing Site, Insights, Integration), so that I navigate faster.
41. As a staff user, I want interim Shopify tooling in its own Integration section, so that it is clearly separated from core backend.
42. As a staff user, I want Categories managed inside the Products page, so that I manage labels where I manage products.
43. As a staff user, I want to tag a result to a customer and an order to a result where they exist, so that I can trace a sale through customization and fulfillment.
44. As a developer, I want Stripe API usage on the latest version and using the right API per action, so that the integration is correct and future-proof.

## Implementation Decisions

Modules to build or modify (favoring deep, isolated, testable modules):

- Currency: a `formatCurrency` helper as the single money-formatting interface; a migration setting SGD defaults and migrating existing rows across `item_prices`, `product_prices`, `product_variants`, `shipping_methods`, `coupons`, and legacy Shopify overrides. Decision: treat the migration as a relabel to SGD unless the user confirms stored USD values need a one-time FX multiply.
- Price source of truth (deep module `price-sync`): MSRP is authoritative. `product_variants.price` becomes a materialized mirror of the costing MSRP and `cost_price` a mirror of computed BOM cost. A new `price_key` column on `product_variants` provides an unambiguous link to the costing source (resolving the premium linen/fibrecool ambiguity); resolution order is `price_key` then `item_id` (item MSRP) then `pillow_product_id`. The Costings save triggers the sync, which then calls the existing Stripe sync. The storefront price field becomes read-only and the variant API rejects client-sent prices. Variants with no resolvable costing source are flagged.
- Stripe Tax + discount (modify checkout/sync/webhook): the discount is applied as a per-checkout Stripe `amount_off` coupon on the session; `automatic_tax` is enabled; the hand-rolled tax line item is removed; Stripe Prices carry `tax_behavior` (exclusive for SG GST) and Stripe Products carry a tax code; the customer address required for tax is provided. Final `tax_amount` and `total` are written back from the completed session (`total_details.amount_tax`, `amount_total`). `tax_rates` is demoted to an optional pre-checkout estimate. Ops prerequisite: enable Stripe Tax and add the SG GST registration in the Dashboard.
- Money ledger (deep module `money-ledger`): an append-only `order_payments` table (`type` of charge/refund/dispute_hold/dispute_loss/dispute_won/fee/adjustment, signed `amount`, unique `stripe_object_id` for idempotency). `orders` gains `amount_captured`, `amount_refunded`, and a `partially_refunded` status; `order_items` gains `returned_quantity`. Net paid is the ledger sum and reconciles to `total - amount_refunded`. Order money state is derived from the ledger rather than encoded only in `status`.
- Refund/cancellation/dispute handling (modify webhook + new admin routes): refund handling becomes partial-aware and idempotent (keyed on the Stripe refund id); status becomes `partially_refunded` unless fully refunded; coupon usage and customer stats reverse only on full refund; disputes resolve on `dispute.closed` (won/lost + fee); `refund.failed` is reconciled. Admin-initiated refund route calls `stripe.refunds.create` with an idempotency key and lets the webhook write the ledger row (single source of truth). Cancelling a paid order issues a full refund; cancelling an unpaid order marks it cancelled with no money moved.
- Restock linkage (reuse existing manual restock): restock stays manual (`receiveStock`); it gains an optional refund/order reference recorded in the inventory transaction metadata and bumps `order_items.returned_quantity`. Surfaced as an order-detail "Restock returned items" action and an optional "link to refund/return" selector on the inventory receive screen. Refunds never auto-restock.
- Realized margin (deep module / view): `order_items` gains `unit_cost`/`total_cost` snapshots written at checkout (variant cost plus customization BOM cost). An `order_margins` view computes per-order revenue, COGS, discount, shipping, tax, gross margin, and margin %, netting refunds/dispute losses and counting COGS returns only for physically restocked goods. Order detail, dashboard, and analytics consume the view.
- Stock truth (deep module `stock` + view change): `variant_stock` is the single live availability source. Storefront loaders join it and expose `stock_available`; all storefront gating switches to `stock_available` (dropping the `stock_quantity` fallback) and disables (not just styles) out-of-stock options. `variant_stock` is extended so bolster variants resolve through `bolster_buildable`. The cart caps quantities to available stock and re-validates before checkout. The customizer disables out-of-stock cover/case options. Checkout server validation remains the final authority.
- Discounts/shipping hardening: enforce `per_customer_limit` via customer order history; expose `applies_to` (product/category scoping) in the discount editor; validate the coupon when applied in the cart; add the missing `increment_coupon_usage` RPC or use the manual update path; filter shipping by `is_active` on the public list; fix the checkout client to read the `{ rows }` shape; drive the free-shipping bar from the method's `free_above`; fix orders dashboard/detail key and shape bugs.
- Settings navigation (config module): reorder `NAV_GROUPS` to Settings, Inventory, Store, Landing Site, Insights, Integration; flatten Store and Inventory entries; move Shopify Admin into a new Integration section and its route to `/settings/integrations/shopify` with a redirect (reusing the `inventory` permission); merge Categories into the Products page with a redirect from `/settings/categories`; surface result->customer and order->result tagging where the relationships exist.
- Stripe API correctness: bump the pinned API version to the latest (`2026-05-27.dahlia`); use `stripe.refunds.create` with idempotency keys; keep `payment_method_types` omitted (dynamic payment methods); use Checkout Sessions for one-time payments; recommend a restricted API key.

Schema changes (summary):

- SGD currency defaults + data migration across price/order/shipping/coupon tables.
- `product_variants.price_key`.
- `order_payments` ledger table; `orders.amount_captured`, `orders.amount_refunded`, `order_status` += `partially_refunded`; `order_items.returned_quantity`.
- `order_items.unit_cost`, `order_items.total_cost`; `order_margins` view.
- `variant_stock` view extended for bolster buildable.
- `increment_coupon_usage` RPC (if chosen).

API contracts (summary):

- Variant create/update endpoints ignore client `price` (derived only).
- New admin `POST /orders/[id]/refund` (full/partial) and order cancel behavior; restock action accepts an optional refund reference.
- Public product list/detail payloads include `stock_available`.
- Checkout returns unchanged shape; webhook writes back tax/total and ledger rows.

## Testing Decisions

What makes a good test here: assert external, observable behavior (inputs/outputs and persisted effects), not internal implementation. Prefer small, framework-light tests consistent with the existing `lib/stripe/__tests__/checkout.test.ts` and `lib/stripe/__tests__/sync.test.ts`.

Modules to test:

- `price-sync`: given costing MSRP/cost and a variant link (`price_key`/`item_id`/`pillow_product_id`), it resolves the correct price and cost, including premium fabric variants; unresolvable variants are reported.
- `money-ledger`: a partial refund yields `partially_refunded` and the correct `amount_refunded`; a duplicate refund event is a no-op (idempotent on `stripe_object_id`); the ledger sum reconciles to `total - amount_refunded`; full refund reverses coupon usage and customer stats.
- Checkout/Stripe reconciliation: for a discounted, taxed order the asserted `session.amount_total` equals the persisted order total after write-back.
- `stock`: `variant_stock` resolves pillow buildable, bolster buildable, item on-hand, and the `track_inventory=false` infinite case.
- Discounts: `per_customer_limit` is enforced against prior orders; `applies_to` scoping validates correctly.

Prior art: `lib/stripe/__tests__/checkout.test.ts`, `lib/stripe/__tests__/sync.test.ts`.

The user should confirm which of these modules they want test coverage for; the recommendation is at minimum `price-sync`, `money-ledger`, and the Stripe reconciliation check, since those guard real money.

## Out of Scope

- Multi-currency storefront / live FX conversion (we unify on SGD instead).
- Carrier-rate shipping integrations (Shippo etc.), weight/zone-tiered shipping.
- Reserving stock at add-to-cart (we cap/validate, not hold); a full reservation system is a later upgrade.
- Subscriptions/recurring billing, Connect/marketplace, Treasury.
- Replacing the Shopify channel; this work only separates it in the nav and keeps existing sync.
- Background retry queue for Stripe sync (remains best-effort/synchronous).

## Further Notes

- Ops prerequisite for Stripe Tax: enable Stripe Tax and add the SG GST registration in the Stripe Dashboard before shipping the tax phase, or `automatic_tax` returns 0.
- Recommended build order: nav reorg and Stripe version bump (quick, low-risk) first, then currency, price source, stock truth, discount+tax, money ledger, realized margin, then discounts/shipping hardening.
- Key behavior change to communicate to staff: refunds no longer auto-restock; restocking is a deliberate action linked to the refund.
