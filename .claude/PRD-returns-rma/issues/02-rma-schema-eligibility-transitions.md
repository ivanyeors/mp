# Slice 02 — RMA schema + eligibility & transition core

Type: AFK
Parent: PRD `returns-rma` (`.claude/PRD-returns-rma/returns-rma-prd.md`) · GitHub #41
Triage: needs-triage
Covers: Child task 1, 6; Acceptance "eligible order item", "explain why"

## What to build

The persistence layer and the two pure functions everything else depends on.
Demoable via tests — no UI yet.

- **Migration:**
  - `rma_requests` (id, order_id → orders, customer_id → customers, resolution_type enum `refund|exchange|replacement`, status enum, customer_note, photos `jsonb default '[]'`, tracking/reference fields for exchange/replacement, timestamps).
  - `rma_request_items` (id, rma_request_id, order_item_id → order_items, quantity, reason).
  - `rma_status_events` (id, rma_request_id, from_status, to_status, actor_kind `customer|staff|system`, actor_id, note, created_at) — append-only timeline.
  - `rma_emails` idempotency ledger: unique `(rma_request_id, template)`, mirrors `order_emails`.
  - RLS: customers read their own RMA rows via `current_customer_id()`; `service_role` full access.
  - Seed `site_settings.rma_return_window_days = 30`.
- **`lib/rma/eligibility.ts`** — pure `evaluateEligibility(order, items, settings, existingRmas) → { eligible, reasons[] }` implementing the ADR eligibility inputs.
- **`lib/rma/transitions.ts`** — pure state machine: `canTransition(from, to)` + `nextStatuses(from)` matching the ADR diagram.

## Acceptance criteria

- [ ] Migration creates all tables/enums with RLS; `pnpm` typegen (if used) reflects new tables
- [ ] `evaluateEligibility` returns machine-readable reasons for each ineligibility case (out of window, wrong status, non-returnable product, already open RMA)
- [ ] `canTransition` rejects every move not in the ADR state machine; vitest covers all edges + a representative sample of illegal moves
- [ ] Existing orders/refund/email behavior untouched (additive migration only)

## Blocked by

- Slice 01 (ADR sign-off)
