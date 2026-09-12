# 03 — Keep PayNow eligible: an SGD guard and a check that protects the two good paths

**Type:** AFK
**Blocked by:** 01
**User stories:** 1, 2, 3
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:checkout`

## Goal

PayNow is eligible on the cart and top-up Checkouts today. This slice makes that
eligibility *impossible to lose by accident*, and proves it is real rather than
assumed.

## Already proven — observed 2026-09-12

Measured against MELLOW LIFE sandbox (`acct_1UEocJFmfnDU9wZa`) by creating real
Checkout Sessions and reading back `payment_method_types`. This is no longer an
assumption, and these three rows are the whole justification for the slice:

| Session | `payment_method_types` | PayNow |
|---|---|---|
| SGD, automatic capture — the cart and top-up shape | `card, link, paynow` | **present** |
| SGD, `capture_method: "manual"` — the hold shape | `card, link` | **absent** |
| USD, automatic capture | `card, link` | **absent** |

Two things this pins down that the docs only imply:

- **Stripe drops PayNow silently on manual capture.** Row 2 is the exact shape of
  `createHoldCheckout`, and the session was created successfully with no error, no
  warning, and simply one fewer method. So the hold path does not fail loudly when
  someone hopes PayNow will appear there — it just never does, which is why slice 01
  writes it down and this check asserts it.
- **A wrong currency fails the same silent way.** Row 3 is the failure mode the guard
  below exists for: a non-SGD line item does not error, it removes an instrument.

## The SGD guard

PayNow requires **every** line item in `sgd`. `createCheckoutSession` derives
currency from `opts.lineItems[0]?.variant.currency` and defaults to `sgd` — so a
single variant priced in another currency silently removes PayNow from the page,
with no error and no log line. A shopper simply stops being offered it.

- Assert every line item's currency matches the derived one, and throw naming the
  offending variant. This mirrors the existing `stripe_price_id` validation loop
  directly above it, which already refuses to build a session from bad data.
- Non-SGD is not supported — it is refused. See PRD non-goals.

## The eligibility check

Add `lib/stripe/paynow-eligibility.check.ts`, in the repo's runnable-self-check
convention (`npx tsx …`), asserting by source inspection:

- Neither `createCheckoutSession` nor `createTopUpCheckout` sets
  `payment_method_types` — an explicit list silently drops PayNow, and is the single
  most likely way this feature regresses.
- Neither sets `capture_method` anywhere outside `payment_intent_data` on the
  **hold** path. `createTopUpCheckout` acquiring a `capture_method: "manual"` would
  disable PayNow on the only customisation path that can have it.
- `createHoldCheckout` **does** set `capture_method: "manual"` — asserted
  positively, with a comment stating this is deliberate and PayNow cannot apply.
  A check that only forbids things would let someone "enable PayNow on the hold" by
  deleting the manual capture, silently converting every hold into a charge.
- `shouldFulfilOrder` still returns true for `paid` and `no_payment_required` and
  false only for `unpaid`, so PayNow is never gated.
- The currency guard exists.

## Acceptance criteria

- [ ] Observed sandbox `payment_method_types` recorded in the slice notes, including
      whether `paynow` was present.
- [ ] A mixed-currency cart throws, naming the variant.
- [ ] An all-SGD cart is unchanged — verified against the existing
      `lib/stripe/__tests__/checkout.test.ts` expectations.
- [ ] `npx tsx lib/stripe/paynow-eligibility.check.ts` passes and fails if
      `payment_method_types` is added to either automatic-capture path.
- [ ] The check fails if `createHoldCheckout` loses its manual capture.
