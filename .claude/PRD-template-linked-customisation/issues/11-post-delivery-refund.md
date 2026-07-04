# Slice 11 — Post-delivery refund request + operator approve

Type: AFK
Parent: PRD `template-linked-customisation` (`.claude/PRD-template-linked-customisation/template-linked-customisation-prd.md`)
User stories covered: 17, 18, 35

## What to build

Controlled refunds after delivery for customised Orders.

- Customer may request a refund only after delivery/shipped (not after Accept before ship).
- Policy: in-person return required (recorded as operator confirmation, not automated logistics).
- Operator approves refund request on platform → Stripe refund (reuse money-flow refund helpers / ledger if present).
- No auto-restock unless existing manual restock flow is used (align with money-flow PRD).
- Customer cannot cancel after Accept before delivery (enforce in UI and API) — reinforces slice 07.

## Acceptance criteria

- [x] No customer cancel/refund action succeeds between Accept and delivery (API returns error; UI has no cancel control).
- [x] After shipped/delivered, customer can submit a refund request.
- [x] Operator approval triggers Stripe refund; rejection leaves payment intact.
- [x] Operator must acknowledge in-person return as part of approval.
- [x] Reuses existing refund infrastructure when available; does not invent a second ledger.

## Status

**Done** on `cursor/post-delivery-refund`.

- `lib/results/post-delivery-refund` — policy gates (cancel deny, request after ship, approve needs return ack)
- Migration `0048_order_refund_request` — `refund_request_status` / note / timestamps on `orders`
- Customer: `POST /api/account/orders/[orderNumber]/cancel` (always 400 for Result path), `POST .../refund-request`
- Account order UI: no cancel; pre-delivery notice; request form after ship
- Operator: `POST /api/shop/orders/[id]/refund-request` approve/reject; approve calls `refundPayment` (ledger via webhook)
- Direct staff refund on Result orders blocked unless pending request + return ack; accessory refund/cancel unchanged
- Tests: `lib/results/__tests__/post-delivery-refund.test.ts`

## Blocked by

- Slice 10 (fulfilled Orders exist in the customised path)
