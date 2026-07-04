# Slice 07 — Customer accept / decline / top-up / capture → Order

Type: AFK
Parent: PRD `template-linked-customisation` (`.claude/PRD-template-linked-customisation/template-linked-customisation-prd.md`)
User stories covered: 13, 14, 15, 16, 17, 19, 33, 37, 38, 41

## What to build

Close the money loop: customer Accept/Decline on the status page (magic link for guests; account area for logged-in users).

- **Accept**: re-validate stock; if final ≤ authorized, capture PaymentIntent; if final > authorized, top-up flow then capture; never capture above authorized.
- On successful capture: transition to `captured`, create **Order** with build snapshot and cost snapshots, deduct inventory, link `order_id` on Result.
- **Decline**: confirmation warning copy (hold will be released; must restart customisation); release/cancel PaymentIntent; status `declined`; status page (and email if sent) offers a clear **Start customisation again** path to mp-config / mbolster-config as appropriate.
- After Accept, no customer cancel-before-delivery path (API and UI reject cancel/refund until shipped).
- Guest magic link auth for status page actions; logged-in users use account Result detail.
- Customer-visible copy uses **tier**, not kind.
- `authorization-hold` module fully wired (create already in 05; capture/cancel/top-up here).
- Review-only Results (no payment intent) cannot Accept/capture (in-store path, slice 13).

## Acceptance criteria

- [x] Accept with final ≤ hold captures payment and creates an Order linked to the Result with full build snapshot.
- [x] Stock is re-validated at Accept; failure blocks capture.
- [x] Inventory is deducted only on successful capture.
- [x] Accept with final > hold requires customer top-up approval before capture; no over-capture.
- [x] Decline shows a warning that the hold will be released and customisation must be restarted.
- [x] After Decline, hold is released, status is `declined`, no Order is created, and UI offers **Start customisation again** (links to the correct flow).
- [x] Guest can Accept/Decline via magic link; logged-in user can Accept/Decline from account Result page.
- [x] After Accept, customer cancel/refund APIs and UI are blocked until the Order is shipped/delivered.
- [x] Results without a payment intent cannot Accept or capture.
- [x] Customer-visible copy uses **tier**, not kind.
- [x] Behavior tests cover capture/top-up/release rules (mocked Stripe).

## Status

**Done** on `cursor/accept-decline-capture-order`.

- `POST /api/results/[id]/accept` — stock check, planCapture, top-up Checkout when needed, capture hold, Order + build snapshot, inventory deduct, `order_id` link
- `POST /api/results/[id]/decline` — release hold, `declined`, blocks after accept/capture
- `planCapture` + `createTopUpCheckout` in `authorization-hold`
- Lifecycle: accept requires payment intent
- Status page: Accept / Decline dialog / Start customisation again / post-accept cancel notice
- Tests: `lib/result-lifecycle/__tests__/slice-07-accept.test.ts`, authorization-hold plan/top-up cases

## Blocked by

- Slice 06 (assigned Results with final build)
