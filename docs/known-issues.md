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

## Refunding every line of an Order can come out a cent over or a cent under what it paid

**Where:** `lib/ecommerce/admin-refund.ts` → `lineRefundAmount` and `selectionRefundAmount`
**Callers:** `app/[lang]/settings/orders/[id]/refund-dialog.tsx` (the *Choose items* figure
and each line's share)
**Status:** open, found 2026-11-20 by the property tests, awaiting the owner's decision

ADR 0038 says each line refunds its share of the cash the Order took for goods
(`total − shipping`, spread by list price), "so … the whole Order adds up to what was
paid". `lineRefundAmount` rounds each line's share to the cent on its own, so ticking
every line and the shipping can differ from the Order total by up to half a cent per
line, in either direction. Both cases below were run through the real functions:

1. **Over by a cent.** Lines S$152.32, S$228.48 and S$76.16 (subtotal S$456.96), no
   shipping, a S$0.03 discount, so the Order paid S$456.93. The exact shares are
   152.3100…, 228.4650… and 76.1550…; rounded they are 152.31, 228.47 and 76.16, which
   is **S$456.94**.
2. **Under by a cent.** Three S$1.00 lines (subtotal S$3.00), no shipping, a S$0.02
   discount, so the Order paid S$2.98. Each exact share is 0.99333…, rounded 0.99, so
   every line is **S$2.97**.

What happens on each path:

- **Over:** the dialog caps the figure at `refundableAmount` and the refund route
  refuses an amount above it, so no money moves wrongly. Staff see a worked-out figure
  a cent higher than the refund that is sent.
- **Under:** nothing caps that direction. The dialog fills in S$2.97, the route accepts
  it as a partial refund, and the ledger reads `partially_refunded` with S$0.01 left.
  The full-refund effects in the `charge.refunded` webhook
  (`app/api/stripe/webhook/route.ts`, `nowFullyRefunded`) do not run: the shipping
  label is not cancelled, the partner commission is not voided, coupon usage and the
  customer's lifetime stats are not reversed.

`lib/ecommerce/__tests__/refunds.property.test.ts` ("choosing every line and the
shipping drifts from what the Order took by at most half a cent per line") pins the
drift at its current bound, `Math.floor(lines / 2)` cents.

**If you fix it:** give out the cents by largest remainder: work every line's exact
share in cents, floor them, then hand the cents still owed to the lines with the
largest remainders, so the shares sum exactly to `total − shipping`. A partial
selection reads its lines' allotted cents. Then set the tolerance in
`refunds.property.test.ts` to zero.
