# Slice 07 — Money ledger + partial/idempotent refunds + disputes

Type: AFK
Parent: PRD `money-flow-traceability` (`.claude/PRD/money-flow-traceability-prd.md`)
User stories covered: 20, 21, 22, 23, 26, 27

## What to build

Replace single-status money state with an append-only money ledger and make all monetary webhook handling precise and idempotent.

- Migration: `order_payments` (append-only: `type` charge/refund/dispute_hold/dispute_loss/dispute_won/fee/adjustment, signed `amount`, unique `stripe_object_id`); `orders.amount_captured`, `orders.amount_refunded`, `order_status` += `partially_refunded`; `order_items.returned_quantity`.
- `money-ledger` module: write ledger rows idempotently (unique `stripe_object_id`), compute net paid, derive money state.
- Rework webhook: `charge.refunded` becomes partial-aware (status `partially_refunded` unless fully refunded) and idempotent; reverse coupon usage and customer stats only on full refund; do NOT auto-restock. Add `charge.dispute.closed` (won/lost + dispute fee) and `refund.failed` reconciliation.
- Oversold safety: when a paid order cannot be fulfilled from stock, set a `needs_attention` flag + loud timeline event + dead-letter.

## Acceptance criteria

- [ ] A partial refund records a `refund` ledger row, sets `amount_refunded`, and status `partially_refunded` (not `refunded`).
- [ ] A full refund sets status `refunded` and reverses coupon usage + customer stats.
- [ ] A re-delivered refund/dispute event is a no-op (idempotent on `stripe_object_id`); no double-count of money or stock.
- [ ] Refunds never auto-restock inventory.
- [ ] `charge.dispute.closed` records won/lost outcome and the dispute fee; `refund.failed` is reconciled/flagged.
- [ ] Oversold paid order sets `needs_attention` + emits an alert/timeline event.
- [ ] Net ledger sum reconciles to `total - amount_refunded`.
- [ ] `money-ledger` test covers partial-refund status, idempotent duplicate event, and ledger-sum reconciliation.

## Blocked by

- Slice 06 (discount + Stripe Tax) - order totals must be Stripe-authoritative before the ledger reconciles against them.
