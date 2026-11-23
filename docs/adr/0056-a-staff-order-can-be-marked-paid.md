# A Staff order can be marked paid: by a Stripe payment Staff pick, or as paid outside Stripe

Status: Accepted (owner, 2026-11-23).

Amends ADR 0048 (a Staff order is paid only through its Payment link) and ADR 0036 (a Sale is an
Order Stripe has charged).

## Context

A **Staff order** could only be paid through its **Payment link** (ADR 0048). A customer at the
counter who had already paid, on the Stripe app's card reader, in cash, or by PayNow to the
company account, still had an order "awaiting payment" and a link nobody would use. Staff could
move its status to Confirmed by hand, which took its stock out but recorded no money: it was not a
**Sale**, Analytics never saw it, and it had no `paid_at`.

Two earlier documents kept this out on purpose. PRD `staff-orders-payment-links` and PRD
`in-store-counter-payments` both list cash as a non-goal, because an **Order** with no Stripe
charge breaks the premise of the money ledger and of ADR 0036.

The owner asked for it (2026-11-23): when an order is made, Staff either send the payment link or
mark it paid, and where it was paid on Stripe, pick that payment from a list that matches the
price. Asked whether marking paid must always be tied to a Stripe payment, the owner chose both:
a Stripe payment, or money that never went through Stripe. Asked who may do it, the owner chose
anyone with `orders`.

## Decision

**Staff may mark an unpaid Staff order paid, at creation or from its Order page, in one of two
ways. Either way it is settled once, by the same steps the webhook runs for a link payment.**

- **By a Stripe payment.** Staff pick from the account's payments of the last 7 days that
  succeeded for exactly the order's total in its currency, are not refunded or disputed, are not
  already in the ledger, and were not made by this site for another Order or Result (no
  `order_id`, `result_id` or `purpose` in their metadata; the order's own link payment is
  allowed, for a webhook that never arrived). The server checks the same things again with Stripe
  before it writes. The ledger `charge` carries the payment's id, so it can be claimed by one
  Order only, and the **Sale** is dated by Stripe's time for the money. Everything after that is
  an ordinary Stripe-paid Order: refunds go back through Stripe.
- **Outside Stripe.** Cash, PayNow or a bank transfer to the company account, or another way
  (which needs a note). The ledger `charge` has no Stripe id and says so
  (`metadata.source = 'outside_stripe'`, the method, the note, who marked it). `orders.payment_method`
  holds the method and `payment_reference` stays empty.
- **A Sale is an Order with a charge in its ledger: Stripe's, or one Staff recorded as paid
  outside Stripe.** A Sale paid outside Stripe is dated by when Staff marked it, the only time we
  have. A `charge` with no Stripe id and no such mark is still not a Sale.
- **Settled once.** Marking paid confirms the Order only if it is still unpaid and payable
  (compare-and-set on `paid_at`), then writes the ledger, takes its stock, counts its coupon,
  updates the Customer and sends the confirmation, as `checkout.session.completed` does. If the
  money cannot be recorded, the Order goes back to unpaid.
- **The link and the mark cannot both settle it.** An open Checkout is expired before the Order is
  marked; one the customer has just completed refuses the mark. A link payment that still lands on
  an Order already paid another way is recorded in the ledger and flagged (`paid_twice`,
  `needs_attention`) for Staff to refund one, and nothing is sent or deducted a second time.
- **Refunds for money Stripe never held are recorded by hand.** Refund, Cancel and a return's
  refund never ask Stripe for it. Staff return the money the way it came, then **Record refund**
  on the Order (or on the return): a ledger `refund` with no Stripe id, the same roll-up and
  status, and no refund email, since that email promises a bank refund in 5 to 10 days.
- **Permission: `orders`**, as for creating the order. Every mark and every recorded refund is in
  the Audit Log with who, how, and which Stripe payment.
- **Still not possible:** typing an amount (ADR 0001: the total is the order's), marking a shop
  Order or a **Result** paid this way, or changing how a paid Order was paid.

## Considered options

- **Stripe payments only** (recommended to the owner). Every paid Order keeps a Stripe charge, so
  Analytics and refunds need no change. Rejected by the owner: cash and transfers are taken at the
  counter and must be recordable.
- **A separate permission for marking paid**, like **Refund money** (ADR 0055). Not chosen by the
  owner; the Audit Log names who did it. It can be added later without changing the data.
- **Moving the status to Confirmed by hand**, as before. Rejected: no `paid_at`, no ledger row, no
  Sale, and no record of how it was paid.
- **A column for the method on `order_payments`.** Rejected for now: it needs a migration applied
  before the code, and the ledger's `metadata` already carries what is read.
- **Stripe's search API for the list of payments.** Rejected: it lags about a minute behind a
  payment just taken, which is exactly the payment Staff are looking for. The list is read and
  filtered here.

## Consequences

- Analytics no longer shows only what Stripe took: revenue includes Sales Staff recorded as paid
  outside Stripe (`docs/data-flows/analytics.md`). Stripe's own reports and ours can now differ by
  those Sales.
- An Order paid outside Stripe has no card to refund, so its refund is whatever Staff record.
  Nothing reconciles that against a bank statement.
- Marking paid takes Staff's word that money arrived when it was paid outside Stripe. The Audit
  Log is the control.
- A Stripe payment taken in the Stripe app has no Order until Staff pick it; one nobody picks is
  only in Stripe.
- No migration.
