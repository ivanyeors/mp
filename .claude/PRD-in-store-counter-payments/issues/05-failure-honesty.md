# 05 — Failure honesty: preflight, no double charge, and money with no Order behind it

**Type:** AFK
**Blocked by:** 04
**User stories:** 6, 10, 11, 17
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:checkout`, `area:admin`

## Goal

Everything that goes wrong between a customer producing a card and an **Order**
existing. Slices 03 and 04 build the happy path and its declines; this one is about
the states where the system and reality can disagree — and the one where a customer
has paid and has nothing to show for it.

Separate from 03 and 04 on purpose: these are the guards whose absence is invisible
until it is expensive, and reviewing them mixed into a UI diff is how they get
waved through.

## Scope

### Reader preflight (story 10)

Before **Staff** invite a customer to the counter, the control should already know
whether the reader will answer. Fold it into slice 04's `idle` state rather than
adding a button nobody will press:

- On mount and on focus regain, `listReaders` for the **Location**.
- Reader `offline` → `reader_offline` state with *Send a link instead* promoted to
  primary. The sale is not lost, only the instrument.
- Reader missing entirely → `unavailable: "no_reader"` linking to slice 02's
  registration screen.
- Cache for 30s. The customer walk-up is the trigger, not a timer, and hammering
  Stripe's reader endpoint on every render is the other failure mode.

### Retry that cannot double charge (story 6)

Three guards, and they are independent because they fail independently:

1. **Idempotency key** on create — `counter-${resultId}-${amountCents}` from slice
   03. Kills the double-press.
2. **Reuse before create** — an existing `topup_payment_intent_id` in
   `requires_payment_method` / `requires_confirmation` is re-processed, never
   replaced. Kills the retry-after-decline duplicate. Stripe's guidance is
   explicit here.
3. **Refuse when already funded** — a `topup_payment_intent_id` that is `succeeded`
   means the customer has paid and the only remaining work is settlement. The
   route must refuse a fresh charge and tell **Staff** to complete the sale.
   Kills the worst case: paid, page lost, staff charge again.

The third is the one to write a test for first. It is the only path where a
customer's card is charged twice for one pillow, and it is reachable by a dropped
WiFi connection at the wrong moment.

### An amount that moved underneath the charge

A live PaymentIntent is for a specific amount. If **Staff** re-assign the build
between creating the intent and taking the card, `priceResult()` returns something
else and the idempotency key no longer matches.

Refuse rather than reconcile: if a live intent's amount differs from the
freshly-computed one, cancel the intent and tell **Staff** *The price changed —
start the charge again*. Amount-updating a PaymentIntent mid-**Reader action** is
a race with a customer's finger on the reader, and the recovery is one button press.

### Money taken with no Order (story 17)

The state that matters most: `payment_intent.succeeded` fired, `topup_paid_at`
stamped, and `accept` never completed — a crash, a closed laptop, a staff member
who walked away.

**No new stuck reason is needed.** `stuckReason` already returns
`topup_unsettled` for exactly this shape — `topup_paid_at` set with
`status === "assigned"` (`lib/results/result-stage.ts:107`) — and
`STUCK_REASON_LABELS` already reads *"Top-up paid — not settled into an Order"*.
A **Counter payment** lands in it for free, and the sidebar badge counts it
through `queue-counts`.

What this slice adds:

- **Verify** the free inheritance with a test rather than assuming it. A counter
  payment reaching `topup_paid_at` must produce `stuck` / `topup_unsettled`.
- **Reach it from the cron.** `app/api/cron/results-sla/route.ts` selects
  `status = 'held'` only, so an `assigned` **Result** sitting on paid money is
  never scanned. Widen the select to include `assigned` rows with
  `topup_paid_at` not null and alert on them. This is the bug that makes
  `topup_unsettled` visible in the UI but silent in ops — and it applies equally
  to the link-paid top-ups that have been possible since PR #129, so fixing it
  here fixes both.
- **A settle action** on the **Result** detail: *This customer has paid — complete
  the sale*, which calls `accept` with the already-stamped intent. `accept` is
  retryable by construction (`app/api/results/[id]/accept/route.ts:~175`, the
  comment beginning *"Capture is not the last write in this route"*), so this is a
  button, not new settlement logic.

### Timeline events

Every **Counter payment** leaves a trail through `addOrderTimelineEvent`'s
Result-side equivalent: charge started (with reader id and admin id), declined
(with code), cancelled, approved, settled. Story 16's attribution comes from the
`taken_by` metadata slice 03 already writes; this makes it visible without a Stripe
Dashboard login.

## Acceptance criteria

- [ ] A `succeeded` `topup_payment_intent_id` makes `POST counter-charge` refuse
      with a settle-instead message — the double-charge test, written first.
- [ ] Double-press creates one PaymentIntent.
- [ ] Retry after decline reuses the intent; Stripe sees no second create.
- [ ] A price change between create and tap cancels the intent and asks **Staff**
      to restart, and does not charge the old amount.
- [ ] Offline reader shows `reader_offline` with *Send a link instead* primary,
      before any charge is attempted.
- [ ] Reader status is cached 30s, not fetched per render.
- [ ] A counter-paid, unsettled **Result** reads `stuck` / `topup_unsettled` and
      counts in the sidebar badge.
- [ ] The SLA cron scans `assigned` rows with `topup_paid_at` and alerts once per
      reminder interval.
- [ ] *Complete the sale* settles a pre-paid **Result** into an **Order** with no
      second charge, and is idempotent under double-press.
- [ ] Timeline events exist for started / declined / cancelled / approved /
      settled, each naming the **Staff** member.
- [ ] `lib/counter-payment/guards.check.ts` asserts all three double-charge
      guards.

## Notes

The widened cron select is a change to an existing money path with live rows
behind it, not new code — link-paid top-ups have been reachable since PR #129 and
have been equally unmonitored. Call it out in the slice notes so slice 08 tests
both instruments, and so nobody reads it as scope creep.
