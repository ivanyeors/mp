# 01 — Glossary and ADR 0018: what PayNow is, and the one flow it cannot serve

**Type:** AFK
**Blocked by:** none
**User stories:** underpins all
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:checkout`, `area:docs`

## Goal

Write down the audit, so the two facts that decide every later slice are not
rediscovered by someone reading Stripe's docs in a hurry.

## CONTEXT.md entries

**PayNow** — a Singapore real-time payment method. The shopper scans a QR with
their banking app; Stripe confirms instantly. Presented only to Singapore
customers, only in `sgd`, and only by a Checkout Session that captures
automatically. Refunds are asynchronous and can fail after appearing to succeed.
Carries no chargeback risk.
_Avoid_ — do not call it a bank transfer or a "delayed notification" method. It is
neither, and treating it as one produces a fulfilment gate that never opens.
_Avoid_ — do not describe PayNow as a payment method we "added". It was already
enabled on the account; what this initiative adds is correct handling.

**Instrument** — which payment method actually moved the money for an **Order** or
a **Result** (card, PayNow, and later a **Card reader** at the counter). Distinct
from the **Balance payment** / **Authorization hold** distinction, which is about
*when* money moves, not *how*.
_Avoid_ — do not overload `source`. `source` records how the sale was originated
(`online_purchase`, `staff_assisted`, `manual`); the instrument is orthogonal, and
an Assisted build can be paid by PayNow.

**Async refund** — a refund that is `pending` when created and reaches `succeeded`
or `failed` later, signalled by `refund.updated` / `refund.failed`. PayNow is the
first instrument on this account that refunds this way.
_Avoid_ — do not infer a completed refund from `charge.refunded`. That event fires
when the refund is *created*.

## ADR 0018 — decisions to record

- **(a) PayNow needs no enablement.** Verified `available: true`, `preference: "on"`
  in live (`acct_1UEobvCMlMx7bA76`) and sandbox (`acct_1UEocJFmfnDU9wZa`) on
  2026-09-12. Record the verifying call so a future reader re-checks rather than
  re-enables.
- **(b) Dynamic payment methods stay.** No path sets `payment_method_types`.
  Stripe's geo/currency eligibility is better than any check we would write, and
  hardcoding a list is how PayNow would have been missed in the first place.
  The single exception is `card_present` in `PRD-in-store-counter-payments` slice
  03, which is confined to `lib/counter-payment/`.
- **(c) PayNow will never appear on the authorization-hold path.** Stripe: *Manual
  capture support: No*. `createHoldCheckout` is manual-capture by definition. This
  is a property of the payment method, not a limitation to work around.
- **(d) Offering PayNow on the customisation flow therefore means offering payment
  in full at submit.** Opt-in, per session, card hold remains the default — see
  slice 04 for the reasoning about refund exposure.
- **(e) Fulfilment is never gated on PayNow.** It is Stripe's *real-time payments*
  family. `shouldFulfilOrder` is already correct; the risk is a future "fix".
- **(f) No chargebacks, and that is an upside.** `charge.dispute.*` handlers will
  never fire for a PayNow charge. Do not add PayNow dispute handling; do not treat
  the absence as missing coverage.
- **(g) Stripe fees are not modelled.** PayNow's 1.3% is the business case for the
  work, not a number the code carries. Cards are unmodelled too, and modelling one
  instrument alone makes margins incomparable.

## Acceptance criteria

- [ ] `CONTEXT.md` carries **PayNow**, **Instrument** and **Async refund** with
      `_Avoid_` lines.
- [ ] `docs/adr/0018-paynow-checkout.md` records (a)–(g) with the verifying API call
      for (a) and the Stripe doc citation for (c).
- [ ] ADR 0018 links ADR 0016 (`planCapture` / **Balance payment**) and the counter
      payments ADR 0017, and states which slice owns PayNow-at-the-counter so it is
      not built twice.
- [ ] `./scripts/graphify update .` run in the same commit.
