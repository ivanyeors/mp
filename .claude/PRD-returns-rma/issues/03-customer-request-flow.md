# Slice 03 — Customer request flow (+ received email, RMA email ledger)

Type: AFK
Parent: PRD `returns-rma` (`.claude/PRD-returns-rma/returns-rma-prd.md`) · GitHub #41
Triage: needs-triage
Covers: Child task 2, 4 (first email); Acceptance "request for an eligible order item", "explain why", "submitted email"

## What to build

End-to-end customer path: from the account order detail page, a signed-in
customer requests a return on eligible items and receives a confirmation email.

- Order-detail UI (`app/[lang]/account/...`): each eligible `order_item` shows **Request a return**; ineligible items show the reason from `evaluateEligibility` (slice 02). Support entry point is a secondary link into the same flow (primary = account order detail).
- Request form: pick items + quantity, resolution type (`refund`/`exchange`/`replacement`), reason, customer note, optional photo URLs.
- API route (service role): re-checks eligibility server-side, creates `rma_requests` + `rma_request_items`, writes the initial `rma_status_events` row (`system` → `requested`), returns the new RMA.
- **RMA email ledger + renderer:** add the RMA template set to `lib/email` (mirroring `order_emails`/`dispatchOrderEmail` but keyed on `rma_request_id`); dispatch the **"request received"** email on create.

## Acceptance criteria

- [ ] A signed-in customer can submit an RMA for one or more eligible items on a delivered order
- [ ] Ineligible items render the specific reason and offer no request affordance
- [ ] Server re-validates eligibility (never trusts the client) before insert
- [ ] Exactly one "request received" email is sent per RMA (idempotent ledger); duplicate submits/retries don't double-send
- [ ] A customer cannot create an RMA against another customer's order (RLS + server check)

## Blocked by

- Slice 02
