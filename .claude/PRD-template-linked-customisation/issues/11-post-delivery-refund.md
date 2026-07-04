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

- [ ] No customer cancel/refund action succeeds between Accept and delivery (API returns error; UI has no cancel control).
- [ ] After shipped/delivered, customer can submit a refund request.
- [ ] Operator approval triggers Stripe refund; rejection leaves payment intact.
- [ ] Operator must acknowledge in-person return as part of approval.
- [ ] Reuses existing refund infrastructure when available; does not invent a second ledger.

## Blocked by

- Slice 10 (fulfilled Orders exist in the customised path)
