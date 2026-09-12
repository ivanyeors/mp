# Deferred payment for Results with no authorization hold

A **Result** carrying no **Authorization hold** is payable: on Accept it settles through the same immediate-capture Stripe Checkout that a top-up already uses. Authorize-then-capture remains the default; it is no longer the only path.

## Context

ADR 0002 made authorize-then-capture the money path for customised goods, and it closed with a loose end: *"In-store measurement-only Results may omit a payment intent (review without hold)."* Those Results were created but never made payable. `lib/results/result-stage.ts` names the consequence — `measurement_residue`, *"Legitimate, but it sits in `held` forever."*

**Staff** now need the same shape remotely. They meet a customer, send an **Assist link**, the customer answers the measurement questions on their own device and stops. Staff compose the real build, then ask for payment. Taking a card before Staff have seen the measurements is exactly what ADR 0002 refused; but so is having no way to charge afterwards.

Three guards blocked it: `transitionResult` refused `accept` and `capture` without a `payment_intent_id`; `planCapture` threw unless the authorized amount was positive; and the assign email was skipped when there was no hold.

## Decision

**A missing `payment_intent_id` means "settle by Balance payment", not "unsellable".**

- `capture` requires that money was actually taken — a captured hold **or** a paid **Balance payment**. The `accept` guard is dropped as redundant: `accept` is already reachable only from `assigned`, which requires Staff assignment and a confirmed **Filling Template**.
- `planCapture(final, 0)` returns `{ holdCapture: 0, topUp: final }` rather than throwing, so a no-hold Result takes the existing top-up branch with the whole total.
- The settlement mechanism is unchanged: `createTopUpCheckout` (immediate capture, `purpose: "result_topup"`), the existing webhook branch that stamps `topup_payment_intent_id` / `topup_paid_at`, and the existing re-entrant `accept` that settles from a session the customer paid but never returned from.

The rule keys on the **absence of a hold**, not on `source = 'staff_assisted'`. One rule in the shared lifecycle is a smaller change than a source check threaded through five callers, and it drains the in-store `measurement_residue` backlog with the same code.

Price stays Costings-derived (`priceResult()` at assign) — ADR 0001. Staff never type an amount.

## Consequences

- A **Result** can reach **Order** without a card ever being authorized. Nothing is reserved before payment, so a build Staff have composed can be abandoned at no cost to the customer.
- Two money paths now converge on one settlement: hold+capture, and no-hold+**Balance payment**. `order_payments` must ledger whichever intents actually charged — for a no-hold Result that is the balance intent alone, and the zero-amount hold charge must not be written.
- `payment_reference` on the Order falls back to the balance intent when there is no hold.
- Nothing expires on a clock. A hold dies at seven days; a deferred Result does not, so the SLA cron reminds rather than expires, and only a human cancels.
- In-store measurement-only Results become payable as a side effect. This is intended: it is the walk-in version of the same journey.
- `capture` is now the sole lifecycle guard protecting against an Order without money. It must not be weakened.
