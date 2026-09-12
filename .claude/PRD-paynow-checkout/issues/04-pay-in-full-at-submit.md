# 04 — Pay in full at submit, so a Singapore shopper can use PayNow on a customisation

**Type:** AFK
**Blocked by:** 02, 03
**User stories:** 4, 5, 6, 7
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:checkout`, `area:configurator`

## Goal

The centre of this PRD, and the only slice that changes what a shopper can do.

PayNow cannot authorize (`Manual capture support: No`), and the customisation submit
takes an **Authorization hold**. So there is exactly one way a Singapore shopper
pays for a custom pillow with PayNow: **pay in full at submit instead of holding a
card.** This slice offers that as a choice.

## The product decision, stated honestly

A hold is better for the shopper. `planCapture` captures the *final* amount up to
the authorized one, so if the build comes in under the quote they are simply charged
less. Paying in full inverts that: we hold their money and owe them a refund, and a
PayNow refund is asynchronous and takes days.

So **the hold stays the default**, and paying in full is an opt-in for a shopper who
would rather scan a QR than type a card number. That is a real preference in
Singapore and worth honouring — but not worth making everyone's default.

## UX

A radio pair in the submit step, not a second page and not a modal. Two options, and
the second one names its own cost:

- **Hold my card** *(default, "Recommended")* — "Nothing is charged today. We charge
  the final price once your build is assigned, and it may be lower than the quote."
- **Pay in full now — S$610.00** — "Pay today by PayNow or card. If the final price
  is lower, we refund the difference; a PayNow refund takes a few days to arrive."

Design constraints, from the repo's mobile work (`PRD-configurator-mobile-ux`):

- 375px, no horizontal scroll, 44px targets. The radio pair must not push the
  submit button below the fold — it sits above it, and on the shortest viewport the
  helper copy for the unselected option may collapse.
- Do not name PayNow as the *only* reason to pick option two — card also works
  there, and a shopper who reads "PayNow" as "the QR one" should not conclude their
  card is refused.
- Do not show a PayNow logo we render ourselves. Hosted Checkout presents the
  method, and a logo on our page that then depends on Stripe's eligibility is how
  a non-Singapore shopper is promised something they cannot have.
- Both locales (`en`, `zh`). The refund sentence is the one most likely to overflow.

## Implementation, and two traps found while auditing

Pay-in-full reuses the machinery that already exists: `planCapture(final, 0)` treats
a zero hold as a full top-up (ADR 0016), and `createTopUpCheckout` already accepts
`holdCapture: 0` with customer-facing copy for exactly this case. So the Stripe call
is a solved problem. Two things are not:

**Trap 1 — the webhook stamp is guarded on `assigned`, and a submit-time payment is
`held`.** `app/api/stripe/webhook/route.ts` stamps `topup_payment_intent_id` /
`topup_paid_at` only `.eq("id", resultId).eq("status", "assigned")`, because until
now a top-up could only follow an assignment. A payment at submit lands on a `held`
Result, so **the stamp silently does nothing and the payment is orphaned** — the
same class of bug the `assigned` guard was itself introduced to fix. Widen the guard
to accept `held` as well, and assert it, or this slice takes money and records
nothing.

**Trap 2 — `topup_unsettled` does not fire on a `held` Result.**
`lib/results/result-stage.ts:107` reads
`if (input.topup_paid_at && status === "assigned") return "topup_unsettled"`. A
paid-in-full Result sits at `held`, so it stages as `needs_assign` — which is
correct and visible in the work queue, but the *money-taken* fact carries no
urgency. Decide deliberately: either widen the stuck reason to `held`, or give
`needs_assign` an ageing threshold when `topup_paid_at` is set. A paid customer
waiting is not the same as an unpaid one waiting.

**What must not change:**

- `authorized_amount` stays `null` — no hold was taken. `resultStage` then stages the
  Result through `QUEUE_SOURCES` (which already contains `online_purchase`), exactly
  as it does with the `authHoldEnabled` switch off. No change needed there; verify it.
- `source` stays `online_purchase`. This is not an Assisted build.
- **`app/api/results/[id]/accept/route.ts` must not be modified.** Its out-of-band
  branch already settles a Result whose top-up was paid elsewhere, and that is
  precisely this case. A diff there means the premise is wrong — stop and re-derive.
  (The same constraint binds `PRD-in-store-counter-payments` slice 03, for the same
  reason.)
- The `authHoldEnabled` kill switch (`ce1fc950`) keeps working. With holds off,
  every submit is pay-in-full and the radio pair should not be offered at all —
  there is no choice left to make.

**Overpayment at accept.** If the final price is *below* what was paid, the
difference must be refunded rather than quietly kept. Establish what `accept` does
today with `paid > final` before building, and if it needs a refund, it rides
slice 02's `refund.updated` handling — which is why this slice is blocked by 02.

## Acceptance criteria

- [ ] The submit step offers the two options, hold selected by default.
- [ ] Choosing pay-in-full produces a Checkout Session whose `payment_method_types`
      include `paynow` for an SGD total (recorded from a real sandbox session).
- [ ] The webhook stamps `topup_payment_intent_id` / `topup_paid_at` on a `held`
      Result, with a test that fails against the old `assigned`-only guard.
- [ ] A paid-in-full Result stages as `needs_assign` and appears in the work queue.
- [ ] A decision is recorded and implemented for `topup_unsettled` on `held`.
- [ ] Accepting a paid-in-full Result creates the **Order** with no second charge.
- [ ] A final price below the paid amount refunds the difference, or the slice notes
      record why it cannot happen.
- [ ] `app/api/results/[id]/accept/route.ts` has **zero diff**.
- [ ] With `authHoldEnabled` off, the radio pair is not rendered.
- [ ] 375px, 44px targets, both locales.
