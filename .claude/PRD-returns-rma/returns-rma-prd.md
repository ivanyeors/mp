# PRD: Returns/RMA workflow

> Mirrored from GitHub issue **#41** for local build tracking. GitHub #41 remains
> the umbrella. Split from #13 so the platform remediation PRD can close
> independently once the #39 production auth verification gate is complete.

## Problem Statement

The commerce remediation PRD intentionally deferred returns/RMA as a separate
product decision. With the core storefront, checkout, customer accounts, tax,
transactional email, and admin RBAC work shipped, returns/RMA is now the
remaining real feature gap for post-purchase support.

Customers need a clear way to request a return, exchange, or replacement, and
operators need a back-office workflow to review, approve, reject, track, and
close those requests without handling everything ad hoc through support
messages.

## Scope

- Customer-facing returns/RMA request flow from account order history and/or support entry points.
- Eligibility rules based on order status, fulfillment status, delivery date, product type, and configurable return window.
- Return request record with reason, requested resolution, customer notes, optional photos, and status history.
- Admin settings surface for reviewing, approving, rejecting, and updating RMA status.
- Email notifications for request received, approved/rejected, instructions sent, and completed/refunded.
- Audit logging for mutating admin RMA actions.

## Out of Scope

- Replacing Stripe refund handling (approved refunds route through the existing `refundPayment` + money-ledger flow).
- Automatic shipping-label purchase unless explicitly scoped later.
- Warehouse carrier integrations beyond storing tracking/reference fields.
- Policy/legal copy finalization beyond placeholders wired to settings/content.

## Decisions

- **Resolution types:** `refund`, `exchange`, `replacement`.
- **Model:** item-level — `rma_requests` + `rma_request_items` + `rma_status_events` timeline (see ADR in slice 01).
- **Refund outcome:** reuses existing `refundPayment` + money-ledger webhook; no new refund path.
- **Emails:** idempotent, keyed on RMA id (not order+template); ride each lifecycle slice.

## Acceptance Criteria

- A signed-in customer can request a return/RMA for an eligible order item.
- Ineligible orders clearly explain why no return/RMA can be requested.
- Staff can review and move RMA requests through the agreed lifecycle from settings.
- Customers receive lifecycle emails for submitted, approved/rejected, and completed requests.
- Admin RMA mutations are audit logged.
- Existing order, refund, and email behavior remains unchanged outside the RMA flow.

## Slices

See `issues/` and `issues/README.md`.
