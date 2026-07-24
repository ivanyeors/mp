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

## Runbook (turnkey — slices 01–06 built + unit-proven; this is live verification)

Preconditions: migration `20260723120000` + `20260723130000` applied to the target
DB; Stripe webhooks pointed at `/api/stripe/webhook`; a delivered test order.

1. **Refund path** — as customer, request a return (resolution `refund`) on a
   delivered order item → expect one "request received" email + a `requested`
   RMA in `/settings/rma`. As staff: Approve → Send instructions → Mark received
   → Issue refund. Confirm: Stripe shows ONE refund; the `charge.refunded`
   webhook writes the money-ledger row (existing behavior); the RMA flips to
   `refunded`; a `refunded` email arrives; `admin_audit_log` has rma.approved /
   instructions_sent / received / refund_initiated + the webhook rma.refunded.
2. **Exchange path** — resolution `exchange`: Approve → instructions → received →
   Complete return with tracking → RMA `completed`, `completed` email, tracking
   stored, audit rows present.
3. **Replacement path** — same as exchange with resolution `replacement`.
4. **Reject path** — Reject with a reason on a fresh `requested` RMA → `rejected`
   email with the reason; reason visible in the timeline.
5. **Eligibility** — ineligible item (undelivered / past window / already
   returned) shows its specific reason and NO request affordance.
6. **Idempotency** — re-trigger each action / redeliver the webhook → no
   duplicate emails, no second refund.
7. **RBAC** — a role without `orders` permission cannot reach `/settings/rma`.

## Blocked by

- Slice 03 · Slice 05 · Slice 06 — all ✅ built & unit-proven (160 tests green)
- **Now blocked only on:** schema applied to a live DB + staging env for manual E2E
