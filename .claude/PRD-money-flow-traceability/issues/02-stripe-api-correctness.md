# Slice 02 — Stripe API correctness (version + refund idempotency + keys)

Type: AFK
Parent: PRD `money-flow-traceability` (`.claude/PRD/money-flow-traceability-prd.md`)
User stories covered: 44

## What to build

Bring the Stripe integration to current best practice without changing payment behavior, so later money-flow slices build on a correct base.

- Bump the pinned Stripe API version to the latest, kept in sync with the SDK. (Shipped: `stripe@22.3.0`, which pins `2026-06-24.dahlia` — a newer dahlia than the `2026-05-27.dahlia` the PRD named; the pinned string must equal the SDK's bundled version for the types to check.)
- Establish the refund helper to use `stripe.refunds.create` with idempotency keys (used by later slices).
- Confirm Checkout Sessions for one-time payments, `payment_method_types` omitted (dynamic payment methods), immutable Price create + archive on change, and webhook signature verification remain intact.
- Recommend/confirm a restricted API key (`rk_`) for the secret and that the webhook secret is set.

## Acceptance criteria

- [x] Pinned API version is the latest (`2026-06-24.dahlia`, in sync with `stripe@22.3.0`); project typechecks clean on the new SDK.
- [x] A refund helper exists that calls `stripe.refunds.create` with an idempotency key (`lib/stripe/refunds.ts`, consumed by Slice 08).
- [x] No code path sends `payment_method_types` (verified by grep; Terminal not used).
- [x] Existing checkout, product/price sync, and webhook flows pass their tests unchanged (`lib/stripe` suite green; only unrelated live-Supabase integration test fails).
- [x] Documented guidance to use a restricted API key + scopes (incl. Refunds) and that the webhook secret is set (`.env.example`).

## Blocked by

None - can start immediately.
