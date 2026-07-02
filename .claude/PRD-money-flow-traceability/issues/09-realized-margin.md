# Slice 09 — Cost-to-sale traceability (realized margin)

Type: AFK
Parent: PRD `money-flow-traceability` (`.claude/PRD/money-flow-traceability-prd.md`)
User stories covered: 16, 17, 18

## What to build

Make per-order profit traceable by snapshotting cost at order time and exposing a refund-aware margin everywhere it matters.

- Migration: `order_items.unit_cost`, `order_items.total_cost`; `order_margins` view (per-order revenue, COGS, discount, shipping, tax, gross margin, margin %), netting refunds/dispute losses and counting COGS returns only for physically restocked goods.
- At checkout, snapshot `unit_cost` from the variant cost (plus customization BOM cost).
- Surface margin on the order detail page and orders dashboard; reuse the view in analytics so reporting reflects realized sold margin.

## Acceptance criteria

- [x] Each order line stores `unit_cost`/`total_cost` frozen at order time (unaffected by later cost changes).
- [x] Order detail shows revenue, cost, discount, shipping, tax, and gross margin/percentage.
- [x] `order_margins` nets refunds and dispute losses; returned-goods COGS only counts when physically restocked.
- [x] Analytics reflects realized sold margin (not just on-hand MSRP).
- [x] A customized order's COGS includes its customization BOM cost.

## Blocked by

- Slice 07 (money ledger) - margin must be refund-aware.
- Slice 04 (price source) - variant `cost_price` must be populated from BOM.
