# Slice 06 — Fix discount leak + adopt Stripe Tax

Type: HITL (requires Stripe Dashboard: enable Stripe Tax + add SG GST registration; confirm tax_behavior + address collection)
Parent: PRD `money-flow-traceability` (`.claude/PRD/money-flow-traceability-prd.md`)
User stories covered: 10, 11, 12, 13, 14, 15

## What to build

Make Stripe the authority for what the customer pays: the discount actually reduces the Stripe charge, tax is computed by Stripe Tax (SG GST), and our DB totals are reconciled from the completed session.

- Apply the order discount as a per-checkout Stripe `amount_off` coupon on the session; free-shipping coupons keep zeroing the shipping rate.
- Enable `automatic_tax`; remove the hand-rolled exclusive-tax line item; set `tax_behavior` on Stripe Prices and a tax code on Stripe Products; provide the customer address Stripe needs.
- Write back `tax_amount` and `total` (and discount) from the completed session; demote `tax_rates` to an optional estimate.
- Add a webhook reconciliation guard: flag/dead-letter any order whose `session.amount_total` != persisted total.

## Acceptance criteria

- [ ] A percentage/fixed coupon reduces the Stripe-charged amount (Stripe total reflects the discount).
- [ ] Tax is computed by Stripe Tax on the post-discount amount; no manual tax line item remains.
- [ ] Stripe Prices carry the correct `tax_behavior`; Stripe Products carry a tax code.
- [ ] On completion, `orders.tax_amount` and `orders.total` equal the session's `amount_tax`/`amount_total`.
- [ ] Reconciliation guard flags mismatches instead of silently confirming.
- [ ] A test asserts that for a discounted, taxed order the asserted Stripe total equals the persisted order total.
- [ ] (Ops) Stripe Tax enabled and SG GST registration added in the Dashboard.

## Blocked by

- Slice 03 (currency unify).
- Slice 02 (Stripe API version) recommended first.
