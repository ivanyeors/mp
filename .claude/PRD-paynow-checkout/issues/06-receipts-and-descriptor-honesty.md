# 06 — "Who is STRIPE PAYMENTS SINGAPORE?", and telling PayNow orders apart

**Type:** AFK
**Blocked by:** 04
**User stories:** 10, 13, 14
**Labels:** `enhancement`, `needs-triage`, `P3`, `area:email`, `area:admin`

## Goal

Two small things that are only cheap if they land before PayNow carries volume.

## The descriptor cannot be fixed, so it must be pre-empted

Stripe ignores `statement_descriptor` for PayNow. The shopper's banking app and
bank statement show **`STRIPE PAYMENTS SINGAPORE PTE. LTD.`** plus a Stripe
reference — never MELLOW LIFE, and never the order number.

There is no code fix. The fix is copy, in the order confirmation email and on the
success page, for a PayNow order only:

> Your bank statement will show **STRIPE PAYMENTS SINGAPORE PTE. LTD.** — that's our
> payment processor, not another merchant. Your order number is **MP-1234**.

Do not add this to card receipts, where the descriptor is ours and the sentence
would invent a problem.

Check `paymentReceipt()` in `lib/email/templates.ts:144` and the existing order
confirmation before adding anything, and extend rather than introduce a second
email. Two receipts for one sale is worse than an imperfect one.

## Instrument on the record

Staff answering "my payment didn't go through" need to know which instrument was
used — a card decline and an abandoned QR are different conversations, and a PayNow
refund takes days where a card refund does not.

- Persist the instrument on the **Order** from the PaymentIntent's
  `payment_method_types` / charge payment-method details at fulfilment, rather than
  re-fetching from Stripe on every admin page view.
- Show it on the **Order** detail beside the payment reference, and on the **Result**
  timeline for a paid-in-full submit.
- Do **not** add a new dimension to `source`. That records how the sale was
  originated, not how it was paid — see slice 01's `_Avoid_` line. An Assisted build
  paid by PayNow must remain `staff_assisted`.

## Revenue by instrument

PayNow's 1.3% against a card's blended SG rate is the entire business case, so it
has to be measurable. A count and sum by instrument over a date range is enough —
the existing money-ledger rollups already carry the amounts; this needs the
instrument column and one grouping. No fee modelling (ADR 0018 decision (g)).

## Acceptance criteria

- [ ] A PayNow order's confirmation names the Stripe descriptor and the order number.
- [ ] A card order's confirmation is byte-identical to today.
- [ ] Exactly one email per sale — verified, not assumed.
- [ ] Instrument persisted at fulfilment and shown on **Order** detail.
- [ ] A paid-in-full **Result** timeline names the instrument.
- [ ] `source` is unchanged for PayNow orders.
- [ ] Revenue split by instrument is reportable for a date range.
