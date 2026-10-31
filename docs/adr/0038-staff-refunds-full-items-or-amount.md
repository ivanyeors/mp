# Staff refund an Order in full, by its lines, or by an amount, and a charge correction needs no return

Status: Accepted (2026-10-31)

## Context

Staff fix accidental charges: a wrong price, a duplicate charge, a fee that
should not have been charged. The order screen's refund took one optional
amount, and only on shop Orders. A customised (**Result**) Order could be
refunded only by approving the customer's post-delivery refund request after an
in-person return (PRD-template-linked-customisation slice 11, US18), so a
charging mistake on one had no path but the Stripe dashboard.

Two money bugs sat under it. The idempotency key was the order and the amount,
so a second, deliberate refund of the same figure within a day replayed the
first at Stripe and moved nothing. And a Result topped up past its hold is paid
on two intents (ADR 0016): the refund was sent only to `payment_reference`,
which cannot refund more than the hold took, and a refund on the second intent
found no Order in the `charge.refunded` webhook and never reached the ledger.

## Decision

- **One dialog, three ways to say how much.** *Full refund* is everything still
  refundable. *Choose items* ticks lines (and a quantity of each) and the
  shipping; each line refunds its share of the cash the Order took for goods
  (`total − shipping`, spread by list price), so the coupon, points and tax come
  off in proportion and the whole Order adds up to what was paid. The figure is
  filled in and Staff may change it. *Custom amount* is a figure. The amount is
  what moves; the lines are the record of what it was for.
- **A reason, always.** *Charged in error*, *Duplicate charge*, *Customer
  returned it*, or *Other* with a note. Stripe is told `duplicate` or
  `requested_by_customer` where one fits and nothing for a charging mistake.
  The timeline, the admin audit log and the Refund's metadata carry the reason,
  the lines and the note.
- **A charge correction needs no return, on any Order.** On a Result Order,
  *Customer returned it* keeps US18: after it shipped, and only once Staff
  confirm it is back in person. That return also answers a pending refund
  request and voids the partner commission on the returned lines, as an RMA
  refund does. Any other reason refunds without either.
- **One key per dialog.** The dialog makes a request id when it opens; the
  Stripe idempotency key is the order, that id and the intent. A double click
  is one refund; a second refund is a second one.
- **Every intent the Order was paid on.** The refund reads the Order's charge
  rows. With one intent, Stripe is asked for the amount (or, for a full refund,
  for whatever is left). With two, it is split by what Stripe has left on each
  charge, largest first; a part that fails after another succeeded is reported
  with the amount that did go through. The webhook finds an Order by
  `payment_reference` and then by its ledger charge rows, for `charge.refunded`
  and `refund.failed` alike.
- **Restocking stays manual.** After a refund for a return, the restock dialog
  opens with the returned lines filled in and linked to the Stripe Refund.
  A charge correction opens nothing: the goods stayed with the customer.

The money ledger is unchanged: the webhook writes the refund row, as for every
refund (PRD-money-flow-traceability).

## Consequences

- No new table. Which lines a refund was for lives on the timeline event, the
  audit log and the Stripe Refund, not per line, so the dialog does not know a
  line was refunded before; the ceiling is the Order's refundable balance.
- A refund that settles later (PayNow) still waits on `refund.updated`, which
  is not handled yet (PRD-paynow-checkout slice 02). Stripe still refuses a
  refund beyond what the charge has left, so nothing is refunded twice.
