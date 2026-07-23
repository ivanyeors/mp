# Slice 07 — Staging E2E QA sign-off

Type: HITL — manual end-to-end verification + sign-off on staging
Parent: PRD `returns-rma` (`.claude/PRD-returns-rma/returns-rma-prd.md`) · GitHub #41
Triage: needs-triage
Covers: All acceptance criteria (end-to-end)

## What to build

Verify the full Returns/RMA loop on staging across all three resolution types
and record sign-off. No new feature code — QA + fixes only.

## Acceptance criteria

- [ ] Customer submits an RMA on an eligible delivered order; ineligible order clearly explains why
- [ ] `refund` path: approve → instructions → received → refund settles via existing flow → `refunded` email received
- [ ] `exchange` and `replacement` paths: reach `completed` with tracking captured → `completed` email received
- [ ] Reject path: customer receives rejection email with reason
- [ ] Every admin mutation appears in the audit log
- [ ] No duplicate emails across retries; existing order/refund/email flows unaffected
- [ ] Sign-off recorded

## Blocked by

- Slice 03
- Slice 05
- Slice 06
