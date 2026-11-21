# Known issues

Confirmed defects that are deliberately **not** fixed yet, with enough detail to
act on without re-deriving them. An entry leaves here by being fixed or by
becoming a PRD under `.claude/`.

---

## The pillow half of the shopper x-ray never returns a Filling Template

**Where:** `lib/shop/customization-llm.ts` → `getBomTemplates(kind, size)`
**Callers:** `app/api/shop/customize/route.ts` (pillow branch),
`app/api/mp-basic/recommend/route.ts`
**Status:** open, pre-existing (predates ADR 0018), owner: Ivan

`getBomTemplates` filters `.eq("kind", "pillow").eq("key", size).eq("pillow_kind", kind)`
with `kind ∈ {basic, premium}`. A **Filling Template** always has
`pillow_kind = null` — set explicitly at
`app/[lang]/settings/inventory/configure/templates/route.ts` and
`configure/unpromoted/route.ts`, because Filling Templates carry no **Tier**
(CONTEXT.md). So that predicate can never match one, and the query returns
**warehouse** templates instead.

Both callers then read `filling_template_placements` for the returned ids, to
render the recommended mix in the shopper's read-only x-ray. Placements exist
only for `role = 'filling'` rows (`20260724000000_backfill_filling_placements.sql`),
so the join returns nothing and the pillow x-ray renders empty.

Two readings, unresolved:

1. **Dead code.** The pillow x-ray was never wired up, and the `pillow_kind`
   filter is a leftover from when this read warehouse BOMs.
2. **A real bug.** It is meant to read Filling Templates, in which case it also
   needs the ADR 0018 treatment — scope by **Size membership**
   (`templateIdsForKey`), not by `key`, or a recipe shared across sizes shows on
   its primary size only.

The bolster half of the same endpoint (`app/api/shop/customize/route.ts`, the
`role = 'filling'` query) does exactly what reading (2) describes, which makes
(2) the more likely intent — but the pillow branch has no equivalent, so this is
a product call, not a mechanical fix.

**If you fix it:** drop `.eq("pillow_kind", kind)`, add `.eq("role", "filling")`,
and scope by membership via `templateIdsForKey` from
`lib/filling-templates/membership.ts`. Add the call site to the reader list in
`lib/filling-templates/membership.check.ts` so it cannot regress.

---

## A sale through a product's Stripe payment link makes no Order

**Where:** `app/api/stripe/webhook/route.ts` (`if (!orderId) break;` in
`checkout.session.completed`); the link is made by `createPaymentLink` in
`lib/stripe/sync.ts`
**Status:** open, pre-existing, found 2026-11-21 in the money review of the payment-link
fix; confirmed by reading, not reproduced against Stripe. A product call

The product editor makes a `buy.stripe.com` link per product. Its sessions carry
`supabase_product_id` in metadata but no `order_id`, so the webhook stops at the line
above. Stripe takes the money, and no Order is made, no stock is deducted and no
receipt is sent. ADR 0048 rejected Stripe Payment Links for Staff orders for the same
kind of reason (the link lives where our stock check cannot reach it).

**If you fix it:** either retire product payment links (the product editor, the two
`stripe_payment_link*` column pairs and `createPaymentLink`), or have the webhook build
an Order from such a session the way checkout does. Until then, do not share a
product's link.

## A refunded return frees its lines to be returned and refunded again

**Where:** `lib/rma/create.ts` → `openReturnedQtyByOrder`
**Status:** open, pre-existing, found 2026-11-21 in the money review of the RMA refund
fix; confirmed by reading

The quantity already being returned skips returns in a terminal status, `refunded`
and `completed` included. Once a return of a line is refunded, the same line can be
returned and refunded again. Only the Order's refundable balance stops it, so a
customer who kept another line can be refunded for one line twice.
`rma_request_items` also has no unique constraint on
(`rma_request_id`, `order_item_id`).

**If you fix it:** count `refunded` against the line (and decide whether `completed`,
an exchange or replacement, should count), with a test that a second return of a
refunded line is refused.

