# Slice 06 — Resolution outcomes (refund / exchange / replacement + email)

Type: AFK
Parent: PRD `returns-rma` (`.claude/PRD-returns-rma/returns-rma-prd.md`) · GitHub #41
Triage: needs-triage
Covers: Child task 5, 6; Acceptance "completed emails", "existing refund behavior unchanged"

## What to build

Close the loop: mark the returned goods received and apply the resolution,
reusing the existing refund machinery.

- On **received**, staff apply the resolution:
  - `refund` → call the existing `refundPayment` + money-ledger flow (NO new refund path); the RMA moves to `refunded` when the refund settles.
  - `exchange` / `replacement` → capture tracking/reference fields, mark `completed`.
- Final lifecycle email: **completed** / **refunded** (idempotent, RMA-keyed).
- Every outcome transition is validated (`canTransition`), appends a status event, and is audit-logged.

## Acceptance criteria

- [ ] Approved refund routes entirely through the existing `refundPayment` + money-ledger webhook (verified: no duplicate/second refund path)
- [ ] Exchange/replacement store tracking/reference and reach `completed`
- [ ] Exactly one `completed`/`refunded` email per RMA
- [ ] Outcome transitions are audit-logged; existing order/refund behavior outside RMA is unchanged

## Blocked by

- Slice 05
