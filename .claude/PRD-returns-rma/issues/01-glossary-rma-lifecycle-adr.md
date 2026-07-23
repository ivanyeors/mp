# Slice 01 — Glossary + RMA lifecycle/model ADR

Type: HITL — architectural decision + sign-off on the RMA data model and state machine
Parent: PRD `returns-rma` (`.claude/PRD-returns-rma/returns-rma-prd.md`) · GitHub #41
Triage: needs-triage
Covers: Child task 1; Acceptance "agreed lifecycle"

## What to build

Add the RMA vocabulary to `CONTEXT.md` and write an ADR that fixes the model and
lifecycle so slices 02–06 build against a signed-off design.

- **Glossary terms:** RMA request, RMA item, Resolution type (`refund` / `exchange` / `replacement`), Return window, RMA status, RMA status event.
- **ADR decisions:**
  - Item-level model: `rma_requests` (one per customer submission, tied to an order) + `rma_request_items` (subset of `order_items`, with per-item qty + reason) + `rma_status_events` (append-only timeline).
  - Status state machine (proposed): `requested → approved | rejected | cancelled`; `approved → instructions_sent | cancelled`; `instructions_sent → received | cancelled`; `received → completed | refunded`. Terminal: `completed`, `refunded`, `rejected`, `cancelled`.
  - Resolution → outcome mapping: `refund` → existing `refundPayment` + money-ledger; `exchange`/`replacement` → store tracking/reference fields, mark `completed`.
  - Eligibility inputs: order paid + fulfillment status (delivered/shipped), `delivered_at` within a configurable **return window** (`site_settings.rma_return_window_days`, default 30), product type (custom/made-to-order Results may be non-returnable — configurable), and item not already in an open RMA.
  - Attachments: optional customer photos stored as a `jsonb` URL array on the request (not the media library).
  - Email idempotency keyed on **RMA request id + template** (parallel `rma_emails` ledger), not order+template — an order can have several RMA emails.

## Acceptance criteria

- [x] `CONTEXT.md` glossary updated with the RMA terms above — new `## Returns / RMA (ADR 0011)` section
- [x] ADR file added under `docs/adr/` — `docs/adr/0011-returns-rma-lifecycle.md`
- [x] State machine diagram (states + allowed transitions) included in the ADR
- [ ] Sign-off recorded (HITL) before slice 02 starts — awaiting user

## Blocked by

None — can start immediately.
