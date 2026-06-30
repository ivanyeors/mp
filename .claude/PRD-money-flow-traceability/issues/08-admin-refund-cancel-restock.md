# Slice 08 — Admin refund/cancel + manual restock linked to refund

Type: AFK
Parent: PRD `money-flow-traceability` (`.claude/PRD/money-flow-traceability-prd.md`)
User stories covered: 19, 24, 25

## What to build

Let staff move money and reconcile goods from within the platform, building on the money ledger.

- Admin refund route: `POST /orders/[id]/refund` (full or partial) calls `stripe.refunds.create` with an idempotency key; the resulting webhook writes the ledger row (single source of truth, no double-write).
- Cancel behavior: cancelling a paid order issues a full refund (+ optional restock prompt); cancelling an unpaid order marks it cancelled with no money moved.
- Restock stays manual (reuse existing `receiveStock`) and gains an optional refund/order reference recorded in `inventory_transactions.metadata` and bumping `order_items.returned_quantity`. Surfaced as an order-detail "Restock returned items" action and an optional "link to refund/return" selector on the inventory receive screen.

## Acceptance criteria

- [ ] Staff can issue a full or partial refund from the order detail screen; the amount flows through Stripe and the ledger.
- [ ] Cancelling a paid order issues a full refund; cancelling an unpaid order moves no money.
- [ ] Restock is never automatic; it is a deliberate action.
- [ ] A restock can be linked to a refund/order; the link is stored in the inventory transaction metadata and increments `returned_quantity`.
- [ ] `returned_quantity` prevents restocking more than was sold/returned.
- [ ] Admin refund uses an idempotency key; double-clicks do not double-refund.

## Blocked by

- Slice 07 (money ledger) - refunds and restock linkage write to the ledger / returned_quantity.