## An RMA refund on a topped-up Result Order goes to the first intent only

**Where:** `app/[lang]/settings/rma/actions.ts` → `issueRmaRefund`
**Status:** open, pre-existing, found 2026-11-21 in the money review of the RMA refund
fix, by reading

A Result topped up past its hold is paid on two PaymentIntents (ADR 0016). ADR 0038
fixed the staff refund for this. The RMA refund still sends the whole amount to
`orders.payment_reference`, which cannot refund more than the hold took.

**If you fix it:** route it through the same split the staff refund uses
(`lib/ecommerce/admin-refund.ts`, ADR 0038).

## A return that is refunded at list price where the paid share is unknown

**Where:** `lib/rma/refund.ts` → `rmaRefundAmount` (the `ponytail:` fallback);
`lib/ecommerce/admin-refund.ts` → *Choose items*
**Status:** open, narrowed 2026-11-21. A return on a plain shop Order now refunds each
line's share of what was paid (`CONTEXT.md`, **Resolution**)

The Order does not record which lines its money off came from, and keeps no copy of its
coupon's terms. So:

- a return on a partner self-purchase Order, a Result Order, an Order whose code was
  scoped to products or categories or has since been deleted, or a code on an Order
  with service lines, refunds the list price, as before: more than was paid for a
  discounted line;
- a code whose scope Staff widened after the Order reads as Order-wide, and a return can
  get less than the line cost. `coupons.updated_at` cannot tell, because every
  redemption moves it;
- Staff *Choose items* spreads `total − shipping` by list price on all of these shapes,
  so on a scoped coupon it can refund an undiscounted line less than it cost.

**If you fix it:** store each line's discount on `order_items` at checkout (and the
code's terms on the Order); then every refund is the exact paid share and both
fallbacks go.

## A Costings save on localhost changes the live price without the live Stripe Price

**Where:** `lib/shop/price-sync.ts` → `syncVariantPricesFromCostings`; `lib/stripe/mode.ts`
**Status:** open, pre-existing, found 2026-11-21 in the money review of the Costings
fix, by reading

Localhost and Vercel share one database. A Costings save writes the shared
`product_variants.price` and syncs only the current mode's Price (`stripe_price_id_test`
on localhost). The live Price keeps the old amount, with no warning, so on the live
site the customer is charged the old amount, the webhook records `total_mismatch` and
the paid Order is not confirmed, until someone runs Resync prices on the live site.

**If you fix it:** refuse price-changing saves from the sandbox, or warn that the live
site needs Resync prices.

## Price changes from Inventory, and taking a Variant off sale, do not reach Stripe

**Where:** `app/[lang]/settings/inventory/configure/save/route.ts`,
`configure/templates/apply/route.ts`, the item revive path in
`app/[lang]/settings/inventory/actions.ts`; `app/api/shop/products/[id]/route.ts` and
`[id]/variants/[variantId]/route.ts`
**Status:** open, pre-existing, found 2026-11-21 in the money reviews, by reading

- A BOM edit or a revived item changes what Costings resolves to for a Variant without
  repricing it; the next Sync from Inventory or Resync prices does.
- Deactivating a Variant, deleting one, or moving a product out of `active` runs no
  Stripe sync, so its Prices and payment link stay active in Stripe (and see the first
  entry for what a link sale does).

**If you fix it:** reprice after those Inventory writes, and sync (retiring the link)
when a Variant or product leaves sale.

## Smaller errors still lost on the Costings paths

**Status:** open, pre-existing, found 2026-11-21 in the money review of the Costings
fix, by reading

- `fetchProductSummaries` in the Costings save answers 500 when its read fails,
  although the Costings rows were saved.
- `syncPillowProducts` (`lib/ecommerce/inventory-sync.ts`) ignores a failed
  `pillow_products` read and a failed `status: draft` update on its restore path.
- A refund return whose amount works out to 0 (the Order already fully refunded)
  cannot be refunded and stays at `received`.
