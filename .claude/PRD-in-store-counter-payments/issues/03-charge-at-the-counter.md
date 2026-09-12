# 03 — The charge: a card_present PaymentIntent that settles through accept unchanged

**Type:** AFK
**Blocked by:** 02
**User stories:** 1, 2, 3
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:checkout`

## Goal

The tracer bullet, and the only slice that touches money. A `curl` (or a simulated
reader tap) against an assigned **Result** produces a real **Order** in the queue,
paid, delivered, ledgered — indistinguishable from one paid by emailed link.

No **Staff** UI yet. That is deliberate: this slice must be demoable and verifiable
through the API alone, so that when slice 04 adds a button the money is already
known to work.

## The idea this slice implements

`accept` already settles a **Result** whose top-up was paid out-of-band. The
hosted-Checkout webhook stamps `topup_payment_intent_id` and `topup_paid_at` when it
sees `purpose === "result_topup"` (`app/api/stripe/webhook/route.ts:104-117`), and
`accept` finds those columns, retrieves the intent, checks `status === "succeeded"`
and that the amount covers the plan, then settles without charging again
(`app/api/results/[id]/accept/route.ts:109-124`).

A **Counter payment** is a PaymentIntent carrying that same metadata, funded by
`card_present`. Make the webhook stamp the same two columns and `accept` needs **no
changes at all**.

**`accept/route.ts` must not be modified by this slice.** If it is, the premise is
wrong and that is worth stopping over rather than patching around.

## Scope

### `lib/counter-payment/index.ts`

```ts
export type CounterChargeInput = {
  resultId: string;
  amount: number;          // major units, from loadAssignedBuild — never from a client
  currency: string;
  readerId: string;
  customerEmail: string | null;
  adminId: string;         // who took it (story 16)
};
```

- `createCounterIntent(input)` — `paymentIntents.create` with
  `payment_method_types: ["card_present"]`, `capture_method: "automatic"`,
  `metadata: { result_id, purpose: "result_topup", counter: "true", taken_by: adminId }`,
  `receipt_email` when there is one, idempotency key
  `counter-${resultId}-${toStripeAmountCents(amount)}`.
  - `capture_method: "automatic"` is decision (b) of ADR 0017. Two-day expiry on a
    `card_present` authorization, and nothing to wait for.
  - No `automatic_payment_methods`. It is mutually exclusive with an explicit
    `payment_method_types`, and this is the one place in the codebase that passes
    the latter.
- `processOnReader(readerId, paymentIntentId)` — `POST
  /v1/terminal/readers/{id}/process_payment_intent`. Returns the reader's
  `action.status`, which is normally `in_progress` but may already be terminal if
  the tap was fast.
- `cancelReaderAction(readerId)` — for slice 04's cancel button; shipped here so
  the module is complete and a stuck simulated reader can be cleared during
  development.
- `readCounterState(resultId)` — the single place that decides what state a counter
  charge is in, from Stripe plus the **Result** row. Pure enough to unit-test given
  a fake Stripe response; slice 04's poll endpoint and slice 05's sweep both call
  it rather than re-deriving.

Reuse `toStripeAmountCents` from `lib/authorization-hold/index.ts` — one rounding
rule for the whole codebase.

### `app/api/results/[id]/counter-charge/route.ts`

`POST`, gated `requireAdmin("results")`.

1. Load the **Result**. Refuse unless `status === "assigned"` — before assign there
   is no priced build, and after capture the sale is done.
2. Refuse if `order_id` is set: the **Result** is already sold.
3. Amount from `loadAssignedBuild(row)` → `priceResult()`. **The route accepts no
   amount in its body.** Same rule as `request-payment` (ADR 0001).
4. Compute `planCapture(finalAmount, authorized ?? 0)`. Charge `plan.topUp` for a
   `top_up` plan. A `capture` plan means the **Result** carries a live online hold
   that covers the total — refuse with a message telling **Staff** to capture that
   hold through *accept* instead of double-charging the customer.
5. **Reuse before create.** If `topup_payment_intent_id` is set and the intent is
   `requires_payment_method` or `requires_confirmation`, process *that* intent on
   the reader. Stripe's guidance is explicit: do not recreate a PaymentIntent
   after a decline. Creating a second is how one customer gets charged twice.
6. `createCounterIntent` → persist `topup_payment_intent_id` immediately, before
   touching the reader. If the reader call fails, the intent is still recoverable;
   if we persisted after, a crash between the two would orphan a live intent.
7. `processOnReader`.
8. Return `{ paymentIntentId, readerActionStatus }` — **never** a success boolean.
   HTTP 200 from Stripe means the reader accepted the instruction (see **Reader
   action** in `CONTEXT.md`).

### Webhook — two new cases in `app/api/stripe/webhook/route.ts`

The handler implements nine events and none is a Terminal event.

```ts
case "payment_intent.succeeded": {
  // A Counter payment (ADR 0017) has no Checkout Session, so the stamp that
  // `checkout.session.completed` applies for a hosted top-up has to happen here
  // too. Same two columns, same `status = 'assigned'` guard — `accept` then
  // settles it without charging again, exactly as it does for a link that was
  // paid and never returned from.
}
case "terminal.reader.action_failed": {
  // Timeline event only. The customer's card was declined or the action timed
  // out; no money moved and the Result is untouched, so Staff can simply retry.
}
```

For `payment_intent.succeeded`, mirror the existing branch precisely: require
`metadata.purpose === "result_topup"`, `.eq("status", "assigned")`, and guard on
`metadata.counter === "true"` so an online top-up's intent (which arrives as a
Checkout Session and is already handled) cannot be stamped twice by two branches.

Subscribe both events plus `terminal.reader.action_succeeded` on the MELLOW LIFE
endpoint `we_1UEpVxCMlMx7bA76xFJYdCCj`, taking the count from 9 to 12. Stripe's
deployment checklist lists the two `terminal.reader.action_*` events as **required**
for server-driven integrations.

## Acceptance criteria

- [ ] Against a simulated reader: create → `present_payment_method` →
      `payment_intent.succeeded` → `accept` → **Order** exists, `status =
      'delivered'`, `delivered_at` set, `paid_at` set, money ledger and inventory
      rows written.
- [ ] That **Order** is field-for-field the shape of one produced by a hosted
      top-up on an equivalent **Result**, `payment_reference` aside.
- [ ] `app/api/results/[id]/accept/route.ts` has **zero** diff in this slice.
- [ ] The route refuses: not `assigned`; already has `order_id`; a `capture` plan.
- [ ] The route accepts no amount, price, or currency from its body — asserted by
      a test that posts one and sees it ignored.
- [ ] Posting twice in a row yields **one** PaymentIntent (idempotency key).
- [ ] A declined intent re-processed reuses the same PaymentIntent id.
- [ ] `topup_payment_intent_id` is persisted before the reader is contacted.
- [ ] `payment_intent.succeeded` stamps only when `purpose === "result_topup"` AND
      `counter === "true"` AND the row is `assigned`.
- [ ] A simulated decline (test card) leaves the **Result** `assigned`, no **Order**,
      and a timeline event.
- [ ] `lib/counter-payment/counter-charge.check.ts` asserts `card_present` is
      present, `automatic_payment_methods` is absent, `capture_method` is
      `automatic`, and greps `lib/authorization-hold/index.ts` to prove it still has
      no `payment_method_types`.
- [ ] The 12 subscribed events are recorded in the slice notes for slice 08 to verify
      against the live endpoint.

## Notes

`transitionResult`'s `balance_paid: topUpPaid > 0` check
(`app/api/results/[id]/accept/route.ts:~205`) is the lifecycle's last guard against
an **Order** with no money behind it, and for a no-hold **Result** it is the *only*
one. A counter payment satisfies it through `topUpPaid`, the same as a link payment.
Do not relax it.
