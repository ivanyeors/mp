# Slice 10 — Order build snapshot + fulfill wiring

Type: AFK
Parent: PRD `template-linked-customisation` (`.claude/PRD-template-linked-customisation/template-linked-customisation-prd.md`)
User stories covered: 33, 34

## What to build

Production-facing Order detail for customised builds, using existing fulfill capabilities.

- Order (and order items) store/show full build snapshot: composed sellable, Filling Template lines, preferences, add-ons, quantities.
- Operator order UI shows snapshot clearly for physical making.
- Fulfill action: tracking number, tracking URL, customer shipping email, mark shipped/fulfilled (reuse existing fulfill route/UI).
- Ensure customised Orders from slice 07 appear in the orders list for processing.

## Acceptance criteria

- [x] Captured customised Order detail shows complete build snapshot for production.
- [x] Operator can add tracking number/URL, send shipping notification, and mark fulfilled.
- [x] Customer receives shipping email when fulfilled (existing template path).
- [x] No regression for non-customised accessory orders fulfill.

## Status

**Done** on `cursor/order-build-snapshot-fulfill`.

- `lib/results/order-build-snapshot` — named build lines frozen at Accept (composed, Filling Template, prefs, add-ons)
- Accept writes production snapshot with item names + Filling Template name
- Operator order detail: **Build snapshot** card (Result path) + legacy cart customization unchanged
- Fulfill: existing `POST /api/shop/orders/[id]/fulfill` (tracking, ship email, shipped status) — works for Result and accessory orders
- Tests: `lib/results/__tests__/order-build-snapshot.test.ts`

## Blocked by

- Slice 07 (Orders created from Accept)
