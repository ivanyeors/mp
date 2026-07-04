# Slice 13 — In-store measurement-only Results (no Stripe hold)

Type: AFK
Parent: PRD `template-linked-customisation` (`.claude/PRD-template-linked-customisation/template-linked-customisation-prd.md`)
User stories covered: 42, 24, 25, 26, 29, 30

## What to build

Walk-in / in-store measurement finalization creates a **Result without a Stripe authorization hold**, unless the customer explicitly continues into the online purchase/checkout path.

- In-store mp-config finalize (`is_final`, staff or by-user measurement) creates a review-only Result: no PaymentIntent, no authorized amount required.
- Telegram notify to ops with platform link (same notify-only pattern as online).
- Operator assigns on platform: confirm/override size×tier + required Filling Template (reuse slice 06 UI; works without payment intent per slice 04 lifecycle).
- Stock validated on assign.
- Customer is not prompted to Accept/capture for review-only Results.
- If the customer later starts the **online purchase** path for that visit, that path creates a **held** Result (or upgrades per implementer choice — prefer clear separate held Result linked to the measurement record) and follows slices 05–07.
- Must not force card authorization on pure in-store measurement.

## Acceptance criteria

- [x] Finalizing an in-store measurement creates a Result with no PaymentIntent and no card authorization.
- [x] Operators receive Telegram with a platform link for that Result.
- [x] Operator can assign size×tier (confirm/override) + Filling Template on the platform for that Result.
- [x] Assignment is blocked without a Filling Template; stock validation runs on assign.
- [x] Review-only Result has no customer Accept/capture actions.
- [x] Online purchase path still creates a held Result with authorization (slice 05) and is not broken.
- [x] Pure in-store measurement never requires entering card details.

## Status

**Done** (`2ad838b6` on `main`, verified on `cursor/slice-13-verify-complete`).

- `buildInstoreReviewOnlyPatch` on first `isFinal` in `/api/mp-config/responses` — `status: held`, ballpark size×tier, no PI/authorized amount
- SLA cron skips held rows without `payment_intent_id`
- Assign skips customer email when no hold; Accept/Decline hidden on status page without PI
- Tests: `lib/results/__tests__/slice-13-instore-review-only.test.ts` (6 tests, all green)

## Blocked by

- Slice 04 (nullable payment intent + lifecycle for review-only)
- Slice 06 (platform assign UI)
